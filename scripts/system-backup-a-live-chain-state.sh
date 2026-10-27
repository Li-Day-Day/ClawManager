# Reuses the exact namespace/Pod guarded administrative SELECT observer.
echo 'A_LIVE_CONFIG_STATE_BEGIN'
a_live_db_identity
test "$(a_live_db_read <<'A_LIVE_UUID_SQL'
SELECT @@server_uuid;
A_LIVE_UUID_SQL
)" = "$a_live_db_server"
a_live_db_read <<'A_LIVE_STATE_SQL'
SELECT JSON_OBJECT('kind','config_counts','rows',COUNT(*),'installations',COUNT(DISTINCT origin_installation_id)) FROM system_backup_configs;
SELECT JSON_OBJECT('kind','config_metadata','installation_id',origin_installation_id,'version',version,'config_sha256',config_sha256,'enabled',enabled,'row_version',row_version) FROM system_backup_configs ORDER BY origin_installation_id,version LIMIT 21;
SELECT JSON_OBJECT('kind','installation_metadata','installation_id',origin_installation_id,'active_config_version',active_config_version,'row_version',row_version) FROM system_backup_installation_state ORDER BY origin_installation_id LIMIT 21;
SELECT JSON_OBJECT('kind','evidence_counts','storage_state',storage_state,'classification',redaction_classification,'rows',COUNT(*)) FROM system_backup_evidence GROUP BY storage_state,redaction_classification ORDER BY storage_state,redaction_classification;
SELECT CONCAT('MIGRATION ',filename) FROM schema_migrations ORDER BY filename LIMIT 201;
A_LIVE_STATE_SQL
a_live_db_identity
echo 'A_LIVE_CONFIG_STATE_COMPLETE config_admitted=false'
if test -n "$a_live_app_pod"; then
  a_live_app_identity() {
    a_live_db_identity
    test "$(kubectl --request-timeout=20s -n "$a_live_db_ns" get pod "$a_live_app_pod" -o jsonpath='{.metadata.uid}')" = "$a_live_app_uid"
  }
  a_live_app_identity
  echo 'A_LIVE_APP_CAPABILITIES_BEGIN'
  kubectl --request-timeout=20s -n "$a_live_db_ns" get pod "$a_live_app_pod" -o 'go-template={{range .status.containerStatuses}}container={{.name}} image_id={{.imageID}}{{"\n"}}{{end}}{{range .spec.containers}}{{range .env}}{{if eq .name "SYSTEM_BACKUP_REGISTRATION_INSTALLATION_ID"}}login_session_installation_env=present{{"\n"}}{{end}}{{end}}{{end}}'
  kubectl --request-timeout=20s -n "$a_live_db_ns" exec "$a_live_app_pod" -- sh -c '
    set -eu
    case "${SYSTEM_BACKUP_READ_SESSIONS_ENABLED-}" in true) echo "LOGIN_SESSION_RECORDER_ENABLED=true";; *) echo "LOGIN_SESSION_RECORDER_ENABLED=false";; esac
    if test -n "${SYSTEM_BACKUP_REGISTRATION_INSTALLATION_ID-}"; then echo "LOGIN_INSTALLATION_CONFIGURED=true"; else echo "LOGIN_INSTALLATION_CONFIGURED=false"; fi
    if test -x /usr/local/bin/clawreef-system-backup-bootstrap; then
      set +e
      /usr/local/bin/clawreef-system-backup-bootstrap --requirements
      a_bootstrap_rc=$?
      set -e
      echo "BOOTSTRAP_REQUIREMENTS_EXIT=$a_bootstrap_rc"
      test "$a_bootstrap_rc" -eq 0 || test "$a_bootstrap_rc" -eq 2
    else echo "BLOCKED bootstrap_binary_absent=true"; fi
    if test -x /usr/local/bin/clawreef-system-backup-registration; then
      echo "REGISTRATION_BINARY_PRESENT=true"
      /usr/local/bin/clawreef-system-backup-registration --help 2>&1 | grep -F -e "-download-runtime" -e "-check-live-url" || true
    else echo "BLOCKED registration_binary_absent=true"; fi
  '
  a_live_app_identity
  echo 'A_LIVE_APP_CAPABILITIES_COMPLETE no_runtime_started=true'
fi
