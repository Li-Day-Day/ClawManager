#!/usr/bin/env bash
set -euo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
IMAGE="${SECRET_BROKER_IMAGE:-}"
APP_SERVICE_ACCOUNT="clawmanager-app"
BROKER_DEPLOYMENT="clawmanager-secret-broker"
TLS_SECRET="clawmanager-secret-broker-tls"
CA_CONFIGMAP="clawmanager-secret-broker-ca"
TARGET_CLUSTER_ADMIN_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_CLUSTER_ADMIN_BINDING="clawmanager-app-cluster-admin"
EXPECTED_ALLOWLIST_SHA256="57f8cc8e82e2f0a3d2ac893d792b49f1a4449e29100cfe25f16e6060d5a9428e"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
TEST_ID="$(date -u +%s)"
TEST_NAMESPACE="${NAMESPACE}-user-${TEST_ID}"
LEGACY_TEST_NAMESPACE="${NAMESPACE%-system}-user-${TEST_ID}"
TEST_SECRET="clawreef-${TEST_ID}-tls-openclaw-bootstrap"
TEST_TEAM_SECRET="clawreef-team-${TEST_ID}-bus"
PROBE_POD="secret-broker-tls-probe-${TEST_ID}"
TMP_DIR=""
TEST_NAMESPACE_UID=""

die() {
  echo "FAIL: $*" >&2
  exit 1
}

binding_tuple() {
  kubectl --context="$CONTEXT" get clusterrolebinding "$1" \
    -o jsonpath='{.roleRef.kind}{"|"}{.roleRef.name}{"|"}{range .subjects[*]}{.kind}{"|"}{.name}{"|"}{.namespace}{"\n"}{end}'
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
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" && "$TMP_DIR" == /tmp/clawmanager-secret-broker-tls.* ]]; then
    rm -rf -- "$TMP_DIR"
  fi
}
trap cleanup EXIT

[[ "$NAMESPACE" == *-system ]] || die "SOURCE_NAMESPACE must end in -system"
PREFIX="${NAMESPACE%-system}"
[[ -n "$IMAGE" ]] || die "SECRET_BROKER_IMAGE is required"
[[ "$IMAGE" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]] || \
  die "SECRET_BROKER_IMAGE must be an immutable image@sha256 digest"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"
command -v openssl >/dev/null || die "openssl is required for initial TLS provisioning"
command -v sha256sum >/dev/null || die "sha256sum is required"
command -v base64 >/dev/null || die "base64 is required"

[[ "$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || \
  die "target cluster-admin binding tuple changed"
[[ "$(binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || \
  die "protected cluster-admin binding tuple changed"

migration_complete="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}{.value}{end}')"
[[ "$migration_complete" != "true" ]] || die "refusing TLS staging: app broker migration is already enabled"

broker_image="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment "$BROKER_DEPLOYMENT" \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].image}')"
[[ "$broker_image" == "$IMAGE" ]] || die "broker deployment image does not match SECRET_BROKER_IMAGE"
allowlist_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment "$BROKER_DEPLOYMENT" \
  -o jsonpath='{.metadata.annotations.clawmanager\.io/secret-broker-read-allowlist-sha256}')"
[[ "$allowlist_hash" == "$EXPECTED_ALLOWLIST_SHA256" ]] || die "broker read allowlist hash changed"

tls_secret_exists=false
ca_configmap_exists=false
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret "$TLS_SECRET" >/dev/null 2>&1 && tls_secret_exists=true
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get configmap "$CA_CONFIGMAP" >/dev/null 2>&1 && ca_configmap_exists=true
[[ "$tls_secret_exists" == "$ca_configmap_exists" ]] || die "TLS Secret and CA ConfigMap must either both exist or both be absent"

if [[ "$tls_secret_exists" == false ]]; then
  umask 077
  TMP_DIR="$(mktemp -d /tmp/clawmanager-secret-broker-tls.XXXXXX)"
  service_name="clawmanager-secret-broker"
  service_fqdn="${service_name}.${NAMESPACE}.svc.cluster.local"

  cat >"$TMP_DIR/ca.cnf" <<EOF
[req]
prompt = no
distinguished_name = dn
x509_extensions = v3_ca
[dn]
CN = clawmanager-secret-broker-ca
[v3_ca]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF
  openssl ecparam -name prime256v1 -genkey -noout -out "$TMP_DIR/ca.key"
  openssl req -x509 -new -sha256 -days 30 -key "$TMP_DIR/ca.key" -out "$TMP_DIR/ca.crt" \
    -config "$TMP_DIR/ca.cnf" -extensions v3_ca
  openssl ecparam -name prime256v1 -genkey -noout -out "$TMP_DIR/tls.key"
  cat >"$TMP_DIR/server.cnf" <<EOF
[req]
prompt = no
distinguished_name = dn
req_extensions = req_ext
[dn]
CN = ${service_name}
[req_ext]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = ${service_name}
DNS.2 = ${service_name}.${NAMESPACE}
DNS.3 = ${service_name}.${NAMESPACE}.svc
DNS.4 = ${service_fqdn}
EOF
  openssl req -new -sha256 -key "$TMP_DIR/tls.key" -out "$TMP_DIR/tls.csr" -config "$TMP_DIR/server.cnf"
  openssl x509 -req -sha256 -days 30 -in "$TMP_DIR/tls.csr" \
    -CA "$TMP_DIR/ca.crt" -CAkey "$TMP_DIR/ca.key" -CAcreateserial \
    -out "$TMP_DIR/tls.crt" -extensions req_ext -extfile "$TMP_DIR/server.cnf"
  openssl verify -CAfile "$TMP_DIR/ca.crt" "$TMP_DIR/tls.crt" >/dev/null

  ca_sha256="$(sha256sum "$TMP_DIR/ca.crt" | awk '{print $1}')"
  cert_not_after="$(openssl x509 -in "$TMP_DIR/tls.crt" -noout -enddate | cut -d= -f2-)"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" create secret tls "$TLS_SECRET" \
    --cert="$TMP_DIR/tls.crt" --key="$TMP_DIR/tls.key" --dry-run=client -o yaml | \
    kubectl --context="$CONTEXT" apply -f - >/dev/null
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" create configmap "$CA_CONFIGMAP" \
    --from-file=ca.crt="$TMP_DIR/ca.crt" --dry-run=client -o yaml | \
    kubectl --context="$CONTEXT" apply -f - >/dev/null
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" annotate --overwrite secret "$TLS_SECRET" \
    clawmanager.io/ca-sha256="$ca_sha256" clawmanager.io/cert-not-after="$cert_not_after" >/dev/null
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" annotate --overwrite configmap "$CA_CONFIGMAP" \
    clawmanager.io/ca-sha256="$ca_sha256" clawmanager.io/cert-not-after="$cert_not_after" >/dev/null
else
  umask 077
  TMP_DIR="$(mktemp -d /tmp/clawmanager-secret-broker-tls.XXXXXX)"
  ca_sha256="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get configmap "$CA_CONFIGMAP" \
    -o jsonpath='{.metadata.annotations.clawmanager\.io/ca-sha256}')"
  secret_ca_sha256="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret "$TLS_SECRET" \
    -o jsonpath='{.metadata.annotations.clawmanager\.io/ca-sha256}')"
  [[ "$ca_sha256" =~ ^[0-9a-f]{64}$ && "$secret_ca_sha256" == "$ca_sha256" ]] || \
    die "existing TLS Secret/CA ConfigMap annotations do not match"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get configmap "$CA_CONFIGMAP" \
    -o jsonpath='{.data.ca\.crt}' >"$TMP_DIR/ca.crt"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret "$TLS_SECRET" \
    -o jsonpath='{.data.tls\.crt}' | base64 -d >"$TMP_DIR/tls.crt"
  actual_ca_sha256="$(sha256sum "$TMP_DIR/ca.crt" | awk '{print $1}')"
  [[ "$actual_ca_sha256" == "$ca_sha256" ]] || die "existing CA ConfigMap data hash does not match its annotation"
  openssl verify -CAfile "$TMP_DIR/ca.crt" "$TMP_DIR/tls.crt" >/dev/null || die "existing server certificate does not verify against the CA"
  openssl x509 -checkend 86400 -noout -in "$TMP_DIR/tls.crt" >/dev/null || die "existing server certificate expires within 24 hours"
fi

broker_patch="$(cat <<EOF
{"spec":{"template":{"metadata":{"annotations":{"clawmanager.io/secret-broker-ca-sha256":"${ca_sha256}"}},"spec":{"containers":[{"name":"secret-broker","env":[{"name":"CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS","value":"false"},{"name":"CLAWMANAGER_SECRET_BROKER_TLS_CERT_FILE","value":"/var/run/secrets/clawmanager-secret-broker-tls/tls.crt"},{"name":"CLAWMANAGER_SECRET_BROKER_TLS_KEY_FILE","value":"/var/run/secrets/clawmanager-secret-broker-tls/tls.key"}],"volumeMounts":[{"name":"secret-broker-tls","mountPath":"/var/run/secrets/clawmanager-secret-broker-tls","readOnly":true}],"readinessProbe":{"httpGet":{"scheme":"HTTPS","path":"/readyz","port":"http"}},"livenessProbe":{"httpGet":{"scheme":"HTTPS","path":"/healthz","port":"http"}}}],"volumes":[{"name":"secret-broker-tls","secret":{"secretName":"${TLS_SECRET}"}}]}}}}
EOF
)"
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" patch deployment "$BROKER_DEPLOYMENT" \
  --type=strategic --patch "$broker_patch" >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status \
  "deployment/$BROKER_DEPLOYMENT" --timeout=180s

broker_url="https://clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local:9444"
app_patch="$(cat <<EOF
{"spec":{"template":{"metadata":{"annotations":{"clawmanager.io/secret-broker-ca-sha256":"${ca_sha256}"}},"spec":{"containers":[{"name":"clawmanager-app","env":[{"name":"CLAWMANAGER_SECRET_BROKER_URL","value":"${broker_url}"},{"name":"CLAWMANAGER_SECRET_BROKER_TOKEN_FILE","value":"/var/run/secrets/clawmanager-secret-broker/token"},{"name":"CLAWMANAGER_SECRET_BROKER_CA_FILE","value":"/var/run/secrets/clawmanager-secret-broker-ca/ca.crt"},{"name":"CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE","value":"false"}],"volumeMounts":[{"name":"secret-broker-token","mountPath":"/var/run/secrets/clawmanager-secret-broker","readOnly":true},{"name":"secret-broker-ca","mountPath":"/var/run/secrets/clawmanager-secret-broker-ca","readOnly":true}]}],"volumes":[{"name":"secret-broker-token","projected":{"sources":[{"serviceAccountToken":{"audience":"clawmanager-secret-broker","expirationSeconds":600,"path":"token"}}]}},{"name":"secret-broker-ca","configMap":{"name":"${CA_CONFIGMAP}"}}]}}}}
EOF
)"
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" patch deployment clawmanager-app \
  --type=strategic --patch "$app_patch" >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status deployment/clawmanager-app --timeout=300s

kubectl --context="$CONTEXT" create namespace "$TEST_NAMESPACE" >/dev/null
TEST_NAMESPACE_UID="$(kubectl --context="$CONTEXT" get namespace "$TEST_NAMESPACE" -o jsonpath='{.metadata.uid}')"
kubectl --context="$CONTEXT" apply -f - >/dev/null <<EOF
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
      image: ${IMAGE}
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
        name: ${CA_CONFIGMAP}
EOF
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" wait --for=condition=Ready \
  "pod/$PROBE_POD" --timeout=180s

tls_request_from_probe() {
  local method="$1" path="$2" body="$3" authenticated="$4"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" exec "$PROBE_POD" -- /bin/sh -ceu '
    method="$1"
    path="$2"
    body="$3"
    host="$4"
    authenticated="$5"
    ca_file=/var/run/secrets/clawmanager-secret-broker-ca/ca.crt
    command -v openssl >/dev/null
    if [ "$authenticated" = true ]; then
      token="$(cat /var/run/secrets/clawmanager-secret-broker/token)"
      response="$({
        printf "%s %s HTTP/1.1\r\nHost: %s\r\n" "$method" "$path" "$host"
        printf "Authorization: Bearer %s\r\n" "$token"
        printf "Content-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s" "${#body}" "$body"
      } | openssl s_client -quiet -connect "${host}:9444" -servername "$host" \
        -verify_hostname "$host" -verify_return_error -CAfile "$ca_file" 2>/dev/null)"
    else
      response="$({
        printf "%s %s HTTP/1.1\r\nHost: %s\r\n" "$method" "$path" "$host"
        printf "Content-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s" "${#body}" "$body"
      } | openssl s_client -quiet -connect "${host}:9444" -servername "$host" \
        -verify_hostname "$host" -verify_return_error -CAfile "$ca_file" 2>/dev/null)"
    fi
    status="$(printf "%s\n" "$response" | sed -n "1{s/\r$//;p;}")"
    case "$status" in
      "HTTP/1.1 200 "*|"HTTP/1.1 204 "*) ;;
      *) printf "unexpected broker response: %s\n" "$status" >&2; exit 1 ;;
    esac
    printf "%s" "$response"
  ' -- "$method" "$path" "$body" "clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local" "$authenticated"
}

post_from_probe() {
  local path="$1" body="$2"
  tls_request_from_probe POST "$path" "$body" true
}

tls_request_from_probe GET /readyz "" false >/dev/null
if kubectl --context="$CONTEXT" --namespace="$NAMESPACE" exec "$PROBE_POD" -- \
  wget -qO- -T 5 "http://clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local:9444/healthz" >/dev/null 2>&1; then
  die "plaintext HTTP unexpectedly reached the TLS broker"
fi

upsert_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_SECRET}\",\"type\":\"Opaque\",\"data\":{\"smoke\":\"dGxzLXNtb2tl\"},\"labels\":{\"managed-by\":\"clawreef\",\"instance-id\":\"${TEST_ID}\"}}"
post_from_probe /v1/secrets/upsert "$upsert_body" >/dev/null
value_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_SECRET}\",\"key\":\"smoke\"}"
value_response="$(post_from_probe /v1/secrets/get-value "$value_body")"
[[ "$value_response" == *'"value":"dGxzLXNtb2tl"'* ]] || die "TLS broker get-value response mismatch"
team_upsert_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_TEAM_SECRET}\",\"type\":\"Opaque\",\"data\":{\"CLAWMANAGER_TEAM_TOKEN\":\"dGVhbS10b2tlbg==\",\"CLAWMANAGER_TEAM_REDIS_URL\":\"cmVkaXM6Ly9yZWRpczo2Mzc5LzA=\"},\"labels\":{\"managed-by\":\"clawreef\",\"team-id\":\"${TEST_ID}\"}}"
post_from_probe /v1/secrets/upsert "$team_upsert_body" >/dev/null
team_value_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_TEAM_SECRET}\",\"key\":\"CLAWMANAGER_TEAM_TOKEN\"}"
team_value_response="$(post_from_probe /v1/secrets/get-value "$team_value_body")"
[[ "$team_value_response" == *'"value":"dGVhbS10b2tlbg=="'* ]] || die "TLS broker Team get-value response mismatch"
legacy_team_upsert_body="{\"namespace\":\"${LEGACY_TEST_NAMESPACE}\",\"name\":\"${TEST_TEAM_SECRET}\",\"type\":\"Opaque\",\"data\":{\"CLAWMANAGER_TEAM_TOKEN\":\"dGVhbS10b2tlbg==\"},\"labels\":{\"managed-by\":\"clawreef\",\"team-id\":\"${TEST_ID}\"}}"
if post_from_probe /v1/secrets/upsert "$legacy_team_upsert_body" >/dev/null 2>&1; then
  die "TLS broker allowed the obsolete base-prefix tenant namespace"
fi
delete_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"labels\":{\"managed-by\":\"clawreef\",\"instance-id\":\"${TEST_ID}\"}}"
post_from_probe /v1/secrets/delete-by-labels "$delete_body" >/dev/null
post_from_probe /v1/secrets/delete \
  "{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_TEAM_SECRET}\"}" >/dev/null
if kubectl --context="$CONTEXT" --namespace="$TEST_NAMESPACE" get secret "$TEST_SECRET" >/dev/null 2>&1; then
  die "TLS broker cleanup did not delete the functional-test Secret"
fi
if kubectl --context="$CONTEXT" --namespace="$TEST_NAMESPACE" get secret "$TEST_TEAM_SECRET" >/dev/null 2>&1; then
  die "TLS broker cleanup did not delete the Team functional-test Secret"
fi

final_migration="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")].value}')"
[[ "$final_migration" == "false" ]] || die "app migration changed during TLS staging"
[[ "$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || \
  die "target cluster-admin binding changed during TLS staging"

echo "PASS[broker-tls]: image=$IMAGE"
echo "PASS[broker-tls]: ca_sha256=$ca_sha256"
echo "PASS[broker-tls]: url=$broker_url"
echo "PASS[broker-tls]: TLS health, instance and Team Secret lifecycle, namespace-policy denial, and plaintext rejection"
echo "STAGED[broker-tls]: app configuration is mounted but migration remains false; cluster-admin bindings were not deleted"

cleanup
trap - EXIT
echo "CLEANED[broker-tls]: temporary certificate files, probe Pod and namespace run_id=$RUN_ID"
