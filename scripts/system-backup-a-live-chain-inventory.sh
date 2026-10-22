#!/usr/bin/env bash
# Public workload metadata only. No exec, logs, credentials, DDL or deployment.
set -eu
command -v kubectl >/dev/null 2>&1 || { echo 'BLOCKED kubectl_missing'; exit 2; }
echo 'A_LIVE_CHAIN_INVENTORY version=1'
printf 'KUBE_CONTEXT '
kubectl --request-timeout=20s config current-context
echo 'NAMESPACES name uid phase'
kubectl --request-timeout=20s get namespaces --no-headers -o 'custom-columns=NAME:.metadata.name,UID:.metadata.uid,PHASE:.status.phase'
for ns in "$@"; do
  case "$ns" in ''|*[!a-z0-9-]*) echo 'BLOCKED invalid_namespace'; exit 2;; esac
  echo "SCOPE namespace=$ns"
  if ! kubectl --request-timeout=20s get namespace "$ns" -o name >/dev/null; then
    echo "BLOCKED namespace_absent=$ns"
    continue
  fi
  echo 'DEPLOYMENTS name uid desired ready image download_runtime_flag download_dsn_env journal_claim'
  kubectl --request-timeout=20s -n "$ns" get deployments -o 'go-template={{range .items}}{{.metadata.name}} {{.metadata.uid}} {{.spec.replicas}} {{.status.readyReplicas}}{{range .spec.template.spec.containers}} image={{.image}} download_runtime_flag={{range .command}}{{if eq . "--download-runtime"}}present{{end}}{{end}}{{range .args}}{{if eq . "--download-runtime"}}present{{end}}{{end}} download_dsn_env={{range .env}}{{if eq .name "SYSTEM_BACKUP_DOWNLOAD_DSN_FILE"}}present{{end}}{{end}}{{end}}{{range .spec.template.spec.volumes}}{{if eq .name "download-journal"}} journal_claim={{.persistentVolumeClaim.claimName}}{{end}}{{end}}{{"\n"}}{{end}}'
  echo 'PODS name uid phase node ready restarts images'
  kubectl --request-timeout=20s -n "$ns" get pods --no-headers -o 'custom-columns=NAME:.metadata.name,UID:.metadata.uid,PHASE:.status.phase,NODE:.spec.nodeName,READY:.status.containerStatuses[*].ready,RESTARTS:.status.containerStatuses[*].restartCount,IMAGES:.spec.containers[*].image'
  echo 'SERVICES name type cluster_ip ports'
  kubectl --request-timeout=20s -n "$ns" get services --no-headers -o 'custom-columns=NAME:.metadata.name,TYPE:.spec.type,CLUSTER_IP:.spec.clusterIP,PORTS:.spec.ports[*].port'
  echo 'INGRESSES name class hosts tls_secret_references'
  kubectl --request-timeout=20s -n "$ns" get ingresses --no-headers -o 'custom-columns=NAME:.metadata.name,CLASS:.spec.ingressClassName,HOSTS:.spec.rules[*].host,TLS_REFS:.spec.tls[*].secretName'
  echo 'PVCS name uid phase volume class access_modes capacity'
  kubectl --request-timeout=20s -n "$ns" get pvc --no-headers -o 'custom-columns=NAME:.metadata.name,UID:.metadata.uid,PHASE:.status.phase,VOLUME:.spec.volumeName,CLASS:.spec.storageClassName,ACCESS:.spec.accessModes[*],CAPACITY:.status.capacity.storage'
  case "$ns" in sbk-provider-*)
    echo 'LAB_PUBLIC_CA validity_metadata_only'
    if command -v openssl >/dev/null 2>&1 && kubectl --request-timeout=20s -n "$ns" get configmap lab-trust -o name >/dev/null; then
      kubectl --request-timeout=20s -n "$ns" get configmap lab-trust -o 'go-template={{index .data "ca.crt"}}' | openssl x509 -noout -subject -issuer -dates -fingerprint -sha256
      if kubectl --request-timeout=20s -n "$ns" get configmap lab-trust -o 'go-template={{index .data "ca.crt"}}' | openssl x509 -checkend 0 -noout >/dev/null; then
        echo 'LAB_CA_NOT_EXPIRED=true leaf_validity_and_sessions_unverified=true'
      else
        echo 'BLOCKED lab_ca_expired_or_invalid=true'
      fi
    else
      echo 'BLOCKED lab_ca_metadata_unavailable=true'
    fi
  ;; esac
done
echo 'INVENTORY_COMPLETE live_chain_verified=false'
