#!/usr/bin/env bash
# Sourced by the fresh migration smoke; only its emptyDir MySQL is writable.
drill_history_only=0
[[ "$drill_history_only" == 0 || "$drill_history_only" == 1 ]] || return 1
if [[ "$drill_history_only" == 1 ]]; then
  [[ "${D_CONFIG_CANDIDATE:-0}" == 0 && "${D_ADMIN_INDEX_CANDIDATE:-0}" == 0 ]] || return 1
fi
[[ "$RUN_NAMESPACE" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ && "$RUN_NAMESPACE_UID" =~ ^[0-9a-f-]{36}$ ]] || return 1
[[ -s "$D_INVARIANT_BINARY" && "$D_INVARIANT_BINARY_SHA256" =~ ^[a-f0-9]{64}$ && -s "$D_PROVIDER_REGISTRATION_DDL" && "$D_PROVIDER_REGISTRATION_DDL_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
[[ -s "$D_ADMIN_READ_HTTP_BINARY" && "$D_ADMIN_READ_HTTP_BINARY_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
[[ "${D_CONFIG_CANDIDATE:-0}" == 0 || "${D_CONFIG_CANDIDATE:-0}" == 1 ]] || return 1
[[ "${D_ADMIN_INDEX_CANDIDATE:-0}" == 0 || "${D_ADMIN_INDEX_CANDIDATE:-0}" == 1 ]] || return 1
if [[ "${D_ADMIN_INDEX_CANDIDATE:-0}" == 1 ]]; then
  [[ "${D_ADMIN_INDEX_VARIANT:-all}" == all || "${D_ADMIN_INDEX_VARIANT:-all}" == page || "${D_ADMIN_INDEX_VARIANT:-all}" == status ]] || return 1
  [[ -s "$D_ADMIN_INDEX_BINARY" && "$D_ADMIN_INDEX_BINARY_SHA256" =~ ^[a-f0-9]{64}$ && -s "$D_ADMIN_INDEX_DDL" && "$D_ADMIN_INDEX_DDL_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
  [[ "$(sha256sum "$D_ADMIN_INDEX_BINARY" | cut -d' ' -f1)" == "$D_ADMIN_INDEX_BINARY_SHA256" && "$(sha256sum "$D_ADMIN_INDEX_DDL" | cut -d' ' -f1)" == "$D_ADMIN_INDEX_DDL_SHA256" ]] || return 1
fi
if [[ "${D_CONFIG_CANDIDATE:-0}" == 1 ]]; then
  [[ -s "$D_CONFIG_CANDIDATE_DDL" && "$D_CONFIG_CANDIDATE_DDL_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
  [[ "$(sha256sum "$D_CONFIG_CANDIDATE_DDL" | cut -d' ' -f1)" == "$D_CONFIG_CANDIDATE_DDL_SHA256" ]] || return 1
fi
[[ -s scripts/system-backup-controller-enabled-fixture.mysql.sql ]] || return 1
[[ "$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)" == "$D_INVARIANT_BINARY_SHA256" && "$(sha256sum "$D_PROVIDER_REGISTRATION_DDL" | cut -d' ' -f1)" == "$D_PROVIDER_REGISTRATION_DDL_SHA256" ]] || return 1
[[ "$(sha256sum "$D_ADMIN_READ_HTTP_BINARY" | cut -d' ' -f1)" == "$D_ADMIN_READ_HTTP_BINARY_SHA256" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || return 1
if [[ "${D_EMBEDDED_MIGRATION_COMPLETED:-0}" != 1 ]]; then
  [[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod migration-app -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$RUN_ID" ]] || return 1
  kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" delete pod migration-app --wait=true --timeout=60s >/dev/null
fi
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- uname -m)" == x86_64 ]] || return 1
mysql_query "CREATE TABLE d_invariant_run_marker (id INT PRIMARY KEY, run_namespace VARCHAR(64), namespace_uid VARCHAR(36), server_uuid VARCHAR(36)); INSERT INTO d_invariant_run_marker VALUES (1,'$RUN_NAMESPACE','$RUN_NAMESPACE_UID',@@server_uuid)" >/dev/null
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-provider-registration.test; chmod 700 /tmp/d-provider-registration.test' < "$D_INVARIANT_BINARY"
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-admin-read-http.test; chmod 700 /tmp/d-admin-read-http.test' < "$D_ADMIN_READ_HTTP_BINARY"
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-provider-registration.sql' < "$D_PROVIDER_REGISTRATION_DDL"
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-admin-read-full-fixture.sql' < scripts/system-backup-controller-enabled-fixture.mysql.sql
if [[ "${D_CONFIG_CANDIDATE:-0}" == 1 ]]; then
  kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-config-candidate.sql' < "$D_CONFIG_CANDIDATE_DDL"
fi
full_fixture_sha256="$(sha256sum scripts/system-backup-controller-enabled-fixture.mysql.sql | cut -d' ' -f1)"
if [[ "${D_ADMIN_INDEX_CANDIDATE:-0}" == 1 ]]; then
  kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-admin-read-index.test; chmod 700 /tmp/d-admin-read-index.test' < "$D_ADMIN_INDEX_BINARY"
  kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-admin-read-index.sql' < "$D_ADMIN_INDEX_DDL"
fi
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
  set -eu
  trap '\''rm -f /tmp/d-provider-registration.test /tmp/d-admin-read-http.test /tmp/d-provider-registration.sql /tmp/d-admin-read-full-fixture.sql /tmp/d-config-candidate.sql /tmp/d-admin-read-index.test /tmp/d-admin-read-index.sql'\'' EXIT
  actual="$(sha256sum /tmp/d-provider-registration.test)"
  [ "${actual%% *}" = "$3" ] || exit 1
  actual_http="$(sha256sum /tmp/d-admin-read-http.test)"
  [ "${actual_http%% *}" = "$6" ] || exit 1
  [ "$(/tmp/d-provider-registration.test -test.list "^TestAAdminReadAuthorityMySQL$")" = TestAAdminReadAuthorityMySQL ] || exit 1
  [ "$(/tmp/d-provider-registration.test -test.list "^TestDAdminReadFullSchemaMySQL$")" = TestDAdminReadFullSchemaMySQL ] || exit 1
  [ "$(/tmp/d-admin-read-http.test -test.list "^TestDAdminReadLiveHTTPMySQL$")" = TestDAdminReadLiveHTTPMySQL ] || exit 1
  if [ "$7" = 1 ]; then
    actual_candidate="$(sha256sum /tmp/d-config-candidate.sql)"
    [ "${actual_candidate%% *}" = "$8" ] || exit 1
    [ "$(/tmp/d-provider-registration.test -test.list "^TestDConfigCanonicalCandidateMySQL$")" = TestDConfigCanonicalCandidateMySQL ] || exit 1
    [ "$(/tmp/d-admin-read-http.test -test.list "^TestDAdminReadConfigHTTPMySQL$")" = TestDAdminReadConfigHTTPMySQL ] || { echo "D config HTTP probe test absent from uploaded binary" >&2; exit 1; }
  fi
  if [ "$9" = 1 ]; then
    actual_index="$(sha256sum /tmp/d-admin-read-index.test)"
    [ "${actual_index%% *}" = "${10}" ] || exit 1
    actual_index_ddl="$(sha256sum /tmp/d-admin-read-index.sql)"
    [ "${actual_index_ddl%% *}" = "${11}" ] || exit 1
    [ "$(/tmp/d-admin-read-index.test -test.list "^TestDAdminReadIndexCandidateMySQL$")" = TestDAdminReadIndexCandidateMySQL ] || { echo "D admin index probe test absent" >&2; exit 1; }
    D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_ADMIN_INDEX_DDL=/tmp/d-admin-read-index.sql D_ADMIN_INDEX_DDL_SHA256="${11}" D_ADMIN_INDEX_VARIANT="${12}" /tmp/d-admin-read-index.test -test.run "^TestDAdminReadIndexCandidateMySQL$" -test.v -test.count=1 -test.timeout=540s
  fi
  if [ "${13}" = 0 ]; then
    D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_PROVIDER_REGISTRATION_DDL=/tmp/d-provider-registration.sql D_PROVIDER_REGISTRATION_DDL_SHA256="$4" /tmp/d-provider-registration.test -test.run "^TestAAdminReadAuthorityMySQL$" -test.v -test.count=1 -test.timeout=180s
    D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_ADMIN_READ_FULL_FIXTURE=/tmp/d-admin-read-full-fixture.sql D_ADMIN_READ_FULL_FIXTURE_SHA256="$5" /tmp/d-provider-registration.test -test.run "^TestDAdminReadFullSchemaMySQL$" -test.v -test.count=1 -test.timeout=180s
  fi
  D_ADMIN_DRILL_HISTORY_ONLY="${13}" D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_ADMIN_READ_FULL_FIXTURE=/tmp/d-admin-read-full-fixture.sql D_ADMIN_READ_FULL_FIXTURE_SHA256="$5" /tmp/d-admin-read-http.test -test.run "^TestDAdminReadLiveHTTPMySQL$" -test.v -test.count=1 -test.timeout=180s
  if [ "$7" = 1 ]; then
    D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_CONFIG_CANDIDATE_DDL=/tmp/d-config-candidate.sql D_CONFIG_CANDIDATE_DDL_SHA256="$8" /tmp/d-provider-registration.test -test.run "^TestDConfigCanonicalCandidateMySQL$" -test.v -test.count=1 -test.timeout=180s
    D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" /tmp/d-admin-read-http.test -test.run "^TestDAdminReadConfigHTTPMySQL$" -test.v -test.count=1 -test.timeout=180s
  fi
' probe "$RUN_NAMESPACE" "$RUN_NAMESPACE_UID" "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256" "$full_fixture_sha256" "$D_ADMIN_READ_HTTP_BINARY_SHA256" "${D_CONFIG_CANDIDATE:-0}" "${D_CONFIG_CANDIDATE_DDL_SHA256:-}" "${D_ADMIN_INDEX_CANDIDATE:-0}" "${D_ADMIN_INDEX_BINARY_SHA256:-}" "${D_ADMIN_INDEX_DDL_SHA256:-}" "${D_ADMIN_INDEX_VARIANT:-all}" "$drill_history_only" || return 1
if [[ "$drill_history_only" == 1 ]]; then
  printf 'PASS d-drill-detail-http-mysql synthetic_cases=19 binary_sha256=%s actual_provider=no production_approval=no\n' "$D_ADMIN_READ_HTTP_BINARY_SHA256"
  return 0
fi
if [[ "${D_ADMIN_INDEX_CANDIDATE:-0}" == 1 ]]; then printf 'PASS d-admin-read-index-candidate-mysql binary_sha256=%s ddl_sha256=%s synthetic=yes production_approval=no\n' "$D_ADMIN_INDEX_BINARY_SHA256" "$D_ADMIN_INDEX_DDL_SHA256"; fi
printf 'PASS d-admin-read-live-http-mysql binary_sha256=%s\n' "$D_ADMIN_READ_HTTP_BINARY_SHA256"
if [[ "${D_CONFIG_CANDIDATE:-0}" == 1 ]]; then printf 'PASS d-config-canonical-candidate-mysql binary_sha256=%s ddl_sha256=%s\n' "$D_INVARIANT_BINARY_SHA256" "$D_CONFIG_CANDIDATE_DDL_SHA256"; printf 'PASS d-config-bootstrap-canonical-mysql binary_sha256=%s\n' "$D_INVARIANT_BINARY_SHA256"; printf 'PASS d-config-live-http-mysql binary_sha256=%s\n' "$D_ADMIN_READ_HTTP_BINARY_SHA256"; fi
printf 'PASS a-admin-read-mysql binary_sha256=%s ddl_sha256=%s\n' "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256"
