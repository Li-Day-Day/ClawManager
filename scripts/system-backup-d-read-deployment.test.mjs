import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cursorMount, readDeploymentTemplate, readMount, renderReadDeployment } from './system-backup-d-read-deployment.mjs';

function fixture() {
  const raw = Buffer.from(JSON.stringify({ schema_version: 'system-backup-registration-rbac.draft.v1', version: 'rbac-v1',
    installation_id: 'installation_synthetic', bindings: [{ actor_id: '42', subject: 'user:42', role: 'viewer' }] }) + '\n');
  const input = { ...readDeploymentTemplate(), installation_id: 'installation_synthetic', config_version: 1,
    rbac_registry_version: 'rbac-v1', rbac_registry_sha256: createHash('sha256').update(raw).digest('hex') };
  return { input, raw };
}
test('template cannot become runnable without real authority pins', () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../deployments/k8s/system-backup-read-k8s.template.json', import.meta.url))), readDeploymentTemplate());
  assert.throws(() => renderReadDeployment(readDeploymentTemplate(), new Uint8Array()));
});
test('pins, original registry bytes, mounts and independent cursor Secret compose consistently', () => {
  const { input, raw } = fixture(), result = renderReadDeployment(input, raw);
  const cm = result.publicResources.items[0], pins = JSON.parse(cm.data['pins.json']);
  assert.equal(cm.immutable, true);
  assert.equal(cm.data['rbac.json'], raw.toString());
  assert.equal(createHash('sha256').update(cm.data['pins.json']).digest('hex'), result.report.pins_sha256);
  assert.equal(pins.registry_directory, readMount + '/registries');
  assert.equal(pins.installation_id, input.installation_id);
  const pod = result.deploymentPatch.spec.template.spec, container = pod.containers[0];
  const env = Object.fromEntries(container.env.map(x => [x.name, x.value]));
  assert.equal(env.SYSTEM_BACKUP_READ_SESSIONS_ENABLED, 'true');
  assert.equal(env.SYSTEM_BACKUP_READ_SESSIONS_SERVER_UUID, input.server_uuid);
  assert.equal(env.SYSTEM_BACKUP_REGISTRATION_INSTALLATION_ID, pins.installation_id);
  assert.equal(env.SYSTEM_BACKUP_READ_PINS_SHA256, result.report.pins_sha256);
  assert.equal(env.SYSTEM_BACKUP_READ_PINS_PATH, readMount + '/pins.json');
  assert.equal(env.SYSTEM_BACKUP_READ_CURSOR_KEY_FILE, cursorMount + '/key');
  assert.equal(env.SYSTEM_BACKUP_READ_CURSOR_KEY_HEX, '');
  assert.ok(container.env.every(x => x.valueFrom === null), 'remove old direct valueFrom bindings on a strategic merge');
  assert.ok(container.volumeMounts.every(x => x.readOnly && !x.subPath));
  const publicVolume = pod.volumes.find(x => x.configMap);
  assert.equal(publicVolume.configMap.name, cm.metadata.name);
  assert.equal(publicVolume.configMap.items[1].path, `registries/rbac_bindings/rbac-v1/${input.rbac_registry_sha256}.json`);
  assert.equal(pod.volumes.find(x => x.secret).secret.secretName, input.cursor_secret);
  assert.equal(pod.volumes.find(x => x.secret).secret.defaultMode, 256);
  assert.equal(result.publicResources.items.some(x => x.kind === 'Secret'), false);
  assert.equal('image' in container, false);
  for (const key of ['image_changed', 'configuration_activated', 'read_authority_granted', 'cursor_secret_created', 'schema_migrated']) assert.equal(result.report[key], false);
});
test('rotation changes content-addressed pins and cannot mutate old public resources', () => {
  const { input, raw } = fixture(), first = renderReadDeployment(input, raw);
  const next = renderReadDeployment({ ...input, config_version: 2 }, raw);
  assert.notEqual(first.publicResources.items[0].metadata.name, next.publicResources.items[0].metadata.name);
  next.deploymentPatch.spec.template.spec.containers[0].env[0].value = 'false';
  assert.equal(first.deploymentPatch.spec.template.spec.containers[0].env[0].value, 'true');
});
for (const [label, changes] of [
  ['unknown field', { password: 'PRIVATE' }], ['wrong schema', { schema_version: 'unknown' }],
  ['namespace injection', { namespace: 'bad; command' }], ['missing namespace UID', { namespace_uid: '' }],
  ['missing server UUID', { server_uuid: '' }], ['database injection', { database: 'other;DROP' }],
  ['missing installation', { installation_id: '' }], ['missing config', { config_version: 0 }],
  ['unsafe config version', { config_version: Number.MAX_SAFE_INTEGER + 1 }],
  ['version path traversal', { rbac_registry_version: '../x' }], ['wrong RBAC hash', { rbac_registry_sha256: '0'.repeat(64) }],
  ['cursor name injection', { cursor_secret: '../secret' }],
]) test(`rejects ${label}`, () => {
  const { input, raw } = fixture();
  assert.throws(() => renderReadDeployment({ ...input, ...changes }, raw));
});
for (const [label, change] of [
  ['installation mismatch', r => { r.installation_id = 'installation_other'; }],
  ['version mismatch', r => { r.version = 'other'; }],
  ['unknown role', r => { r.bindings[0].role = 'root'; }],
  ['wrong subject', r => { r.bindings[0].subject = 'user:43'; }],
  ['duplicate actor', r => { r.bindings.push({ ...r.bindings[0] }); }],
  ['unknown binding field', r => { r.bindings[0].token = 'PRIVATE'; }],
]) test(`rejects RBAC ${label} even with a matching byte digest`, () => {
  const { input, raw } = fixture(), registry = JSON.parse(raw);
  change(registry);
  const changed = Buffer.from(JSON.stringify(registry));
  assert.throws(() => renderReadDeployment({ ...input, rbac_registry_sha256: createHash('sha256').update(changed).digest('hex') }, changed));
});
test('invalid UTF-8 and oversized registry bytes do not become public ConfigMaps', () => {
  const { input } = fixture();
  for (const raw of [Buffer.from([0xff]), Buffer.alloc(262145)]) {
    assert.throws(() => renderReadDeployment({ ...input, rbac_registry_sha256: createHash('sha256').update(raw).digest('hex') }, raw));
  }
});
