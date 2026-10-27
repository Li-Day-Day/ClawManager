import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const appManifests = [
  'deployments/k8s/cluster/clawmanager.yaml',
  'deployments/k3s/cluster/clawmanager.yaml',
  'deployments/k8s/single-node/clawmanager.yaml',
  'deployments/k3s/single-node/clawmanager.yaml',
  'deployments/k8s/sites/nine-node-production/20-clawmanager-production.yaml',
];

const requiredRuntimeResources = [
  'leases',
  'deployments',
  'pods',
  'pods/exec',
  'services',
  'endpoints',
  'configmaps',
  'persistentvolumeclaims',
  'persistentvolumes',
  'namespaces',
  'nodes',
  'networkpolicies',
  'storageclasses',
];

const expectedRuntimeRules = [
  '["coordination.k8s.io"]|["leases"]|["get", "create", "update"]',
  '["apps"]|["deployments"]|["get", "list", "create", "update", "patch", "delete"]',
  '[""]|["pods"]|["get", "list", "create", "delete"]',
  '[""]|["pods/exec"]|["create"]',
  '[""]|["services"]|["get", "list", "create", "update", "delete"]',
  '[""]|["endpoints"]|["get"]',
  '[""]|["configmaps"]|["get", "list", "create", "update", "delete"]',
  '[""]|["persistentvolumeclaims"]|["get", "list", "create", "update", "delete"]',
  '[""]|["persistentvolumes"]|["get", "list", "create", "delete"]',
  '[""]|["namespaces"]|["get", "list", "create", "delete"]',
  '[""]|["nodes"]|["list"]',
  '["networking.k8s.io"]|["networkpolicies"]|["get", "list", "create", "update", "delete"]',
  '["storage.k8s.io"]|["storageclasses"]|["get"]',
];

function namedDocument(source, kind, name) {
  const documents = source.split(/^---\s*$/m);
  const document = documents.find((candidate) =>
    new RegExp(`^kind: ${kind}$`, 'm').test(candidate) &&
    new RegExp(`^  name: ${name}$`, 'm').test(candidate));
  assert.ok(document, `missing ${kind}/${name}`);
  return document;
}

test('official app manifests are idempotent post-cutover and never restore cluster-admin', () => {
  for (const path of appManifests) {
    const source = readFileSync(path, 'utf8');
    for (const document of source.split(/^---\s*$/m)) {
      assert.ok((document.match(/^apiVersion:/gm) ?? []).length <= 1, `${path} has a missing document separator`);
      assert.ok((document.match(/^kind:/gm) ?? []).length <= 1, `${path} has a missing document separator`);
    }

    const role = namedDocument(source, 'ClusterRole', 'clawmanager-runtime-manager');
    assert.doesNotMatch(role, /\bsecrets\b/, `${path} must not grant Secret access`);
    assert.doesNotMatch(role, /["']\*["']|^- \*$/m, `${path} must not grant wildcard access`);
    for (const resource of requiredRuntimeResources) {
      assert.ok(role.includes(resource), `${path} is missing ${resource}`);
    }
    for (const verb of ['get', 'list', 'create', 'update', 'patch', 'delete']) {
      assert.ok(role.includes(verb), `${path} is missing audited verb ${verb}`);
    }
    const actualRules = [...role.matchAll(/  - apiGroups: (\[[^\n]+\])\n    resources: (\[[^\n]+\])\n    verbs: (\[[^\n]+\])/g)]
      .map((match) => `${match[1]}|${match[2]}|${match[3]}`);
    assert.deepEqual(actualRules, expectedRuntimeRules, `${path} runtime role drifted from the audited matrix`);

    assert.doesNotMatch(source, /^kind: ClusterRoleBinding\s*$[\s\S]*?^  name: clawmanager-app-cluster-admin\s*$/m,
      `${path} must not recreate the removed compatibility binding`);

    const appDeployment = namedDocument(source, 'Deployment', 'clawmanager-app');
    const brokerAccount = namedDocument(source, 'ServiceAccount', 'clawmanager-secret-broker');
    const brokerRole = namedDocument(source, 'ClusterRole', 'clawmanager-secret-broker');
    const brokerDeployment = namedDocument(source, 'Deployment', 'clawmanager-secret-broker');
    const brokerService = namedDocument(source, 'Service', 'clawmanager-secret-broker');
    const brokerPolicy = namedDocument(source, 'NetworkPolicy', 'clawmanager-secret-broker-ingress');
    const waitBroker = appDeployment.match(/- name: wait-secret-broker[\s\S]*?\n\s*volumeMounts:/)?.[0];
    assert.ok(waitBroker, `${path} is missing the broker readiness init container`);
    assert.doesNotMatch(waitBroker, /(?:^|\s)\+(?=\s|$)/m,
      `${path} broker readiness command contains a standalone + argument`);
    assert.match(waitBroker, /openssl s_client \\\n\s+-connect /,
      `${path} broker readiness command must use shell continuations before OpenSSL arguments`);
    assert.match(appDeployment, /name: CLAWMANAGER_SECRET_BROKER_URL\s*\n\s*value: "https:\/\/clawmanager-secret-broker\.clawmanager-system\.svc\.cluster\.local:9444"/);
    assert.match(appDeployment, /name: CLAWMANAGER_SECRET_BROKER_CA_FILE\s*\n\s*value: "\/var\/run\/secrets\/clawmanager-secret-broker-ca\/ca\.crt"/);
    assert.match(appDeployment, /name: CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE\s*\n\s*value: "true"/);
    assert.match(appDeployment, /name: wait-secret-broker[\s\S]*?openssl s_client[\s\S]*?-verify_hostname clawmanager-secret-broker\.clawmanager-system\.svc\.cluster\.local/);
    assert.match(appDeployment, /name: wait-secret-broker[\s\S]*?-CAfile \/var\/run\/secrets\/clawmanager-secret-broker-ca\/ca\.crt/);
    assert.match(appDeployment, /audience: clawmanager-secret-broker\s*\n\s*expirationSeconds: 600\s*\n\s*path: token/);
    assert.match(appDeployment, /name: secret-broker-ca\s*\n\s*configMap:\s*\n\s*name: clawmanager-secret-broker-ca\s*\n\s*optional: false/);
    assert.match(brokerAccount, /automountServiceAccountToken: true/);
    assert.match(brokerRole, /resources: \["secrets"\]\s*\n    verbs: \["get", "list", "create", "update", "delete"\]/);
    assert.doesNotMatch(brokerRole, /"watch"|"patch"|["']\*["']/);
    assert.match(brokerDeployment, /name: CLAWMANAGER_SECRET_BROKER_TLS_CERT_FILE/);
    assert.match(brokerDeployment, /name: https\s*\n\s*containerPort: 9444/);
    assert.match(brokerDeployment, /secretName: clawmanager-secret-broker-tls/);
    assert.doesNotMatch(brokerDeployment, /CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS/);
    assert.match(brokerService, /name: https\s*\n\s*port: 9444\s*\n\s*targetPort: https/);
    assert.match(brokerPolicy, /app: clawmanager-app/);
    const appImage = appDeployment.match(/- name: clawmanager-app[\s\S]*?\n\s*image: ([^\s]+)/)?.[1];
    const brokerImage = brokerDeployment.match(/- name: secret-broker[\s\S]*?\n\s*image: ([^\s]+)/)?.[1];
    const waitImage = appDeployment.match(/- name: wait-secret-broker[\s\S]*?\n\s*image: ([^\s]+)/)?.[1];
    assert.equal(brokerImage, appImage, `${path} must run app and broker from the same reviewed image`);
    assert.equal(waitImage, appImage, `${path} broker readiness gate must use the reviewed app image`);
  }
});

test('Secret broker has a separate identity, closed RBAC verbs and ingress', () => {
  const source = readFileSync('deployments/k8s/secret-broker.yaml', 'utf8');
  const account = namedDocument(source, 'ServiceAccount', 'clawmanager-secret-broker');
  const role = namedDocument(source, 'ClusterRole', 'clawmanager-secret-broker');
  const deployment = namedDocument(source, 'Deployment', 'clawmanager-secret-broker');
  const policy = namedDocument(source, 'NetworkPolicy', 'clawmanager-secret-broker-ingress');
  assert.match(account, /namespace: clawmanager-system/);
  assert.match(role, /resources: \["secrets"\]\s*\n    verbs: \["get", "list", "create", "update", "delete"\]/);
  assert.match(role, /resources: \["tokenreviews"\]\s*\n    verbs: \["create"\]/);
  assert.doesNotMatch(role, /["']\*["']/);
  assert.match(deployment, /serviceAccountName: clawmanager-secret-broker/);
  assert.match(deployment, /enableServiceLinks: false/);
  assert.match(deployment, /command: \["\/usr\/local\/bin\/clawreef-secret-broker"\]/);
  assert.match(deployment, /name: CLAWMANAGER_SECRET_BROKER_PORT\s*\n\s*value: "9444"/);
  assert.match(deployment, /name: CLAWMANAGER_SECRET_BROKER_TLS_CERT_FILE\s*\n\s*value: "\/var\/run\/secrets\/clawmanager-secret-broker-tls\/tls\.crt"/);
  assert.match(deployment, /name: CLAWMANAGER_SECRET_BROKER_TLS_KEY_FILE\s*\n\s*value: "\/var\/run\/secrets\/clawmanager-secret-broker-tls\/tls\.key"/);
  assert.match(deployment, /name: https\s*\n\s*containerPort: 9444/);
  assert.match(deployment, /path: \/readyz\s*\n\s*port: https\s*\n\s*scheme: HTTPS/);
  assert.match(deployment, /secretName: clawmanager-secret-broker-tls/);
  assert.doesNotMatch(deployment, /CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS/);
  assert.match(policy, /app: clawmanager-app/);
  assert.match(policy, /port: 9444/);

  const registry = JSON.parse(readFileSync('contracts/system-backup/v12/secret-broker-read-allowlist.json', 'utf8'));
  const canonical = JSON.stringify({
    schema_version: registry.schema_version,
    registry_version: registry.registry_version,
    entries: registry.entries,
  });
  const hash = createHash('sha256').update(canonical).digest('hex');
  assert.equal(hash, registry.registry_sha256);
  assert.match(deployment, new RegExp(`clawmanager.io/secret-broker-read-allowlist-sha256: ${hash}`));

  const brokerStore = readFileSync('backend/internal/services/k8s/secret_store.go', 'utf8');
  const brokerMain = readFileSync('backend/cmd/secret-broker/main.go', 'utf8');
  assert.match(brokerStore, /parsed\.Scheme == "http" && !SecretBrokerInsecureHTTPForTestsEnabled\(\)/);
  assert.match(brokerStore, /CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS/);
  assert.match(brokerMain, /certFile == "" && !k8s\.SecretBrokerInsecureHTTPForTestsEnabled\(\)/);
  assert.match(brokerMain, /Secret broker TLS certificate and key are required; insecure HTTP is test-only/);
});

test('application Secret API calls are centralized behind the SecretStore boundary', () => {
  function goFiles(root) {
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? goFiles(path) : entry.name.endsWith('.go') && !entry.name.endsWith('_test.go') ? [path] : [];
    });
  }
  const allowed = new Set([
    join('backend', 'internal', 'services', 'k8s', 'secret_store.go'),
    join('backend', 'internal', 'services', 'k8s', 'secret_broker_server.go'),
  ]);
  const violations = [];
  for (const path of goFiles(join('backend', 'internal'))) {
    if (!allowed.has(path) && /CoreV1\(\)\.Secrets|\.Secrets\(/.test(readFileSync(path, 'utf8'))) {
      violations.push(path);
    }
  }
  assert.deepEqual(violations, []);
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /clawreef-secret-broker \.\/cmd\/secret-broker/);
  assert.match(dockerfile, /COPY --from=backend-builder \/out\/clawreef-secret-broker \/usr\/local\/bin\/clawreef-secret-broker/);
});

test('live cutover is fail-closed until the Secret broker migration is reviewed', () => {
  const script = readFileSync('scripts/system-backup-rbac-cutover-zhanghui08.sh', 'utf8');
  const gate = script.indexOf('assert_secret_broker_cutover_ready');
  const gateCall = script.lastIndexOf('\nassert_secret_broker_cutover_ready\n');
  const deletion = script.indexOf('delete clusterrolebinding "$TARGET_CLUSTER_ADMIN_BINDING"');
  assert.ok(gate >= 0 && gateCall > gate, 'missing Secret broker cutover gate');
  assert.ok(deletion > gateCall, 'cluster-admin deletion must occur only after the broker gate');
  assert.match(script, /SECRET_BROKER_CUTOVER_APPROVED:-false/);
  assert.match(script, /\[\[ "\$SECRET_BROKER_EVIDENCE_SHA256" =~ \^\[0-9a-f\]\{64\}\$ \]\]/);
  assert.match(script, /BLOCKED: Secret broker cutover is not approved/);
  assert.doesNotMatch(script, /--resource-name/, 'older kubectl releases do not support --resource-name');
  assert.match(script, /"secrets\/\$REGISTERED_SECRET_NAME"/);
  assert.match(script, /authorization check failed instead of returning yes\/no/);
  assert.match(script, /SECRET_BROKER_ALLOWLIST_SHA256="57f8cc8e82e2f0a3d2ac893d792b49f1a4449e29100cfe25f16e6060d5a9428e"/);
  assert.match(script, /secret broker read allowlist hash mismatch/);
  assert.match(script, /secret broker unexpectedly allowed to create RoleBindings/);
  assert.match(script, /cutover requires an HTTPS CLAWMANAGER_SECRET_BROKER_URL/);

  const staging = readFileSync('scripts/secret-broker-stage-zhanghui08.sh', 'utf8');
  assert.match(staging, /SECRET_BROKER_IMAGE must be an immutable image@sha256 digest/);
  assert.match(staging, /refusing staging: app broker migration is already enabled/);
  assert.match(staging, /enableServiceLinks: false/);
  assert.match(staging, /name: CLAWMANAGER_SECRET_BROKER_PORT\s*\n\s*value: "9444"/);
  assert.match(staging, /name: CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS\s*\n\s*value: "true"/);
  assert.match(staging, /STAGED: app migration remains disabled; cluster-admin bindings were not deleted/);
  assert.doesNotMatch(staging, /delete clusterrolebinding/);
  assert.match(staging, /current_uid.*TEST_NAMESPACE_UID/);
  assert.match(staging, /TEST_NAMESPACE="\$\{NAMESPACE\}-user-\$\{TEST_ID\}"/);
  assert.match(staging, /TEST_TEAM_SECRET="clawreef-team-\$\{TEST_ID\}-bus"/);
  assert.match(staging, /broker allowed the obsolete base-prefix tenant namespace/);
  assert.match(staging, /broker cleanup did not delete the Team functional-test Secret/);

  const tlsStaging = readFileSync('scripts/secret-broker-tls-stage-zhanghui08.sh', 'utf8');
  assert.match(tlsStaging, /CLAWMANAGER_SECRET_BROKER_TLS_CERT_FILE/);
  assert.match(tlsStaging, /CLAWMANAGER_SECRET_BROKER_TLS_KEY_FILE/);
  assert.match(tlsStaging, /CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS","value":"false"/);
  assert.match(tlsStaging, /scheme\":\"HTTPS/);
  assert.match(tlsStaging, /CLAWMANAGER_SECRET_BROKER_CA_FILE/);
  assert.match(tlsStaging, /CN = \$\{service_name\}/);
  assert.doesNotMatch(tlsStaging, /CN = \$\{service_fqdn\}/);
  assert.match(tlsStaging, /DNS\.4 = \$\{service_fqdn\}/);
  assert.match(tlsStaging, /refusing TLS staging: app broker migration is already enabled/);
  assert.match(tlsStaging, /migration remains false; cluster-admin bindings were not deleted/);
  assert.match(tlsStaging, /plaintext HTTP unexpectedly reached the TLS broker/);
  assert.match(tlsStaging, /openssl s_client -quiet/);
  assert.match(tlsStaging, /-verify_hostname "\$host" -verify_return_error -CAfile "\$ca_file"/);
  assert.doesNotMatch(tlsStaging, /wget[^\n]*--ca-certificate/);
  assert.match(tlsStaging, /wget -qO- -T 5 "http:\/\/clawmanager-secret-broker/);
  assert.doesNotMatch(tlsStaging, /wget[^\n]*--timeout/);
  assert.doesNotMatch(tlsStaging, /delete clusterrolebinding/);
  assert.match(tlsStaging, /TEST_NAMESPACE="\$\{NAMESPACE\}-user-\$\{TEST_ID\}"/);
  assert.match(tlsStaging, /TEST_TEAM_SECRET="clawreef-team-\$\{TEST_ID\}-bus"/);
  assert.match(tlsStaging, /TLS broker allowed the obsolete base-prefix tenant namespace/);
  for (const variable of ['broker_patch', 'app_patch']) {
    const match = tlsStaging.match(new RegExp(`${variable}="\\$\\(cat <<EOF\\n([^\\n]+)\\nEOF`));
    assert.ok(match, `missing ${variable} JSON heredoc`);
    const candidate = match[1].replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g, 'test-value');
    assert.doesNotThrow(() => JSON.parse(candidate), `${variable} must be valid JSON`);
  }

  const pkiBootstrap = readFileSync('scripts/secret-broker-pki-bootstrap.sh', 'utf8');
  assert.match(pkiBootstrap, /KUBE_CONTEXT:\?KUBE_CONTEXT is required/);
  assert.match(pkiBootstrap, /TLS Secret and CA ConfigMap must either both exist or both be absent/);
  assert.match(pkiBootstrap, /openssl verify -CAfile/);
  assert.match(pkiBootstrap, /openssl x509 -checkhost/);
  assert.match(pkiBootstrap, /--dry-run=client -o yaml/);
  assert.doesNotMatch(pkiBootstrap, /kubectl[^\n]+delete/);

  const labelOwnershipSmoke = readFileSync('scripts/secret-broker-label-ownership-smoke-zhanghui08.sh', 'utf8');
  assert.match(labelOwnershipSmoke, /missing\|get\|\/v1\/secrets\/get/);
  assert.match(labelOwnershipSmoke, /missing\|get-value\|\/v1\/secrets\/get-value/);
  assert.match(labelOwnershipSmoke, /missing\|delete\|\/v1\/secrets\/delete/);
  assert.match(labelOwnershipSmoke, /wrong\|get\|\/v1\/secrets\/get/);
  assert.match(labelOwnershipSmoke, /wrong\|get-value\|\/v1\/secrets\/get-value/);
  assert.match(labelOwnershipSmoke, /wrong\|delete\|\/v1\/secrets\/delete/);
  assert.match(labelOwnershipSmoke, /expect_status 403/);
  assert.match(labelOwnershipSmoke, /rejected point delete removed an invalidly labelled Secret/);
  assert.match(labelOwnershipSmoke, /current_uid.*TEST_NAMESPACE_UID/);
  assert.doesNotMatch(labelOwnershipSmoke, /delete clusterrolebinding/);

  const migrationCanary = readFileSync('scripts/secret-broker-migration-canary-zhanghui08.sh', 'utf8');
  assert.match(migrationCanary, /CONFIRM_SECRET_BROKER_MIGRATION=true is required/);
  assert.match(migrationCanary, /restoring CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE=false/);
  assert.match(migrationCanary, /SECRET_BROKER_SYNC_WAIT_SECONDS:-120/);
  assert.match(migrationCanary, /\.status\.updatedReplicas/);
  assert.match(migrationCanary, /pod-template-hash=\$\{pod_template_hash\}/);
  assert.match(migrationCanary, /leader initial\/scheduled sync did not reach a healthy terminal point/);
  assert.doesNotMatch(migrationCanary, /sleep 12/);
  assert.match(migrationCanary, /migration=true; target cluster-admin remains for business smoke/);
  assert.doesNotMatch(migrationCanary, /delete clusterrolebinding/);

  const teamBusinessSmoke = readFileSync('scripts/secret-broker-team-business-smoke-zhanghui08.sh', 'utf8');
  assert.match(teamBusinessSmoke, /CONFIRM_SECRET_BROKER_TEAM_SMOKE=true is required/);
  assert.match(teamBusinessSmoke, /existing Team Secrets are baseline only and will not be touched/);
  assert.match(teamBusinessSmoke, /PASS\[team-business-smoke:create\]/);
  assert.match(teamBusinessSmoke, /PASS\[team-business-smoke:delete\]/);
  assert.match(teamBusinessSmoke, /bound PV remains after the \$\{WAIT_SECONDS\}s deletion convergence window/);
  assert.match(teamBusinessSmoke, /CLAIM_NAMESPACE:\.spec\.claimRef\.namespace/);
  assert.match(teamBusinessSmoke, /awk -v target_ns="\$TENANT_NAMESPACE"/);
  assert.doesNotMatch(teamBusinessSmoke, /awk -v namespace=/);
  assert.doesNotMatch(teamBusinessSmoke, /kubectl[^\n]+ delete /);
  assert.doesNotMatch(teamBusinessSmoke, /delete clusterrolebinding/);

  const instanceDeleteSmoke = readFileSync('scripts/secret-broker-instance-delete-smoke-zhanghui08.sh', 'utf8');
  assert.match(instanceDeleteSmoke, /CONFIRM_SECRET_BROKER_INSTANCE_DELETE_SMOKE=true is required/);
  assert.match(instanceDeleteSmoke, /SMOKE_INSTANCE_NAME must identify a disposable d-broker-smoke-/);
  assert.match(instanceDeleteSmoke, /instance-id=\$\{INSTANCE_ID\},managed-by=clawreef/);
  assert.match(instanceDeleteSmoke, /SELECT id,user_id,name,type,instance_mode,runtime_type,status,COALESCE\(workspace_path,''\)/);
  assert.match(instanceDeleteSmoke, /instance \$INSTANCE_ID is not a Lite gateway runtime/);
  assert.match(instanceDeleteSmoke, /workspace path does not match the exact expected Lite instance path/);
  assert.match(instanceDeleteSmoke, /Lite workspace is not visible from every app Pod before deletion/);
  assert.match(instanceDeleteSmoke, /Lite instance unexpectedly owns per-instance Kubernetes resources/);
  assert.match(instanceDeleteSmoke, /database instance row remains after the \$\{WAIT_SECONDS\}s convergence window/);
  assert.match(instanceDeleteSmoke, /runtime binding remains after the \$\{WAIT_SECONDS\}s convergence window/);
  assert.match(instanceDeleteSmoke, /Lite workspace remains after the \$\{WAIT_SECONDS\}s convergence window/);
  assert.match(instanceDeleteSmoke, /PASS\[instance-delete-smoke:isolation\]/);
  assert.match(instanceDeleteSmoke, /PASS\[instance-delete-smoke:delete\]/);
  assert.doesNotMatch(instanceDeleteSmoke, /kubectl[^\n]+ delete /);
  assert.doesNotMatch(instanceDeleteSmoke, /delete clusterrolebinding/);

  const northboundCertificateSmoke = readFileSync('scripts/secret-broker-northbound-certificate-smoke-zhanghui08.sh', 'utf8');
  assert.match(northboundCertificateSmoke, /CONFIRM_SECRET_BROKER_NORTHBOUND_CERTIFICATE_SMOKE=true is required/);
  assert.match(northboundCertificateSmoke, /NORTHBOUND_SMOKE_IMAGE_REF must be an immutable image@sha256 reference/);
  assert.match(northboundCertificateSmoke, /type: ClusterIP/);
  assert.doesNotMatch(northboundCertificateSmoke, /type: NodePort/);
  assert.match(northboundCertificateSmoke, /automountServiceAccountToken: false/);
  assert.match(northboundCertificateSmoke, /readOnlyRootFilesystem: true/);
  assert.match(northboundCertificateSmoke, /clawmanager\.io\/smoke-run-id/);
  assert.match(northboundCertificateSmoke, /refusing to delete unowned/);
  assert.match(northboundCertificateSmoke, /certificate\.prepare audit count did not increase by exactly one/);
  assert.match(northboundCertificateSmoke, /certificate\.activate audit count did not increase by exactly one/);
  assert.match(northboundCertificateSmoke, /Gateway Pod was not replaced by certificate activation/);
  assert.match(northboundCertificateSmoke, /active CA fingerprint did not change/);
  assert.match(northboundCertificateSmoke, /five run-owned Secrets removed/);
  assert.doesNotMatch(northboundCertificateSmoke, /delete clusterrolebinding/);
  assert.doesNotMatch(northboundCertificateSmoke, /\/healthz|\/debug\//);

  const finalEvidence = readFileSync('scripts/secret-broker-final-evidence-zhanghui08.sh', 'utf8');
  assert.match(finalEvidence, /schema=clawmanager\.secret-broker-cutover-evidence\/v3/);
  assert.match(finalEvidence, /assert_script_hash label_ownership /);
  assert.match(finalEvidence, /assert_script_hash app_init /);
  assert.match(finalEvidence, /assert_artifact_hash manifest\.k8s_cluster /);
  assert.match(finalEvidence, /assert_artifact_hash manifest\.nine_node_production /);
  assert.match(finalEvidence, /broker\.production_insecure_http_test_switch=disabled/);
  assert.match(finalEvidence, /broker\.probe_transport=https\|https/);
  assert.match(finalEvidence, /app\.wait_secret_broker_init=2\|completed\|exit0\|restarts0/);
  assert.match(finalEvidence, /init command contains a standalone \+ argument/);
  assert.match(finalEvidence, /smoke\.label_ownership=passed\|/);
  assert.match(finalEvidence, /smoke\.app_init=passed/);
  assert.match(finalEvidence, /review_state=pending_cross_owner_review/);
  assert.match(finalEvidence, /DONE\[final-evidence\]: read-only snapshot captured/);
  assert.match(finalEvidence, /northbound\.residual_certificate_secrets=0/);
  assert.match(finalEvidence, /smoke\.instance_6\.workspace_visible_app_pods=0/);
  assert.match(finalEvidence, /Team #4 lifecycle tombstone is not the expected deleted row/);
  assert.match(finalEvidence, /smoke\.team_4\.lifecycle_tombstone=/);
  assert.match(finalEvidence, /smoke\.team_4\.member_rows_deleted_detached=/);
  assert.doesNotMatch(finalEvidence, /deleted Team #4 database row returned/);
  assert.match(finalEvidence, /smoke\.chat_pro_222=/);
  assert.match(finalEvidence, /smoke\.chat_lite_111=/);
  assert.match(finalEvidence, /evidence_sha256=/);
  assert.doesNotMatch(finalEvidence, /kubectl[^\n]*\s(?:apply|create|delete|patch|replace|edit|scale|set)\s/);
  assert.doesNotMatch(finalEvidence, /delete clusterrolebinding/);
  assert.doesNotMatch(finalEvidence, /\/healthz|\/debug\//);
});

test('instance PV cleanup is scoped to the current installation ownership proof', () => {
  const cleanup = readFileSync('backend/internal/services/k8s/cleanup_service.go', 'utf8');
  assert.match(cleanup, /tenantUserIDFromNamespace/);
  assert.match(cleanup, /claimNamespace != expectedNamespace \|\| pv\.Labels\["user-id"\] != strconv\.Itoa\(userID\)/);
  assert.match(cleanup, /Skipping PV %s delete: %s/);
  assert.match(cleanup, /ownedPVCount/);
  assert.doesNotMatch(cleanup, /PersistentVolumes\(\)\.Delete\(ctx, pvName, metav1\.DeleteOptions\{\}\)/);

  const regression = readFileSync('backend/internal/services/k8s/cleanup_service_test.go', 'utf8');
  assert.match(regression, /TestDeleteAllPVsPreservesOtherInstallationsWithSameInstanceID/);
  assert.match(regression, /clawmanager-ltt-user-1/);
  assert.match(regression, /foreign/);
});

test('Lite gateway deletion erases only its validated workspace before removing the record', () => {
  const service = readFileSync('backend/internal/services/instance_service.go', 'utf8');
  const start = service.indexOf('func (s *instanceService) deleteV2Instance');
  const end = service.indexOf('func (s *instanceService) cleanupV2GatewayBinding', start);
  assert.ok(start >= 0 && end > start, 'deleteV2Instance body not found');
  const body = service.slice(start, end);
  const bindingCleanup = body.indexOf('s.cleanupV2GatewayBinding(ctx, instance)');
  const workspaceErase = body.indexOf('s.eraseV2Workspace(instance, runtimeType)');
  const recordDelete = body.indexOf('s.instanceRepo.Delete(instance.ID)');
  assert.ok(bindingCleanup >= 0 && workspaceErase > bindingCleanup && recordDelete > workspaceErase,
    'Lite deletion must clean the gateway, erase the workspace, then delete the database row');

  const regression = readFileSync('backend/internal/services/instance_service_v2_test.go', 'utf8');
  assert.match(regression, /TestInstanceServiceDeleteV2MissingBindingStillDeletesInstance/);
  assert.match(regression, /TestInstanceServiceDeleteV2RejectsUnexpectedWorkspaceBeforeDeletingRecord/);
  assert.match(regression, /TestInstanceServiceDeleteV2TreatsAlreadyAbsentExpectedWorkspaceAsIdempotent/);
  assert.match(regression, /Lite workspace still exists after deletion retry/);
});

test('functional-test collector is get-only for the registered Secret', () => {
  const path = 'deployments/k8s/system-backup-secret-capture-functional-test.yaml';
  const source = readFileSync(path, 'utf8');
  const role = namedDocument(source, 'Role', 'clawmanager-system-backup-secret-capture-functional-test');
  assert.match(role, /resources: \["secrets"\]/);
  assert.match(role, /resourceNames:\s*\n\s*- clawmanager-system-backup-functional-test-allowlisted/);
  assert.match(role, /verbs: \["get"\]/);
  assert.doesNotMatch(role, /verbs:.*\b(list|watch|create|update|patch|delete)\b/);
});

test('functional-test allowlist hash matches its ordered canonical projection', () => {
  const registryPath = 'contracts/system-backup/v12/secret-allowlist-functional-test.json';
  const manifestPath = 'deployments/k8s/system-backup-secret-capture-functional-test.yaml';
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const canonical = JSON.stringify({
    schema_version: registry.schema_version,
    registry_version: registry.registry_version,
    entries: registry.entries,
  });
  const actual = createHash('sha256').update(canonical).digest('hex');
  assert.equal(actual, registry.registry_sha256);
  assert.equal(registry.entries.length, 1);

  const manifest = readFileSync(manifestPath, 'utf8');
  assert.ok(manifest.includes(`clawmanager.io/secret-allowlist-version: ${registry.registry_version}`));
  assert.ok(manifest.includes(`clawmanager.io/secret-allowlist-sha256: ${actual}`));
  assert.ok(manifest.includes(`name: ${registry.entries[0].secret_name}`));
  assert.ok(manifest.includes(`namespace: ${registry.entries[0].namespace}`));
});
