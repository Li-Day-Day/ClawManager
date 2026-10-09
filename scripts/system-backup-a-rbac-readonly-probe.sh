#!/usr/bin/env bash
set -euo pipefail

# A-owned, read-only verification for the zhanghui08 functional-test install.
# Requires an existing kubectl context with permission to use SubjectAccessReview.
CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
EXPECTED_NAMESPACE_UID="${EXPECTED_NAMESPACE_UID:-337cfe30-2c17-4b8e-b32a-760778b8098e}"
REGISTERED_SECRET="clawmanager-system-backup-functional-test-allowlisted"
UNREGISTERED_SECRET="clawmanager-system-backup-functional-test-unregistered"
ALLOWLIST_SHA256="4966a40bc8e3b948d29ac79cb3514a2955ec47a4186aa2eee14b07cbec4242b5"
APP_AS="system:serviceaccount:${NAMESPACE}:clawmanager-app"
COLLECTOR_AS="system:serviceaccount:${NAMESPACE}:clawmanager-system-backup-secret-capture"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
kubectl_read() { kubectl --request-timeout=30s --context="$CONTEXT" "$@"; }

assert_access() {
  local expected="$1" identity="$2" verb="$3" resource="$4" actual rc=0
  actual="$(kubectl_read auth can-i --as="$identity" --namespace="$NAMESPACE" "$verb" "$resource" 2>&1)" || rc=$?
  case "$actual" in
    yes) [[ "$rc" -eq 0 ]] || fail "unexpected SubjectAccessReview exit=$rc for yes: identity=$identity verb=$verb resource=$resource" ;;
    no) [[ "$rc" -eq 0 || "$rc" -eq 1 ]] || fail "unexpected SubjectAccessReview exit=$rc for no: identity=$identity verb=$verb resource=$resource" ;;
    *) fail "SubjectAccessReview error (exit=$rc): identity=$identity verb=$verb resource=$resource" ;;
  esac
  [[ "$actual" == "$expected" ]] || \
    fail "expected $expected, got $actual: identity=$identity verb=$verb resource=$resource"
  printf 'PASS: %s %s %s = %s\n' "$identity" "$verb" "$resource" "$actual"
}

[[ "$(kubectl_read config current-context)" == "$CONTEXT" ]] || fail "current context mismatch"
[[ "$(kubectl_read get namespace "$NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$EXPECTED_NAMESPACE_UID" ]] || \
  fail "namespace UID mismatch"
kubectl_read --namespace="$NAMESPACE" get serviceaccount clawmanager-app -o name >/dev/null
kubectl_read --namespace="$NAMESPACE" get serviceaccount clawmanager-system-backup-secret-capture -o name >/dev/null
[[ "$(kubectl_read --namespace="$NAMESPACE" get secret "$REGISTERED_SECRET" \
  -o jsonpath='{.metadata.annotations.clawmanager\.io/secret-allowlist-sha256}')" == "$ALLOWLIST_SHA256" ]] || \
  fail "functional-test allowlist hash mismatch"

# Verify the target grant is an exact named-object grant, without reading Secret data.
ROLE="clawmanager-system-backup-secret-capture-functional-test"
[[ "$(kubectl_read --namespace="$NAMESPACE" get role "$ROLE" -o jsonpath='{.rules[*].resources[*]}')" == 'secrets' ]] || \
  fail "collector Role resource changed"
[[ "$(kubectl_read --namespace="$NAMESPACE" get role "$ROLE" -o jsonpath='{.rules[*].resourceNames[*]}')" == "$REGISTERED_SECRET" ]] || \
  fail "collector Role resourceName changed"
[[ "$(kubectl_read --namespace="$NAMESPACE" get role "$ROLE" -o jsonpath='{.rules[*].verbs[*]}')" == 'get' ]] || \
  fail "collector Role verbs changed"
[[ "$(kubectl_read --namespace="$NAMESPACE" get rolebinding "$ROLE" -o jsonpath='{.roleRef.kind}/{.roleRef.name}/{.subjects[0].kind}/{.subjects[0].name}/{.subjects[0].namespace}')" == \
  "Role/$ROLE/ServiceAccount/clawmanager-system-backup-secret-capture/$NAMESPACE" ]] || \
  fail "collector RoleBinding changed"

assert_access yes "$COLLECTOR_AS" get "secrets/$REGISTERED_SECRET"
assert_access no "$COLLECTOR_AS" get "secrets/$UNREGISTERED_SECRET"
for verb in list watch create update patch delete; do
  assert_access no "$COLLECTOR_AS" "$verb" secrets
done
for verb in update patch delete; do
  assert_access no "$COLLECTOR_AS" "$verb" "secrets/$REGISTERED_SECRET"
done
for verb in get list watch create update patch delete; do
  assert_access no "$APP_AS" "$verb" secrets
done
assert_access no "$APP_AS" get "secrets/$REGISTERED_SECRET"
assert_access no "$APP_AS" get "secrets/$UNREGISTERED_SECRET"
assert_access yes "$APP_AS" get deployments

[[ -z "$(kubectl_read get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin --ignore-not-found -o name)" ]] || \
  fail "target cluster-admin binding still exists"
[[ "$(kubectl_read get clusterrolebinding clawmanager-app-cluster-admin \
  -o jsonpath='{.roleRef.kind}/{.roleRef.name}/{.subjects[0].kind}/{.subjects[0].name}/{.subjects[0].namespace}')" == \
  'ClusterRole/cluster-admin/ServiceAccount/clawmanager-app/clawmanager-system' ]] || \
  fail "protected binding changed"

printf 'PASS: A functional-test collector RBAC and app post-cutover denial; namespace_uid=%s allowlist_sha256=%s\n' \
  "$EXPECTED_NAMESPACE_UID" "$ALLOWLIST_SHA256"
