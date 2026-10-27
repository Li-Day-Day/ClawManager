import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { proxyCAMount, renderWebProxyDeployment, webProxyTemplate } from './system-backup-d-web-proxy-deployment.mjs';

const now = new Date('2026-10-21T10:00:00Z');
const publicCA = rootCertificates.find(raw => {
  const cert = new X509Certificate(raw);
  return cert.ca && Date.parse(cert.validFrom) < now.getTime() && Date.parse(cert.validTo) > now.getTime();
});
assert.ok(publicCA, 'Existing Node public root bundle required; do not install or fetch certificates');
const ca = Buffer.from(publicCA + '\n');
const hash = b => createHash('sha256').update(b).digest('hex');
const fixture = () => ({ ...webProxyTemplate(), server_name: 'download.synthetic.invalid', ca_sha256: hash(ca) });
test('public proxy template cannot enable a route without a concrete CA and TLS name', () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../deployments/k8s/system-backup-web-proxy.template.json', import.meta.url))), webProxyTemplate());
  assert.throws(() => renderWebProxyDeployment(webProxyTemplate(), ca, now));
});
test('same namespace Service, original CA bytes and TLS name reach the existing renderer', () => {
  const input = fixture(), result = renderWebProxyDeployment(input, ca, now);
  const cm = result.publicResources.items[0], pod = result.deploymentPatch.spec.template.spec;
  assert.equal(cm.immutable, true);
  assert.equal(hash(cm.data['ca.pem']), input.ca_sha256);
  const container = pod.containers[0], env = Object.fromEntries(container.env.map(e => [e.name, e.value]));
  assert.equal(env.SYSTEM_BACKUP_DOWNLOAD_PROXY_ENABLED, 'true');
  assert.equal(env.SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST, `system-backup-registration.${input.namespace}.svc.cluster.local`);
  assert.equal(env.SYSTEM_BACKUP_DOWNLOAD_PROXY_PORT, '9443');
  assert.equal(env.SYSTEM_BACKUP_DOWNLOAD_PROXY_SERVER_NAME, input.server_name);
  assert.equal(env.SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE, proxyCAMount + '/ca.pem');
  assert.ok(container.env.every(e => e.valueFrom === null));
  assert.equal(container.volumeMounts[0].readOnly, true);
  assert.equal(container.volumeMounts[0].subPath, null);
  assert.equal(pod.volumes[0].configMap.name, cm.metadata.name);
  assert.equal('image' in container, false);
  assert.equal(result.publicResources.items.some(x => x.kind === 'Secret'), false);
  for (const key of ['runtime_created', 'server_certificate_verified', 'upstream_tls_verified', 'image_changed', 'configuration_activated', 'download_verified']) assert.equal(result.report[key], false);
});
for (const [label, changes] of [
  ['unknown field', { password: 'PRIVATE' }], ['wrong schema', { schema_version: 'wrong' }],
  ['namespace injection', { namespace: 'other;cmd' }], ['missing namespace UID', { namespace_uid: '' }],
  ['service path', { service_name: '../other' }], ['missing TLS name', { server_name: '' }],
  ['URL as TLS name', { server_name: 'https://download.invalid' }], ['wildcard TLS name', { server_name: '*.invalid' }],
  ['empty DNS label', { server_name: 'download..invalid' }], ['oversized DNS label', { server_name: 'a'.repeat(64) + '.invalid' }],
  ['CA digest mismatch', { ca_sha256: '0'.repeat(64) }],
]) test(`rejects ${label}`, () => assert.throws(() => renderWebProxyDeployment({ ...fixture(), ...changes }, ca, now)));
test('expired and not-yet-valid certificates never become an enabled patch', () => {
  const cert = new X509Certificate(publicCA);
  for (const at of [new Date(Date.parse(cert.validFrom) - 1), new Date(Date.parse(cert.validTo)), new Date(NaN)]) {
    assert.throws(() => renderWebProxyDeployment(fixture(), ca, at));
  }
});
test('duplicate CAs, non-certificate content, malformed PEM and oversized bytes are rejected', () => {
  for (const bytes of [Buffer.concat([ca, ca]), Buffer.from(publicCA + '\nPRIVATE KEY\n'),
    Buffer.from('-----BEGIN CERTIFICATE-----\nBAD\n-----END CERTIFICATE-----'), Buffer.alloc(65537), Buffer.from([0xff])]) {
    assert.throws(() => renderWebProxyDeployment({ ...fixture(), ca_sha256: hash(bytes) }, bytes, now));
  }
});
