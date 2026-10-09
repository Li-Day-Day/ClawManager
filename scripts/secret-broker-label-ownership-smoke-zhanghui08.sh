#!/usr/bin/env bash
set -Eeuo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
IMAGE_REF="${SECRET_BROKER_IMAGE_REF:?SECRET_BROKER_IMAGE_REF is required}"
IMAGE_DIGEST="${SECRET_BROKER_IMAGE_DIGEST:?SECRET_BROKER_IMAGE_DIGEST is required}"
APP_SERVICE_ACCOUNT="clawmanager-app"
TARGET_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_BINDING="clawmanager-app-cluster-admin"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
TEST_ID="$(date -u +%s)"
WRONG_ID="${TEST_ID}1"
VALID_ID="${TEST_ID}2"
TEST_NAMESPACE="${NAMESPACE}-user-${TEST_ID}"
MISSING_SECRET="clawreef-${TEST_ID}-label-missing-openclaw-bootstrap"
WRONG_SECRET="clawreef-team-${WRONG_ID}-bus"
VALID_SECRET="clawreef-team-${VALID_ID}-bus"
PROBE_POD="secret-broker-label-probe-${TEST_ID}"
TEST_NAMESPACE_UID=""

die() {
  echo "FAIL[secret-broker-label-ownership]: $*" >&2
  exit 1
}

binding_tuple() {
  kubectl --context="$CONTEXT" get clusterrolebinding "$1" \
    -o jsonpath='{.roleRef.kind}{"|"}{.roleRef.name}{"|"}{.subjects[0].kind}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}'
}

cleanup() {
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" delete pod "$PROBE_POD" \
    --ignore-not-found --wait=true >/dev/null 2>&1 || true
  if [[ -n "$TEST_NAMESPACE_UID" ]]; then
    current_uid="$(kubectl --context="$CONTEXT" get namespace "$TEST_NAMESPACE" \
      -o jsonpath='{.metadata.uid}' 2>/dev/null || true)"
    if [[ "$current_uid" == "$TEST_NAMESPACE_UID" ]]; then
      kubectl --context="$CONTEXT" delete namespace "$TEST_NAMESPACE" --wait=true >/dev/null 2>&1 || true
    fi
  fi
}
trap cleanup EXIT

[[ "$NAMESPACE" == *-system ]] || die "SOURCE_NAMESPACE must end in -system"
[[ "$IMAGE_REF" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]] || die "SECRET_BROKER_IMAGE_REF must be immutable"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "SECRET_BROKER_IMAGE_DIGEST is invalid"
[[ "$IMAGE_REF" == *"@${IMAGE_DIGEST}" ]] || die "image reference and digest differ"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"

app_image="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].image}')"
broker_image="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].image}')"
[[ "$app_image" == "$IMAGE_REF" && "$broker_image" == "$IMAGE_REF" ]] || die "app/broker are not pinned to the reviewed image"

for deployment in clawmanager-app clawmanager-secret-broker; do
  state="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment "$deployment" \
    -o jsonpath='{.spec.replicas}{"|"}{.status.updatedReplicas}{"|"}{.status.readyReplicas}{"|"}{.status.availableReplicas}')"
  [[ "$state" == "2|2|2|2" ]] || die "$deployment is not 2|2|2|2: $state"
done

migration="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")].value}')"
broker_url="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_URL")].value}')"
[[ "$migration" == true ]] || die "migration must remain true"
[[ "$broker_url" == "https://clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local:9444" ]] || die "app broker URL is not the reviewed HTTPS endpoint"
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret clawmanager-secret-broker-tls >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get configmap clawmanager-secret-broker-ca >/dev/null
[[ "$(binding_tuple "$TARGET_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || die "target binding tuple changed"
[[ "$(binding_tuple "$PROTECTED_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || die "protected binding tuple changed"

mapfile -t running_container_states < <(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get pods \
  -l 'app in (clawmanager-app,clawmanager-secret-broker)' \
  -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.ready}{"|"}{.restartCount}{"|"}{.imageID}{"\n"}{end}{end}')
[[ "${#running_container_states[@]}" -eq 4 ]] || die "expected four running app/broker container states"
for container_state in "${running_container_states[@]}"; do
  IFS='|' read -r ready restarts image_id <<<"$container_state"
  [[ "$ready" == true && "$restarts" == 0 ]] || die "app/broker Pod is not ready with zero restarts"
  [[ "$image_id" == *"${IMAGE_DIGEST}"* ]] || die "running Pod imageID does not match the reviewed digest"
done

echo "READY[secret-broker-label-ownership]: run_id=${RUN_ID} migration=true app_broker_digest=${IMAGE_DIGEST}"

kubectl --context="$CONTEXT" create namespace "$TEST_NAMESPACE" >/dev/null
TEST_NAMESPACE_UID="$(kubectl --context="$CONTEXT" get namespace "$TEST_NAMESPACE" -o jsonpath='{.metadata.uid}')"

# Seed two policy-shaped names through the administrative test harness so the
# broker must authorize the persisted metadata rather than trusting the name.
kubectl --context="$CONTEXT" --namespace="$TEST_NAMESPACE" create secret generic "$MISSING_SECRET" \
  --from-literal=smoke=missing-label --dry-run=client -o yaml | \
  kubectl --context="$CONTEXT" apply -f - >/dev/null
kubectl --context="$CONTEXT" --namespace="$TEST_NAMESPACE" create secret generic "$WRONG_SECRET" \
  --from-literal=smoke=wrong-label --dry-run=client -o yaml | \
  kubectl --context="$CONTEXT" apply -f - >/dev/null
kubectl --context="$CONTEXT" --namespace="$TEST_NAMESPACE" label secret "$WRONG_SECRET" \
  managed-by=clawreef "team-id=${TEST_ID}" >/dev/null

kubectl --context="$CONTEXT" --namespace="$NAMESPACE" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: ${PROBE_POD}
  namespace: ${NAMESPACE}
  labels:
    app: clawmanager-app
spec:
  serviceAccountName: ${APP_SERVICE_ACCOUNT}
  automountServiceAccountToken: false
  restartPolicy: Never
  containers:
    - name: client
      image: ${IMAGE_REF}
      command: ["/bin/sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: broker-token
          mountPath: /var/run/secrets/clawmanager-secret-broker
          readOnly: true
        - name: broker-ca
          mountPath: /var/run/secrets/clawmanager-secret-broker-ca
          readOnly: true
  volumes:
    - name: broker-token
      projected:
        sources:
          - serviceAccountToken:
              audience: clawmanager-secret-broker
              expirationSeconds: 600
              path: token
    - name: broker-ca
      configMap:
        name: clawmanager-secret-broker-ca
EOF
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" wait --for=condition=Ready "pod/$PROBE_POD" --timeout=180s >/dev/null

broker_status() {
  local path="$1" body="$2"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" exec "$PROBE_POD" -- /bin/sh -ceu '
    path="$1"
    body="$2"
    host="$3"
    token="$(cat /var/run/secrets/clawmanager-secret-broker/token)"
    response="$({
      printf "POST %s HTTP/1.1\r\nHost: %s\r\n" "$path" "$host"
      printf "Authorization: Bearer %s\r\n" "$token"
      printf "Content-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s" "${#body}" "$body"
    } | openssl s_client -quiet -connect "${host}:9444" -servername "$host" \
      -verify_hostname "$host" -verify_return_error \
      -CAfile /var/run/secrets/clawmanager-secret-broker-ca/ca.crt 2>/dev/null)"
    printf "%s\n" "$response" | sed -n "1{s/\r$//;p;}"
  ' -- "$path" "$body" "clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local"
}

expect_status() {
  local expected="$1" label="$2" path="$3" body="$4" status
  status="$(broker_status "$path" "$body")"
  case "$status" in
    "HTTP/1.1 ${expected} "*) ;;
    *) die "${label} returned unexpected status: ${status}" ;;
  esac
  echo "PASS[secret-broker-label-ownership:${label}]: HTTP ${expected}"
}

for tuple in \
  "missing|get|/v1/secrets/get|{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${MISSING_SECRET}\"}" \
  "missing|get-value|/v1/secrets/get-value|{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${MISSING_SECRET}\",\"key\":\"smoke\"}" \
  "missing|delete|/v1/secrets/delete|{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${MISSING_SECRET}\"}" \
  "wrong|get|/v1/secrets/get|{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${WRONG_SECRET}\"}" \
  "wrong|get-value|/v1/secrets/get-value|{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${WRONG_SECRET}\",\"key\":\"smoke\"}" \
  "wrong|delete|/v1/secrets/delete|{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${WRONG_SECRET}\"}"
do
  IFS='|' read -r ownership operation path body <<<"$tuple"
  expect_status 403 "${ownership}-${operation}" "$path" "$body"
done

kubectl --context="$CONTEXT" --namespace="$TEST_NAMESPACE" get secret "$MISSING_SECRET" "$WRONG_SECRET" \
  -o name >/dev/null || die "rejected point delete removed an invalidly labelled Secret"
echo "PASS[secret-broker-label-ownership:delete-preserved]: rejected Secrets remain present"

valid_upsert="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${VALID_SECRET}\",\"type\":\"Opaque\",\"data\":{\"smoke\":\"dmFsaWQ=\"},\"labels\":{\"managed-by\":\"clawreef\",\"team-id\":\"${VALID_ID}\"}}"
valid_get="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${VALID_SECRET}\"}"
valid_value="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${VALID_SECRET}\",\"key\":\"smoke\"}"
expect_status 204 valid-upsert /v1/secrets/upsert "$valid_upsert"
expect_status 200 valid-get /v1/secrets/get "$valid_get"
expect_status 200 valid-get-value /v1/secrets/get-value "$valid_value"
expect_status 204 valid-delete /v1/secrets/delete "$valid_get"
if kubectl --context="$CONTEXT" --namespace="$TEST_NAMESPACE" get secret "$VALID_SECRET" >/dev/null 2>&1; then
  die "valid point delete did not remove the broker-managed Secret"
fi

final_migration="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")].value}')"
[[ "$final_migration" == true ]] || die "migration changed during smoke"
[[ "$(binding_tuple "$TARGET_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || die "target binding changed during smoke"
[[ "$(binding_tuple "$PROTECTED_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || die "protected binding changed during smoke"

echo "DONE[secret-broker-label-ownership]: missing/wrong labels denied for get/get-value/delete; valid point lifecycle passed; bindings unchanged"
