// Compose public pins and a core Deployment patch. No SQL, cluster access,
// bootstrap authorization, token issuance or Secret values are produced here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const dns = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
const version = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const readMount = '/run/system-backup-read';
export const cursorMount = '/run/system-backup-read-cursor';
const names = ['schema_version', 'namespace', 'namespace_uid', 'deployment', 'container', 'server_uuid', 'database',
  'installation_id', 'config_version', 'rbac_registry_version', 'rbac_registry_sha256', 'cursor_secret'];
function closed(value, fields) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort());
}
function resourceName(value) { assert.ok(typeof value === 'string' && value.length <= 63 && dns.test(value)); }
export function readDeploymentTemplate() {
  return { schema_version: 'system-backup-read-kubernetes.v1', namespace: 'clawmanager-zhanghui08-system',
    namespace_uid: '337cfe30-2c17-4b8e-b32a-760778b8098e', deployment: 'clawmanager-app', container: 'clawmanager-app',
    server_uuid: 'f1f5f76a-95f5-11f1-b08e-366835b4a029', database: 'clawmanager', installation_id: '', config_version: 0,
    rbac_registry_version: '', rbac_registry_sha256: '', cursor_secret: 'system-backup-read-cursor' };
}
export function renderReadDeployment(input, registryBytes) {
  closed(input, names);
  assert.equal(input.schema_version, 'system-backup-read-kubernetes.v1');
  for (const field of ['namespace', 'deployment', 'container', 'cursor_secret']) resourceName(input[field]);
  for (const field of ['namespace_uid', 'server_uuid']) assert.match(input[field], uuid);
  assert.match(input.database, /^[A-Za-z0-9_]{1,64}$/);
  assert.match(input.installation_id, /^installation_[A-Za-z0-9._:-]{1,115}$/);
  assert.ok(Number.isSafeInteger(input.config_version) && input.config_version >= 1);
  assert.match(input.rbac_registry_version, version);
  assert.ok(!input.rbac_registry_version.includes('..'));
  assert.match(input.rbac_registry_sha256, hash);
  assert.ok(registryBytes instanceof Uint8Array && registryBytes.byteLength > 0 && registryBytes.byteLength <= 262144);
  assert.equal(sha(registryBytes), input.rbac_registry_sha256);
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(registryBytes);
  const registry = JSON.parse(raw);
  closed(registry, ['schema_version', 'version', 'installation_id', 'bindings']);
  assert.equal(registry.schema_version, 'system-backup-registration-rbac.draft.v1');
  assert.equal(registry.version, input.rbac_registry_version);
  assert.equal(registry.installation_id, input.installation_id);
  assert.ok(Array.isArray(registry.bindings) && registry.bindings.length <= 10000);
  const actors = new Set();
  for (const binding of registry.bindings) {
    closed(binding, ['actor_id', 'subject', 'role']);
    assert.ok(typeof binding.actor_id === 'string' && /^[1-9][0-9]{0,18}$/.test(binding.actor_id)
      && BigInt(binding.actor_id) <= 9223372036854775807n && !actors.has(binding.actor_id));
    actors.add(binding.actor_id);
    assert.equal(binding.subject, 'user:' + binding.actor_id);
    assert.ok(['viewer', 'operator', 'config_admin', 'security_admin'].includes(binding.role));
  }
  const pins = { installation_id: input.installation_id, config_version: input.config_version,
    rbac_registry_version: input.rbac_registry_version, rbac_registry_sha256: input.rbac_registry_sha256,
    registry_directory: readMount + '/registries' };
  const pinBytes = json(pins), pinDigest = sha(pinBytes), configName = 'sbk-read-' + pinDigest.slice(0, 16);
  // Keep original registry bytes: its hash is an exact-byte SQL/deployment pin.
  const publicResources = { apiVersion: 'v1', kind: 'List', items: [{ apiVersion: 'v1', kind: 'ConfigMap',
    metadata: { name: configName, namespace: input.namespace }, immutable: true,
    data: { 'pins.json': pinBytes, 'rbac.json': raw } }] };
  const env = [
    ['SYSTEM_BACKUP_READ_SESSIONS_ENABLED', 'true'], ['SYSTEM_BACKUP_READ_SESSIONS_SERVER_UUID', input.server_uuid],
    ['SYSTEM_BACKUP_REGISTRATION_INSTALLATION_ID', input.installation_id], ['SYSTEM_BACKUP_READ_LIVE_ENABLED', 'true'],
    ['SYSTEM_BACKUP_READ_PINS_PATH', readMount + '/pins.json'], ['SYSTEM_BACKUP_READ_PINS_SHA256', pinDigest],
    ['SYSTEM_BACKUP_READ_CURSOR_KEY_FILE', cursorMount + '/key'],
    // Override even an envFrom legacy value; the loader rejects two sources.
    ['SYSTEM_BACKUP_READ_CURSOR_KEY_HEX', ''],
  // A strategic merge must remove a previous valueFrom; otherwise replacing
  // an explicit Secret-backed env var can retain two competing sources.
  ].map(([name, value]) => ({ name, value, valueFrom: null }));
  const deploymentPatch = { metadata: { name: input.deployment, namespace: input.namespace }, spec: { template: {
    metadata: { annotations: { 'clawmanager.io/backup-read-pins-sha256': pinDigest } }, spec: {
      containers: [{ name: input.container, env, volumeMounts: [
        { name: 'system-backup-read-public', mountPath: readMount, readOnly: true, subPath: null, subPathExpr: null },
        { name: 'system-backup-read-cursor', mountPath: cursorMount, readOnly: true, subPath: null, subPathExpr: null },
      ] }],
      volumes: [
        { name: 'system-backup-read-public', configMap: { name: configName, optional: false, defaultMode: 292, items: [
          { key: 'pins.json', path: 'pins.json' },
          { key: 'rbac.json', path: `registries/rbac_bindings/${input.rbac_registry_version}/${input.rbac_registry_sha256}.json` },
        ] } },
        { name: 'system-backup-read-cursor', secret: { secretName: input.cursor_secret, optional: false,
          defaultMode: 256, items: [{ key: 'key', path: 'key' }] } },
      ],
    },
  } } };
  return { publicResources, deploymentPatch, report: {
    status: 'PUBLIC_COMPOSITION_PREPARED_LIVE_AUTHORITY_REQUIRED', namespace: input.namespace, namespace_uid: input.namespace_uid,
    expected_database: input.database, expected_server_uuid: input.server_uuid, installation_id: input.installation_id,
    config_version: input.config_version, pins_sha256: pinDigest, rbac_sha256: input.rbac_registry_sha256,
    cursor_secret: input.cursor_secret, cursor_secret_required_bytes: 32, cursor_secret_created: false,
    image_changed: false, schema_migrated: false, configuration_activated: false, read_authority_granted: false,
    required_image_features: ['dedicated_UTC_backup_read_pool', 'SYSTEM_BACKUP_READ_CURSOR_KEY_FILE'],
    live_checks_required: ['namespace UID', 'existing image includes required features and reviewed schema',
      'database name/server UUID', 'admitted active config and exact RBAC pins', 'existing application JWT key',
      'root-readable cursor Secret projection or separately reviewed UID/GID modes', 'fresh login/session and authorized HTTP reads'],
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--template') process.stdout.write(json(readDeploymentTemplate()));
    else {
      assert.equal(args.length, 6);
      const options = {};
      for (let i = 0; i < args.length; i += 2) {
        assert.ok(['--input', '--rbac', '--output'].includes(args[i]) && !options[args[i]]);
        options[args[i]] = args[i + 1];
      }
      const input = JSON.parse(readFileSync(resolve(options['--input']), 'utf8'));
      const result = renderReadDeployment(input, readFileSync(resolve(options['--rbac'])));
      const directory = resolve(options['--output']);
      mkdirSync(directory, { recursive: false, mode: 0o700 });
      for (const [name, value] of [['public.json', result.publicResources], ['deployment-patch.json', result.deploymentPatch], ['report.json', result.report]]) {
        writeFileSync(join(directory, name), json(value), { flag: 'wx', mode: 0o600 });
      }
      process.stdout.write(json(result.report));
    }
  } catch {
    console.error('Read deployment input rejected or output unavailable; no SQL, cluster or credentials accessed.');
    process.exitCode = 1;
  }
}
