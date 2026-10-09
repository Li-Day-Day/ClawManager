#!/usr/bin/env bash
set -Eeuo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
SYSTEM_NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
USER_ID="${SMOKE_USER_ID:-}"
INSTANCE_ID="${SMOKE_INSTANCE_ID:-}"
EXPECTED_INSTANCE_NAME="${SMOKE_INSTANCE_NAME:-}"
CONFIRM_SMOKE="${CONFIRM_SECRET_BROKER_INSTANCE_DELETE_SMOKE:-false}"
WAIT_SECONDS="${INSTANCE_DELETE_SMOKE_WAIT_SECONDS:-900}"
EXPECTED_IMAGE_DIGEST="${SECRET_BROKER_IMAGE_DIGEST:-}"
TARGET_CLUSTER_ADMIN_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_CLUSTER_ADMIN_BINDING="clawmanager-app-cluster-admin"
APP_SERVICE_ACCOUNT="clawmanager-app"
RUN_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

die() {
  echo "FAIL[instance-delete-smoke]: $*" >&2
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

mysql_query() {
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" exec deploy/mysql -- sh -c \
    'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names --execute="$1"' \
    sh "$1"
}

instance_row_count() {
  mysql_query "SELECT COUNT(*) FROM instances WHERE id=${INSTANCE_ID} AND user_id=${USER_ID}"
}

binding_row_count() {
  mysql_query "SELECT COUNT(*) FROM instance_runtime_bindings WHERE instance_id=${INSTANCE_ID}"
}

workspace_presence_count() {
  local pod
  local present=0
  local state
  for pod in "${APP_PODS[@]}"; do
    state="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" exec "$pod" -c clawmanager-app -- \
      sh -c 'if [ -e "$1" ]; then echo present; else echo absent; fi' sh "$EXPECTED_WORKSPACE_PATH")" || \
      die "could not inspect the Lite workspace from app Pod $pod"
    case "$state" in
      present) present=$((present + 1)) ;;
      absent) ;;
      *) die "app Pod $pod returned an invalid workspace state" ;;
    esac
  done
  echo "$present"
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
    die "$selector has an image ID outside the reviewed digest"
  fi
}

assert_no_broker_errors() {
  local app_logs
  app_logs="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" logs \
    -l app=clawmanager-app --all-containers=true --prefix=true --since-time="$RUN_START")"
  if printf '%s\n' "$app_logs" | grep -Eiq \
    'secret broker configuration|x509:|certificate signed by unknown authority|token_review_failed|caller_forbidden|policy_denied|failed to (upsert|delete|get).*secret'; then
    die "app logs contain a Secret broker/TLS failure"
  fi
}

target_resources() {
  kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get \
    deployments,pods,services,configmaps,persistentvolumeclaims,networkpolicies,secrets \
    -l "$INSTANCE_SELECTOR" -o name 2>/dev/null | sort
}

[[ "$CONFIRM_SMOKE" == true ]] || die "CONFIRM_SECRET_BROKER_INSTANCE_DELETE_SMOKE=true is required"
[[ "$SYSTEM_NAMESPACE" == *-system ]] || die "SOURCE_NAMESPACE must end in -system"
[[ "$USER_ID" =~ ^[1-9][0-9]*$ ]] || die "SMOKE_USER_ID must be a positive integer"
[[ "$INSTANCE_ID" =~ ^[1-9][0-9]*$ ]] || die "SMOKE_INSTANCE_ID must be a positive integer"
[[ "$EXPECTED_INSTANCE_NAME" == d-broker-smoke-* ]] || die "SMOKE_INSTANCE_NAME must identify a disposable d-broker-smoke-* instance"
[[ "$WAIT_SECONDS" =~ ^[0-9]+$ && "$WAIT_SECONDS" -ge 300 && "$WAIT_SECONDS" -le 1800 ]] || \
  die "INSTANCE_DELETE_SMOKE_WAIT_SECONDS must be an integer from 300 through 1800"
[[ "$EXPECTED_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "SECRET_BROKER_IMAGE_DIGEST is invalid"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"

TENANT_NAMESPACE="${SYSTEM_NAMESPACE}-user-${USER_ID}"
INSTANCE_SELECTOR="instance-id=${INSTANCE_ID},managed-by=clawreef"

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

mapfile -t APP_PODS < <(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods \
  -l app=clawmanager-app --field-selector=status.phase=Running -o name | sed 's#^pod/##' | sort)
[[ "${#APP_PODS[@]}" -eq 2 ]] || die "expected 2 running app Pods, found ${#APP_PODS[@]}"

mapfile -t INSTANCE_ROWS < <(mysql_query \
  "SELECT id,user_id,name,type,instance_mode,runtime_type,status,COALESCE(workspace_path,'') FROM instances WHERE id=${INSTANCE_ID} AND user_id=${USER_ID}")
[[ "${#INSTANCE_ROWS[@]}" -eq 1 ]] || die "database does not contain exactly one matching instance row"
IFS=$'\t' read -r db_instance_id db_user_id db_instance_name db_type db_mode db_runtime_type db_status db_workspace_path <<<"${INSTANCE_ROWS[0]}"
[[ "$db_instance_id" == "$INSTANCE_ID" && "$db_user_id" == "$USER_ID" ]] || die "database instance identity changed"
[[ "$db_instance_name" == "$EXPECTED_INSTANCE_NAME" ]] || die "database instance name is $db_instance_name instead of $EXPECTED_INSTANCE_NAME"
[[ "$db_type" =~ ^[a-z0-9-]+$ ]] || die "database instance type is not a normalized runtime type"
[[ "$db_mode" == lite && "$db_runtime_type" == gateway ]] || \
  die "instance $INSTANCE_ID is not a Lite gateway runtime: mode=$db_mode runtime_type=$db_runtime_type"
[[ "$db_status" == running || "$db_status" == stopped ]] || die "instance status $db_status is not safe for this deletion smoke"
EXPECTED_WORKSPACE_PATH="/workspaces/${db_type}/user-${USER_ID}/instance-${INSTANCE_ID}"
[[ "$db_workspace_path" == "$EXPECTED_WORKSPACE_PATH" ]] || \
  die "workspace path does not match the exact expected Lite instance path"
[[ "$(binding_row_count)" == 1 ]] || die "Lite instance does not have exactly one runtime binding before deletion"
[[ "$(workspace_presence_count)" == "${#APP_PODS[@]}" ]] || \
  die "Lite workspace is not visible from every app Pod before deletion"

mapfile -t BEFORE_RESOURCES < <(target_resources)
[[ "${#BEFORE_RESOURCES[@]}" -eq 0 ]] || {
  printf '%s\n' "${BEFORE_RESOURCES[@]}" >&2
  die "Lite instance unexpectedly owns per-instance Kubernetes resources"
}

declare -A TARGET_PV_UIDS=()
declare -A FOREIGN_PV_UIDS=()
declare -A FOREIGN_PV_CLAIMS=()
while read -r pv_name pv_uid pv_user_id claim_namespace claim_name; do
  [[ -n "$pv_name" ]] || continue
  if [[ "$pv_user_id" == "$USER_ID" && "$claim_namespace" == "$TENANT_NAMESPACE" ]]; then
    TARGET_PV_UIDS["$pv_name"]="$pv_uid"
  else
    FOREIGN_PV_UIDS["$pv_name"]="$pv_uid"
    FOREIGN_PV_CLAIMS["$pv_name"]="${claim_namespace}/${claim_name}"
  fi
done < <(kubectl --context="$CONTEXT" get persistentvolumes -l "$INSTANCE_SELECTOR" \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,USER_ID:.metadata.labels.user-id,CLAIM_NAMESPACE:.spec.claimRef.namespace,CLAIM_NAME:.spec.claimRef.name' \
  --no-headers 2>/dev/null || true)

echo "READY[instance-delete-smoke]: migration=true instance_id=$INSTANCE_ID instance_name=$EXPECTED_INSTANCE_NAME mode=lite runtime_type=gateway"
echo "BASELINE[instance-delete-smoke]: database_rows=1 binding_rows=1 workspace_visible_app_pods=${#APP_PODS[@]} per_instance_k8s_resources=0"
for pv_name in "${!TARGET_PV_UIDS[@]}"; do
  echo "BASELINE[instance-delete-smoke]: target_pv=$pv_name uid=${TARGET_PV_UIDS[$pv_name]}"
done
for pv_name in "${!FOREIGN_PV_UIDS[@]}"; do
  echo "BASELINE[instance-delete-smoke]: foreign_pv=$pv_name uid=${FOREIGN_PV_UIDS[$pv_name]} claim=${FOREIGN_PV_CLAIMS[$pv_name]}"
done
echo "ACTION[instance-delete-smoke]: in the UI delete only instance #${INSTANCE_ID} (${EXPECTED_INSTANCE_NAME}); wait until it disappears, then press Enter here"
read -r

deadline=$((SECONDS + WAIT_SECONDS))
while (( SECONDS < deadline )); do
  remaining="$(target_resources)"
  database_remaining="$(instance_row_count)"
  binding_remaining="$(binding_row_count)"
  workspace_remaining="$(workspace_presence_count)"
  target_pv_remaining=0
  for pv_name in "${!TARGET_PV_UIDS[@]}"; do
    if kubectl --context="$CONTEXT" get persistentvolume "$pv_name" >/dev/null 2>&1; then
      target_pv_remaining=$((target_pv_remaining + 1))
    fi
  done
  if [[ -z "$remaining" && "$target_pv_remaining" -eq 0 && "$database_remaining" == 0 && \
        "$binding_remaining" == 0 && "$workspace_remaining" == 0 ]]; then
    break
  fi
  sleep 5
done

remaining="$(target_resources)"
[[ -z "$remaining" ]] || {
  printf '%s\n' "$remaining" >&2
  die "managed namespaced resources remain after instance deletion"
}
[[ "$(instance_row_count)" == 0 ]] || die "database instance row remains after the ${WAIT_SECONDS}s convergence window"
[[ "$(binding_row_count)" == 0 ]] || die "runtime binding remains after the ${WAIT_SECONDS}s convergence window"
[[ "$(workspace_presence_count)" == 0 ]] || die "Lite workspace remains after the ${WAIT_SECONDS}s convergence window"
for pv_name in "${!TARGET_PV_UIDS[@]}"; do
  kubectl --context="$CONTEXT" get persistentvolume "$pv_name" >/dev/null 2>&1 && \
    die "target PV $pv_name remains after the ${WAIT_SECONDS}s convergence window"
done

for pv_name in "${!FOREIGN_PV_UIDS[@]}"; do
  current_uid="$(kubectl --context="$CONTEXT" get persistentvolume "$pv_name" -o jsonpath='{.metadata.uid}' 2>/dev/null || true)"
  [[ "$current_uid" == "${FOREIGN_PV_UIDS[$pv_name]}" ]] || \
    die "foreign PV $pv_name was deleted or replaced; expected uid=${FOREIGN_PV_UIDS[$pv_name]} current=${current_uid:-missing}"
  echo "PASS[instance-delete-smoke:isolation]: preserved_foreign_pv=$pv_name claim=${FOREIGN_PV_CLAIMS[$pv_name]}"
done

assert_no_broker_errors
assert_zero_app_restarts
[[ "$(app_env CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE)" == true ]] || die "migration changed during instance deletion"
[[ "$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${SYSTEM_NAMESPACE}" ]] || \
  die "target cluster-admin binding changed during instance deletion"
[[ "$(binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || \
  die "protected cluster-admin binding changed during instance deletion"

echo "PASS[instance-delete-smoke:delete]: instance_id=$INSTANCE_ID database row, runtime binding, and exact Lite workspace cleanup complete"
echo "DONE[instance-delete-smoke]: migration remains true; foreign-installation PVs and both cluster-admin bindings remain unchanged"
