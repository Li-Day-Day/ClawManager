#!/usr/bin/env bash
set -euo pipefail

CONTEXT="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
NAMESPACE="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
IMAGE="${SECRET_BROKER_IMAGE:-}"
APP_SERVICE_ACCOUNT="clawmanager-app"
BROKER_SERVICE_ACCOUNT="clawmanager-secret-broker"
BROKER_ROLE="clawmanager-zhanghui08-secret-broker"
BROKER_BINDING="clawmanager-zhanghui08-secret-broker"
ALLOWLIST_VERSION="staging-2026-09-21"
ALLOWLIST_SHA256="57f8cc8e82e2f0a3d2ac893d792b49f1a4449e29100cfe25f16e6060d5a9428e"
TARGET_CLUSTER_ADMIN_BINDING="clawmanager-zhanghui08-app-cluster-admin"
PROTECTED_CLUSTER_ADMIN_BINDING="clawmanager-app-cluster-admin"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
TEST_ID="$(date -u +%s)"
TEST_NAMESPACE="${NAMESPACE}-user-${TEST_ID}"
LEGACY_TEST_NAMESPACE="${NAMESPACE%-system}-user-${TEST_ID}"
TEST_SECRET="clawreef-${TEST_ID}-broker-smoke-openclaw-bootstrap"
TEST_TEAM_SECRET="clawreef-team-${TEST_ID}-bus"
AUTHORIZED_POD="secret-broker-authorized-${TEST_ID}"
DENIED_POD="secret-broker-denied-${TEST_ID}"
DENIED_SERVICE_ACCOUNT="secret-broker-denied-${TEST_ID}"
TEST_NAMESPACE_UID=""

die() {
  echo "FAIL: $*" >&2
  exit 1
}

binding_tuple() {
  kubectl --context="$CONTEXT" get clusterrolebinding "$1" \
    -o jsonpath='{.roleRef.kind}{"|"}{.roleRef.name}{"|"}{range .subjects[*]}{.kind}{"|"}{.name}{"|"}{.namespace}{"\n"}{end}'
}

dump_broker_rollout_diagnostics() {
  echo "DIAGNOSTIC[broker-rollout]: deployment" >&2
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-secret-broker \
    -o custom-columns='NAME:.metadata.name,DESIRED:.spec.replicas,UPDATED:.status.updatedReplicas,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image' >&2 || true
  echo "DIAGNOSTIC[broker-rollout]: pods" >&2
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get pods -l app=clawmanager-secret-broker \
    -o custom-columns='POD:.metadata.name,PHASE:.status.phase,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,WAITING_REASON:.status.containerStatuses[0].state.waiting.reason,TERMINATED_REASON:.status.containerStatuses[0].state.terminated.reason,IMAGE_ID:.status.containerStatuses[0].imageID,NODE:.spec.nodeName' >&2 || true
  while IFS= read -r pod; do
    [[ -n "$pod" ]] || continue
    echo "DIAGNOSTIC[broker-rollout]: describe ${pod}" >&2
    kubectl --context="$CONTEXT" --namespace="$NAMESPACE" describe "$pod" >&2 || true
    echo "DIAGNOSTIC[broker-rollout]: logs ${pod}" >&2
    kubectl --context="$CONTEXT" --namespace="$NAMESPACE" logs "$pod" --container=secret-broker --tail=200 >&2 || true
    echo "DIAGNOSTIC[broker-rollout]: previous logs ${pod}" >&2
    kubectl --context="$CONTEXT" --namespace="$NAMESPACE" logs "$pod" --container=secret-broker --previous --tail=200 >&2 || true
  done < <(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get pods \
    -l app=clawmanager-secret-broker -o name 2>/dev/null || true)
  echo "DIAGNOSTIC[broker-rollout]: recent namespace events" >&2
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get events --sort-by=.lastTimestamp 2>&1 | tail -n 40 >&2 || true
}

cleanup() {
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" delete pod \
    "$AUTHORIZED_POD" "$DENIED_POD" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" delete serviceaccount \
    "$DENIED_SERVICE_ACCOUNT" --ignore-not-found >/dev/null 2>&1 || true
  if [[ -n "$TEST_NAMESPACE_UID" ]]; then
    current_uid="$(kubectl --context="$CONTEXT" get namespace "$TEST_NAMESPACE" \
      -o jsonpath='{.metadata.uid}' 2>/dev/null || true)"
    if [[ "$current_uid" == "$TEST_NAMESPACE_UID" ]]; then
      kubectl --context="$CONTEXT" delete namespace "$TEST_NAMESPACE" --wait=true >/dev/null 2>&1 || true
    fi
  fi
}
trap cleanup EXIT

[[ "$NAMESPACE" == *-system ]] || die "SOURCE_NAMESPACE must end in -system"
PREFIX="${NAMESPACE%-system}"
[[ -n "$IMAGE" ]] || die "SECRET_BROKER_IMAGE is required"
[[ "$IMAGE" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]] || \
  die "SECRET_BROKER_IMAGE must be an immutable image@sha256 digest"
[[ "$(kubectl --context="$CONTEXT" config current-context)" == "$CONTEXT" ]] || die "context mismatch"
kubectl --context="$CONTEXT" get namespace "$NAMESPACE" >/dev/null
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get serviceaccount "$APP_SERVICE_ACCOUNT" >/dev/null
[[ "$(binding_tuple "$TARGET_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|${NAMESPACE}" ]] || \
  die "target cluster-admin binding tuple changed"
[[ "$(binding_tuple "$PROTECTED_CLUSTER_ADMIN_BINDING")" == "ClusterRole|cluster-admin|ServiceAccount|${APP_SERVICE_ACCOUNT}|clawmanager-system" ]] || \
  die "protected cluster-admin binding tuple changed"

migration_complete="$(kubectl --context="$CONTEXT" --namespace="$NAMESPACE" get deployment clawmanager-app \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}{.value}{end}')"
[[ "$migration_complete" != "true" ]] || die "refusing staging: app broker migration is already enabled"

kubectl --context="$CONTEXT" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${BROKER_SERVICE_ACCOUNT}
  namespace: ${NAMESPACE}
automountServiceAccountToken: true
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ${BROKER_ROLE}
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list", "create", "update", "delete"]
  - apiGroups: ["authentication.k8s.io"]
    resources: ["tokenreviews"]
    verbs: ["create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${BROKER_BINDING}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ${BROKER_ROLE}
subjects:
  - kind: ServiceAccount
    name: ${BROKER_SERVICE_ACCOUNT}
    namespace: ${NAMESPACE}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clawmanager-secret-broker
  namespace: ${NAMESPACE}
  annotations:
    clawmanager.io/secret-broker-read-allowlist-version: ${ALLOWLIST_VERSION}
    clawmanager.io/secret-broker-read-allowlist-sha256: ${ALLOWLIST_SHA256}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: clawmanager-secret-broker
  template:
    metadata:
      labels:
        app: clawmanager-secret-broker
    spec:
      serviceAccountName: ${BROKER_SERVICE_ACCOUNT}
      enableServiceLinks: false
      securityContext:
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: secret-broker
          image: ${IMAGE}
          imagePullPolicy: IfNotPresent
          command: ["/usr/local/bin/clawreef-secret-broker"]
          env:
            # Pin the numeric listen port explicitly. Without this override,
            # Kubernetes' legacy Service env injection uses the same variable
            # name with a tcp:// value for Service/clawmanager-secret-broker.
            - name: CLAWMANAGER_SECRET_BROKER_PORT
              value: "9444"
            - name: K8S_NAMESPACE
              value: ${PREFIX}
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: CLAWMANAGER_SECRET_BROKER_APP_SERVICE_ACCOUNT
              value: ${APP_SERVICE_ACCOUNT}
            - name: CLAWMANAGER_SECRET_BROKER_AUDIENCE
              value: clawmanager-secret-broker
            - name: CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS
              value: "true"
            - name: CLAWMANAGER_SECRET_BROKER_READ_ALLOWLIST
              value: ""
          ports:
            - name: http
              containerPort: 9444
          readinessProbe:
            httpGet:
              path: /readyz
              port: http
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 10
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
            limits:
              cpu: 500m
              memory: 128Mi
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 65532
---
apiVersion: v1
kind: Service
metadata:
  name: clawmanager-secret-broker
  namespace: ${NAMESPACE}
spec:
  selector:
    app: clawmanager-secret-broker
  ports:
    - name: http
      port: 9444
      targetPort: http
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: clawmanager-secret-broker-ingress
  namespace: ${NAMESPACE}
spec:
  podSelector:
    matchLabels:
      app: clawmanager-secret-broker
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: clawmanager-app
      ports:
        - protocol: TCP
          port: 9444
EOF

if ! kubectl --context="$CONTEXT" --namespace="$NAMESPACE" rollout status \
  deployment/clawmanager-secret-broker --timeout=180s; then
  dump_broker_rollout_diagnostics
  die "Secret broker rollout did not become available; app migration and cluster-admin bindings were left unchanged"
fi

BROKER_AS="system:serviceaccount:${NAMESPACE}:${BROKER_SERVICE_ACCOUNT}"
for verb in get list create update delete; do
  kubectl --context="$CONTEXT" auth can-i --quiet --as="$BROKER_AS" --namespace="$NAMESPACE" "$verb" secrets || \
    die "broker must be allowed: $verb secrets"
done
for verb in watch patch; do
  if kubectl --context="$CONTEXT" auth can-i --quiet --as="$BROKER_AS" --namespace="$NAMESPACE" "$verb" secrets; then
    die "broker unexpectedly allowed: $verb secrets"
  fi
done
kubectl --context="$CONTEXT" auth can-i --quiet --as="$BROKER_AS" create tokenreviews.authentication.k8s.io || \
  die "broker cannot create TokenReviews"

kubectl --context="$CONTEXT" create namespace "$TEST_NAMESPACE" >/dev/null
TEST_NAMESPACE_UID="$(kubectl --context="$CONTEXT" get namespace "$TEST_NAMESPACE" -o jsonpath='{.metadata.uid}')"
kubectl --context="$CONTEXT" --namespace="$NAMESPACE" create serviceaccount "$DENIED_SERVICE_ACCOUNT" >/dev/null
kubectl --context="$CONTEXT" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: ${AUTHORIZED_POD}
  namespace: ${NAMESPACE}
  labels:
    app: clawmanager-app
spec:
  serviceAccountName: ${APP_SERVICE_ACCOUNT}
  automountServiceAccountToken: false
  restartPolicy: Never
  containers:
    - name: client
      image: ${IMAGE}
      command: ["/bin/sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: broker-token
          mountPath: /var/run/secrets/clawmanager-secret-broker
          readOnly: true
  volumes:
    - name: broker-token
      projected:
        sources:
          - serviceAccountToken:
              audience: clawmanager-secret-broker
              expirationSeconds: 600
              path: token
---
apiVersion: v1
kind: Pod
metadata:
  name: ${DENIED_POD}
  namespace: ${NAMESPACE}
  labels:
    app: clawmanager-app
spec:
  serviceAccountName: ${DENIED_SERVICE_ACCOUNT}
  automountServiceAccountToken: false
  restartPolicy: Never
  containers:
    - name: client
      image: ${IMAGE}
      command: ["/bin/sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: broker-token
          mountPath: /var/run/secrets/clawmanager-secret-broker
          readOnly: true
  volumes:
    - name: broker-token
      projected:
        sources:
          - serviceAccountToken:
              audience: clawmanager-secret-broker
              expirationSeconds: 600
              path: token
EOF

kubectl --context="$CONTEXT" --namespace="$NAMESPACE" wait --for=condition=Ready \
  "pod/$AUTHORIZED_POD" "pod/$DENIED_POD" --timeout=180s

BROKER_URL="http://clawmanager-secret-broker.${NAMESPACE}.svc.cluster.local:9444"
post_from_pod() {
  local pod="$1" path="$2" body="$3"
  kubectl --context="$CONTEXT" --namespace="$NAMESPACE" exec "$pod" -- /bin/sh -ceu '
    token="$(cat /var/run/secrets/clawmanager-secret-broker/token)"
    wget -qO- --header="Authorization: Bearer ${token}" --header="Content-Type: application/json" \
      --post-data="$1" "$2$3"
  ' -- "$body" "$BROKER_URL" "$path"
}

upsert_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_SECRET}\",\"type\":\"Opaque\",\"data\":{\"smoke\":\"c21va2U=\"},\"labels\":{\"managed-by\":\"clawreef\",\"instance-id\":\"${TEST_ID}\"}}"
post_from_pod "$AUTHORIZED_POD" /v1/secrets/upsert "$upsert_body" >/dev/null
value_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_SECRET}\",\"key\":\"smoke\"}"
value_response="$(post_from_pod "$AUTHORIZED_POD" /v1/secrets/get-value "$value_body")"
[[ "$value_response" == *'"value":"c21va2U="'* ]] || die "broker get-value response mismatch"

team_upsert_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_TEAM_SECRET}\",\"type\":\"Opaque\",\"data\":{\"CLAWMANAGER_TEAM_TOKEN\":\"dGVhbS10b2tlbg==\",\"CLAWMANAGER_TEAM_REDIS_URL\":\"cmVkaXM6Ly9yZWRpczo2Mzc5LzA=\"},\"labels\":{\"managed-by\":\"clawreef\",\"team-id\":\"${TEST_ID}\"}}"
post_from_pod "$AUTHORIZED_POD" /v1/secrets/upsert "$team_upsert_body" >/dev/null
team_value_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_TEAM_SECRET}\",\"key\":\"CLAWMANAGER_TEAM_TOKEN\"}"
team_value_response="$(post_from_pod "$AUTHORIZED_POD" /v1/secrets/get-value "$team_value_body")"
[[ "$team_value_response" == *'"value":"dGVhbS10b2tlbg=="'* ]] || die "broker Team get-value response mismatch"
legacy_team_upsert_body="{\"namespace\":\"${LEGACY_TEST_NAMESPACE}\",\"name\":\"${TEST_TEAM_SECRET}\",\"type\":\"Opaque\",\"data\":{\"CLAWMANAGER_TEAM_TOKEN\":\"dGVhbS10b2tlbg==\"},\"labels\":{\"managed-by\":\"clawreef\",\"team-id\":\"${TEST_ID}\"}}"
if post_from_pod "$AUTHORIZED_POD" /v1/secrets/upsert "$legacy_team_upsert_body" >/dev/null 2>&1; then
  die "broker allowed the obsolete base-prefix tenant namespace"
fi

if post_from_pod "$AUTHORIZED_POD" /v1/secrets/get-value \
  "{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"unregistered\",\"key\":\"smoke\"}" >/dev/null 2>&1; then
  die "broker allowed an unregistered Secret name"
fi
if post_from_pod "$DENIED_POD" /v1/secrets/get-value "$value_body" >/dev/null 2>&1; then
  die "broker allowed a different ServiceAccount"
fi

delete_body="{\"namespace\":\"${TEST_NAMESPACE}\",\"labels\":{\"managed-by\":\"clawreef\",\"instance-id\":\"${TEST_ID}\"}}"
post_from_pod "$AUTHORIZED_POD" /v1/secrets/delete-by-labels "$delete_body" >/dev/null
post_from_pod "$AUTHORIZED_POD" /v1/secrets/delete \
  "{\"namespace\":\"${TEST_NAMESPACE}\",\"name\":\"${TEST_TEAM_SECRET}\"}" >/dev/null
if kubectl --context="$CONTEXT" --namespace="$TEST_NAMESPACE" get secret "$TEST_SECRET" >/dev/null 2>&1; then
  die "broker cleanup did not delete the functional-test Secret"
fi
if kubectl --context="$CONTEXT" --namespace="$TEST_NAMESPACE" get secret "$TEST_TEAM_SECRET" >/dev/null 2>&1; then
  die "broker cleanup did not delete the Team functional-test Secret"
fi

echo "PASS[broker-stage]: image=$IMAGE"
echo "PASS[broker-stage]: app_identity=system:serviceaccount:${NAMESPACE}:${APP_SERVICE_ACCOUNT}"
echo "PASS[broker-stage]: denied_identity=system:serviceaccount:${NAMESPACE}:${DENIED_SERVICE_ACCOUNT}"
echo "PASS[broker-stage]: read_allowlist_version=$ALLOWLIST_VERSION"
echo "PASS[broker-stage]: read_allowlist_sha256=$ALLOWLIST_SHA256"
echo "PASS[broker-stage]: instance and Team Secret upsert/get-value/delete, filtered cleanup and policy denials"
echo "STAGED: app migration remains disabled; cluster-admin bindings were not deleted"

cleanup
trap - EXIT
echo "CLEANED[broker-stage]: temporary pods, denied ServiceAccount and namespace run_id=$RUN_ID"
