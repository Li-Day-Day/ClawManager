#!/usr/bin/env bash
# Sourced after current catalog replay; writes only to the run-owned MySQL pod.
[[ "${A_BUSINESS_HISTORY_SMOKE:-0}" == 1 && "$RUN_NAMESPACE" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ && "$RUN_NAMESPACE_UID" =~ ^[0-9a-f-]{36}$ ]] || return 1
[[ -s "$A_BUSINESS_BINARY" && "$A_BUSINESS_BINARY_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
[[ "$(sha256sum "$A_BUSINESS_BINARY" | cut -d' ' -f1)" == "$A_BUSINESS_BINARY_SHA256" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod mysql -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$RUN_ID" ]] || return 1
[[ "$D_EMBEDDED_MIGRATION_COMPLETED" == 1 ]] || return 1
business_restore_mode="${A_BUSINESS_RESTORE_SMOKE:-0}"
[[ "$business_restore_mode" == 0 || "$business_restore_mode" == 1 ]] || return 1
business_test_pattern='^TestABusinessHistoryRowsMySQL$'
business_test_timeout=180s
business_test_profile=history
if [[ "$business_restore_mode" == 1 ]]; then
  [[ "$EXPECTED_CATALOG_HASH" =~ ^[a-f0-9]{64}$ ]] || return 1
  business_test_pattern='^TestABusinessRestoreRowsMySQL$'
  business_test_timeout=600s
  business_test_profile=restore
fi
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- uname -m)" == x86_64 ]] || return 1
mysql_query "CREATE TABLE d_invariant_run_marker (id INT PRIMARY KEY, run_namespace VARCHAR(64), namespace_uid VARCHAR(36), server_uuid VARCHAR(36)); INSERT INTO d_invariant_run_marker VALUES (1,'$RUN_NAMESPACE','$RUN_NAMESPACE_UID',@@server_uuid)" >/dev/null
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/a-business-history.test; chmod 700 /tmp/a-business-history.test' < "$A_BUSINESS_BINARY"
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
  set -eu
  trap '\''rm -f /tmp/a-business-history.test'\'' EXIT
  actual="$(sha256sum /tmp/a-business-history.test)"
  [ "${actual%% *}" = "$3" ] || exit 1
  /tmp/a-business-history.test -test.run "^TestABusinessRestoreMySQLSeed$" -test.v -test.count=1 -test.timeout=60s
  D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" A_BUSINESS_CATALOG_SHA256="$6" /tmp/a-business-history.test -test.run "$4" -test.v -test.count=1 -test.timeout="$5"
' probe "$RUN_NAMESPACE" "$RUN_NAMESPACE_UID" "$A_BUSINESS_BINARY_SHA256" "$business_test_pattern" "$business_test_timeout" "$EXPECTED_CATALOG_HASH"
printf 'PASS a-business-%s-mysql binary_sha256=%s\n' "$business_test_profile" "$A_BUSINESS_BINARY_SHA256"
