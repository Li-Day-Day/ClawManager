#!/usr/bin/env bash
# Sourced by the existing isolated fresh-migration runner. No production DB.
resources_mysql_suite=readback
case "$resources_mysql_suite" in readback|writer|writer-fk) ;; *) return 1 ;; esac
[[ "$RUN_NAMESPACE" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ && "$RUN_NAMESPACE_UID" =~ ^[0-9a-f-]{36}$ ]] || return 1
[[ -s "$D_INVARIANT_BINARY" && "$D_INVARIANT_BINARY_SHA256" =~ ^[a-f0-9]{64}$ && -s "$D_PROVIDER_REGISTRATION_DDL" && "$D_PROVIDER_REGISTRATION_DDL_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
[[ "$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)" == "$D_INVARIANT_BINARY_SHA256" && "$(sha256sum "$D_PROVIDER_REGISTRATION_DDL" | cut -d' ' -f1)" == "$D_PROVIDER_REGISTRATION_DDL_SHA256" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || return 1
[[ "${D_EMBEDDED_MIGRATION_COMPLETED:-0}" == 1 ]] || return 1
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- uname -m)" == x86_64 ]] || return 1
mysql_query "CREATE TABLE d_invariant_run_marker(id INT PRIMARY KEY,run_namespace VARCHAR(64),namespace_uid VARCHAR(36),server_uuid VARCHAR(36)); INSERT INTO d_invariant_run_marker VALUES(1,'$RUN_NAMESPACE','$RUN_NAMESPACE_UID',@@server_uuid)" >/dev/null || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-resources-readback.test; chmod 700 /tmp/d-resources-readback.test' < "$D_INVARIANT_BINARY" || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-resources-readback-inputs.json' < "$D_PROVIDER_REGISTRATION_DDL" || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
  set -eu
  trap '\''rm -f /tmp/d-resources-readback.test /tmp/d-resources-readback-inputs.json'\'' EXIT
  actual="$(sha256sum /tmp/d-resources-readback.test)"; [ "${actual%% *}" = "$3" ] || exit 1
  case "$5" in
    readback) test_root=TestDResourcesReadbackMySQL ;;
    writer) test_root=TestDResourcesWriteMySQL ;;
    writer-fk) test_root=TestAResourcesWriteFKMySQL ;;
    *) exit 1 ;;
  esac
  test_name="^${test_root}$"
  [ "$(/tmp/d-resources-readback.test -test.list "$test_name")" = "$test_root" ] || exit 1
  D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_PROVIDER_REGISTRATION_DDL=/tmp/d-resources-readback-inputs.json D_PROVIDER_REGISTRATION_DDL_SHA256="$4" /tmp/d-resources-readback.test -test.run "$test_name" -test.v -test.count=1 -test.timeout=300s
' probe "$RUN_NAMESPACE" "$RUN_NAMESPACE_UID" "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256" "$resources_mysql_suite" || return 1
if [[ "$resources_mysql_suite" == writer-fk ]]; then
  printf 'PASS a-resources-write-fk-mysql cases=10 binary_sha256=%s inputs_sha256=%s synthetic_proofs=yes full_restore=no production=no\n' "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256"
elif [[ "$resources_mysql_suite" == writer ]]; then
  printf 'PASS d-resources-write-mysql cases=9 binary_sha256=%s inputs_sha256=%s synthetic_proofs=yes full_restore=no production=no\n' "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256"
else
  printf 'PASS d-resources-readback-mysql cases=12 binary_sha256=%s inputs_sha256=%s synthetic_proofs=yes full_restore=no production=no\n' "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256"
fi
