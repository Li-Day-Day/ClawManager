#!/usr/bin/env bash
set -Eeuo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
IMAGE_REF="${SECRET_BROKER_IMAGE_REF:?SECRET_BROKER_IMAGE_REF is required}"
IMAGE_DIGEST="${SECRET_BROKER_IMAGE_DIGEST:?SECRET_BROKER_IMAGE_DIGEST is required}"
APP_SERVICE_ACCOUNT="clawmanager-app"
TARGET_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_BINDING="clawmanager-app-cluster-admin"
PATCH_DIR=""

die() {
  echo "FAIL[secret-broker-app-init]: $*" >&2
  exit 1
}

binding_tuple() {
  kubectl --context="$CONTEXT" get clusterrolebinding "$1" \
    -o jsonpath='{.roleRef.kind}{"|"}{.roleRef.name}{"|"}{.subjects[0].kind}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}'
}

deployment_state() {
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment "$1" \
    -o jsonpath='{.spec.replicas}{"|"}{.status.updatedReplicas}{"|"}{.status.readyReplicas}{"|"}{.status.availableReplicas}'
}

cleanup() {
  if [[ -n "$PATCH_DIR" && -d "$PATCH_DIR" && "$PATCH_DIR" == /tmp/clawmanager-app-init.* ]]; then
    rm -rf -- "$PATCH_DIR"
  fi
}
trap cleanup EXIT

[[ "$NAMESPACE" == *-system ]] || die "SOURCE_NAMESPACE must end in -system"
[[ "$IMAGE_REF" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]] || die "SECRET_BROKER_IMAGE_REF must be immutable"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "SECRET_BROKER_IMAGE_DIGEST is invalid"
[[ "$IMAGE_REF" == *"@${IMAGE_DIGEST}" ]] || die "image reference and digest differ"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"

for deployment in clawmanager-app clawmanager-secret-broker; do
  [[ "$(deployment_state "$deployment")" == '2|2|2|2' ]] || die "$deployment is not 2|2|2|2"
done

app_image="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].image}')"
broker_image="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].image}')"
[[ "$app_image" == "$IMAGE_REF" && "$broker_image" == "$IMAGE_REF" ]] || die "app/broker are not pinned to the reviewed image"

migration="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")].value}')"
broker_url="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_URL")].value}')"
ca_volume="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="secret-broker-ca")].configMap.name}')"
[[ "$migration" == true ]] || die "migration must remain true"
[[ "$broker_url" == "https://clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local:9444" ]] || die "app broker URL is not the reviewed HTTPS endpoint"
[[ "$ca_volume" == clawmanager-secret-broker-ca ]] || die "app CA volume is missing or changed"
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get secret clawmanager-secret-broker-tls >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get configmap clawmanager-secret-broker-ca >/dev/null
[[ "$(binding_tuple "$TARGET_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || die "target binding tuple changed"
[[ "$(binding_tuple "$PROTECTED_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || die "protected binding tuple changed"

echo "READY[secret-broker-app-init]: migration=true app_broker_digest=${IMAGE_DIGEST}"

PATCH_DIR="$(mktemp -d /tmp/clawmanager-app-init.XXXXXX)"
cat >"$PATCH_DIR/app-init-patch.yaml" <<EOF
spec:
  template:
    spec:
      initContainers:
        - name: wait-secret-broker
          image: ${IMAGE_REF}
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-ceu"]
          args:
            - |
              until openssl s_client \\
                -connect clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local:9444 \\
                -servername clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local \\
                -verify_hostname clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local \\
                -verify_return_error \\
                -CAfile /var/run/secrets/clawmanager-secret-broker-ca/ca.crt \\
                </dev/null >/dev/null 2>&1; do
                sleep 2
              done
          volumeMounts:
            - name: secret-broker-ca
              mountPath: /var/run/secrets/clawmanager-secret-broker-ca
              readOnly: true
EOF

kubectl --context="$CONTEXT" --namespace="$NAMESPACE" patch deployment clawmanager-app \
  --type=strategic --patch-file="$PATCH_DIR/app-init-patch.yaml" >/dev/null

if ! kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status deployment/clawmanager-app --timeout=600s; then
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
    -o custom-columns='NAME:.metadata.name,DESIRED:.spec.replicas,UPDATED:.status.updatedReplicas,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas'
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get pods -l app=clawmanager-app \
    -o custom-columns='NAME:.metadata.name,PHASE:.status.phase,INIT_REASON:.status.initContainerStatuses[0].state.waiting.reason,INIT_EXIT:.status.initContainerStatuses[0].state.terminated.exitCode,APP_READY:.status.containerStatuses[0].ready,APP_RESTARTS:.status.containerStatuses[0].restartCount'
  die "app rollout with wait-secret-broker did not converge"
fi

[[ "$(deployment_state clawmanager-app)" == '2|2|2|2' ]] || die "app is not 2|2|2|2 after init rollout"
[[ "$(deployment_state clawmanager-secret-broker)" == '2|2|2|2' ]] || die "broker changed during init rollout"

init_image="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="wait-secret-broker")].image}')"
init_command="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="wait-secret-broker")].args[0]}')"
[[ "$init_image" == "$IMAGE_REF" ]] || die "init container image is not the reviewed image"
[[ "$init_command" == *"openssl s_client"* ]] || die "init command is missing OpenSSL"
[[ "$init_command" == *"clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local:9444"* ]] || die "init command endpoint changed"
if printf '%s\n' "$init_command" | grep -Eq '(^|[[:space:]])\+([[:space:]]|$)'; then
  die "init command contains a standalone + argument"
fi

mapfile -t init_states < <(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get pods -l app=clawmanager-app \
  -o jsonpath='{range .items[*]}{range .status.initContainerStatuses[?(@.name=="wait-secret-broker")]}{.state.terminated.exitCode}{"|"}{.restartCount}{"\n"}{end}{end}')
[[ "${#init_states[@]}" -eq 2 ]] || die "expected two init container states"
for state in "${init_states[@]}"; do
  [[ "$state" == '0|0' ]] || die "init container did not complete cleanly: $state"
done

mapfile -t app_states < <(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get pods -l app=clawmanager-app \
  -o jsonpath='{range .items[*]}{range .status.containerStatuses[?(@.name=="clawmanager-app")]}{.ready}{"|"}{.restartCount}{"|"}{.imageID}{"\n"}{end}{end}')
[[ "${#app_states[@]}" -eq 2 ]] || die "expected two app container states"
for state in "${app_states[@]}"; do
  IFS='|' read -r ready restarts image_id <<<"$state"
  [[ "$ready" == true && "$restarts" == 0 && "$image_id" == *"${IMAGE_DIGEST}"* ]] || die "app Pod is not ready/zero-restart/reviewed-image"
done

final_migration="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")].value}')"
[[ "$final_migration" == true ]] || die "migration changed during init rollout"
[[ "$(binding_tuple "$TARGET_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || die "target binding changed during init rollout"
[[ "$(binding_tuple "$PROTECTED_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || die "protected binding changed during init rollout"

echo 'PASS[secret-broker-app-init]: two init containers completed exit=0 restart=0; app Deployment is 2/2 Ready'
echo 'DONE[secret-broker-app-init]: migration=true; broker healthy; target and protected bindings unchanged'
