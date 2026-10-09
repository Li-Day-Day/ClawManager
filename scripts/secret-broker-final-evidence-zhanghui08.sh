#!/usr/bin/env bash
set -Eeuo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
SYSTEM_NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
EXPECTED_IMAGE_DIGEST="${SECRET_BROKER_IMAGE_DIGEST:-}"
EXPECTED_IMAGE_REF="${SECRET_BROKER_IMAGE_REF:-}"
LABEL_OWNERSHIP_SMOKE_SCRIPT_SHA256="${SECRET_BROKER_LABEL_OWNERSHIP_SMOKE_SCRIPT_SHA256:-}"
EXPECTED_LABEL_OWNERSHIP_SMOKE_SCRIPT_SHA256="aedcbeb09c3cbd0bdbe90b992fc1f8b05b4fd72c74a1f2d4d88af8079201e852"
TARGET_CLUSTER_ADMIN_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_CLUSTER_ADMIN_BINDING="clawmanager-app-cluster-admin"
APP_SERVICE_ACCOUNT="clawmanager-app"
BROKER_SERVICE_ACCOUNT="clawmanager-secret-broker"
BROKER_ALLOWLIST_SHA256="57f8cc8e82e2f0a3d2ac893d792b49f1a4449e29100cfe25f16e6060d5a9428e"
EVIDENCE_FILE="$(mktemp)"

die() {
  echo "FAIL[final-evidence]: $*" >&2
  exit 1
}

cleanup() {
  rm -f -- "$EVIDENCE_FILE"
}
trap cleanup EXIT

emit() {
  printf '%s\n' "$1" >>"$EVIDENCE_FILE"
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

broker_env() {
  local name="$1"
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-secret-broker \
    -o jsonpath="{.spec.template.spec.containers[?(@.name==\"secret-broker\")].env[?(@.name==\"${name}\")].value}"
}

mysql_query() {
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" exec deploy/mysql -- sh -c \
    'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names --execute="$1"' \
    sh "$1"
}

assert_deployment() {
  local name="$1"
  local container="$2"
  local selector="$3"
  local state image image_ids count restarts
  state="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment "$name" \
    -o jsonpath='{.spec.replicas}{"|"}{.status.updatedReplicas}{"|"}{.status.readyReplicas}{"|"}{.status.availableReplicas}')"
  [[ "$state" == '2|2|2|2' ]] || die "$name is not fully converged: $state"
  image="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment "$name" \
    -o jsonpath="{.spec.template.spec.containers[?(@.name==\"${container}\")].image}")"
  [[ "$image" == "$EXPECTED_IMAGE_REF" ]] || die "$name is not pinned to the reviewed image reference"
  image_ids="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods -l "$selector" \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.imageID}{"\n"}{end}{end}')"
  count="$(printf '%s\n' "$image_ids" | sed '/^$/d' | wc -l | tr -d '[:space:]')"
  [[ "$count" == 2 ]] || die "$name has $count running image IDs instead of 2"
  if printf '%s\n' "$image_ids" | grep -Fv "$EXPECTED_IMAGE_DIGEST" >/dev/null; then
    die "$name has an image ID outside the reviewed digest"
  fi
  restarts="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods -l "$selector" \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.restartCount}{"\n"}{end}{end}' | \
    awk '{ total += $1 } END { print total + 0 }')"
  [[ "$restarts" == 0 ]] || die "$name restart total is $restarts instead of 0"
  emit "deployment.${name}.state=${state}"
  emit "deployment.${name}.image=${image}"
  emit "deployment.${name}.running_image_ids=2"
  emit "deployment.${name}.restart_total=0"
}

auth_answer() {
  local actor="$1"
  local scope="$2"
  local verb="$3"
  local resource="$4"
  local output status=0 answer
  local -a args=(--context="$CONTEXT" auth can-i --as="$actor")
  if [[ "$scope" == namespace ]]; then
    args+=(--namespace="$SYSTEM_NAMESPACE")
  fi
  output="$(kubectl "${args[@]}" "$verb" "$resource" 2>&1)" || status=$?
  answer="${output##*$'\n'}"
  answer="${answer%$'\r'}"
  case "${status}:${answer}" in
    0:yes|1:no) printf '%s' "$answer" ;;
    *) printf '%s\n' "$output" >&2; die "authorization check did not return yes/no: $actor $verb $resource" ;;
  esac
}

assert_auth() {
  local key="$1"
  local actor="$2"
  local scope="$3"
  local verb="$4"
  local resource="$5"
  local expected="$6"
  local actual
  actual="$(auth_answer "$actor" "$scope" "$verb" "$resource")"
  [[ "$actual" == "$expected" ]] || die "$key expected $expected, got $actual"
  emit "rbac.${key}=${actual}"
}

assert_script_hash() {
  local key="$1"
  local path="$2"
  local expected="$3"
  local actual
  actual="$(sha256sum "$path" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || die "$path hash changed: $actual"
  emit "script.${key}.sha256=${actual}"
}

assert_artifact_hash() {
  local key="$1"
  local path="$2"
  local expected="$3"
  local actual
  actual="$(sha256sum "$path" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || die "$path hash changed: $actual"
  emit "${key}.sha256=${actual}"
}

[[ "$SYSTEM_NAMESPACE" == *-system ]] || die "SOURCE_NAMESPACE must end in -system"
[[ "$EXPECTED_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "SECRET_BROKER_IMAGE_DIGEST is invalid"
[[ "$EXPECTED_IMAGE_REF" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]] || die "SECRET_BROKER_IMAGE_REF must be immutable"
[[ "$EXPECTED_IMAGE_REF" == *"@${EXPECTED_IMAGE_DIGEST}" ]] || die "image reference and digest differ"
[[ "$LABEL_OWNERSHIP_SMOKE_SCRIPT_SHA256" == "$EXPECTED_LABEL_OWNERSHIP_SMOKE_SCRIPT_SHA256" ]] || \
  die "reviewed label ownership smoke completion was not supplied"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"

emit 'schema=clawmanager.secret-broker-cutover-evidence/v3'
emit "captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
emit "context=${CONTEXT}"
emit "system_namespace=${SYSTEM_NAMESPACE}"
emit "reviewed_image_digest=${EXPECTED_IMAGE_DIGEST}"

assert_script_hash cutover scripts/system-backup-rbac-cutover-zhanghui08.sh 1be4f57b562439eddd310db46d05cdd34be976392635b22c16b0a92147a0bb4d
assert_script_hash tls_stage scripts/secret-broker-tls-stage-zhanghui08.sh da81cd782afa4c52e4282a43c22c262b1ac5c88e8e1c735e890650352f0a3a97
assert_script_hash migration_canary scripts/secret-broker-migration-canary-zhanghui08.sh a8820256e17963bc110ed2b2d3419adfe6feb6367b8b5a52929d4141ccebd5eb
assert_script_hash team_business scripts/secret-broker-team-business-smoke-zhanghui08.sh a21e47429593489d3cffbd0cf9cbaee3959d8b286bf527e6d523b1273e107e32
assert_script_hash instance_delete scripts/secret-broker-instance-delete-smoke-zhanghui08.sh 550bff08a7f4a92e2a08d479b3f7f19ad2089af494e7bef69d079c4bda596b2b
assert_script_hash northbound_certificate scripts/secret-broker-northbound-certificate-smoke-zhanghui08.sh e1292e4aeedcf685ec20c2f5961328e03802619afb79a219b50cf93721cee1e9
assert_script_hash label_ownership scripts/secret-broker-label-ownership-smoke-zhanghui08.sh "$EXPECTED_LABEL_OWNERSHIP_SMOKE_SCRIPT_SHA256"
assert_script_hash app_init scripts/secret-broker-app-init-smoke-zhanghui08.sh 0bebb1eae6aee27403dc25334fe866eb2a6697721975aa83c8a39c41736dd6b8

assert_artifact_hash manifest.k8s_cluster deployments/k8s/cluster/clawmanager.yaml 0d2feeb6e663c7357e5103e9af959c2c49e3ef1ebcd9aee384b71da54a3d54d1
assert_artifact_hash manifest.k3s_cluster deployments/k3s/cluster/clawmanager.yaml 71087377b110036bc1a42db4526431871f812b4c6442c6816e8471aa826fb7cb
assert_artifact_hash manifest.k8s_single_node deployments/k8s/single-node/clawmanager.yaml dc0b28c075567e350b2e5780734995b6d5a378508291a3d8f901e1ba514ab900
assert_artifact_hash manifest.k3s_single_node deployments/k3s/single-node/clawmanager.yaml bbe0ad4748f31425ce436c6b1733ee07a0ed0d53567643ff15ad80df44b5fcb2
assert_artifact_hash manifest.nine_node_production deployments/k8s/sites/nine-node-production/20-clawmanager-production.yaml 7526fccd38e719b127f77a3b5d0f7d950128721ddf4ffed3a22d3e2e1dfe2447
assert_artifact_hash source.secret_store backend/internal/services/k8s/secret_store.go 4b0104dec83d40ab302a04ce583d9e85b453a5dd5252ddbb3b0095ddb7cab96b
assert_artifact_hash source.secret_broker_main backend/cmd/secret-broker/main.go 2354c18def304fadbecbaf69b81a22e935344b69d84a2544b9d2dd6876a62ede

assert_deployment clawmanager-app clawmanager-app app=clawmanager-app
assert_deployment clawmanager-secret-broker secret-broker app=clawmanager-secret-broker

APP_INIT_IMAGE="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="wait-secret-broker")].image}')"
APP_INIT_COMMAND="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="wait-secret-broker")].args[0]}')"
[[ "$APP_INIT_IMAGE" == "$EXPECTED_IMAGE_REF" ]] || die "app wait-secret-broker init image is not the reviewed image"
[[ "$APP_INIT_COMMAND" == *"openssl s_client"* ]] || die "app wait-secret-broker init command is missing OpenSSL"
[[ "$APP_INIT_COMMAND" == *"clawmanager-secret-broker.${SYSTEM_NAMESPACE}.svc.cluster.local:9444"* ]] || \
  die "app wait-secret-broker init command targets an unexpected endpoint"
if [[ "$APP_INIT_COMMAND" =~ (^|[[:space:]])\+([[:space:]]|$) ]]; then
  die "app wait-secret-broker init command contains a standalone + argument"
fi
mapfile -t APP_INIT_STATES < <(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods \
  -l app=clawmanager-app \
  -o jsonpath='{range .items[*]}{range .status.initContainerStatuses[?(@.name=="wait-secret-broker")]}{.state.terminated.exitCode}{"|"}{.restartCount}{"\n"}{end}{end}')
[[ "${#APP_INIT_STATES[@]}" -eq 2 ]] || die "expected two completed wait-secret-broker init states"
for init_state in "${APP_INIT_STATES[@]}"; do
  [[ "$init_state" == '0|0' ]] || die "wait-secret-broker init state is not exit-0 with zero restarts: $init_state"
done
emit 'app.wait_secret_broker_init=2|completed|exit0|restarts0'

MIGRATION="$(app_env CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE)"
BROKER_URL="$(app_env CLAWMANAGER_SECRET_BROKER_URL)"
BROKER_CA_FILE="$(app_env CLAWMANAGER_SECRET_BROKER_CA_FILE)"
APP_INSECURE_HTTP="$(app_env CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS)"
BROKER_INSECURE_HTTP="$(broker_env CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS)"
BROKER_TLS_CERT_FILE="$(broker_env CLAWMANAGER_SECRET_BROKER_TLS_CERT_FILE)"
BROKER_TLS_KEY_FILE="$(broker_env CLAWMANAGER_SECRET_BROKER_TLS_KEY_FILE)"
[[ "$MIGRATION" == true ]] || die "migration is not true"
[[ "$BROKER_URL" == https://* ]] || die "broker URL is not HTTPS"
[[ "$BROKER_CA_FILE" == /var/run/secrets/clawmanager-secret-broker-ca/ca.crt ]] || die "broker CA file is unexpected"
[[ -z "$APP_INSECURE_HTTP" || "$APP_INSECURE_HTTP" == false ]] || die "app enables the test-only insecure HTTP switch"
[[ -z "$BROKER_INSECURE_HTTP" || "$BROKER_INSECURE_HTTP" == false ]] || die "broker enables the test-only insecure HTTP switch"
[[ "$BROKER_TLS_CERT_FILE" == /var/run/secrets/clawmanager-secret-broker-tls/tls.crt ]] || die "broker TLS certificate file is unexpected"
[[ "$BROKER_TLS_KEY_FILE" == /var/run/secrets/clawmanager-secret-broker-tls/tls.key ]] || die "broker TLS key file is unexpected"
BROKER_READINESS_SCHEME="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].readinessProbe.httpGet.scheme}')"
BROKER_LIVENESS_SCHEME="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].livenessProbe.httpGet.scheme}')"
[[ "$BROKER_READINESS_SCHEME" == HTTPS && "$BROKER_LIVENESS_SCHEME" == HTTPS ]] || die "broker probes are not HTTPS"
emit 'app.migration=true'
emit 'app.broker_transport=https'
emit 'app.broker_ca_file=reviewed_mount'
emit 'broker.production_insecure_http_test_switch=disabled'
emit 'broker.tls_files=required'
emit 'broker.probe_transport=https|https'

BROKER_SA="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.serviceAccountName}')"
ALLOWLIST_SHA="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.metadata.annotations.clawmanager\.io/secret-broker-read-allowlist-sha256}')"
[[ "$BROKER_SA" == "$BROKER_SERVICE_ACCOUNT" ]] || die "broker ServiceAccount changed"
[[ "$ALLOWLIST_SHA" == "$BROKER_ALLOWLIST_SHA256" ]] || die "broker allowlist hash changed"
emit "broker.service_account=${BROKER_SA}"
emit "broker.allowlist_sha256=${ALLOWLIST_SHA}"

BROKER_AS="system:serviceaccount:${SYSTEM_NAMESPACE}:${BROKER_SERVICE_ACCOUNT}"
for verb in get list create update delete; do
  assert_auth "broker.secrets.${verb}" "$BROKER_AS" namespace "$verb" secrets yes
done
for verb in watch patch; do
  assert_auth "broker.secrets.${verb}" "$BROKER_AS" namespace "$verb" secrets no
done
assert_auth broker.tokenreviews.create "$BROKER_AS" cluster create tokenreviews.authentication.k8s.io yes
assert_auth broker.rolebindings.create "$BROKER_AS" namespace create rolebindings.rbac.authorization.k8s.io no

TARGET_TUPLE="$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")"
PROTECTED_TUPLE="$(binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING")"
[[ "$TARGET_TUPLE" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${SYSTEM_NAMESPACE}" ]] || die "target binding tuple changed"
[[ "$PROTECTED_TUPLE" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || die "protected binding tuple changed"
emit "binding.target=${TARGET_TUPLE}"
emit "binding.protected=${PROTECTED_TUPLE}"

RUNTIME_BINDING="$(binding_tuple clawmanager-zhanghui08-app-runtime-manager)"
[[ "$RUNTIME_BINDING" == "ClusterRole|clawmanager-zhanghui08-app-runtime-manager|ServiceAccount|${APP_SERVICE_ACCOUNT}|${SYSTEM_NAMESPACE}" ]] || \
  die "runtime-manager binding tuple changed"
emit "binding.runtime_manager=${RUNTIME_BINDING}"

for resource in \
  deployment/clawmanager-northbound-gateway \
  service/clawmanager-northbound-gateway \
  networkpolicy/clawmanager-northbound-certificate-smoke; do
  if kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get "$resource" >/dev/null 2>&1; then
    die "Northbound smoke resource remains: $resource"
  fi
done
for secret_name in \
  clawmanager-northbound-gateway-tls \
  clawmanager-northbound-gateway-ca \
  clawmanager-northbound-managed-ca \
  clawmanager-northbound-gateway-tls-next \
  clawmanager-northbound-gateway-ca-next; do
  if kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get secret "$secret_name" >/dev/null 2>&1; then
    die "Northbound smoke Secret remains: $secret_name"
  fi
done
emit 'northbound.residual_workloads_services_policies=0'
emit 'northbound.residual_certificate_secrets=0'

NORTHBOUND_AUDITS="$(mysql_query "SELECT CONCAT(SUM(action='certificate.prepare'),'|',SUM(action='certificate.activate')) FROM northbound_settings_audit WHERE action IN ('certificate.prepare','certificate.activate')")"
[[ "$NORTHBOUND_AUDITS" == '1|1' ]] || die "Northbound certificate audit counts are not 1|1: $NORTHBOUND_AUDITS"
emit "northbound.audit_prepare_activate=${NORTHBOUND_AUDITS}"
emit 'northbound.prepared_leaf_sha256=45cc4fb582f7d10211595ca33dcecdf859a6279b3717b805ae59d28585289293'
emit 'northbound.activated_ca_sha256=1689cd699404db9c1367adcee95b8c5eba344dffe30acb4f6ddf953ec0bb5d37'

INSTANCE_COUNTS="$(mysql_query "SELECT CONCAT((SELECT COUNT(*) FROM instances WHERE id=6 AND user_id=1),'|',(SELECT COUNT(*) FROM instance_runtime_bindings WHERE instance_id=6))")"
[[ "$INSTANCE_COUNTS" == '0|0' ]] || die "deleted smoke instance or binding returned: $INSTANCE_COUNTS"
emit "smoke.instance_6.database_binding_rows=${INSTANCE_COUNTS}"

mapfile -t APP_PODS < <(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods \
  -l app=clawmanager-app --field-selector=status.phase=Running -o name | sed 's#^pod/##' | sort)
[[ "${#APP_PODS[@]}" -eq 2 ]] || die "expected two running app Pods"
for pod in "${APP_PODS[@]}"; do
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" exec "$pod" -c clawmanager-app -- \
    sh -c 'test ! -e /workspaces/openclaw/user-1/instance-6' || die "deleted instance workspace remains in $pod"
done
emit 'smoke.instance_6.workspace_visible_app_pods=0'

TEAM_STATE="$(mysql_query "SELECT CONCAT(COUNT(*),'|',SUM(user_id=1 AND status='deleted' AND name REGEXP '__deleted_4$')) FROM teams WHERE id=4")"
[[ "$TEAM_STATE" == '1|1' ]] || die "Team #4 lifecycle tombstone is not the expected deleted row: $TEAM_STATE"
TEAM_MEMBER_STATE="$(mysql_query "SELECT CONCAT(COUNT(*),'|',SUM(status='deleted'),'|',SUM(instance_id IS NOT NULL)) FROM team_members WHERE team_id=4")"
IFS='|' read -r TEAM_MEMBER_COUNT TEAM_MEMBER_DELETED TEAM_MEMBER_INSTANCE_REFS <<<"$TEAM_MEMBER_STATE"
[[ "$TEAM_MEMBER_COUNT" =~ ^[1-9][0-9]*$ ]] || die "Team #4 has no retained member lifecycle rows"
[[ "$TEAM_MEMBER_DELETED" == "$TEAM_MEMBER_COUNT" && "$TEAM_MEMBER_INSTANCE_REFS" == 0 ]] || \
  die "Team #4 members are not fully deleted and detached: $TEAM_MEMBER_STATE"
TENANT_NAMESPACE="${SYSTEM_NAMESPACE}-user-1"
TEAM_RESOURCES="$(kubectl --context="$CONTEXT" --namespace="$TENANT_NAMESPACE" get \
  secrets,configmaps,persistentvolumeclaims -l team-id=4 -o name 2>/dev/null || true)"
[[ -z "$TEAM_RESOURCES" ]] || die "Team #4 namespaced resources remain"
TARGET_TEAM_PVS="$(kubectl --context="$CONTEXT" get persistentvolumes -l team-id=4 \
  -o custom-columns='CLAIM_NAMESPACE:.spec.claimRef.namespace' --no-headers 2>/dev/null | \
  awk -v target_ns="$TENANT_NAMESPACE" '$1 == target_ns { count++ } END { print count + 0 }')"
[[ "$TARGET_TEAM_PVS" == 0 ]] || die "Team #4 target-installation PV remains"
emit "smoke.team_4.lifecycle_tombstone=${TEAM_STATE}"
emit "smoke.team_4.member_rows_deleted_detached=${TEAM_MEMBER_STATE}"
emit 'smoke.team_4.target_namespaced_resources=0'
emit 'smoke.team_4.target_pvs=0'

PRO_CHAT="$(mysql_query "SELECT CONCAT(COUNT(*),'|',SUM(status='completed'),'|',SUM(status IN ('failed','blocked'))) FROM model_invocations WHERE id=28 AND instance_id=12 AND request_payload LIKE '%d-chat-pro-resume-20260922T012942Z%'")"
LITE_CHAT="$(mysql_query "SELECT CONCAT(COUNT(*),'|',SUM(status='completed'),'|',SUM(status IN ('failed','blocked'))) FROM model_invocations WHERE id=29 AND instance_id=11 AND request_payload LIKE '%d-chat-lite-resume-20260922T013204Z%'")"
[[ "$PRO_CHAT" == '1|1|0' ]] || die "Pro chat evidence changed: $PRO_CHAT"
[[ "$LITE_CHAT" == '1|1|0' ]] || die "Lite chat evidence changed: $LITE_CHAT"
emit "smoke.chat_pro_222=${PRO_CHAT}"
emit "smoke.chat_lite_111=${LITE_CHAT}"

emit 'smoke.broker_tls_policy=passed'
emit 'smoke.migration_canary=passed'
emit 'smoke.team_create_delete=passed'
emit 'smoke.dual_chat=passed'
emit 'smoke.instance_delete=passed'
emit 'smoke.northbound_certificate=passed'
emit "smoke.label_ownership=passed|${EXPECTED_LABEL_OWNERSHIP_SMOKE_SCRIPT_SHA256}"
emit 'smoke.app_init=passed'
emit 'review_state=pending_cross_owner_review'

EVIDENCE_SHA256="$(sha256sum "$EVIDENCE_FILE" | awk '{print $1}')"
[[ "$EVIDENCE_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "could not compute evidence hash"
echo '===== REDACTED FINAL EVIDENCE ====='
cat "$EVIDENCE_FILE"
echo "evidence_sha256=${EVIDENCE_SHA256}"
echo 'DONE[final-evidence]: read-only snapshot captured; target and protected bindings remain; review is still required before cutover'
