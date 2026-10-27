#!/usr/bin/env bash
# Sourced by the existing isolated fresh-migration runner. No production DB.
[[ "$RUN_NAMESPACE" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ && "$RUN_NAMESPACE_UID" =~ ^[0-9a-f-]{36}$ ]] || return 1
[[ -s "$D_INVARIANT_BINARY" && "$D_INVARIANT_BINARY_SHA256" =~ ^[a-f0-9]{64}$ && -s "$D_PROVIDER_REGISTRATION_DDL" && "$D_PROVIDER_REGISTRATION_DDL_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
[[ "$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)" == "$D_INVARIANT_BINARY_SHA256" && "$(sha256sum "$D_PROVIDER_REGISTRATION_DDL" | cut -d' ' -f1)" == "$D_PROVIDER_REGISTRATION_DDL_SHA256" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || return 1
[[ "${D_EMBEDDED_MIGRATION_COMPLETED:-0}" == 1 ]] || return 1
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- uname -m)" == x86_64 ]] || return 1
mysql_query "CREATE TABLE d_invariant_run_marker(id INT PRIMARY KEY,run_namespace VARCHAR(64),namespace_uid VARCHAR(36),server_uuid VARCHAR(36)); INSERT INTO d_invariant_run_marker VALUES(1,'$RUN_NAMESPACE','$RUN_NAMESPACE_UID',@@server_uuid)" >/dev/null || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-bootstrap-original-materials.test; chmod 700 /tmp/d-bootstrap-original-materials.test' < "$D_INVARIANT_BINARY" || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-bootstrap-original-materials-inputs.json' < "$D_PROVIDER_REGISTRATION_DDL" || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
  set -eu
  trap '\''rm -f /tmp/d-bootstrap-original-materials.test /tmp/d-bootstrap-original-materials-inputs.json'\'' EXIT
  actual="$(sha256sum /tmp/d-bootstrap-original-materials.test)"; [ "${actual%% *}" = "$3" ] || exit 1
  test_root=TestDBootstrapOriginalMaterialsMySQL
  test_name="^${test_root}$"
  [ "$(/tmp/d-bootstrap-original-materials.test -test.list "$test_name")" = "$test_root" ] || exit 1
  D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_PROVIDER_REGISTRATION_DDL=/tmp/d-bootstrap-original-materials-inputs.json D_PROVIDER_REGISTRATION_DDL_SHA256="$4" /tmp/d-bootstrap-original-materials.test -test.run "$test_name" -test.v -test.count=1 -test.timeout=420s
' probe "$RUN_NAMESPACE" "$RUN_NAMESPACE_UID" "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256" || return 1
printf 'PASS d-bootstrap-original-materials-mysql cases=22 binary_sha256=%s inputs_sha256=%s original_files=yes nonce_ca=real_apis tls=loopback synthetic_mapping=yes physical_capacity=no production=no\n' "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256"
