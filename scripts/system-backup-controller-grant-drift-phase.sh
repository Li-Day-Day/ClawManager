#!/usr/bin/env bash
# Sourced after the isolated transition phase. It only mutates that run's
# throwaway MySQL account and deletes no resources of its own.
[[ "${CONTROLLER_GRANT_DRIFT_SMOKE:-0}" == 1 && "${CONTROLLER_TRANSITION_SMOKE:-0}" == 1 && -n "${RUN_NAMESPACE_UID:-}" ]] || {
  echo 'grant drift requires the isolated controller transition phase' >&2
  return 1
}

controller_process_fingerprint() {
  kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pods -l app=controller-enabled \
    -o jsonpath='{range .items[*]}{.metadata.uid}{" "}{range .status.containerStatuses[*]}{.name}{":"}{.containerID}{":"}{.restartCount}{" "}{end}{"\n"}{end}' | LC_ALL=C sort
}

[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || {
  echo 'grant drift namespace identity changed' >&2
  return 1
}
wait_controller_modes enabled disabled
state_before_grant_drift="$(transition_state)"
processes_before_grant_drift="$(controller_process_fingerprint)"
[[ "$(printf '%s\n' "$processes_before_grant_drift" | wc -l)" == 2 && "$processes_before_grant_drift" == *://* ]] || {
  echo 'grant drift requires two running container identities' >&2
  return 1
}

# Removing a required direct grant must revoke readiness on both replicas.
# The controller health endpoint remains a process check, not authorization.
# SELECT tests bootstrap failure; UPDATE leaves bootstrap reads available and
# tests worker/loop admission. Neither round may recreate Pods or containers.
for grant_case in 'SELECT system_backup_configs' 'UPDATE system_backups'; do
read -r grant_verb grant_table <<<"$grant_case"
printf "REVOKE %s ON \`clawmanager\`.\`%s\` FROM 'sbk_controller'@'%%';\n" "$grant_verb" "$grant_table" | mysql_root_stream
deadline=$((SECONDS + 90))
while (( SECONDS < deadline )); do
  ready_replicas="$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get deployment controller-enabled-smoke -o jsonpath='{.status.readyReplicas}')"
  [[ -z "$ready_replicas" || "$ready_replicas" == 0 ]] && break
  sleep 3
done
[[ -z "${ready_replicas:-}" || "$ready_replicas" == 0 ]] || {
  kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" logs -l app=controller-enabled --all-containers=true --prefix=true --tail=60 >&2 || true
  printf 'controller remained ready after required %s grant was revoked: %s replicas\n' "$grant_case" "$ready_replicas" >&2
  return 1
}
[[ "$(transition_state)" == "$state_before_grant_drift" ]] || {
  echo 'grant drift modified installation state' >&2
  return 1
}

[[ "$(controller_process_fingerprint)" == "$processes_before_grant_drift" ]] || {
  echo 'controller process restarted during grant revocation' >&2
  return 1
}
printf "GRANT %s ON \`clawmanager\`.\`%s\` TO 'sbk_controller'@'%%';\n" "$grant_verb" "$grant_table" | mysql_root_stream
wait_controller_modes enabled disabled
[[ "$(transition_state)" == "$state_before_grant_drift" ]] || {
  echo 'grant restoration modified installation state' >&2
  return 1
}
[[ "$(controller_process_fingerprint)" == "$processes_before_grant_drift" ]] || {
  echo 'controller recovery required a Pod or container restart' >&2
  return 1
}
printf 'PASS controller-grant-recovery isolated=true grant=%s/%s restored-without-restart=true pod-uids-and-container-ids=unchanged restart-counts=unchanged leader=1 standby=1 installation-projection=unchanged namespace-cleanup=pending\n' "$grant_verb" "$grant_table"
done
