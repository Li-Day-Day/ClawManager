#!/usr/bin/env bash
# Sourced only by the existing full fresh-catalog harness in an owned namespace.
[[ "$RUN_NAMESPACE" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ && "$RUN_NAMESPACE_UID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || return 1
[[ "${D_EMBEDDED_MIGRATION_COMPLETED:-0}" == 1 ]] || return 1
[[ -s "$D_INVARIANT_BINARY" && "$D_INVARIANT_BINARY_SHA256" =~ ^[a-f0-9]{64}$ && -s "$D_PROVIDER_REGISTRATION_DDL" && "$D_PROVIDER_REGISTRATION_DDL_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
[[ "$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)" == "$D_INVARIANT_BINARY_SHA256" && "$(sha256sum "$D_PROVIDER_REGISTRATION_DDL" | cut -d' ' -f1)" == "$D_PROVIDER_REGISTRATION_DDL_SHA256" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod mysql -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$RUN_ID" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- uname -m)" == x86_64 ]] || return 1
mysql_query "CREATE TABLE d_invariant_run_marker (id INT PRIMARY KEY, run_namespace VARCHAR(64), namespace_uid VARCHAR(36), server_uuid VARCHAR(36)); INSERT INTO d_invariant_run_marker VALUES (1,'$RUN_NAMESPACE','$RUN_NAMESPACE_UID',@@server_uuid)" >/dev/null || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-control-health.test; chmod 700 /tmp/d-control-health.test' < "$D_INVARIANT_BINARY" || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-control-health-inputs.json' < "$D_PROVIDER_REGISTRATION_DDL" || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
  set -eu
  trap '\''rm -f /tmp/d-control-health.test /tmp/d-control-health-inputs.json'\'' EXIT
  actual="$(sha256sum /tmp/d-control-health.test)"
  [ "${actual%% *}" = "$3" ] || exit 1
  D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_CONTROL_HEALTH_INPUTS=/tmp/d-control-health-inputs.json D_CONTROL_HEALTH_INPUTS_SHA256="$4" /tmp/d-control-health.test -test.run "^TestDControlHealthMySQL$" -test.v -test.count=1 -test.timeout=240s
' probe "$RUN_NAMESPACE" "$RUN_NAMESPACE_UID" "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256" || return 1
printf 'PASS d-control-health-mysql binary_sha256=%s inputs_sha256=%s synthetic_read_scope=yes fixture_root_grants=yes production_approval=no\n' "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256"
