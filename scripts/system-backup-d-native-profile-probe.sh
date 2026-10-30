#!/usr/bin/env bash
# One controlled field run; load the pinned bwrap policy only while the
# disposable Runtime Pod exists, then remove the policy and all /tmp inputs.
set -Eeuo pipefail

profile=/tmp/d-native-bwrap-apparmor-4.profile
probe=/tmp/d-native-slot-probe-20261030.py
runner=/tmp/d-native-profile-probe-20261030.sh
profile_sha=e7b571fce332e968b75e14cad8b1b26d7ead3e34cb32f53f138a5d262aa67f2a
probe_sha=10e9a2839a0e997bf16d64a2b85eec4057ae0b9a43775bdde3066a740636c9e5
context=kubernetes-admin@kubernetes
namespace=clawmanager-zhanghui08-system
image=10.130.14.23:5000/openclaw-lite@sha256:d57b751e4790ed8e9af5efca4f230de32762982d7e04fd65819c6b603377d34f
loaded=0
retain=0

cleanup() {
  local result=$?
  trap - EXIT INT TERM HUP
  if [ "$loaded" = 1 ] && [ "$retain" = 0 ]; then
    if apparmor_parser -R -K "$profile"; then
      loaded=0
    else
      result=3
    fi
  fi
  if [ "$loaded" = 0 ]; then
    rm -f -- "$profile" || result=3
  else
    printf '%s\n' 'PROFILE_REMAINS: apparmor_parser -R -K /tmp/d-native-bwrap-apparmor-4.profile'
  fi
  rm -f -- "$probe" "$runner" || result=3
  printf 'D_NATIVE_PROFILE_PROBE_EXIT=%s\n' "$result"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

test "$(sha256sum "$profile" | cut -d' ' -f1)" = "$profile_sha"
test "$(sha256sum "$probe" | cut -d' ' -f1)" = "$probe_sha"
test "$(sysctl -n kernel.apparmor_restrict_unprivileged_userns)" = 1
aa-status >/dev/null
if aa-status | grep -qi bwrap; then
  echo 'bwrap profile already loaded; refusing to replace it' >&2
  exit 3
fi
apparmor_parser -Q -K "$profile"
loaded=1
apparmor_parser -a -K "$profile"
aa-status | grep -i bwrap

set +e
python3 -B "$probe" --context "$context" --namespace "$namespace" --image "$image" --node k8s-master --synthetic-lifecycle --privileged-slot
probe_result=$?
remaining=$(kubectl --context "$context" -n "$namespace" get pods -l app=d-native-backup-probe -o name 2>&1)
remaining_result=$?
set -e
if [ "$remaining_result" -ne 0 ] || [ -n "$remaining" ]; then
  retain=1
  printf 'DISPOSABLE_POD_UNRESOLVED: %s\n' "$remaining" >&2
  exit 3
fi
exit "$probe_result"
