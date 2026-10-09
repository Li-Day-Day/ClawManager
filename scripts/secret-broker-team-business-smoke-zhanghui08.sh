#!/usr/bin/env bash
set -Eeuo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
SYSTEM_NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
USER_ID="${SMOKE_USER_ID:-}"
CONFIRM_SMOKE="${CONFIRM_SECRET_BROKER_TEAM_SMOKE:-false}"
WAIT_SECONDS="${TEAM_SMOKE_WAIT_SECONDS:-900}"
EXPECTED_IMAGE_DIGEST="${SECRET_BROKER_IMAGE_DIGEST:-sha256:10125e2bf46da1d1ac163a937b8bddb1b5dbc43edf82af789b2f7fd75fa59418}"
TARGET_CLUSTER_ADMIN_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_CLUSTER_ADMIN_BINDING="clawmanager-app-cluster-admin"
APP_SERVICE_ACCOUNT="clawmanager-app"
RUN_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

die() {
  echo "FAIL[team-business-smoke]: $*" >&2
  exit 1
}

binding_tuple() {
  kubectl --context="$CONTEXT" get clusterrolebinding "$1" \
    -o jsonpath='{.roleRef.kind}{"|"}{.roleRef.name}{"|"}{range .subjects[*]}{.kind}{"|"}{.name}{"|"}{.namespace}{"\n"}{end}'
}

app_env() {
  local name="$1"
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-app \
    -o jsonpath="{.spec.template.spec.containers[?(@.name==\"clawmanager-app\")].env[?(@.name==\"${name}\")].value}"
}

assert_two_ready() {
  local deployment="$1"
  local state
  state="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment "$deployment" \
    -o jsonpath='{.spec.replicas}{"|"}{.status.readyReplicas}{"|"}{.status.availableReplicas}')"
  [[ "$state" == '2|2|2' ]] || die "$deployment is not 2/2 Ready and Available: $state"
}

assert_zero_app_restarts() {
  local restart_total
  restart_total="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods -l app=clawmanager-app \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.restartCount}{"\n"}{end}{end}' | \
    awk '{ total += $1 } END { print total + 0 }')"
  [[ "$restart_total" == 0 ]] || die "app restart total is $restart_total instead of 0"
}

assert_running_image_ids() {
  local selector="$1"
  local expected_count="$2"
  local image_ids
  local count
  image_ids="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods -l "$selector" \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.imageID}{"\n"}{end}{end}')"
  count="$(printf '%s\n' "$image_ids" | sed '/^$/d' | wc -l | tr -d '[:space:]')"
  [[ "$count" == "$expected_count" ]] || die "$selector returned $count image IDs instead of $expected_count"
  if printf '%s\n' "$image_ids" | grep -Fv "$EXPECTED_IMAGE_DIGEST" >/dev/null; then
    printf '%s\n' "$image_ids" >&2
    die "$selector has an image ID outside the reviewed fix11 digest"
  fi
}

assert_no_broker_errors() {
  local app_logs
  app_logs="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" logs \
    -l app=clawmanager-app --all-containers=true --prefix=true --since-time="$RUN_START")"
  if printf '%s\n' "$app_logs" | grep -Eiq \
    'secret broker configuration|x509:|certificate signed by unknown authority|token_review_failed|caller_forbidden|policy_denied|failed to (upsert|delete|get).*secret'; then
    printf '%s\n' "$app_logs" >&2
    die "app logs contain a Secret broker/TLS failure"
  fi
}

resource_absent() {
  local resource="$1"
  local namespace="$2"
  local name="$3"
  ! kubectl --context="$CONTEXT" --namespace="$namespace" get "$resource" "$name" >/dev/null 2>&1
}

[[ "$CONFIRM_SMOKE" == true ]] || die "CONFIRM_SECRET_BROKER_TEAM_SMOKE=true is required"
[[ "$SYSTEM_NAMESPACE" == *-system ]] || die "SOURCE_NAMESPACE must end in -system"
[[ "$USER_ID" =~ ^[1-9][0-9]*$ ]] || die "SMOKE_USER_ID must be a positive integer"
[[ "$WAIT_SECONDS" =~ ^[0-9]+$ && "$WAIT_SECONDS" -ge 300 && "$WAIT_SECONDS" -le 1800 ]] || \
  die "TEAM_SMOKE_WAIT_SECONDS must be an integer from 300 through 1800"
[[ "$EXPECTED_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "SECRET_BROKER_IMAGE_DIGEST is invalid"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"

TENANT_NAMESPACE="${SYSTEM_NAMESPACE}-user-${USER_ID}"
[[ "$(app_env CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE)" == true ]] || die "app migration is not true"
[[ "$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${SYSTEM_NAMESPACE}" ]] || \
  die "target cluster-admin binding tuple changed"
[[ "$(binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || \
  die "protected cluster-admin binding tuple changed"

assert_two_ready clawmanager-app
assert_two_ready clawmanager-secret-broker
assert_zero_app_restarts
assert_running_image_ids app=clawmanager-app 2
assert_running_image_ids app=clawmanager-secret-broker 2

declare -A BEFORE_TEAM_SECRETS=()
while IFS= read -r resource_name; do
  [[ -n "$resource_name" ]] && BEFORE_TEAM_SECRETS["$resource_name"]=1
done < <(kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get secrets \
  -l team-id -o name 2>/dev/null | sort)

echo "READY[team-business-smoke]: migration=true namespace=$TENANT_NAMESPACE"
echo "ACTION[team-business-smoke]: in the UI create one disposable Team for user ${USER_ID}; use a unique d-broker-team-smoke-* name and wait for Running"
echo "INFO[team-business-smoke]: existing Team Secrets are baseline only and will not be touched"

deadline=$((SECONDS + WAIT_SECONDS))
new_secret_resource=""
while (( SECONDS < deadline )); do
  new_resources=()
  while IFS= read -r resource_name; do
    [[ -n "$resource_name" ]] || continue
    if [[ -z "${BEFORE_TEAM_SECRETS[$resource_name]+present}" ]]; then
      new_resources+=("$resource_name")
    fi
  done < <(kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get secrets \
    -l team-id -o name 2>/dev/null | sort)
  if [[ "${#new_resources[@]}" -eq 1 ]]; then
    new_secret_resource="${new_resources[0]}"
    break
  fi
  [[ "${#new_resources[@]}" -le 1 ]] || die "more than one new Team Secret appeared; cannot select a unique smoke Team"
  sleep 5
done
[[ -n "$new_secret_resource" ]] || die "no new Team Secret appeared within ${WAIT_SECONDS}s"

secret_name="${new_secret_resource#secret/}"
[[ "$secret_name" =~ ^clawreef-team-([1-9][0-9]*)-bus$ ]] || die "unexpected Team Secret name: $secret_name"
team_id="${BASH_REMATCH[1]}"
configmap_name="clawreef-team-${team_id}-config"
pvc_name="clawreef-team-${team_id}-shared"

managed_by="$(kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get secret "$secret_name" \
  -o jsonpath='{.metadata.labels.managed-by}')"
label_team_id="$(kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get secret "$secret_name" \
  -o jsonpath='{.metadata.labels.team-id}')"
[[ "$managed_by" == clawreef && "$label_team_id" == "$team_id" ]] || die "Team Secret labels are invalid"

secret_keys="$(kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get secret "$secret_name" \
  -o go-template='{{range $key, $value := .data}}{{$key}}{{"\n"}}{{end}}' | sort | paste -sd, -)"
[[ "$secret_keys" == 'CLAWMANAGER_TEAM_REDIS_URL,CLAWMANAGER_TEAM_TOKEN' ]] || \
  die "Team Secret key set is unexpected: $secret_keys"

deadline=$((SECONDS + 300))
while (( SECONDS < deadline )); do
  configmap_team_id="$(kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get configmap "$configmap_name" \
    -o jsonpath='{.metadata.labels.team-id}' 2>/dev/null || true)"
  pvc_state="$(kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get pvc "$pvc_name" \
    -o jsonpath='{.metadata.labels.team-id}{"|"}{.status.phase}{"|"}{.spec.volumeName}' 2>/dev/null || true)"
  IFS='|' read -r pvc_team_id pvc_phase bound_pv_name <<<"$pvc_state"
  if [[ "$configmap_team_id" == "$team_id" && "$pvc_team_id" == "$team_id" && \
    "$pvc_phase" == Bound && -n "$bound_pv_name" ]]; then
    break
  fi
  sleep 5
done
[[ "$configmap_team_id" == "$team_id" ]] || die "Team ConfigMap did not become ready"
[[ "$pvc_team_id" == "$team_id" && "$pvc_phase" == Bound && -n "$bound_pv_name" ]] || \
  die "Team PVC did not become Bound: ${pvc_state:-missing}"
bound_pv_claim="$(kubectl --context="$CONTEXT" get persistentvolume "$bound_pv_name" \
  -o jsonpath='{.spec.claimRef.namespace}{"|"}{.spec.claimRef.name}')"
[[ "$bound_pv_claim" == "${TENANT_NAMESPACE}|${pvc_name}" ]] || \
  die "bound PV claim identity is outside the smoke Team: $bound_pv_claim"

assert_no_broker_errors
assert_zero_app_restarts
echo "PASS[team-business-smoke:create]: team_id=$team_id secret=$TENANT_NAMESPACE/$secret_name keys=$secret_keys"
echo "ACTION[team-business-smoke]: confirm Team #${team_id} is Running in the UI, delete only that disposable Team, then press Enter here"
read -r

deadline=$((SECONDS + WAIT_SECONDS))
while (( SECONDS < deadline )); do
  if resource_absent secret "$TENANT_NAMESPACE" "$secret_name" && \
    resource_absent configmap "$TENANT_NAMESPACE" "$configmap_name" && \
    resource_absent pvc "$TENANT_NAMESPACE" "$pvc_name"; then
    break
  fi
  sleep 5
done
resource_absent secret "$TENANT_NAMESPACE" "$secret_name" || die "Team Secret remains after UI deletion"
resource_absent configmap "$TENANT_NAMESPACE" "$configmap_name" || die "Team ConfigMap remains after UI deletion"
resource_absent pvc "$TENANT_NAMESPACE" "$pvc_name" || die "Team PVC remains after UI deletion"

remaining_namespaced="$(kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get \
  secrets,configmaps,persistentvolumeclaims -l "team-id=${team_id}" -o name 2>/dev/null || true)"
[[ -z "$remaining_namespaced" ]] || {
  printf '%s\n' "$remaining_namespaced" >&2
  die "Team-labelled namespaced resources remain after deletion"
}
if kubectl --context="$CONTEXT" get persistentvolume "$bound_pv_name" >/dev/null 2>&1; then
  deadline=$((SECONDS + WAIT_SECONDS))
  while (( SECONDS < deadline )); do
    kubectl --context="$CONTEXT" get persistentvolume "$bound_pv_name" >/dev/null 2>&1 || break
    sleep 5
  done
fi
if kubectl --context="$CONTEXT" get persistentvolume "$bound_pv_name" >/dev/null 2>&1; then
  kubectl --context="$CONTEXT" get persistentvolume "$bound_pv_name" \
    -o custom-columns='NAME:.metadata.name,PHASE:.status.phase,DELETION:.metadata.deletionTimestamp,CLAIM_NAMESPACE:.spec.claimRef.namespace,CLAIM_NAME:.spec.claimRef.name' >&2
  die "smoke Team bound PV remains after the ${WAIT_SECONDS}s deletion convergence window"
fi

pv_inventory="$(kubectl --context="$CONTEXT" get persistentvolumes -l "team-id=${team_id}" \
  -o custom-columns='NAME:.metadata.name,CLAIM_NAMESPACE:.spec.claimRef.namespace' --no-headers 2>/dev/null || true)"
remaining_pvs="$(printf '%s\n' "$pv_inventory" | awk -v target_ns="$TENANT_NAMESPACE" '$2 == target_ns { print $1 }')"
[[ -z "$remaining_pvs" ]] || {
  printf '%s\n' "$remaining_pvs" >&2
  die "another Team-labelled PV still claims the smoke tenant namespace"
}

assert_no_broker_errors
assert_zero_app_restarts
[[ "$(app_env CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE)" == true ]] || die "migration changed during Team smoke"
[[ "$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${SYSTEM_NAMESPACE}" ]] || \
  die "target cluster-admin binding changed during Team smoke"
[[ "$(binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || \
  die "protected cluster-admin binding changed during Team smoke"

echo "PASS[team-business-smoke:delete]: team_id=$team_id Team Secret/ConfigMap/PVC/PV cleanup complete"
echo "DONE[team-business-smoke]: migration remains true; both cluster-admin bindings remain unchanged"
