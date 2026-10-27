#!/usr/bin/env bash
# Local shell transport test. No kubectl, MySQL, network or temporary files.
set -euo pipefail
cd "$(dirname "$0")/.."
simulate() (
  export CONTROLLER_GRANT_DRIFT_SMOKE=1 CONTROLLER_TRANSITION_SMOKE=1
  export RUN_NAMESPACE=synthetic RUN_NAMESPACE_UID=synthetic-uid CONTEXT=synthetic
  local_scenario="$1"
  grant_table=''
  wait_controller_modes() { [[ "$1 $2" == 'enabled disabled' ]]; }
  transition_state() { printf 'synthetic-stable-projection'; }
  mysql_root_stream() {
    local sql
    sql="$(cat)"
    case "$sql" in
      "REVOKE SELECT ON "*|"GRANT SELECT ON "*|"REVOKE UPDATE ON "*|"GRANT UPDATE ON "*) ;;
      *) echo 'unexpected SQL in shell test' >&2; return 1 ;;
    esac
  }
  kubectl() {
    case "$*" in
      *'get namespace synthetic '*)
        if [[ "$local_scenario" == wrong_namespace ]]; then printf 'different-uid'; else printf 'synthetic-uid'; fi ;;
      *'get pods -l app=controller-enabled '*)
        local count=0 identity=first
        if [[ -n "$grant_table" ]]; then
          [[ "$local_scenario" != restarted ]] || count=1
          [[ "$local_scenario" != replaced ]] || identity=replacement
        fi
        printf 'pod-a controller:containerd://%s:%s \npod-b controller:containerd://second:0 \n' "$identity" "$count" ;;
      *'get deployment controller-enabled-smoke '*) printf '0' ;;
      *) printf 'unexpected cluster command: %s\n' "$*" >&2; return 1 ;;
    esac
  }
  source scripts/system-backup-controller-grant-drift-phase.sh
)
output="$(simulate stable)"
[[ "$(printf '%s\n' "$output" | grep -c '^PASS controller-grant-recovery ')" == 2 ]]
[[ "$output" == *'grant=SELECT/system_backup_configs'* && "$output" == *'grant=UPDATE/system_backups'* ]]
for scenario in wrong_namespace restarted replaced; do
  if simulate "$scenario" >/dev/null 2>&1; then
    printf 'unsafe scenario was accepted: %s\n' "$scenario" >&2
    exit 1
  fi
done
printf 'PASS local-grant-recovery-shell stable=2 rejected=namespace/restart/replacement network=false files-created=false\n'
