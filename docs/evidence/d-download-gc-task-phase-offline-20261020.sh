#!/usr/bin/env bash
set -euo pipefail
# All kubectl/mysql calls below are shell functions. No network or SQL occurs.
task_root="$1"
CONTEXT=offline-gc-task
RUN_NAMESPACE=sbk-mig-261020000000-abcd
RUN_NAMESPACE_UID=11111111-2222-4333-8444-555555555555
observed_uid="$RUN_NAMESPACE_UID"
RUN_ID=offline-gc-task-phase
D_INVARIANT_BINARY="$task_root/scripts/system-backup-d-download-gc-task-phase.sh"
D_PROVIDER_REGISTRATION_DDL="$task_root/backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json"
D_INVARIANT_BINARY_SHA256="$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)"
D_PROVIDER_REGISTRATION_DDL_SHA256="$(sha256sum "$D_PROVIDER_REGISTRATION_DDL" | cut -d' ' -f1)"
mysql_query() {
  [[ "$#" == 1 && "$1" == *"CREATE TABLE d_invariant_run_marker"* && "$1" == *"'$RUN_NAMESPACE','$RUN_NAMESPACE_UID',@@server_uuid"* ]] || return 1
  marker_calls=$((marker_calls+1))
}
kubectl() {
  local all="$*"
  if [[ "$all" == "--context=$CONTEXT get namespace $RUN_NAMESPACE -o jsonpath={.metadata.uid}" ]]; then printf '%s' "$observed_uid";return;fi
  [[ "$1" == "--context=$CONTEXT" && "$2" == "--namespace=$RUN_NAMESPACE" ]] || return 1
  if [[ "$all" == *"get pod migration-app -o jsonpath="* ]]; then printf '%s' "$RUN_ID";return;fi
  if [[ "$all" == *"delete pod migration-app --wait=true --timeout=60s" ]]; then deletes=$((deletes+1));return;fi
  if [[ "$all" == *"exec pod/mysql -- uname -m" ]]; then printf x86_64;return;fi
  if [[ "$all" == *"exec -i pod/mysql -- sh -c umask 077; cat > /tmp/d-download-gc-task"* ]]; then
    [[ "$#" == 9 && "$8" == -c ]] || return 1
    cat >/dev/null
    uploads=$((uploads+1));return
  fi
  [[ "$#" == 13 && "$3" == exec && "$4" == pod/mysql && "$5" == -- && "$6" == sh && "$7" == -c && "$9" == probe ]] || return 1
  [[ "${10}" == "$RUN_NAMESPACE" && "${11}" == "$RUN_NAMESPACE_UID" && "${12}" == "$D_INVARIANT_BINARY_SHA256" && "${13}" == "$D_PROVIDER_REGISTRATION_DDL_SHA256" ]] || return 1
  local payload="$8"
  [[ "$payload" == *'trap '\''rm -f /tmp/d-download-gc-task.test /tmp/d-download-gc-task-inputs.json'\'' EXIT'* ]] || return 1
  [[ "$payload" == *'-test.run "^TestDDownloadGCTaskMySQL$" -test.v -test.count=1 -test.timeout=900s'* ]] || return 1
  bash --noprofile --norc -n -c "$payload"
  test_calls=$((test_calls+1))
}
for D_EMBEDDED_MIGRATION_COMPLETED in 0 1; do
  uploads=0;test_calls=0;marker_calls=0;deletes=0
  # Suppress the phase's synthetic PASS text, so it cannot look like SQL proof.
  source "$task_root/scripts/system-backup-d-download-gc-task-phase.sh" >/dev/null
  [[ "$uploads" == 2 && "$test_calls" == 1 && "$marker_calls" == 1 ]]
  [[ "$deletes" == "$((1-D_EMBEDDED_MIGRATION_COMPLETED))" ]]
  printf 'OFFLINE_PASS gc_task_phase embedded_migration=%s argv_pins=yes payload_syntax=yes cleanup_trap=yes actual_mysql=no network=no\n' "$D_EMBEDDED_MIGRATION_COMPLETED"
done
original_binary="$D_INVARIANT_BINARY"
original_binary_hash="$D_INVARIANT_BINARY_SHA256"
original_input_hash="$D_PROVIDER_REGISTRATION_DDL_SHA256"
for rejection in namespace_uid binary_hash input_hash empty_binary; do
  uploads=0;test_calls=0;marker_calls=0;deletes=0
  observed_uid="$RUN_NAMESPACE_UID"
  D_INVARIANT_BINARY="$original_binary"
  D_INVARIANT_BINARY_SHA256="$original_binary_hash"
  D_PROVIDER_REGISTRATION_DDL_SHA256="$original_input_hash"
  case "$rejection" in
    namespace_uid) observed_uid=22222222-2222-4333-8444-555555555555 ;;
    binary_hash) D_INVARIANT_BINARY_SHA256=0000000000000000000000000000000000000000000000000000000000000000 ;;
    input_hash) D_PROVIDER_REGISTRATION_DDL_SHA256=0000000000000000000000000000000000000000000000000000000000000000 ;;
    empty_binary) D_INVARIANT_BINARY=/dev/null ;;
  esac
  if source "$task_root/scripts/system-backup-d-download-gc-task-phase.sh" >/dev/null; then
    printf 'OFFLINE_FAIL gc_task_phase rejection=%s unexpectedly accepted\n' "$rejection" >&2
    exit 1
  fi
  [[ "$uploads" == 0 && "$test_calls" == 0 && "$marker_calls" == 0 && "$deletes" == 0 ]]
  printf 'OFFLINE_PASS gc_task_phase rejection=%s remote_actions=zero actual_mysql=no network=no\n' "$rejection"
done
