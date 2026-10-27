#!/usr/bin/env bash
set -euo pipefail

# Read-only, no remote files or cluster objects. No Secret data/config bodies.
# This confirms the current authenticated context, not a signature over the
# historical schema candidate. Provider adapters still require platform inputs.
CONTEXT='kubernetes-admin@kubernetes'
NAMESPACE='clawmanager-zhanghui08-system'
EXPECTED_UID='337cfe30-2c17-4b8e-b32a-760778b8098e'
EXPECTED_IDENTITY_HASH='a88b9dcf73776853ff36887f705a156b3ffdf4db12ab2497c614ffa6f814079b'
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
command -v kubectl >/dev/null || fail 'kubectl unavailable; do not install dependencies'
command -v sha256sum >/dev/null || fail 'sha256sum unavailable; do not install dependencies'
kube() { kubectl --request-timeout=30s --context="$CONTEXT" "$@" 2>/dev/null; }

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
current="$(kube config current-context)" || fail 'cannot read current context'
[[ "$current" == "$CONTEXT" ]] || fail 'current context mismatch'
insecure="$(kube config view --minify -o jsonpath='{.clusters[0].cluster.insecure-skip-tls-verify}')" || fail 'cannot check TLS policy'
[[ -z "$insecure" || "$insecure" == 'false' ]] || fail 'TLS certificate verification is disabled'
server="$(kube config view --minify -o jsonpath='{.clusters[0].cluster.server}')" || fail 'cannot check API transport'
[[ "$server" == https://* ]] || fail 'API transport must use HTTPS'
uid="$(kube get namespace "$NAMESPACE" -o jsonpath='{.metadata.uid}')" || fail 'cannot read namespace identity'
[[ "$uid" == "$EXPECTED_UID" ]] || fail 'namespace UID mismatch'
identity_hash="$(printf 'k8s-namespace-uid-v1\0%s' "$uid" | sha256sum)"
identity_hash="${identity_hash%% *}"
[[ "$identity_hash" == "$EXPECTED_IDENTITY_HASH" ]] || fail 'installation identity hash mismatch'
actor="$(kube auth whoami -o jsonpath='{.status.userInfo.username}')" || fail 'authenticated SelfSubjectReview unavailable; report this failure without changing permissions'
[[ -n "$actor" ]] || fail 'authenticated subject is empty'
actor_hash="$(printf 'k8s-authenticated-subject-v1\0%s' "$actor" | sha256sum)"
actor_hash="${actor_hash%% *}"
unset actor server

# One SELECT returns counts only; reuses the installed mysql client/Pod account.
# This does not prove that the account is SELECT-only and does not activate config.
query='SELECT (SELECT COUNT(*) FROM system_backup_configs), (SELECT COUNT(*) FROM system_backup_installation_state WHERE active_config_version IS NOT NULL)'
counts="$(kube -n "$NAMESPACE" exec deploy/mysql -- sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names --execute="$1"' a-readonly-config "$query")" || fail 'active-config count query failed'
[[ "$counts" =~ ^([0-9]+)[[:blank:]]+([0-9]+)$ ]] || fail 'active-config count response invalid'
config_rows="${BASH_REMATCH[1]}"
active_installations="${BASH_REMATCH[2]}"
uid_after="$(kube get namespace "$NAMESPACE" -o jsonpath='{.metadata.uid}')" || fail 'namespace final identity read failed'
[[ "$uid_after" == "$EXPECTED_UID" ]] || fail 'namespace changed during probe'

printf 'probe_started_at=%s\nprobe_finished_at=%s\n' "$started_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'installation_identity_hash=%s\nauthenticated_subject_hash=%s\n' "$identity_hash" "$actor_hash"
printf 'config_rows=%s\nactive_installations=%s\n' "$config_rows" "$active_installations"
printf '%s\n' 'tls_verification_enabled=true' 'namespace_identity_stable=true' 'temporary_artifacts_created=false' 'historical_candidate_authenticated=false' 'evidence_registered=false' 'PASS: A current-context identity and active-config read-only preflight'
