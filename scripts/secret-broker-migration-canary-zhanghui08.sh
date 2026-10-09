#!/usr/bin/env bash
set -Eeuo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
IMAGE="${SECRET_BROKER_IMAGE:-}"
EXPECTED_CA_SHA256="${SECRET_BROKER_CA_SHA256:-}"
CONFIRM_MIGRATION="${CONFIRM_SECRET_BROKER_MIGRATION:-false}"
APP_SERVICE_ACCOUNT="clawmanager-app"
TARGET_CLUSTER_ADMIN_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_CLUSTER_ADMIN_BINDING="clawmanager-app-cluster-admin"
EXPECTED_ALLOWLIST_SHA256="57f8cc8e82e2f0a3d2ac893d792b49f1a4449e29100cfe25f16e6060d5a9428e"
EXPECTED_BROKER_URL="https://clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local:9444"
EXPECTED_CA_FILE="/var/run/secrets/clawmanager-secret-broker-ca/ca.crt"
SYNC_WAIT_SECONDS="${SECRET_BROKER_SYNC_WAIT_SECONDS:-120}"
ROLLBACK_ARMED=0
APP_LOGS=""
SYNC_TERMINAL=""
SYNC_FAILURE_REASON=""
APP_POD_SELECTOR="app=clawmanager-app"

die() {
  echo "FAIL: $*" >&2
  if [[ "${ROLLBACK_ARMED:-0}" == 1 ]]; then
    rollback 1
  fi
  exit 1
}

binding_tuple() {
  kubectl --context="$CONTEXT" get clusterrolebinding "$1" \
    -o jsonpath='{.roleRef.kind}{"|"}{.roleRef.name}{"|"}{range .subjects[*]}{.kind}{"|"}{.name}{"|"}{.namespace}{"\n"}{end}'
}

app_env() {
  local name="$1"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
    -o jsonpath="{.spec.template.spec.containers[?(@.name==\"clawmanager-app\")].env[?(@.name==\"${name}\")].value}"
}

restart_total() {
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get pods -l app=clawmanager-app \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.restartCount}{"\n"}{end}{end}' | \
    awk '{ total += $1 } END { print total + 0 }'
}

wait_for_app_convergence() {
  local timeout_seconds="${1:-120}"
  local deadline=$((SECONDS + timeout_seconds))
  local state=""
  local desired="0"
  local total="0"
  local updated="0"
  local ready="0"
  local available="0"
  local revision=""
  local pod_template_hash=""

  while (( SECONDS < deadline )); do
    state="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
      -o jsonpath='{.spec.replicas}{"|"}{.status.replicas}{"|"}{.status.updatedReplicas}{"|"}{.status.readyReplicas}{"|"}{.status.availableReplicas}' 2>/dev/null || true)"
    IFS='|' read -r desired total updated ready available <<<"$state"
    desired="${desired:-0}"
    total="${total:-0}"
    updated="${updated:-0}"
    ready="${ready:-0}"
    available="${available:-0}"
    if [[ "$desired" -gt 0 && "$total" == "$desired" && "$updated" == "$desired" && \
      "$ready" == "$desired" && "$available" == "$desired" ]]; then
      revision="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
        -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' 2>/dev/null || true)"
      pod_template_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get replicasets \
        -l app=clawmanager-app \
        -o custom-columns='REVISION:.metadata.annotations.deployment\.kubernetes\.io/revision,HASH:.metadata.labels.pod-template-hash' \
        --no-headers 2>/dev/null | awk -v revision="$revision" '$1 == revision { print $2 }' | tail -n 1)"
      if [[ -n "$revision" && -n "$pod_template_hash" && "$pod_template_hash" != '<none>' ]]; then
        APP_POD_SELECTOR="app=clawmanager-app,pod-template-hash=${pod_template_hash}"
        return 0
      fi
    fi
    sleep 3
  done

  echo "APP_CONVERGENCE_STATE=${state:-unavailable}" >&2
  return 1
}

wait_for_healthy_sync() {
  local timeout_seconds="$1"
  local deadline=$((SECONDS + timeout_seconds))

  while (( SECONDS < deadline )); do
    if ! APP_LOGS="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" logs \
      -l "$APP_POD_SELECTOR" --all-containers=true --prefix=true --since=10m 2>&1)"; then
      sleep 5
      continue
    fi
    if printf '%s\n' "$APP_LOGS" | grep -Eiq \
      'secret broker configuration|x509:|certificate signed by unknown authority|token_review_failed|caller_forbidden|policy_denied|connection refused'; then
      printf '%s\n' "$APP_LOGS" >&2
      SYNC_FAILURE_REASON="app log contains a Secret broker/TLS failure"
      return 2
    fi
    SYNC_TERMINAL="$(printf '%s\n' "$APP_LOGS" | \
      grep -E '\[SyncService\] (Sync complete|No instances found, skipping sync)' | tail -n 1 || true)"
    if [[ -n "$SYNC_TERMINAL" ]]; then
      return 0
    fi
    sleep 5
  done

  printf '%s\n' "$APP_LOGS" >&2
  SYNC_FAILURE_REASON="leader initial/scheduled sync did not reach a healthy terminal point within ${timeout_seconds}s"
  return 1
}

rollback() {
  local original_status="${1:-$?}"
  trap - ERR
  if [[ "$ROLLBACK_ARMED" == 1 ]]; then
    echo "ROLLBACK[broker-migration]: restoring CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE=false" >&2
    kubectl --context="$CONTEXT" --namespace="$NAMESPACE" set env deployment/clawmanager-app \
      CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE=false >/dev/null || true
    kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status deployment/clawmanager-app \
      --timeout=300s >/dev/null || true
    if ! wait_for_app_convergence 120; then
      echo "ROLLBACK[broker-migration]: app replicas did not fully converge before timeout" >&2
    fi
  fi
  exit "$original_status"
}
trap 'rollback $?' ERR

[[ "$CONFIRM_MIGRATION" == true ]] || die "CONFIRM_SECRET_BROKER_MIGRATION=true is required"
[[ "$NAMESPACE" == *-system ]] || die "SOURCE_NAMESPACE must end in -system"
[[ "$IMAGE" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]] || \
  die "SECRET_BROKER_IMAGE must be an immutable image@sha256 digest"
[[ "$EXPECTED_CA_SHA256" =~ ^[0-9a-f]{64}$ ]] || \
  die "SECRET_BROKER_CA_SHA256 must be the reviewed TLS CA hash"
[[ "$SYNC_WAIT_SECONDS" =~ ^[0-9]+$ && "$SYNC_WAIT_SECONDS" -ge 30 && "$SYNC_WAIT_SECONDS" -le 300 ]] || \
  die "SECRET_BROKER_SYNC_WAIT_SECONDS must be an integer from 30 through 300"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"

[[ "$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || \
  die "target cluster-admin binding tuple changed"
[[ "$(binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || \
  die "protected cluster-admin binding tuple changed"

[[ "$(app_env CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE)" == false ]] || \
  die "app migration must be explicitly false before the canary"
[[ "$(app_env CLAWMANAGER_SECRET_BROKER_URL)" == "$EXPECTED_BROKER_URL" ]] || die "app broker URL mismatch"
[[ "$(app_env CLAWMANAGER_SECRET_BROKER_CA_FILE)" == "$EXPECTED_CA_FILE" ]] || die "app broker CA file mismatch"

broker_image="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].image}')"
[[ "$broker_image" == "$IMAGE" ]] || die "broker image mismatch"
broker_ready="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.status.readyReplicas}')"
broker_desired="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.replicas}')"
[[ "$broker_ready" == "$broker_desired" && "$broker_ready" == 2 ]] || die "broker is not 2/2 Ready"

deployment_ca_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.metadata.annotations.clawmanager\.io/secret-broker-ca-sha256}')"
secret_ca_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret clawmanager-secret-broker-tls \
  -o jsonpath='{.metadata.annotations.clawmanager\.io/ca-sha256}')"
configmap_ca_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get configmap clawmanager-secret-broker-ca \
  -o jsonpath='{.metadata.annotations.clawmanager\.io/ca-sha256}')"
[[ "$deployment_ca_hash" == "$EXPECTED_CA_SHA256" && "$secret_ca_hash" == "$EXPECTED_CA_SHA256" && "$configmap_ca_hash" == "$EXPECTED_CA_SHA256" ]] || \
  die "TLS CA hash mismatch"

allowlist_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.metadata.annotations.clawmanager\.io/secret-broker-read-allowlist-sha256}')"
[[ "$allowlist_hash" == "$EXPECTED_ALLOWLIST_SHA256" ]] || die "broker read allowlist hash mismatch"
allowlist_value="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_READ_ALLOWLIST")].value}')"
[[ -z "$allowlist_value" ]] || die "expected an empty live read allowlist after REFERENCE_COUNT=0"

baseline_restarts="$(restart_total)"
echo "BASELINE[broker-migration]: app_restart_total=$baseline_restarts"

ROLLBACK_ARMED=1
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" set env deployment/clawmanager-app \
  CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE=true >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status deployment/clawmanager-app --timeout=300s
[[ "$(app_env CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE)" == true ]] || die "migration flag did not become true"
wait_for_app_convergence 120 || die "app replicas did not converge to the current migration=true revision"
echo "PASS[broker-migration]: app replicas converged to the current revision"

kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status deployment/openclaw-runtime --timeout=180s
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status deployment/hermes-runtime --timeout=180s
if ! wait_for_healthy_sync "$SYNC_WAIT_SECONDS"; then
  die "$SYNC_FAILURE_REASON"
fi
echo "PASS[broker-migration]: leader sync reached a healthy terminal point"
echo "APP_POD_SELECTOR=$APP_POD_SELECTOR"
printf '%s\n' "$SYNC_TERMINAL"

post_restarts="$(restart_total)"
[[ "$post_restarts" == "$baseline_restarts" ]] || \
  die "app restart count changed: before=$baseline_restarts after=$post_restarts"
[[ "$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || \
  die "target cluster-admin binding changed during migration canary"

ROLLBACK_ARMED=0
trap - ERR
echo "PASS[broker-migration]: HTTPS broker configuration, app/runtime rollout, sync, logs and restart count"
echo "CANARY[broker-migration]: migration=true; target cluster-admin remains for business smoke"
echo "NEXT[broker-migration]: run real instance, Team, northbound certificate and cleanup smoke before RBAC removal"
