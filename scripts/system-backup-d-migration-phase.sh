#!/usr/bin/env bash
# Only sourced inside the fresh, run-owned MySQL namespace. The binary embeds
# the current catalog, so an older app image is not mistaken for a new replay.
[[ ( "${D_PROVIDER_REGISTRATION_SMOKE:-0}" == 1 || "${D_HISTORY_CLI_SMOKE:-0}" == 1 ) && "$RUN_NAMESPACE" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ ]] || return 1
if [[ "${D_HISTORY_CLI_SMOKE:-0}" == 1 ]]; then
  [[ "${D_PROVIDER_REGISTRATION_SMOKE:-0}" == 0 && "${D_HISTORY_REVIEW_SMOKE:-0}" == 1 && "$D_MIGRATION_BINARY" == "$D_HISTORY_CLI_BINARY" && "$D_MIGRATION_BINARY_SHA256" == "$D_HISTORY_CLI_SHA256" ]] || return 1
fi
[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod mysql -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$RUN_ID" ]] || return 1
[[ "$(sha256sum "$D_MIGRATION_BINARY" | cut -d' ' -f1)" == "$D_MIGRATION_BINARY_SHA256" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- uname -m)" == x86_64 ]] || return 1
migration_server_uuid="$(mysql_query 'SELECT @@server_uuid')"
[[ "$migration_server_uuid" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-system-backup-migrate; chmod 700 /tmp/d-system-backup-migrate' < "$D_MIGRATION_BINARY"
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
 set -eu
 umask 077
 trap '\''rm -f /tmp/d-system-backup-migrate /tmp/d-migration-dsn'\'' EXIT
 actual="$(sha256sum /tmp/d-system-backup-migrate)"
 [ "${actual%% *}" = "$1" ] || exit 1
 printf "%s:%s@tcp(127.0.0.1:3306)/clawmanager" "$MYSQL_USER" "$MYSQL_PASSWORD" > /tmp/d-migration-dsn
 /tmp/d-system-backup-migrate --apply --dsn-file /tmp/d-migration-dsn --expected-server-uuid "$2" --expected-database clawmanager --expected-catalog-sha256 "$3"
' migration "$D_MIGRATION_BINARY_SHA256" "$migration_server_uuid" "$EXPECTED_CATALOG_HASH"
D_EMBEDDED_MIGRATION_COMPLETED=1
printf 'PASS pinned-migration-runner binary_sha256=%s catalog_sha256=%s\n' "$D_MIGRATION_BINARY_SHA256" "$EXPECTED_CATALOG_HASH"
