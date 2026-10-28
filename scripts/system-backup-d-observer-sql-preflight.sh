#!/usr/bin/env bash
# Read-only SQL syntax/schema check for the observer's latest-capture query.
# Uses existing DBA environment only; it does not validate observer grants,
# prove task execution or initialize anything.
set -euo pipefail
context="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
namespace="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
: "${SBK_EXPECTED_NAMESPACE_UID:?required}"
: "${SBK_MYSQL_POD:?required}"
: "${SBK_EXPECTED_MYSQL_POD_UID:?required}"
: "${SBK_EXPECTED_SERVER_UUID:?required}"
: "${SBK_EXPECTED_DATABASE:?required}"
: "${SBK_OBSERVER_INSTALLATION_ID:?required}"
[[ "$SBK_EXPECTED_SERVER_UUID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]
[[ "$SBK_EXPECTED_DATABASE" =~ ^[A-Za-z0-9_]{1,64}$ ]]
[[ "$SBK_OBSERVER_INSTALLATION_ID" =~ ^installation_[A-Za-z0-9._:-]{1,115}$ ]]
check_uid() {
  [[ "$(kubectl --context="$context" get namespace "$namespace" -o jsonpath='{.metadata.uid}')" == "$SBK_EXPECTED_NAMESPACE_UID" ]]
  [[ "$(kubectl --context="$context" -n "$namespace" get pod "$SBK_MYSQL_POD" -o jsonpath='{.metadata.uid}')" == "$SBK_EXPECTED_MYSQL_POD_UID" ]]
}
check_uid
identity=$(kubectl --context="$context" -n "$namespace" exec "$SBK_MYSQL_POD" -- sh -c '
  set -eu
  db=${MYSQL_DATABASE:-}
  case "$db" in ""|*[!A-Za-z0-9_]*) exit 1;; esac
  test -n "${MYSQL_ROOT_PASSWORD:-}"
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  mysql --connect-timeout=5 -uroot --batch --skip-column-names -D "$db" -e "SELECT CONCAT(@@server_uuid, CHAR(58), DATABASE())"
')
[[ "$identity" == "$SBK_EXPECTED_SERVER_UUID:$SBK_EXPECTED_DATABASE" ]] || { echo 'Database identity mismatch' >&2; exit 1; }
check_uid
# The constant task ID is only a syntax/schema probe, not a task under test.
kubectl --context="$context" -n "$namespace" exec -i "$SBK_MYSQL_POD" -- sh -c '
  set -eu
  db=${MYSQL_DATABASE:-}
  case "$db" in ""|*[!A-Za-z0-9_]*) exit 1;; esac
  test -n "${MYSQL_ROOT_PASSWORD:-}"
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  mysql --connect-timeout=5 -uroot --batch --raw -D "$db"
' <<SQL
START TRANSACTION READ ONLY;
SELECT COUNT(*) AS latest_capture_jobs,COALESCE(SUM(j.last_accepted_sequence>0 AND j.last_observed_status='completed'),0) AS completed_relays
FROM system_backup_job_observations j
WHERE j.origin_installation_id='$SBK_OBSERVER_INSTALLATION_ID' AND j.target_type='backup' AND j.target_public_id='sbk_00000000-0000-4000-8000-000000000000' AND j.phase='capture'
AND j.attempt_no=(SELECT MAX(a.attempt_no) FROM system_backup_attempts a WHERE a.target_type='backup' AND a.target_public_id='sbk_00000000-0000-4000-8000-000000000000' AND a.phase='capture')
AND EXISTS (SELECT 1 FROM system_backup_attempts a2 WHERE a2.target_type=j.target_type AND a2.target_public_id=j.target_public_id AND a2.attempt_no=j.attempt_no AND a2.phase=j.phase AND a2.status='sealed');
SELECT COUNT(*) AS installation_key_count FROM system_backups WHERE origin_installation_id='$SBK_OBSERVER_INSTALLATION_ID' AND endpoint='createSystemBackup' AND idempotency_key='d-observer-syntax-probe-20261028';
ROLLBACK;
SQL
check_uid
echo 'READ_ONLY_SCHEMA_PROBE_ONLY_NOT_ACCEPTANCE'
