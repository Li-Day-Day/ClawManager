import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeMigrationCatalog } from './system-backup-contract-check.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
export function buildDownloadAuditInputs(root = fileURLToPath(new URL('../', import.meta.url))) {
  const catalog = computeMigrationCatalog(resolve(root, 'backend/internal/db/migrations'));
  const bootstrap = readFileSync(resolve(root, 'backend/internal/systembackupcontroller/bootstrap.go'), 'utf8');
  if (catalog.file_count !== 95 || bootstrap.match(/ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/)?.[1] !== catalog.hash ||
      Number(bootstrap.match(/ContractMigrationCatalogFileCount\s*=\s*(\d+)/)?.[1]) !== catalog.file_count) throw new Error('Audit probe requires current reviewed 95-file catalog');
  return { kind: 'd_download_audit_probe_inputs.v1', catalog_sha256: catalog.hash,
    migration_files: readdirSync(resolve(root, 'backend/internal/db/migrations')).filter(p => p.endsWith('.sql')).sort() };
}
export function prepareDownloadAuditBundle(root, bundle) {
  const text = p => readFileSync(resolve(root, p), 'utf8').replace(/\r\n?/g, '\n');
  const paths = ['scripts/system-backup-fresh-migration-smoke.sh', 'scripts/system-backup-smoke-contract.sh',
    'scripts/system-backup-d-invariants-phase.sh', 'scripts/system-backup-d-migration-phase.sh',
    'backend/internal/systembackupcontroller/bootstrap.go',
    ...buildDownloadAuditInputs(root).migration_files.map(p => `backend/internal/db/migrations/${p}`)];
  for (const path of paths) {
    let value = text(path);
    if (path === 'scripts/system-backup-fresh-migration-smoke.sh') {
      if ((value.match(/^test_image_pull_policy=IfNotPresent$/gm) ?? []).length !== 1) throw new Error('Cannot pin Never policy');
      value = value.replace('test_image_pull_policy=IfNotPresent', 'test_image_pull_policy=Never');
    }
    const destination = resolve(bundle, path); mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, value, { flag: 'wx' });
  }
  writeFileSync(resolve(bundle, 'scripts/system-backup-d-provider-registration-phase.sh'), text('scripts/system-backup-d-download-audit-phase.sh'), { flag: 'wx' });
  const pins = ['d-download-audit.test', 'system-backup-migrate', 'd-download-audit-inputs.json'].map(path => {
    const bytes = readFileSync(resolve(bundle, path));
    if (path !== 'd-download-audit-inputs.json' && !bytes.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46]))) throw new Error('Linux ELF required');
    return { path, sha256: sha(bytes), bytes: bytes.length };
  });
  const report = { kind: 'd_download_audit_bundle', profile: 'd-download-audit', image_pull_policy: 'Never', pins,
    catalog_migrations: 95, schema_ddl_installed: false, production_approval: false };
  writeFileSync(resolve(bundle, 'bundle-pins.json'), JSON.stringify(report), { flag: 'wx' });
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, first, second] = process.argv.slice(2);
  if (mode === 'inputs' && first && !second) {
    const value = Buffer.from(JSON.stringify(buildDownloadAuditInputs()));
    writeFileSync(first, value, { flag: 'wx' });
    console.log(`PASS download-audit-inputs sha256=${sha(value)} ddl_installed=no real_mysql=not_run`);
  } else if (mode === 'bundle' && first && second) console.log(JSON.stringify(prepareDownloadAuditBundle(first, second)));
  else throw new Error('Usage: inputs <new-json> | bundle <frozen-root> <owned-bundle>');
}
