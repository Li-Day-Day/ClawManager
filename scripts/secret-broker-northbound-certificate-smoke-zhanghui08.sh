#!/usr/bin/env bash
set -Eeuo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
SYSTEM_NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
CONFIRM_SMOKE="${CONFIRM_SECRET_BROKER_NORTHBOUND_CERTIFICATE_SMOKE:-false}"
EXPECTED_IMAGE_REF="${NORTHBOUND_SMOKE_IMAGE_REF:-}"
EXPECTED_IMAGE_DIGEST="${SECRET_BROKER_IMAGE_DIGEST:-}"
WAIT_SECONDS="${NORTHBOUND_CERTIFICATE_SMOKE_WAIT_SECONDS:-300}"
TARGET_CLUSTER_ADMIN_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_CLUSTER_ADMIN_BINDING="clawmanager-app-cluster-admin"
APP_SERVICE_ACCOUNT="clawmanager-app"
GATEWAY_NAME="clawmanager-northbound-gateway"
NETWORK_POLICY_NAME="clawmanager-northbound-certificate-smoke"
RUN_ID="d-northbound-cert-$(date -u +%Y%m%dT%H%M%SZ)"
RUN_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TMP_DIR="$(mktemp -d)"
SUCCESS=false
CLEANUP_FAILED=false

ACTIVE_TLS_SECRET="clawmanager-northbound-gateway-tls"
ACTIVE_CA_SECRET="clawmanager-northbound-gateway-ca"
MANAGED_CA_SECRET="clawmanager-northbound-managed-ca"
NEXT_TLS_SECRET="clawmanager-northbound-gateway-tls-next"
NEXT_CA_SECRET="clawmanager-northbound-gateway-ca-next"
SMOKE_SECRETS=(
  "$ACTIVE_TLS_SECRET"
  "$ACTIVE_CA_SECRET"
  "$MANAGED_CA_SECRET"
  "$NEXT_TLS_SECRET"
  "$NEXT_CA_SECRET"
)

die() {
  echo "FAIL[northbound-certificate-smoke]: $*" >&2
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

audit_count() {
  mysql_query "SELECT COUNT(*) FROM northbound_settings_audit WHERE action='$1'"
}

assert_two_ready() {
  local deployment="$1"
  local state
  state="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment "$deployment" \
    -o jsonpath='{.spec.replicas}{"|"}{.status.readyReplicas}{"|"}{.status.availableReplicas}')"
  [[ "$state" == '2|2|2' ]] || die "$deployment is not 2/2 Ready and Available: $state"
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
    die "$selector has an image ID outside the reviewed digest"
  fi
}

assert_zero_restarts() {
  local selector="$1"
  local restart_total
  restart_total="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods -l "$selector" \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.restartCount}{"\n"}{end}{end}' | \
    awk '{ total += $1 } END { print total + 0 }')"
  [[ "$restart_total" == 0 ]] || die "$selector restart total is $restart_total instead of 0"
}

assert_platform_safety() {
  [[ "$(app_env CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE)" == true ]] || die "app migration is not true"
  [[ "$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${SYSTEM_NAMESPACE}" ]] || \
    die "target cluster-admin binding tuple changed"
  [[ "$(binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || \
    die "protected cluster-admin binding tuple changed"
  assert_two_ready clawmanager-app
  assert_two_ready clawmanager-secret-broker
  assert_running_image_ids app=clawmanager-app 2
  assert_running_image_ids app=clawmanager-secret-broker 2
  assert_zero_restarts app=clawmanager-app
  assert_zero_restarts app=clawmanager-secret-broker
  [[ "$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-app \
    -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].image}')" == "$EXPECTED_IMAGE_REF" ]] || \
    die "app Deployment is not pinned to the reviewed image reference"
  [[ "$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment clawmanager-secret-broker \
    -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].image}')" == "$EXPECTED_IMAGE_REF" ]] || \
    die "broker Deployment is not pinned to the reviewed image reference"
}

resource_run_id() {
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get "$1" "$2" \
    -o jsonpath='{.metadata.labels.clawmanager\.io/smoke-run-id}' 2>/dev/null || true
}

delete_owned_resource() {
  local kind="$1"
  local name="$2"
  local actual_run_id
  if ! kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get "$kind" "$name" >/dev/null 2>&1; then
    return
  fi
  actual_run_id="$(resource_run_id "$kind" "$name")"
  if [[ "$actual_run_id" != "$RUN_ID" ]]; then
    echo "FAIL[northbound-certificate-smoke:cleanup]: refusing to delete unowned ${kind}/${name}" >&2
    CLEANUP_FAILED=true
    return
  fi
  if ! kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" delete "$kind" "$name" \
    --wait=true --timeout="${WAIT_SECONDS}s" >/dev/null; then
    echo "FAIL[northbound-certificate-smoke:cleanup]: could not delete ${kind}/${name}" >&2
    CLEANUP_FAILED=true
  fi
}

cleanup() {
  set +e
  delete_owned_resource deployment "$GATEWAY_NAME"
  delete_owned_resource service "$GATEWAY_NAME"
  delete_owned_resource networkpolicy "$NETWORK_POLICY_NAME"
  local secret_name
  for secret_name in "${SMOKE_SECRETS[@]}"; do
    delete_owned_resource secret "$secret_name"
  done
  rm -rf -- "$TMP_DIR"
  if [[ "$CLEANUP_FAILED" == true ]]; then
    return 1
  fi
  echo "CLEANED[northbound-certificate-smoke]: exact run-id resources and local certificate scratch removed"
  return 0
}

on_exit() {
  local status=$?
  trap - EXIT
  if ! cleanup; then
    status=1
  fi
  if [[ "$status" -ne 0 ]]; then
    echo "FAILED[northbound-certificate-smoke]: both cluster-admin bindings were left unchanged" >&2
  fi
  exit "$status"
}
trap on_exit EXIT

create_tls_secret() {
  local name="$1"
  local cert_file="$2"
  local key_file="$3"
  local stage="$4"
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" create secret tls "$name" \
    --cert="$cert_file" --key="$key_file" --dry-run=client -o yaml | \
    kubectl label --local -f - \
      app.kubernetes.io/managed-by=clawmanager \
      "clawmanager.io/northbound-certificate=${stage}" \
      "clawmanager.io/smoke-run-id=${RUN_ID}" --overwrite -o yaml | \
    kubectl --context="$CONTEXT" apply -f - >/dev/null
}

create_ca_secret() {
  local name="$1"
  local ca_file="$2"
  local stage="$3"
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" create secret generic "$name" \
    --type=Opaque --from-file="ca.crt=${ca_file}" --dry-run=client -o yaml | \
    kubectl label --local -f - \
      app.kubernetes.io/managed-by=clawmanager \
      "clawmanager.io/northbound-certificate=${stage}" \
      "clawmanager.io/smoke-run-id=${RUN_ID}" --overwrite -o yaml | \
    kubectl --context="$CONTEXT" apply -f - >/dev/null
}

extract_secret_key() {
  local name="$1"
  local key="$2"
  local output_file="$3"
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get secret "$name" \
    -o "go-template={{index .data \"${key}\" | base64decode}}" >"$output_file"
  [[ -s "$output_file" ]] || die "Secret $name is missing required key $key"
}

certificate_fingerprint() {
  openssl x509 -in "$1" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' | tr '[:upper:]' '[:lower:]'
}

assert_secret_owned() {
  local name="$1"
  local expected_type="$2"
  local expected_keys="$3"
  local actual
  actual="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get secret "$name" \
    -o go-template='{{.type}}|{{index .metadata.labels "app.kubernetes.io/managed-by"}}|{{index .metadata.labels "clawmanager.io/smoke-run-id"}}|{{range $key,$unused := .data}}{{$key}},{{end}}')"
  [[ "$actual" == "${expected_type}|clawmanager|${RUN_ID}|${expected_keys}" ]] || \
    die "Secret $name metadata or key set changed: $actual"
}

assert_gateway_handshake() {
  local pod
  pod="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods \
    -l "app=${GATEWAY_NAME},clawmanager.io/smoke-run-id=${RUN_ID}" \
    --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')"
  [[ -n "$pod" ]] || die "no running synthetic Gateway Pod"
  kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" exec "$pod" -- sh -c \
    'openssl s_client -connect 127.0.0.1:9443 -servername clawmanager-northbound-gateway -verify_hostname clawmanager-northbound-gateway -verify_return_error -CAfile /etc/clawmanager/northbound/ca/ca.crt </dev/null >/dev/null 2>&1' || \
    die "synthetic Gateway TLS handshake failed"
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

[[ "$CONFIRM_SMOKE" == true ]] || die "CONFIRM_SECRET_BROKER_NORTHBOUND_CERTIFICATE_SMOKE=true is required"
[[ "$SYSTEM_NAMESPACE" == *-system ]] || die "SOURCE_NAMESPACE must end in -system"
[[ "$EXPECTED_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "SECRET_BROKER_IMAGE_DIGEST is invalid"
[[ "$EXPECTED_IMAGE_REF" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]] || die "NORTHBOUND_SMOKE_IMAGE_REF must be an immutable image@sha256 reference"
[[ "$EXPECTED_IMAGE_REF" == *"@${EXPECTED_IMAGE_DIGEST}" ]] || die "NORTHBOUND_SMOKE_IMAGE_REF does not match SECRET_BROKER_IMAGE_DIGEST"
[[ "$WAIT_SECONDS" =~ ^[0-9]+$ && "$WAIT_SECONDS" -ge 120 && "$WAIT_SECONDS" -le 900 ]] || \
  die "NORTHBOUND_CERTIFICATE_SMOKE_WAIT_SECONDS must be an integer from 120 through 900"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"

assert_platform_safety

for kind_and_name in \
  "deployment/$GATEWAY_NAME" \
  "service/$GATEWAY_NAME" \
  "networkpolicy/$NETWORK_POLICY_NAME"; do
  if kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get "$kind_and_name" >/dev/null 2>&1; then
    die "baseline resource already exists: $kind_and_name"
  fi
done
for secret_name in "${SMOKE_SECRETS[@]}"; do
  if kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get secret "$secret_name" >/dev/null 2>&1; then
    die "baseline Secret already exists: $secret_name"
  fi
done

PREPARE_AUDIT_BEFORE="$(audit_count certificate.prepare)"
ACTIVATE_AUDIT_BEFORE="$(audit_count certificate.activate)"
[[ "$PREPARE_AUDIT_BEFORE" =~ ^[0-9]+$ && "$ACTIVATE_AUDIT_BEFORE" =~ ^[0-9]+$ ]] || die "could not read certificate audit baseline"
SETTINGS_BEFORE="$(mysql_query 'SELECT api_enabled,external_node_port,require_explicit_callers,version FROM northbound_admin_settings WHERE id=1')"
[[ -n "$SETTINGS_BEFORE" ]] || die "could not read Northbound settings baseline"

umask 077
cat >"$TMP_DIR/ca.cnf" <<'EOF'
[req]
distinguished_name = dn
x509_extensions = v3_ca
prompt = no
[dn]
CN = ClawManager Northbound Smoke CA
[v3_ca]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
EOF
cat >"$TMP_DIR/leaf.cnf" <<EOF
[v3_server]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = ${GATEWAY_NAME}
DNS.2 = ${GATEWAY_NAME}.${SYSTEM_NAMESPACE}.svc
DNS.3 = ${GATEWAY_NAME}.${SYSTEM_NAMESPACE}.svc.cluster.local
EOF

openssl req -x509 -newkey rsa:3072 -nodes -days 30 -sha256 -config "$TMP_DIR/ca.cnf" \
  -keyout "$TMP_DIR/legacy-ca.key" -out "$TMP_DIR/legacy-ca.crt" >/dev/null 2>&1
openssl req -x509 -newkey rsa:3072 -nodes -days 30 -sha256 -config "$TMP_DIR/ca.cnf" \
  -subj '/CN=ClawManager Northbound Managed Smoke CA' \
  -keyout "$TMP_DIR/managed-ca.key" -out "$TMP_DIR/managed-ca.crt" >/dev/null 2>&1

for leaf in active seeded-next; do
  openssl req -new -newkey rsa:2048 -nodes -sha256 \
    -subj "/CN=${GATEWAY_NAME}" \
    -keyout "$TMP_DIR/${leaf}.key" -out "$TMP_DIR/${leaf}.csr" >/dev/null 2>&1
done
openssl x509 -req -in "$TMP_DIR/active.csr" -CA "$TMP_DIR/legacy-ca.crt" -CAkey "$TMP_DIR/legacy-ca.key" \
  -CAcreateserial -days 30 -sha256 -extfile "$TMP_DIR/leaf.cnf" -extensions v3_server \
  -out "$TMP_DIR/active.crt" >/dev/null 2>&1
openssl x509 -req -in "$TMP_DIR/seeded-next.csr" -CA "$TMP_DIR/managed-ca.crt" -CAkey "$TMP_DIR/managed-ca.key" \
  -CAcreateserial -days 30 -sha256 -extfile "$TMP_DIR/leaf.cnf" -extensions v3_server \
  -out "$TMP_DIR/seeded-next.crt" >/dev/null 2>&1

LEGACY_CA_FINGERPRINT="$(certificate_fingerprint "$TMP_DIR/legacy-ca.crt")"
MANAGED_CA_FINGERPRINT="$(certificate_fingerprint "$TMP_DIR/managed-ca.crt")"
ACTIVE_FINGERPRINT_BEFORE="$(certificate_fingerprint "$TMP_DIR/active.crt")"
SEEDED_NEXT_FINGERPRINT="$(certificate_fingerprint "$TMP_DIR/seeded-next.crt")"
[[ "$LEGACY_CA_FINGERPRINT" != "$MANAGED_CA_FINGERPRINT" ]] || die "legacy and managed CA fingerprints unexpectedly match"
[[ "$ACTIVE_FINGERPRINT_BEFORE" != "$SEEDED_NEXT_FINGERPRINT" ]] || die "active and seeded staged leaf fingerprints unexpectedly match"

create_tls_secret "$ACTIVE_TLS_SECRET" "$TMP_DIR/active.crt" "$TMP_DIR/active.key" active
create_ca_secret "$ACTIVE_CA_SECRET" "$TMP_DIR/legacy-ca.crt" active
create_tls_secret "$MANAGED_CA_SECRET" "$TMP_DIR/managed-ca.crt" "$TMP_DIR/managed-ca.key" staged
create_tls_secret "$NEXT_TLS_SECRET" "$TMP_DIR/seeded-next.crt" "$TMP_DIR/seeded-next.key" staged
create_ca_secret "$NEXT_CA_SECRET" "$TMP_DIR/managed-ca.crt" staged

kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" apply -f - >/dev/null <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${GATEWAY_NAME}
  labels:
    app: ${GATEWAY_NAME}
    clawmanager.io/smoke-run-id: ${RUN_ID}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${GATEWAY_NAME}
  template:
    metadata:
      labels:
        app: ${GATEWAY_NAME}
        clawmanager.io/smoke-run-id: ${RUN_ID}
    spec:
      automountServiceAccountToken: false
      enableServiceLinks: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: tls-endpoint
          image: ${EXPECTED_IMAGE_REF}
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - exec openssl s_server -accept 9443 -cert /etc/clawmanager/northbound/server/tls.crt -key /etc/clawmanager/northbound/server/tls.key -www -quiet
          ports:
            - name: https
              containerPort: 9443
          readinessProbe:
            tcpSocket:
              port: https
            initialDelaySeconds: 2
            periodSeconds: 2
          livenessProbe:
            tcpSocket:
              port: https
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              cpu: 100m
              memory: 64Mi
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
            readOnlyRootFilesystem: true
          volumeMounts:
            - name: tls
              mountPath: /etc/clawmanager/northbound/server
              readOnly: true
            - name: ca
              mountPath: /etc/clawmanager/northbound/ca
              readOnly: true
      volumes:
        - name: tls
          secret:
            secretName: ${ACTIVE_TLS_SECRET}
        - name: ca
          secret:
            secretName: ${ACTIVE_CA_SECRET}
---
apiVersion: v1
kind: Service
metadata:
  name: ${GATEWAY_NAME}
  labels:
    app: ${GATEWAY_NAME}
    clawmanager.io/smoke-run-id: ${RUN_ID}
spec:
  type: ClusterIP
  selector:
    app: ${GATEWAY_NAME}
  ports:
    - name: https
      port: 9443
      targetPort: https
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${NETWORK_POLICY_NAME}
  labels:
    clawmanager.io/smoke-run-id: ${RUN_ID}
spec:
  podSelector:
    matchLabels:
      app: ${GATEWAY_NAME}
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: clawmanager-app
      ports:
        - protocol: TCP
          port: 9443
EOF

kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" rollout status deployment "$GATEWAY_NAME" --timeout="${WAIT_SECONDS}s" >/dev/null
[[ "$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get service "$GATEWAY_NAME" -o jsonpath='{.spec.type}')" == ClusterIP ]] || \
  die "synthetic Gateway Service is not ClusterIP-only"
[[ -z "$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get service "$GATEWAY_NAME" -o jsonpath='{range .spec.ports[*]}{.nodePort}{end}')" ]] || \
  die "synthetic Gateway Service unexpectedly has a NodePort"

assert_secret_owned "$ACTIVE_TLS_SECRET" kubernetes.io/tls 'tls.crt,tls.key,'
assert_secret_owned "$ACTIVE_CA_SECRET" Opaque 'ca.crt,'
assert_secret_owned "$MANAGED_CA_SECRET" kubernetes.io/tls 'tls.crt,tls.key,'
assert_secret_owned "$NEXT_TLS_SECRET" kubernetes.io/tls 'tls.crt,tls.key,'
assert_secret_owned "$NEXT_CA_SECRET" Opaque 'ca.crt,'
assert_gateway_handshake

GATEWAY_POD_UID_BEFORE="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods \
  -l "app=${GATEWAY_NAME},clawmanager.io/smoke-run-id=${RUN_ID}" -o jsonpath='{.items[0].metadata.uid}')"
[[ -n "$GATEWAY_POD_UID_BEFORE" ]] || die "could not capture initial synthetic Gateway Pod UID"

echo "READY[northbound-certificate-smoke]: run_id=$RUN_ID cluster_ip_only=true api_workload=false database_accounts=0"
echo "BASELINE[northbound-certificate-smoke]: five run-id-owned certificate Secrets, one synthetic TLS endpoint, migration=true legacy_ca_sha256=$LEGACY_CA_FINGERPRINT active_leaf_sha256=$ACTIVE_FINGERPRINT_BEFORE"
echo "ACTION[northbound-certificate-smoke:prepare]: open 管理后台 > 北向接口; in 内部 CA 纳管与续签 set DNS SAN to:"
echo "${GATEWAY_NAME}, ${GATEWAY_NAME}.${SYSTEM_NAMESPACE}.svc, ${GATEWAY_NAME}.${SYSTEM_NAMESPACE}.svc.cluster.local"
echo "ACTION[northbound-certificate-smoke:prepare]: clear IP SAN, set 证书有效期 to 30, click 准备托管证书, wait for the green success message, then press Enter here. Do not click activation yet."
read -r

assert_secret_owned "$MANAGED_CA_SECRET" kubernetes.io/tls 'tls.crt,tls.key,'
assert_secret_owned "$NEXT_TLS_SECRET" kubernetes.io/tls 'tls.crt,tls.key,'
assert_secret_owned "$NEXT_CA_SECRET" Opaque 'ca.crt,'
extract_secret_key "$NEXT_TLS_SECRET" tls.crt "$TMP_DIR/prepared-leaf.crt"
extract_secret_key "$NEXT_CA_SECRET" ca.crt "$TMP_DIR/prepared-ca.crt"
extract_secret_key "$MANAGED_CA_SECRET" tls.crt "$TMP_DIR/managed-ca-after-prepare.crt"

PREPARED_FINGERPRINT="$(certificate_fingerprint "$TMP_DIR/prepared-leaf.crt")"
PREPARED_CA_FINGERPRINT="$(certificate_fingerprint "$TMP_DIR/prepared-ca.crt")"
MANAGED_CA_AFTER_FINGERPRINT="$(certificate_fingerprint "$TMP_DIR/managed-ca-after-prepare.crt")"
[[ "$PREPARED_FINGERPRINT" != "$SEEDED_NEXT_FINGERPRINT" ]] || die "prepare did not replace the seeded staged leaf certificate"
[[ "$PREPARED_FINGERPRINT" != "$ACTIVE_FINGERPRINT_BEFORE" ]] || die "prepared and active leaf fingerprints match before activation"
[[ "$PREPARED_CA_FINGERPRINT" == "$MANAGED_CA_FINGERPRINT" && "$MANAGED_CA_AFTER_FINGERPRINT" == "$MANAGED_CA_FINGERPRINT" ]] || \
  die "prepared CA does not match the run-owned managed CA"
openssl verify -CAfile "$TMP_DIR/prepared-ca.crt" "$TMP_DIR/prepared-leaf.crt" >/dev/null 2>&1 || die "prepared leaf does not verify against prepared CA"
openssl x509 -in "$TMP_DIR/prepared-leaf.crt" -noout -checkend 86400 >/dev/null 2>&1 || die "prepared leaf expires within 24 hours"
PREPARE_AUDIT_AFTER="$(audit_count certificate.prepare)"
[[ "$PREPARE_AUDIT_AFTER" -eq $((PREPARE_AUDIT_BEFORE + 1)) ]] || die "certificate.prepare audit count did not increase by exactly one"
echo "PASS[northbound-certificate-smoke:prepare]: staged leaf and managed CA verified; active leaf unchanged; audit incremented once prepared_leaf_sha256=$PREPARED_FINGERPRINT prepared_ca_sha256=$PREPARED_CA_FINGERPRINT"
echo "ACTION[northbound-certificate-smoke:activate]: in the same page click 已分发 CA，确认激活, accept the browser confirmation, wait for the green success message, then press Enter here."
read -r

kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" rollout status deployment "$GATEWAY_NAME" --timeout="${WAIT_SECONDS}s" >/dev/null
GATEWAY_POD_UID_AFTER="$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get pods \
  -l "app=${GATEWAY_NAME},clawmanager.io/smoke-run-id=${RUN_ID}" -o jsonpath='{.items[0].metadata.uid}')"
[[ -n "$GATEWAY_POD_UID_AFTER" && "$GATEWAY_POD_UID_AFTER" != "$GATEWAY_POD_UID_BEFORE" ]] || die "Gateway Pod was not replaced by certificate activation"
[[ -n "$(kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get deployment "$GATEWAY_NAME" \
  -o jsonpath='{.spec.template.metadata.annotations.clawmanager\.io/northbound-certificate-activated-at}')" ]] || \
  die "Gateway activation rollout annotation is missing"

assert_secret_owned "$ACTIVE_TLS_SECRET" kubernetes.io/tls 'tls.crt,tls.key,'
assert_secret_owned "$ACTIVE_CA_SECRET" Opaque 'ca.crt,'
for next_secret in "$NEXT_TLS_SECRET" "$NEXT_CA_SECRET"; do
  if kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get secret "$next_secret" >/dev/null 2>&1; then
    die "staged Secret remains after activation: $next_secret"
  fi
done
extract_secret_key "$ACTIVE_TLS_SECRET" tls.crt "$TMP_DIR/active-after.crt"
extract_secret_key "$ACTIVE_CA_SECRET" ca.crt "$TMP_DIR/active-ca-after.crt"
ACTIVE_FINGERPRINT_AFTER="$(certificate_fingerprint "$TMP_DIR/active-after.crt")"
ACTIVE_CA_FINGERPRINT_AFTER="$(certificate_fingerprint "$TMP_DIR/active-ca-after.crt")"
[[ "$ACTIVE_FINGERPRINT_AFTER" == "$PREPARED_FINGERPRINT" ]] || die "active leaf does not match the prepared leaf after activation"
[[ "$ACTIVE_CA_FINGERPRINT_AFTER" == "$PREPARED_CA_FINGERPRINT" ]] || die "active CA does not match the prepared CA after activation"
[[ "$ACTIVE_FINGERPRINT_AFTER" != "$ACTIVE_FINGERPRINT_BEFORE" ]] || die "active leaf fingerprint did not change"
[[ "$ACTIVE_CA_FINGERPRINT_AFTER" != "$LEGACY_CA_FINGERPRINT" ]] || die "active CA fingerprint did not change"
assert_gateway_handshake

ACTIVATE_AUDIT_AFTER="$(audit_count certificate.activate)"
[[ "$ACTIVATE_AUDIT_AFTER" -eq $((ACTIVATE_AUDIT_BEFORE + 1)) ]] || die "certificate.activate audit count did not increase by exactly one"
[[ "$(mysql_query 'SELECT api_enabled,external_node_port,require_explicit_callers,version FROM northbound_admin_settings WHERE id=1')" == "$SETTINGS_BEFORE" ]] || \
  die "Northbound settings changed during certificate-only smoke"
assert_no_broker_errors
assert_platform_safety
SUCCESS=true
echo "PASS[northbound-certificate-smoke:activate]: active leaf and CA changed to prepared values; Gateway rolled; TLS handshake passed; audit incremented once active_leaf_sha256=$ACTIVE_FINGERPRINT_AFTER active_ca_sha256=$ACTIVE_CA_FINGERPRINT_AFTER"
echo "PASS[northbound-certificate-smoke:safety]: migration=true, app/broker remain 2/2 on reviewed digest, both cluster-admin bindings unchanged"

cleanup || die "run-id cleanup failed"
trap - EXIT
[[ "$SUCCESS" == true ]] || die "smoke did not reach a successful terminal state"
assert_platform_safety
for kind_and_name in \
  "deployment/$GATEWAY_NAME" \
  "service/$GATEWAY_NAME" \
  "networkpolicy/$NETWORK_POLICY_NAME"; do
  if kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get "$kind_and_name" >/dev/null 2>&1; then
    die "run-owned resource remains after cleanup: $kind_and_name"
  fi
done
for secret_name in "${SMOKE_SECRETS[@]}"; do
  if kubectl --context="$CONTEXT" --namespace="$SYSTEM_NAMESPACE" get secret "$secret_name" >/dev/null 2>&1; then
    die "run-owned Secret remains after cleanup: $secret_name"
  fi
done
echo "DONE[northbound-certificate-smoke]: prepare/activate and CA rollover passed; synthetic endpoint and five run-owned Secrets removed; audit retained; do not remove either binding"
