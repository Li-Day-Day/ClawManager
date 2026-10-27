import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeMigrationCatalog } from './system-backup-contract-check.mjs';

export function buildControlHealthProbeInputs(root = fileURLToPath(new URL('../', import.meta.url))) {
  const text = (path) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n?/g, '\n');
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const catalog = computeMigrationCatalog(resolve(root, 'backend/internal/db/migrations'));
  const controller = text('backend/internal/systembackupcontroller/bootstrap.go');
  if (controller.match(/ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/)?.[1] !== catalog.hash
    || Number(controller.match(/ContractMigrationCatalogFileCount\s*=\s*(\d+)/)?.[1]) !== catalog.file_count) {
    throw new Error('Current catalog and controller admission differ');
  }
  const ddl = text('docs/system-backup-d-control-health-proposal-20261016.sql');
  const fixture = text('scripts/system-backup-controller-enabled-fixture.mysql.sql');
  return { kind: 'd_control_health_probe_inputs.v1', health_ddl: ddl, health_ddl_sha256: digest(ddl),
    fixture_sql: fixture, fixture_sha256: digest(fixture), catalog_sha256: catalog.hash,
    migration_files: readdirSync(resolve(root, 'backend/internal/db/migrations')).filter((name) => name.endsWith('.sql')).sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/system-backup-d-control-health-inputs.mjs <new-inputs.json>');
  const value = JSON.stringify(buildControlHealthProbeInputs());
  writeFileSync(process.argv[2], value, { flag: 'wx' });
  console.log(`PASS control-health-inputs sha256=${createHash('sha256').update(value).digest('hex')} real_mysql=not_run`);
}
