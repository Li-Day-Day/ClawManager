#!/usr/bin/env bash
# Read-only metadata. Does not fetch Secrets, env values, logs, exec or tokens.
set -euo pipefail
ns="${1:-clawmanager-zhanghui08-system}"
case "$ns" in *[!a-z0-9-]*|'') printf '%s\n' 'Invalid namespace' >&2; exit 2;; esac
kubectl config current-context
kubectl get namespace "$ns" -o jsonpath='{.metadata.name}{" uid="}{.metadata.uid}{"\n"}'
kubectl -n "$ns" get deployments,pods,services,persistentvolumeclaims -o wide
kubectl -n "$ns" get deployments -o jsonpath='{range .items[*]}{.metadata.name}{" images="}{range .spec.template.spec.containers[*]}{.image}{" "}{end}{"\n"}{end}'
kubectl -n "$ns" get pods -o jsonpath='{range .items[*]}{.metadata.name}{" uid="}{.metadata.uid}{" node="}{.spec.nodeName}{" sa="}{.spec.serviceAccountName}{" claims="}{range .spec.volumes[*]}{.persistentVolumeClaim.claimName}{" "}{end}{"\n"}{end}'
