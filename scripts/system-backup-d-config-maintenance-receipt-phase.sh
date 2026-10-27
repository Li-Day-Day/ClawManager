#!/usr/bin/env bash
# Sourced only by the fresh migration smoke, after the full current catalog.
# The legacy DDL payload slot contains JSON input provenance for this profile.
# Synthetic maintenance receipt storage only; no production grant or historical source.
[[ "$RUN_NAMESPACE" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ && "$RUN_NAMESPACE_UID" =~ ^[0-9a-f-]{36}$ ]] || return 1
[[ -s "$D_INVARIANT_BINARY" && "$D_INVARIANT_BINARY_SHA256" =~ ^[a-f0-9]{64}$ && -s "$D_PROVIDER_REGISTRATION_DDL" && "$D_PROVIDER_REGISTRATION_DDL_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
[[ "$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)" == "$D_INVARIANT_BINARY_SHA256" && "$(sha256sum "$D_PROVIDER_REGISTRATION_DDL" | cut -d' ' -f1)" == "$D_PROVIDER_REGISTRATION_DDL_SHA256" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || return 1
if [[ "${D_EMBEDDED_MIGRATION_COMPLETED:-0}" != 1 ]]; then
  [[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod migration-app -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$RUN_ID" ]] || return 1
  kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" delete pod migration-app --wait=true --timeout=60s >/dev/null || return 1
fi
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- uname -m)" == x86_64 ]] || return 1
mysql_query "CREATE TABLE d_invariant_run_marker (id INT PRIMARY KEY, run_namespace VARCHAR(64), namespace_uid VARCHAR(36), server_uuid VARCHAR(36)); INSERT INTO d_invariant_run_marker VALUES (1,'$RUN_NAMESPACE','$RUN_NAMESPACE_UID',@@server_uuid)" >/dev/null || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-config-maintenance-receipt.test; chmod 700 /tmp/d-config-maintenance-receipt.test' < "$D_INVARIANT_BINARY" || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-config-maintenance-receipt-inputs.json' < "$D_PROVIDER_REGISTRATION_DDL" || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
  set -eu
  trap '\''rm -f /tmp/d-config-maintenance-receipt.test /tmp/d-config-maintenance-receipt-inputs.json'\'' EXIT
  actual="$(sha256sum /tmp/d-config-maintenance-receipt.test)"
  [ "${actual%% *}" = "$3" ] || exit 1
  D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_PROVIDER_REGISTRATION_DDL=/tmp/d-config-maintenance-receipt-inputs.json D_PROVIDER_REGISTRATION_DDL_SHA256="$4" /tmp/d-config-maintenance-receipt.test -test.run "^TestDConfigMaintenanceReceiptMySQL$" -test.v -test.count=1 -test.timeout=300s
' probe "$RUN_NAMESPACE" "$RUN_NAMESPACE_UID" "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256" || return 1
printf 'PASS d-config-maintenance-receipt-mysql binary_sha256=%s inputs_sha256=%s synthetic_admission=yes production_approval=no\n' "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256"
