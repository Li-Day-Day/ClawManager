#!/usr/bin/env bash
set -euo pipefail
# Read-only metadata inventory. No Secret/config bodies, pod exec, downloads,
# local files, kubeconfig changes, provider calls, or resource mutations.
CONTEXT='kubernetes-admin@kubernetes'
NAMESPACE='clawmanager-zhanghui08-system'
EXPECTED_UID='337cfe30-2c17-4b8e-b32a-760778b8098e'
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
command -v kubectl >/dev/null || fail 'kubectl missing; nothing installed'
kube() { kubectl --context="$CONTEXT" --request-timeout=20s "$@" 2>/dev/null; }
[[ "$(kube config current-context)" == "$CONTEXT" ]] || fail 'context mismatch'
insecure="$(kube config view --minify -o jsonpath='{.clusters[0].cluster.insecure-skip-tls-verify}')" || fail 'TLS policy unavailable'
[[ -z "$insecure" || "$insecure" == false ]] || fail 'TLS verification disabled'
server="$(kube config view --minify -o jsonpath='{.clusters[0].cluster.server}')" || fail 'API transport unavailable'
[[ "$server" == https://* ]] || fail 'HTTPS required'
unset server
[[ "$(kube get namespace "$NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$EXPECTED_UID" ]] || fail 'namespace UID mismatch'
printf '%s\n' 'D_PROVIDER_READINESS_V1' "namespace=$NAMESPACE" "namespace_uid=$EXPECTED_UID"
for tool in kubectl openssl python3 node aws vault bao mc docker ctr crictl; do
  if command -v "$tool" >/dev/null; then printf 'tool=%s available\n' "$tool"; else printf 'tool=%s missing\n' "$tool"; fi
done

# List metadata only. Names are discovery hints, never proof of provider capability.
workloads="$(kube get deployment,statefulset -A -o 'jsonpath={range .items[*]}{.metadata.namespace}{"/"}{.metadata.name}{"\n"}{end}')" || fail 'workload metadata inventory failed'
while IFS= read -r item; do
  [[ -n "$item" ]] || continue
  case "${item,,}" in
    "$NAMESPACE/"*|*vault*|*kms*|*minio*|*openbao*|*signer*|*evidence*) printf 'workload=%s\n' "$item" ;;
  esac
done <<< "$workloads"
services="$(kube -n "$NAMESPACE" get service -o 'jsonpath={range .items[*]}{.metadata.name}{"\n"}{end}')" || fail 'service metadata inventory failed'
while IFS= read -r item; do [[ -z "$item" ]] || printf 'service=%s\n' "$item"; done <<< "$services"
classes="$(kube get storageclass -o 'jsonpath={range .items[*]}{.metadata.name}{"\n"}{end}')" || fail 'storage class inventory failed'
while IFS= read -r item; do [[ -z "$item" ]] || printf 'storage_class=%s\n' "$item"; done <<< "$classes"
nodes="$(kube get node -o 'jsonpath={range .items[*]}{.metadata.name}{" "}{.status.nodeInfo.architecture}{"\n"}{end}')" || fail 'node architecture inventory failed'
while IFS= read -r item; do [[ -z "$item" ]] || printf 'node=%s\n' "$item"; done <<< "$nodes"
[[ "$(kube get namespace "$NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$EXPECTED_UID" ]] || fail 'namespace changed during inventory'
printf '%s\n' 'temporary_artifacts_created=false' 'provider_capability_proven=false' 'PASS: D provider readiness inventory only'
