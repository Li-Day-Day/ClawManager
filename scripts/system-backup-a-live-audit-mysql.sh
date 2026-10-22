#!/usr/bin/env bash
# Dedicated synthetic selected-column fixture. No source SQL or credentials read.
set -euo pipefail
umask 077
run="$1"; binary_sha="$2"; script_sha="$3"
mode="${4:-audit}"
[[ "$run" =~ ^aaudit-[0-9]{14}-[a-f0-9]{8}$ && "$binary_sha" =~ ^[a-f0-9]{64}$ && "$script_sha" =~ ^[a-f0-9]{64}$ ]] || exit 1
[[ "$mode" == audit || "$mode" == startup ]] || exit 1
owned="/tmp/$run"
context=kubernetes-admin@kubernetes
source_ns=clawmanager-zhanghui08-system
uid=''
namespace_attempted=0
k() { kubectl --context="$context" "$@"; }
guard() {
  [[ "$uid" =~ ^[a-f0-9-]{36}$ && "$(k get namespace "$run" -o jsonpath='{.metadata.uid}')" == "$uid" && "$(k get namespace "$run" -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$run" ]]
}
# Collect public scheduling/status fields before the run's cleanup removes them.
# Do not dump Pod YAML, Secret values, probe output, or database logs.
diagnose_startup() {
  local observed_uid observed_label pod_identity pod_uid pods count=0 entry
  echo "A_AUDIT_STARTUP_DIAGNOSTIC namespace=$run uid=$uid node=$node" >&2
  observed_uid="$(k --request-timeout=10s get namespace "$run" -o jsonpath='{.metadata.uid}' 2>/dev/null)" || observed_uid=''
  observed_label="$(k --request-timeout=10s get namespace "$run" -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}' 2>/dev/null)" || observed_label=''
  if [[ "$observed_uid" != "$uid" || "$observed_label" != "$run" ]]; then
    echo 'A_AUDIT_STARTUP_DIAGNOSTIC skipped=namespace_identity_unverified' >&2
    return 0
  fi
  pod_identity="$(k --request-timeout=10s -n "$run" get pod mysql -o jsonpath='{.metadata.uid}{" "}{.metadata.labels.clawmanager\.io/test-run}' 2>/dev/null)" || pod_identity=''
  pod_uid="${pod_identity%% *}"
  if [[ ! "$pod_uid" =~ ^[a-f0-9-]{36}$ || "$pod_identity" != "$pod_uid $run" ]]; then
    echo 'A_AUDIT_STARTUP_DIAGNOSTIC skipped=pod_identity_unverified' >&2
    return 0
  fi
  k --request-timeout=10s -n "$run" get pod mysql -o jsonpath='{"A_AUDIT_POD phase="}{.status.phase}{" node="}{.spec.nodeName}{" reason="}{.status.reason}{"\n"}{range .status.conditions[*]}{"A_AUDIT_CONDITION "}{.type}{"="}{.status}{" reason="}{.reason}{"\n"}{end}{range .status.containerStatuses[*]}{"A_AUDIT_CONTAINER "}{.name}{" ready="}{.ready}{" restarts="}{.restartCount}{" waiting="}{.state.waiting.reason}{" terminated="}{.state.terminated.reason}{" exit="}{.state.terminated.exitCode}{"\n"}{end}' >&2 || true
  k --request-timeout=10s -n "$run" get events --field-selector="involvedObject.uid=$pod_uid" -o jsonpath='{range .items[*]}{"A_AUDIT_EVENT "}{.type}{" reason="}{.reason}{" count="}{.count}{"\n"}{end}{range .items[?(@.reason=="FailedScheduling")]}{"A_AUDIT_SCHEDULING "}{.message}{"\n"}{end}' >&2 || true
  k --request-timeout=10s get node "$node" -o jsonpath='{"A_AUDIT_NODE allocatable_pods="}{.status.allocatable.pods}{" capacity_pods="}{.status.capacity.pods}{"\n"}{range .status.conditions[*]}{"A_AUDIT_NODE_CONDITION "}{.type}{"="}{.status}{" reason="}{.reason}{"\n"}{end}' >&2 || true
  if pods="$(k --request-timeout=10s get pods --all-namespaces --field-selector="spec.nodeName=$node,status.phase!=Succeeded,status.phase!=Failed" -o jsonpath='{range .items[*]}{.metadata.uid}{"\n"}{end}')"; then
    while IFS= read -r entry; do if [[ -n "$entry" ]]; then count=$((count+1)); fi; done <<< "$pods"
    echo "A_AUDIT_NODE_COUNT node=$node nonterminal_pods=$count" >&2
  else
    echo "A_AUDIT_NODE_COUNT node=$node nonterminal_pods=unverified" >&2
  fi
  return 0
}
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$namespace_attempted" == 1 && -z "$uid" ]]; then
    recovered_uid="$(k get namespace "$run" -o jsonpath='{.metadata.uid}' 2>/dev/null || true)"
    if [[ "$recovered_uid" =~ ^[a-f0-9-]{36}$ && "$(k get namespace "$run" -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}' 2>/dev/null || true)" == "$run" ]]; then
      uid="$recovered_uid"
    else
      echo "A_AUDIT_CLEANUP namespace=$run absent=unverified" >&2
      status=1
    fi
  fi
  if [[ -n "$uid" ]]; then
    if guard && k delete namespace "$run" --wait=true --timeout=180s >/dev/null && namespace_absence="$(k get namespace "$run" --ignore-not-found -o name)" && [[ -z "$namespace_absence" ]]; then
      echo "A_AUDIT_CLEANUP namespace=$run uid=$uid absent=yes"
    else
      echo "A_AUDIT_CLEANUP namespace=$run absent=unverified" >&2
      status=1
    fi
  fi
  # Only the strictly named, per-run upload directory is owned by this runner.
  if [[ "$owned" =~ ^/tmp/aaudit-[0-9]{14}-[a-f0-9]{8}$ && ! -L "$owned" ]]; then
    rm -f -- "$owned/probe.test" "$owned/probe.sh"
    if rmdir -- "$owned" && [[ ! -e "$owned" ]]; then
      echo 'A_AUDIT_UPLOAD_CLEANUP absent=yes'
    else status=1; fi
  else status=1; fi
  echo "A_AUDIT_REMOTE_EXIT=$status"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
[[ "$0" == "$owned/probe.sh" && "$(sha256sum "$0" | cut -d' ' -f1)" == "$script_sha" ]] || exit 1
if [[ "$mode" == audit ]]; then
  [[ "$(sha256sum "$owned/probe.test" | cut -d' ' -f1)" == "$binary_sha" ]] || exit 1
else
  [[ "$binary_sha" == "$(printf '%064d' 0)" && ! -e "$owned/probe.test" ]] || exit 1
fi
pod="$(k -n "$source_ns" get pods -l app=mysql -o jsonpath='{.items[0].metadata.name}')"
[[ "$pod" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || exit 1
image_id="$(k -n "$source_ns" get pod "$pod" -o jsonpath='{.status.containerStatuses[0].imageID}')"
image="${image_id#*://}"
node="$(k -n "$source_ns" get pod "$pod" -o jsonpath='{.spec.nodeName}')"
[[ "$image" =~ ^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$ && "$node" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || exit 1
[[ "$(k get node "$node" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')" == True ]] || exit 1
for condition in MemoryPressure DiskPressure PIDPressure; do
  [[ "$(k get node "$node" -o jsonpath="{.status.conditions[?(@.type==\"$condition\")].status}")" == False ]] || exit 1
done
hostname="$(k get node "$node" -o jsonpath='{.metadata.labels.kubernetes\.io/hostname}')"
[[ "$hostname" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || exit 1
namespace_attempted=1
uid="$(k create -f - -o jsonpath='{.metadata.uid}' <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: $run
  labels: {clawmanager.io/test-run: "$run", clawmanager.io/test-purpose: audit-collector}
EOF
)"
guard
echo "A_AUDIT_RUN namespace=$run uid=$uid image=$image binary_sha256=$binary_sha"
for ((attempt=0; attempt<60; attempt++)); do
  guard
  if k -n "$run" get serviceaccount default -o name >/dev/null 2>&1; then break; fi
  sleep 1
done
password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
k -n "$run" create -f - >/dev/null <<EOF
apiVersion: v1
kind: Secret
metadata: {name: fixture-db}
stringData: {password: "$password"}
---
apiVersion: v1
kind: Pod
metadata:
  name: mysql
  labels: {clawmanager.io/test-run: "$run"}
spec:
  nodeSelector: {kubernetes.io/hostname: "$hostname"}
  restartPolicy: Never
  activeDeadlineSeconds: 600
  automountServiceAccountToken: false
  containers:
  - name: mysql
    image: $image
    imagePullPolicy: Never
    args: ["--innodb-use-native-aio=0"]
    env:
    - name: MYSQL_ROOT_PASSWORD
      valueFrom: {secretKeyRef: {name: fixture-db, key: password}}
    resources:
      requests: {cpu: 250m, memory: 512Mi, ephemeral-storage: 512Mi}
      limits: {cpu: "1", memory: 1Gi, ephemeral-storage: 2Gi}
    readinessProbe:
      exec:
        command: ["sh", "-c", "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -h127.0.0.1 -uroot --execute='SELECT 1' >/dev/null"]
      periodSeconds: 3
    volumeMounts: [{name: data, mountPath: /var/lib/mysql}]
  volumes: [{name: data, emptyDir: {sizeLimit: 1Gi}}]
EOF
unset password
if k -n "$run" wait --for=condition=Ready pod/mysql --timeout=240s >/dev/null; then
  :
else
  startup_status=$?
  diagnose_startup
  exit "$startup_status"
fi
guard
if [[ "$mode" == startup ]]; then
  echo 'A_AUDIT_STARTUP_PASS readiness=yes image_pull_policy=Never sql_cases=not_run migrations=not_run'
  exit 0
fi
[[ "$(k -n "$run" exec mysql -- uname -m)" == x86_64 ]]
k -n "$run" exec mysql -- sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --execute="$1"' seed "CREATE DATABASE aaudit_guard; CREATE TABLE aaudit_guard.run_marker(id INT PRIMARY KEY,run_id VARCHAR(64),namespace_uid CHAR(36),server_uuid CHAR(36)); INSERT INTO aaudit_guard.run_marker VALUES(1,'$run','$uid',@@server_uuid);"
k -n "$run" exec -i mysql -- sh -c 'umask 077; cat > /tmp/aaudit.test; chmod 700 /tmp/aaudit.test' < "$owned/probe.test"
guard
k -n "$run" exec mysql -- sh -c '
 set -eu
 trap '\''rm -f /tmp/aaudit.test'\'' EXIT
 actual="$(sha256sum /tmp/aaudit.test)"
 [ "${actual%% *}" = "$3" ]
 A_AUDIT_MYSQL_RUN="$1" A_AUDIT_MYSQL_UID="$2" /tmp/aaudit.test -test.run "^TestAuditCollectorMySQL$" -test.v -test.count=1 -test.timeout=150s
' probe "$run" "$uid" "$binary_sha"
guard
echo 'A_AUDIT_SQL_PASS transport=unix fixture=synthetic_selected_columns http=synthetic migrations=not_run production_approval=no'
