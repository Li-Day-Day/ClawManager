#!/usr/bin/env bash
set -Eeuo pipefail

CONTEXT="${KUBE_CONTEXT:?KUBE_CONTEXT is required}"
NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-system}"
VALID_DAYS="${SECRET_BROKER_TLS_DAYS:-365}"
TLS_SECRET="clawmanager-secret-broker-tls"
CA_CONFIGMAP="clawmanager-secret-broker-ca"
SERVICE_NAME="clawmanager-secret-broker"
TMP_DIR=""

die() {
  echo "FAIL[secret-broker-pki]: $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" && "$TMP_DIR" == /tmp/clawmanager-secret-broker-pki.* ]]; then
    rm -rf -- "$TMP_DIR"
  fi
}
trap cleanup EXIT

[[ "$VALID_DAYS" =~ ^[1-9][0-9]*$ ]] || die "SECRET_BROKER_TLS_DAYS must be a positive integer"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"
command -v openssl >/dev/null || die "openssl is required"
command -v sha256sum >/dev/null || die "sha256sum is required"

kubectl --context="$CONTEXT" create namespace "$NAMESPACE" --dry-run=client -o yaml | \
  kubectl --context="$CONTEXT" apply -f - >/dev/null

secret_exists=false
configmap_exists=false
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret "$TLS_SECRET" >/dev/null 2>&1 && secret_exists=true
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get configmap "$CA_CONFIGMAP" >/dev/null 2>&1 && configmap_exists=true
[[ "$secret_exists" == "$configmap_exists" ]] || die "TLS Secret and CA ConfigMap must either both exist or both be absent"

umask 077
TMP_DIR="$(mktemp -d /tmp/clawmanager-secret-broker-pki.XXXXXX)"
service_fqdn="${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local"

if [[ "$secret_exists" == true ]]; then
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get configmap "$CA_CONFIGMAP" \
    -o jsonpath='{.data.ca\.crt}' >"$TMP_DIR/ca.crt"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret "$TLS_SECRET" \
    -o jsonpath='{.data.tls\.crt}' | base64 -d >"$TMP_DIR/tls.crt"
  openssl verify -CAfile "$TMP_DIR/ca.crt" "$TMP_DIR/tls.crt" >/dev/null || die "existing broker certificate does not verify against the configured CA"
  openssl x509 -checkhost "$service_fqdn" -noout -in "$TMP_DIR/tls.crt" >/dev/null || die "existing broker certificate does not cover the Service FQDN"
  openssl x509 -checkend 86400 -noout -in "$TMP_DIR/tls.crt" >/dev/null || die "existing broker certificate expires within 24 hours"
  ca_sha256="$(sha256sum "$TMP_DIR/ca.crt" | awk '{print $1}')"
  secret_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret "$TLS_SECRET" -o jsonpath='{.metadata.annotations.clawmanager\.io/ca-sha256}')"
  configmap_hash="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get configmap "$CA_CONFIGMAP" -o jsonpath='{.metadata.annotations.clawmanager\.io/ca-sha256}')"
  [[ "$secret_hash" == "$ca_sha256" && "$configmap_hash" == "$ca_sha256" ]] || die "existing PKI annotations do not match the public CA"
  echo "READY[secret-broker-pki]: existing TLS Secret and CA ConfigMap verified ca_sha256=${ca_sha256}"
  exit 0
fi

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

cat >"$TMP_DIR/tls.cnf" <<EOF
[req]
prompt = no
distinguished_name = dn
req_extensions = v3_req
[dn]
CN = ${SERVICE_NAME}
[v3_req]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = ${SERVICE_NAME}
DNS.2 = ${SERVICE_NAME}.${NAMESPACE}
DNS.3 = ${SERVICE_NAME}.${NAMESPACE}.svc
DNS.4 = ${service_fqdn}
EOF

openssl ecparam -name prime256v1 -genkey -noout -out "$TMP_DIR/ca.key"
openssl req -x509 -new -sha256 -days "$VALID_DAYS" -key "$TMP_DIR/ca.key" \
  -out "$TMP_DIR/ca.crt" -config "$TMP_DIR/ca.cnf"
openssl ecparam -name prime256v1 -genkey -noout -out "$TMP_DIR/tls.key"
openssl req -new -sha256 -key "$TMP_DIR/tls.key" -out "$TMP_DIR/tls.csr" -config "$TMP_DIR/tls.cnf"
openssl x509 -req -sha256 -days "$VALID_DAYS" -in "$TMP_DIR/tls.csr" \
  -CA "$TMP_DIR/ca.crt" -CAkey "$TMP_DIR/ca.key" -CAcreateserial \
  -out "$TMP_DIR/tls.crt" -extfile "$TMP_DIR/tls.cnf" -extensions v3_req
openssl verify -CAfile "$TMP_DIR/ca.crt" "$TMP_DIR/tls.crt" >/dev/null
openssl x509 -checkhost "$service_fqdn" -noout -in "$TMP_DIR/tls.crt" >/dev/null

ca_sha256="$(sha256sum "$TMP_DIR/ca.crt" | awk '{print $1}')"
cert_not_after="$(openssl x509 -enddate -noout -in "$TMP_DIR/tls.crt" | cut -d= -f2-)"

kubectl --context="$CONTEXT" --namespace="$NAMESPACE" create secret tls "$TLS_SECRET" \
  --cert="$TMP_DIR/tls.crt" --key="$TMP_DIR/tls.key" --dry-run=client -o yaml | \
  kubectl --context="$CONTEXT" apply -f - >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" create configmap "$CA_CONFIGMAP" \
  --from-file=ca.crt="$TMP_DIR/ca.crt" --dry-run=client -o yaml | \
  kubectl --context="$CONTEXT" apply -f - >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" label --overwrite secret "$TLS_SECRET" \
  app.kubernetes.io/managed-by=clawmanager >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" label --overwrite configmap "$CA_CONFIGMAP" \
  app.kubernetes.io/managed-by=clawmanager >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" annotate --overwrite secret "$TLS_SECRET" \
  clawmanager.io/ca-sha256="$ca_sha256" clawmanager.io/cert-not-after="$cert_not_after" >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" annotate --overwrite configmap "$CA_CONFIGMAP" \
  clawmanager.io/ca-sha256="$ca_sha256" clawmanager.io/cert-not-after="$cert_not_after" >/dev/null

echo "DONE[secret-broker-pki]: TLS Secret and CA ConfigMap created ca_sha256=${ca_sha256}"
