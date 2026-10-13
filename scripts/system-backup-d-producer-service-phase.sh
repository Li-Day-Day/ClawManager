#!/usr/bin/env bash
# Sourced by the fresh migration smoke; only its emptyDir MySQL is writable.
[[ "$RUN_NAMESPACE" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ && "$RUN_NAMESPACE_UID" =~ ^[0-9a-f-]{36}$ ]] || return 1
[[ -s "$D_INVARIANT_BINARY" && "$D_INVARIANT_BINARY_SHA256" =~ ^[a-f0-9]{64}$ && -s "$D_PROVIDER_REGISTRATION_DDL" && "$D_PROVIDER_REGISTRATION_DDL_SHA256" =~ ^[a-f0-9]{64}$ ]] || return 1
[[ "$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)" == "$D_INVARIANT_BINARY_SHA256" && "$(sha256sum "$D_PROVIDER_REGISTRATION_DDL" | cut -d' ' -f1)" == "$D_PROVIDER_REGISTRATION_DDL_SHA256" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || return 1
if [[ "${D_EMBEDDED_MIGRATION_COMPLETED:-0}" != 1 ]]; then
  [[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod migration-app -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$RUN_ID" ]] || return 1
  kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" delete pod migration-app --wait=true --timeout=60s >/dev/null
fi
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- uname -m)" == x86_64 ]] || return 1
test_target='^TestDProducerMySQL$'
pass_name='d-producer-service-mysql'
if [[ "${D_PRODUCER_RECOVERY_ONLY:-0}" == 1 ]]; then
  case "${D_PRODUCER_RECOVERY_TEST:-D}" in
    D) test_target='^TestD(HistoricalRecovery|RecoveryFence|RecoveryFenceRead|RecoveryFenceRecoveryRace)MySQL$'; pass_name='d-producer-recovery-mysql' ;;
    A) test_target='^TestAHistoricalRecoveryMySQL$'; pass_name='a-producer-recovery-mysql' ;;
    ADeployment) test_target='^TestSystemHistoricalDeploymentGuardMySQL$'; pass_name='a-recovery-deployment-mysql' ;;
    Schema) test_target='^TestDRecoveryAuthoritySchemaMySQL$'; pass_name='d-recovery-authority-schema-mysql' ;;
    Manager) test_target='^TestDRecoveryManagerRowMySQL$'; pass_name='d-recovery-manager-row-mysql' ;;
    AManager) test_target='^TestSystemRecoveryAuthority(Combined|PinnedDecision)?MySQL$'; pass_name='a-recovery-manager-authority-mysql' ;;
    ARead) test_target='^TestSystemRecoveryAuthorityReadMySQL$'; pass_name='a-recovery-authority-read-mysql' ;;
    ABootstrap) test_target='^TestRecoveryManagerBootstrapMySQL$'; pass_name='a-recovery-manager-bootstrap-mysql' ;;
    ARevoke) test_target='^TestRecoveryManagerRevocationMySQL$'; pass_name='a-recovery-manager-revocation-mysql' ;;
    Authority) test_target='^TestDRecoveryAuthority(Race)?MySQL$'; pass_name='d-recovery-authority-mysql' ;;
    *) return 1 ;;
  esac
fi
mysql_query "CREATE TABLE d_invariant_run_marker (id INT PRIMARY KEY, run_namespace VARCHAR(64), namespace_uid VARCHAR(36), server_uuid VARCHAR(36)); INSERT INTO d_invariant_run_marker VALUES (1,'$RUN_NAMESPACE','$RUN_NAMESPACE_UID',@@server_uuid)" >/dev/null
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-provider-registration.test; chmod 700 /tmp/d-provider-registration.test' < "$D_INVARIANT_BINARY"
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c 'umask 077; cat > /tmp/d-provider-registration.sql' < "$D_PROVIDER_REGISTRATION_DDL"
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c 'umask 077; mkdir /tmp/d-producer-fixtures; mkdir -p /tmp/d-producer-fixtures/backend/internal/systembackupevidence' || return 1
tar -cf - contracts/system-backup/v12 | kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- tar -xf - -C /tmp/d-producer-fixtures || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
  set -eu
  trap '\''rm -f /tmp/d-provider-registration.test /tmp/d-provider-registration.sql; rm -rf /tmp/d-producer-fixtures'\'' EXIT
  cd /tmp/d-producer-fixtures/backend/internal/systembackupevidence
  actual="$(sha256sum /tmp/d-provider-registration.test)"
  [ "${actual%% *}" = "$3" ] || exit 1
  D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_PROVIDER_REGISTRATION_DDL=/tmp/d-provider-registration.sql D_PROVIDER_REGISTRATION_DDL_SHA256="$4" /tmp/d-provider-registration.test -test.run "$5" -test.v -test.count=1 -test.timeout=300s
' probe "$RUN_NAMESPACE" "$RUN_NAMESPACE_UID" "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256" "$test_target" || return 1
printf 'PASS %s binary_sha256=%s ddl_sha256=%s\n' "$pass_name" "$D_INVARIANT_BINARY_SHA256" "$D_PROVIDER_REGISTRATION_DDL_SHA256"
