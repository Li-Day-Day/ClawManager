// Public CA and same-origin edge composition only. Does not create the
// download runtime, acquire credentials, contact providers or change config.
import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const dns = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const proxyCAMount = '/run/system-backup-download-proxy';
export function webProxyTemplate() {
  return { schema_version: 'system-backup-web-proxy-kubernetes.v1', namespace: 'clawmanager-zhanghui08-system',
    namespace_uid: '337cfe30-2c17-4b8e-b32a-760778b8098e', deployment: 'clawmanager-app', container: 'clawmanager-app',
    service_name: 'system-backup-registration', server_name: '', ca_sha256: '' };
}
export function renderWebProxyDeployment(input, caBytes, now = new Date()) {
  assert.ok(input && typeof input === 'object' && !Array.isArray(input));
  assert.deepEqual(Object.keys(input).sort(), Object.keys(webProxyTemplate()).sort());
  assert.equal(input.schema_version, 'system-backup-web-proxy-kubernetes.v1');
  assert.match(input.namespace_uid, uuid);
  for (const key of ['namespace', 'deployment', 'container', 'service_name']) {
    assert.ok(typeof input[key] === 'string' && input[key].length <= 63 && dns.test(input[key]));
  }
  assert.ok(typeof input.server_name === 'string' && input.server_name.length <= 253);
  for (const label of input.server_name.split('.')) {
    assert.ok(label.length >= 1 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
  }
  assert.match(input.ca_sha256, /^[0-9a-f]{64}$/);
  assert.ok(caBytes instanceof Uint8Array && caBytes.byteLength > 0 && caBytes.byteLength <= 65536);
  assert.equal(sha(caBytes), input.ca_sha256);
  assert.ok(now instanceof Date && Number.isFinite(now.getTime()));
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(caBytes);
  assert.ok(!raw.includes('\ufeff'));
  const blocks = raw.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  assert.ok(blocks.length >= 1 && blocks.length <= 32);
  let remaining = raw;
  const seen = new Set();
  for (const block of blocks) {
    remaining = remaining.replace(block, '');
    const cert = new X509Certificate(block);
    assert.ok(cert.ca && Date.parse(cert.validFrom) <= now.getTime() && now.getTime() < Date.parse(cert.validTo));
    assert.ok(!seen.has(cert.fingerprint256));
    seen.add(cert.fingerprint256);
  }
  assert.equal(remaining.trim(), '');
  const name = 'sbk-web-ca-' + input.ca_sha256.slice(0, 16);
  const env = [
    ['SYSTEM_BACKUP_DOWNLOAD_PROXY_ENABLED', 'true'],
    ['SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST', `${input.service_name}.${input.namespace}.svc.cluster.local`],
    ['SYSTEM_BACKUP_DOWNLOAD_PROXY_PORT', '9443'],
    ['SYSTEM_BACKUP_DOWNLOAD_PROXY_SERVER_NAME', input.server_name],
    ['SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE', proxyCAMount + '/ca.pem'],
  ].map(([name, value]) => ({ name, value, valueFrom: null }));
  return {
    publicResources: { apiVersion: 'v1', kind: 'List', items: [{ apiVersion: 'v1', kind: 'ConfigMap', immutable: true,
      metadata: { name, namespace: input.namespace }, data: { 'ca.pem': raw } }] },
    deploymentPatch: { metadata: { name: input.deployment, namespace: input.namespace }, spec: { template: {
      metadata: { annotations: { 'clawmanager.io/backup-download-proxy-ca-sha256': input.ca_sha256 } },
      spec: { containers: [{ name: input.container, env, volumeMounts: [{ name: 'system-backup-web-download-ca',
        mountPath: proxyCAMount, readOnly: true, subPath: null, subPathExpr: null }] }],
        volumes: [{ name: 'system-backup-web-download-ca', configMap: { name, optional: false, defaultMode: 292,
          items: [{ key: 'ca.pem', path: 'ca.pem' }] } }],
      },
    } } },
    report: { status: 'PUBLIC_PROXY_COMPOSITION_PREPARED_LIVE_RUNTIME_REQUIRED', namespace: input.namespace,
      namespace_uid: input.namespace_uid, service: input.service_name, port: 9443, server_name: input.server_name,
      ca_sha256: input.ca_sha256, ca_certificates: blocks.length, certificate_time_checked_at: now.toISOString(),
      runtime_created: false, server_certificate_verified: false, upstream_tls_verified: false,
      image_changed: false, configuration_activated: false, download_verified: false,
      required_checks: ['actual namespace UID and Service endpoints', 'image includes the dedicated proxy renderer',
        'runtime readiness and original runtime digest', 'CA provenance and actual server certificate name/chain',
        'actual same-origin HTTPS login/proof/download and final Operation audit'],
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--template') process.stdout.write(json(webProxyTemplate()));
    else {
      assert.equal(args.length, 6);
      const options = {};
      for (let i = 0; i < args.length; i += 2) {
        assert.ok(['--input', '--ca', '--output'].includes(args[i]) && !options[args[i]]);
        options[args[i]] = args[i + 1];
      }
      const input = JSON.parse(readFileSync(resolve(options['--input']), 'utf8'));
      const result = renderWebProxyDeployment(input, readFileSync(resolve(options['--ca'])));
      const directory = resolve(options['--output']);
      mkdirSync(directory, { recursive: false, mode: 0o700 });
      for (const [name, value] of [['public.json', result.publicResources], ['deployment-patch.json', result.deploymentPatch], ['report.json', result.report]]) {
        writeFileSync(join(directory, name), json(value), { flag: 'wx', mode: 0o600 });
      }
      process.stdout.write(json(result.report));
    }
  } catch {
    console.error('Web proxy deployment input rejected or output unavailable; no runtime, cluster or credentials accessed.');
    process.exitCode = 1;
  }
}
