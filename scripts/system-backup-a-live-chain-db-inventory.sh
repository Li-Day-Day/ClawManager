# Appended only for the explicitly selected test namespace/MySQL Pod identity.
# Administrative observer connection; this is NOT the runtime authorization test.
echo 'A_LIVE_DB_OBSERVATION observer_not_runtime_identity=true'
a_live_db_identity() {
  test "$(kubectl --request-timeout=20s get namespace "$a_live_db_ns" -o jsonpath='{.metadata.uid}')" = "$a_live_db_ns_uid"
  test "$(kubectl --request-timeout=20s -n "$a_live_db_ns" get pod "$a_live_db_pod" -o jsonpath='{.metadata.uid}')" = "$a_live_db_pod_uid"
}
a_live_db_identity
a_live_db_read() {
  kubectl --request-timeout=20s -n "$a_live_db_ns" exec -i "$a_live_db_pod" -c mysql -- sh -c 'set -eu; test -n "$MYSQL_ROOT_PASSWORD"; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --batch --raw --skip-column-names --default-character-set=utf8mb4 --database="$1"' a-live-db-observer "$a_live_db_name"
}
if test "${a_live_state_only-0}" != 1; then
a_live_db_read <<'A_LIVE_DB_SQL'
SELECT JSON_OBJECT('server_uuid',@@server_uuid,'database',DATABASE(),'mysql_version',VERSION(),'observed_at',DATE_FORMAT(UTC_TIMESTAMP(6),'%Y-%m-%dT%H:%i:%s.%fZ'));
SELECT CONCAT('TABLE ',TABLE_NAME) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('schema_migrations','system_backup_installation_state','system_backup_configs','system_backup_operations','system_backup_evidence','system_backup_download_admission_receipts','system_backup_download_result_receipts','system_backup_totp_credentials','system_backup_admin_sessions','system_backup_admin_revocations','system_backup_strong_auth_nonces','system_backup_metadata_reservations') ORDER BY TABLE_NAME;
SELECT CONCAT('COLUMN ',TABLE_NAME,'.',COLUMN_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('system_backup_configs','system_backup_installation_state','schema_migrations') ORDER BY TABLE_NAME,ORDINAL_POSITION;
A_LIVE_DB_SQL
fi
a_live_db_identity
echo 'A_LIVE_DB_OBSERVATION_COMPLETE runtime_grants_verified=false active_config_verified=false'
