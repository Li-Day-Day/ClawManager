#!/usr/bin/env bash
# Sourced after the parent has verified ownership and stopped migration-app.
[[ -n "${mysql_ip:-}" && "${RUN_NAMESPACE:-}" =~ ^sbk-mig-[0-9]{12}-[0-9a-f]{4}$ && -n "${RUN_NAMESPACE_UID:-}" ]] || { echo 'isolated image test context missing' >&2; exit 1; }
validate_system_backup_smoke_image "$D_INVARIANT_IMAGE" "${D_INVARIANT_IMAGE##*@sha256:}"
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" create -f - >/dev/null <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: d-invariant-probe-isolation
spec:
  podSelector: {matchLabels: {app: d-invariant-probe}}
  policyTypes: [Ingress, Egress]
  ingress: []
  egress:
    - to: [{podSelector: {matchLabels: {app: mysql}}}]
      ports: [{protocol: TCP, port: 3306}]
---
apiVersion: v1
kind: Pod
metadata:
  name: d-invariant-probe
  labels:
    app: d-invariant-probe
    clawmanager.io/test-run: "$RUN_ID"
spec:
  restartPolicy: Never
  activeDeadlineSeconds: 210
  automountServiceAccountToken: false
  enableServiceLinks: false
  nodeSelector: {kubernetes.io/hostname: $TEST_NODE}
  securityContext:
    runAsNonRoot: true
    runAsUser: 65532
    seccompProfile: {type: RuntimeDefault}
  containers:
    - name: probe
      image: $D_INVARIANT_IMAGE
      imagePullPolicy: IfNotPresent
      command: ["/d-invariants.test"]
      args: ["-test.run", "^TestDDatabaseInvariants$", "-test.v", "-test.count=1", "-test.timeout=180s"]
      securityContext:
        readOnlyRootFilesystem: true
        allowPrivilegeEscalation: false
        capabilities: {drop: [ALL]}
      resources:
        requests: {cpu: 100m, memory: 128Mi}
        limits: {cpu: "1", memory: 512Mi}
      env:
        - {name: D_INVARIANT_RUN, value: "$RUN_NAMESPACE"}
        - {name: D_INVARIANT_NAMESPACE_UID, value: "$RUN_NAMESPACE_UID"}
        - {name: D_INVARIANT_MYSQL_HOST, value: "$mysql_ip"}
        - name: MYSQL_PASSWORD
          valueFrom: {secretKeyRef: {name: migration-db, key: mysql-password}}
EOF
deadline=$((SECONDS + 240))
probe_exit=''
while (( SECONDS < deadline )); do
  probe_exit="$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod d-invariant-probe -o jsonpath='{.status.containerStatuses[0].state.terminated.exitCode}')"
  [[ -n "$probe_exit" ]] && break
  sleep 3
done
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" logs pod/d-invariant-probe || { echo 'probe logs unavailable' >&2; exit 1; }
[[ "$probe_exit" == 0 ]] || { printf 'D image probe failed: exit=%s\n' "${probe_exit:-not-terminated}" >&2; exit 1; }
probe_image_id="$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod d-invariant-probe -o jsonpath='{.status.containerStatuses[0].imageID}')"
[[ -n "$probe_image_id" ]] || { echo 'probe runtime image identity missing' >&2; exit 1; }
printf 'PASS d-database-invariants image=%s runtime_image_id=%s catalog=%s source=synthetic-isolated-mysql\n' "$D_INVARIANT_IMAGE" "$probe_image_id" "$EXPECTED_CATALOG_HASH"
