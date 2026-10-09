#!/usr/bin/env bash
set -euo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
APP_SERVICE_ACCOUNT="clawmanager-app"
APP_AS="system:serviceaccount:${NAMESPACE}:${APP_SERVICE_ACCOUNT}"
RUNTIME_ROLE="clawmanager-zhanghui08-app-runtime-manager"
RUNTIME_BINDING="clawmanager-zhanghui08-app-runtime-manager"
TARGET_CLUSTER_ADMIN_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_CLUSTER_ADMIN_BINDING="clawmanager-app-cluster-admin"
PROBE_SERVICE_ACCOUNT="clawmanager-app-rbac-smoke"
PROBE_BINDING="clawmanager-zhanghui08-app-rbac-smoke"
PROBE_AS="system:serviceaccount:${NAMESPACE}:${PROBE_SERVICE_ACCOUNT}"
COLLECTOR_SERVICE_ACCOUNT="clawmanager-system-backup-secret-capture"
COLLECTOR_AS="system:serviceaccount:${NAMESPACE}:${COLLECTOR_SERVICE_ACCOUNT}"
REGISTERED_SECRET_NAME="clawmanager-system-backup-functional-test-allowlisted"
UNREGISTERED_SECRET_NAME="clawmanager-system-backup-functional-test-unregistered"
ALLOWLIST_REGISTRY_VERSION="functional-test-2026-09-20"
ALLOWLIST_REGISTRY_SHA256="4966a40bc8e3b948d29ac79cb3514a2955ec47a4186aa2eee14b07cbec4242b5"
COLLECTOR_MANIFEST="deployments/k8s/system-backup-secret-capture-functional-test.yaml"
SECRET_BROKER_CUTOVER_APPROVED="${SECRET_BROKER_CUTOVER_APPROVED:-false}"
SECRET_BROKER_EVIDENCE_SHA256="${SECRET_BROKER_EVIDENCE_SHA256:-}"
SECRET_BROKER_DEPLOYMENT="clawmanager-secret-broker"
SECRET_BROKER_SERVICE_ACCOUNT="clawmanager-secret-broker"
SECRET_BROKER_AS="system:serviceaccount:${NAMESPACE}:${SECRET_BROKER_SERVICE_ACCOUNT}"
SECRET_BROKER_ALLOWLIST_SHA256="57f8cc8e82e2f0a3d2ac893d792b49f1a4449e29100cfe25f16e6060d5a9428e"
ROLLBACK_ARMED=0

die() {
  echo "FAIL: $*" >&2
  exit 1
}

cleanup_probe() {
  kubectl --context="$CONTEXT" delete clusterrolebinding "$PROBE_BINDING" --ignore-not-found >/dev/null 2>&1 || true
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" delete serviceaccount "$PROBE_SERVICE_ACCOUNT" --ignore-not-found >/dev/null 2>&1 || true
}

restore_target_cluster_admin() {
  if [[ "$ROLLBACK_ARMED" != "1" ]]; then
    return
  fi
  echo "ROLLBACK: post-cutover app smoke failed; restoring only ${TARGET_CLUSTER_ADMIN_BINDING}" >&2
  kubectl --context="$CONTEXT" apply -f - >/dev/null <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${TARGET_CLUSTER_ADMIN_BINDING}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: ${APP_SERVICE_ACCOUNT}
    namespace: ${NAMESPACE}
EOF
}

on_exit() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    restore_target_cluster_admin
  fi
  cleanup_probe
  exit "$status"
}
trap on_exit EXIT

binding_tuple() {
  kubectl --context="$CONTEXT" get clusterrolebinding "$1" \
    -o jsonpath='{.roleRef.kind}{"|"}{.roleRef.name}{"|"}{range .subjects[*]}{.kind}{"|"}{.name}{"|"}{.namespace}{"\n"}{end}'
}

auth_can_i() {
  local actor="$1" scope="$2" verb="$3" resource="$4"
  local raw answer status=0
  local -a args=(--context="$CONTEXT" auth can-i --as="$actor")
  if [[ "$scope" == "namespace" ]]; then
    args+=(--namespace="$NAMESPACE")
  fi
  raw="$(kubectl "${args[@]}" "$verb" "$resource" 2>&1)" || status=$?
  answer="${raw##*$'\n'}"
  answer="${answer%$'\r'}"
  case "${status}:${answer}" in
    0:yes) return 0 ;;
    1:no) return 1 ;;
    *)
      printf '%s\n' "$raw" >&2
      die "authorization check failed instead of returning yes/no: $actor $verb $resource"
      ;;
  esac
}

assert_allowed_ns() {
  local actor="$1" verb="$2" resource="$3"
  if ! auth_can_i "$actor" namespace "$verb" "$resource"; then
    die "$actor must be allowed: $verb $resource in $NAMESPACE"
  fi
}

assert_allowed_cluster() {
  local actor="$1" verb="$2" resource="$3"
  if ! auth_can_i "$actor" cluster "$verb" "$resource"; then
    die "$actor must be allowed cluster-wide: $verb $resource"
  fi
}

assert_denied_secret_matrix() {
  local actor="$1"
  local verb secret_name
  for verb in get list watch create update patch delete; do
    if auth_can_i "$actor" namespace "$verb" secrets; then
      die "$actor unexpectedly allowed: $verb secrets"
    fi
  done
  for secret_name in "$REGISTERED_SECRET_NAME" "$UNREGISTERED_SECRET_NAME"; do
    for verb in get update patch delete; do
      if auth_can_i "$actor" namespace "$verb" "secrets/$secret_name"; then
        die "$actor unexpectedly allowed: $verb secret/$secret_name"
      fi
    done
  done
}

assert_runtime_matrix() {
  local actor="$1"
  local item verb resource
  local -a namespaced=(
    "get leases.coordination.k8s.io" "create leases.coordination.k8s.io" "update leases.coordination.k8s.io"
    "get deployments.apps" "list deployments.apps" "create deployments.apps"
    "update deployments.apps" "patch deployments.apps" "delete deployments.apps"
    "get pods" "list pods" "create pods" "delete pods" "create pods/exec"
    "get services" "list services" "create services" "update services" "delete services"
    "get endpoints"
    "get configmaps" "list configmaps" "create configmaps" "update configmaps" "delete configmaps"
    "get persistentvolumeclaims" "list persistentvolumeclaims"
    "create persistentvolumeclaims" "update persistentvolumeclaims" "delete persistentvolumeclaims"
    "get networkpolicies.networking.k8s.io" "list networkpolicies.networking.k8s.io"
    "create networkpolicies.networking.k8s.io" "update networkpolicies.networking.k8s.io"
    "delete networkpolicies.networking.k8s.io"
  )
  local -a cluster=(
    "get persistentvolumes" "list persistentvolumes" "create persistentvolumes" "delete persistentvolumes"
    "get namespaces" "list namespaces" "create namespaces" "delete namespaces"
    "list nodes"
    "get storageclasses.storage.k8s.io"
  )
  for item in "${namespaced[@]}"; do
    read -r verb resource <<<"$item"
    assert_allowed_ns "$actor" "$verb" "$resource"
  done
  for item in "${cluster[@]}"; do
    read -r verb resource <<<"$item"
    assert_allowed_cluster "$actor" "$verb" "$resource"
  done
}

restart_total() {
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get pods -l app=clawmanager-app \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.restartCount}{"\n"}{end}{end}' | \
    awk '{ total += $1 } END { print total + 0 }'
}

app_and_runtime_smoke() {
  local phase="$1" log_output
  echo "SMOKE[$phase]: app rollout"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status deployment/clawmanager-app --timeout=180s
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get pods -l app=clawmanager-app \
    -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,IMAGE_ID:.status.containerStatuses[0].imageID'

  local deployment
  for deployment in openclaw-runtime hermes-runtime opencode-runtime deepseek-harness-runtime; do
    if kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment "$deployment" >/dev/null 2>&1; then
      kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status "deployment/$deployment" --timeout=180s
    fi
  done

  sleep 12
  log_output="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" logs \
    -l app=clawmanager-app --all-containers=true --prefix=true --since=20s)"
  if ! printf '%s\n' "$log_output" | grep -Eq '\[SyncService\] (Sync complete|No instances found, skipping sync)'; then
    die "scheduled sync did not reach a healthy terminal point during $phase smoke"
  fi
  if printf '%s\n' "$log_output" | grep -Eiq 'forbidden|cannot (get|list|watch|create|update|patch|delete) resource'; then
    printf '%s\n' "$log_output" >&2
    die "Kubernetes authorization error detected during $phase smoke"
  fi
  echo "PASS[$phase]: app rollout, runtime rollouts, and scheduled sync"
}

collector_smoke() {
  kubectl --context="$CONTEXT" apply -f "$COLLECTOR_MANIFEST" >/dev/null
  local registered_hash verb
  registered_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret "$REGISTERED_SECRET_NAME" \
    -o jsonpath='{.metadata.annotations.clawmanager\.io/secret-allowlist-sha256}')"
  [[ "$registered_hash" == "$ALLOWLIST_REGISTRY_SHA256" ]] || \
    die "registered Secret allowlist hash mismatch: $registered_hash"

  if ! auth_can_i "$COLLECTOR_AS" namespace get "secrets/$REGISTERED_SECRET_NAME"; then
    die "collector cannot get registered Secret"
  fi
  if auth_can_i "$COLLECTOR_AS" namespace get "secrets/$UNREGISTERED_SECRET_NAME"; then
    die "collector can get unregistered Secret"
  fi
  for verb in list watch create update patch delete; do
    if auth_can_i "$COLLECTOR_AS" namespace "$verb" secrets; then
      die "collector unexpectedly allowed: $verb secrets"
    fi
  done
  for verb in update patch delete; do
    if auth_can_i "$COLLECTOR_AS" namespace "$verb" "secrets/$REGISTERED_SECRET_NAME"; then
      die "collector unexpectedly allowed: $verb secret/$REGISTERED_SECRET_NAME"
    fi
  done

  echo "PASS[collector]: registered_secret=$REGISTERED_SECRET_NAME"
  echo "PASS[collector]: unregistered_secret=$UNREGISTERED_SECRET_NAME"
  echo "PASS[collector]: allowlist_registry_version=$ALLOWLIST_REGISTRY_VERSION"
  echo "PASS[collector]: allowlist_registry_sha256=$ALLOWLIST_REGISTRY_SHA256"
}

assert_secret_broker_cutover_ready() {
  local broker_sa broker_url migration_complete allowlist_hash verb
  if [[ "$SECRET_BROKER_CUTOVER_APPROVED" != "true" ]]; then
    echo "BLOCKED: Secret broker cutover is not approved; cluster-admin was not deleted" >&2
    echo "BLOCKED: finish broker staging and business smoke, then provide explicit cutover approval and evidence hash" >&2
    exit 3
  fi
  [[ "$SECRET_BROKER_EVIDENCE_SHA256" =~ ^[0-9a-f]{64}$ ]] || \
    die "SECRET_BROKER_EVIDENCE_SHA256 must bind reviewed functional smoke evidence"

  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get serviceaccount "$SECRET_BROKER_SERVICE_ACCOUNT" >/dev/null
  broker_sa="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment "$SECRET_BROKER_DEPLOYMENT" \
    -o jsonpath='{.spec.template.spec.serviceAccountName}')"
  [[ "$broker_sa" == "$SECRET_BROKER_SERVICE_ACCOUNT" ]] || \
    die "secret broker uses unexpected ServiceAccount: $broker_sa"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status \
    "deployment/$SECRET_BROKER_DEPLOYMENT" --timeout=180s
  allowlist_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment "$SECRET_BROKER_DEPLOYMENT" \
    -o jsonpath='{.metadata.annotations.clawmanager\.io/secret-broker-read-allowlist-sha256}')"
  [[ "$allowlist_hash" == "$SECRET_BROKER_ALLOWLIST_SHA256" ]] || \
    die "secret broker read allowlist hash mismatch: $allowlist_hash"

  for verb in get list create update delete; do
    assert_allowed_ns "$SECRET_BROKER_AS" "$verb" secrets
  done
  assert_allowed_cluster "$SECRET_BROKER_AS" create tokenreviews.authentication.k8s.io
  for verb in watch patch; do
    if auth_can_i "$SECRET_BROKER_AS" namespace "$verb" secrets; then
      die "secret broker unexpectedly allowed: $verb secrets"
    fi
  done
  if auth_can_i "$SECRET_BROKER_AS" namespace create rolebindings.rbac.authorization.k8s.io; then
    die "secret broker unexpectedly allowed to create RoleBindings"
  fi

  broker_url="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
    -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_URL")]}{.value}{end}')"
  migration_complete="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
    -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}{.value}{end}')"
  [[ "$broker_url" == https://* ]] || die "cutover requires an HTTPS CLAWMANAGER_SECRET_BROKER_URL"
  [[ "$migration_complete" == "true" ]] || \
    die "clawmanager-app has not declared CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE=true"
  echo "PASS[broker-gate]: deployment ready; RBAC closed; allowlist_sha256=$allowlist_hash; app migration declared; evidence_sha256=$SECRET_BROKER_EVIDENCE_SHA256"
}

[[ -f "$COLLECTOR_MANIFEST" ]] || die "run from repository root; missing $COLLECTOR_MANIFEST"
actual_context="$(kubectl --context="$CONTEXT" config current-context)"
[[ "$actual_context" == "$CONTEXT" ]] || die "context mismatch: got $actual_context, expected $CONTEXT"
kubectl --context="$CONTEXT" get namespace "$NAMESPACE" >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get serviceaccount "$APP_SERVICE_ACCOUNT" >/dev/null

target_tuple="$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")"
[[ "$target_tuple" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || \
  die "refusing cutover: unexpected target binding tuple: $target_tuple"
protected_tuple="$(binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING")"
[[ "$protected_tuple" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || \
  die "protected binding tuple changed unexpectedly: $protected_tuple"

echo "BASELINE: target=$target_tuple"
echo "BASELINE: protected=$protected_tuple"
baseline_restarts="$(restart_total)"
echo "BASELINE: app_restart_total=$baseline_restarts"

kubectl --context="$CONTEXT" apply -f - >/dev/null <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ${RUNTIME_ROLE}
rules:
  - apiGroups: ["coordination.k8s.io"]
    resources: ["leases"]
    verbs: ["get", "create", "update"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "create", "delete"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create"]
  - apiGroups: [""]
    resources: ["services"]
    verbs: ["get", "list", "create", "update", "delete"]
  - apiGroups: [""]
    resources: ["endpoints"]
    verbs: ["get"]
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "create", "update", "delete"]
  - apiGroups: [""]
    resources: ["persistentvolumeclaims"]
    verbs: ["get", "list", "create", "update", "delete"]
  - apiGroups: [""]
    resources: ["persistentvolumes"]
    verbs: ["get", "list", "create", "delete"]
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["get", "list", "create", "delete"]
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["list"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["networkpolicies"]
    verbs: ["get", "list", "create", "update", "delete"]
  - apiGroups: ["storage.k8s.io"]
    resources: ["storageclasses"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${RUNTIME_BINDING}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ${RUNTIME_ROLE}
subjects:
  - kind: ServiceAccount
    name: ${APP_SERVICE_ACCOUNT}
    namespace: ${NAMESPACE}
EOF

cleanup_probe
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" create serviceaccount "$PROBE_SERVICE_ACCOUNT" >/dev/null
kubectl --context="$CONTEXT" create clusterrolebinding "$PROBE_BINDING" \
  --clusterrole="$RUNTIME_ROLE" --serviceaccount="${NAMESPACE}:${PROBE_SERVICE_ACCOUNT}" >/dev/null
assert_runtime_matrix "$PROBE_AS"
assert_denied_secret_matrix "$PROBE_AS"
echo "PASS[pre-cutover]: isolated runtime role matrix; probe has no Secret verbs"

app_and_runtime_smoke pre-cutover
collector_smoke
assert_secret_broker_cutover_ready

kubectl --context="$CONTEXT" delete clusterrolebinding "$TARGET_CLUSTER_ADMIN_BINDING" --wait=true
ROLLBACK_ARMED=1
if kubectl --context="$CONTEXT" get clusterrolebinding "$TARGET_CLUSTER_ADMIN_BINDING" >/dev/null 2>&1; then
  die "target cluster-admin binding still exists"
fi
binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING" >/dev/null

assert_runtime_matrix "$APP_AS"
assert_denied_secret_matrix "$APP_AS"
app_and_runtime_smoke post-cutover
post_restarts="$(restart_total)"
[[ "$post_restarts" == "$baseline_restarts" ]] || \
  die "app restart count changed: before=$baseline_restarts after=$post_restarts"
ROLLBACK_ARMED=0
echo "PASS[cutover]: app runtime/sync works without target cluster-admin; Secret verbs denied"

collector_smoke
echo "PASS[protected]: $PROTECTED_CLUSTER_ADMIN_BINDING remains unchanged"
echo "DONE: RBAC cutover and functional-test Secret collector verification completed"
