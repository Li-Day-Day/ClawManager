import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export function prepareControlHealthBundle(root, bundle) {
  const utf8 = (path) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n?/g, '\n');
  const files = ['scripts/system-backup-fresh-migration-smoke.sh', 'scripts/system-backup-smoke-contract.sh',
    'scripts/system-backup-d-invariants-phase.sh', 'scripts/system-backup-d-migration-phase.sh',
    'backend/internal/systembackupcontroller/bootstrap.go',
    ...readdirSync(resolve(root, 'backend/internal/db/migrations')).filter((name) => name.endsWith('.sql')).sort().map((name) => `backend/internal/db/migrations/${name}`)];
  for (const file of files) {
    let value = utf8(file);
    if (file === 'scripts/system-backup-fresh-migration-smoke.sh') {
      if ((value.match(/^test_image_pull_policy=IfNotPresent$/gm) ?? []).length !== 1) throw new Error('Cannot pin fresh-harness image policy');
      value = value.replace('test_image_pull_policy=IfNotPresent', 'test_image_pull_policy=Never');
    }
    const destination = resolve(bundle, file); mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, value, { flag: 'wx' });
  }
  const destination = resolve(bundle, 'scripts/system-backup-d-provider-registration-phase.sh');
  writeFileSync(destination, utf8('scripts/system-backup-d-control-health-phase.sh'), { flag: 'wx' });
  const pins = ['d-control-health.test', 'system-backup-migrate', 'd-control-health-inputs.json'].map((name) => {
    const bytes = readFileSync(resolve(bundle, name));
    if (name !== 'd-control-health-inputs.json' && !bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) throw new Error('Linux ELF payload required');
    return { path: name, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  });
  const report = { kind: 'd_control_health_probe_bundle', profile: 'd-control-health', image_pull_policy: 'Never', pins,
    full_catalog_migrations: files.filter((file) => file.endsWith('.sql')).length, remote_executed: false, production_approval: false };
  writeFileSync(resolve(bundle, 'bundle-pins.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw new Error('Usage: node scripts/system-backup-d-control-health-bundle.mjs <frozen-root> <owned-bundle>');
  console.log(JSON.stringify(prepareControlHealthBundle(process.argv[2], process.argv[3])));
}
