#!/usr/bin/env bash
# Sourced only by the fresh migration smoke, using its run-owned namespace.
history_review_mode="${D_HISTORY_REVIEW_SMOKE:-0}"
history_cli_mode="${D_HISTORY_CLI_SMOKE:-0}"
[[ "$history_cli_mode" == 0 || "$history_cli_mode" == 1 ]] || { echo 'invalid history CLI mode' >&2; exit 1; }
if [[ "$history_cli_mode" == 1 ]]; then
  [[ "$history_review_mode" == 1 && -s "${D_HISTORY_CLI_BINARY:-}" && "${D_HISTORY_CLI_SHA256:-}" =~ ^[0-9a-f]{64}$ && -s scripts/system-backup-d-history-cli-phase.sh ]] || { echo 'history CLI inputs missing' >&2; exit 1; }
  [[ "$(sha256sum "$D_HISTORY_CLI_BINARY" | cut -d' ' -f1)" == "$D_HISTORY_CLI_SHA256" ]] || { echo 'history CLI checksum mismatch' >&2; exit 1; }
fi
[[ "$history_review_mode" == 0 || "$history_review_mode" == 1 ]] || { echo 'invalid history review test mode' >&2; exit 1; }
[[ "$history_review_mode" == 0 || ( "${D_PROVIDER_REGISTRATION_SMOKE:-0}" == 0 && -z "${D_INVARIANT_IMAGE:-}" ) ]] || { echo 'history review requires dedicated binary mode' >&2; exit 1; }
if [[ "${D_PROVIDER_REGISTRATION_SMOKE:-0}" == 1 ]]; then
  source scripts/system-backup-d-provider-registration-phase.sh
  return
fi
[[ "$RUN_NAMESPACE" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ && -n "$RUN_NAMESPACE_UID" ]] || { echo 'isolated namespace identity missing' >&2; exit 1; }
if [[ -n "${D_INVARIANT_IMAGE:-}" ]]; then
  validate_system_backup_smoke_image "$D_INVARIANT_IMAGE" "${D_INVARIANT_IMAGE##*@sha256:}"
else
  [[ -s "$D_INVARIANT_BINARY" && "$D_INVARIANT_BINARY_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo 'probe binary or pinned checksum missing' >&2; exit 1; }
  [[ "$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)" == "$D_INVARIANT_BINARY_SHA256" ]] || { echo 'probe checksum mismatch' >&2; exit 1; }
fi
current_uid="$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')"
[[ "$current_uid" == "$RUN_NAMESPACE_UID" ]] || { echo 'namespace UID changed' >&2; exit 1; }
if [[ "$history_cli_mode" == 1 ]]; then
  [[ "${D_EMBEDDED_MIGRATION_COMPLETED:-0}" == 1 ]] || { echo 'history CLI requires completed current-catalog replay' >&2; exit 1; }
  [[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod mysql -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$RUN_ID" ]] || { echo 'MySQL pod ownership mismatch' >&2; exit 1; }
  [[ -z "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pods -l app=migration-app -o name)" ]] || { echo 'history CLI requires no migration app' >&2; exit 1; }
else
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod migration-app -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$RUN_ID" ]] || { echo 'migration app ownership mismatch' >&2; exit 1; }
# Stop the isolated app before introducing synthetic records. No controller or
# provider runs in this phase. Source application pods are never modified.
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" delete pod migration-app --wait=true --timeout=60s >/dev/null
fi
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- uname -m)" == x86_64 ]] || { echo 'probe requires amd64 MySQL pod' >&2; exit 1; }
mysql_query "CREATE TABLE d_invariant_run_marker (id INT PRIMARY KEY, run_namespace VARCHAR(64), namespace_uid VARCHAR(36), server_uuid VARCHAR(36)); INSERT INTO d_invariant_run_marker VALUES (1,'$RUN_NAMESPACE','$RUN_NAMESPACE_UID',@@server_uuid)" >/dev/null
# This non-UTC default is a negative control for per-connection UTC setup.
# It belongs only to the disposable MySQL server and dies with the namespace.
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --execute="SET GLOBAL time_zone = '\''+08:00'\''"' >/dev/null
if [[ -n "${D_INVARIANT_IMAGE:-}" ]]; then
  source scripts/system-backup-d-invariants-image-phase.sh
else
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c \
  'umask 077; cat > /tmp/d-invariants.test; chmod 700 /tmp/d-invariants.test' < "$D_INVARIANT_BINARY"
if [[ "$history_cli_mode" == 1 ]]; then
  source scripts/system-backup-d-history-cli-phase.sh
  return
fi
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
  set -eu
  trap '\''rm -f /tmp/d-invariants.test'\'' EXIT
  actual="$(sha256sum /tmp/d-invariants.test)"
  [ "${actual%% *}" = "$3" ] || { echo "uploaded probe checksum mismatch" >&2; exit 1; }
  expected_test=TestDDatabaseInvariants
  if [ "$4" = 1 ]; then expected_test=TestDReviewedHistoryMySQL; fi
  test_name="^${expected_test}$"
  [ "$(/tmp/d-invariants.test -test.list "$test_name")" = "$expected_test" ] || { echo "required probe test absent" >&2; exit 1; }
  D_HISTORY_REVIEW_SMOKE="$4" D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" /tmp/d-invariants.test -test.run "$test_name" -test.v -test.count=1 -test.timeout=180s
' probe "$RUN_NAMESPACE" "$RUN_NAMESPACE_UID" "$D_INVARIANT_BINARY_SHA256" "$history_review_mode"
if [[ "$history_review_mode" == 1 ]]; then
  printf 'PASS d-reviewed-history binary_sha256=%s catalog=%s source=synthetic-isolated-mysql production-upgrade=false\n' "$D_INVARIANT_BINARY_SHA256" "$EXPECTED_CATALOG_HASH"
else
  printf 'PASS d-database-invariants binary_sha256=%s catalog=%s source=synthetic-isolated-mysql\n' "$D_INVARIANT_BINARY_SHA256" "$EXPECTED_CATALOG_HASH"
fi
fi
