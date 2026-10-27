import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {computeMigrationCatalog} from './system-backup-contract-check.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));

const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const ddl = name => fs.readFileSync(name,'utf8').replace(/\r\n/g,'\n');
const canonical = ddl('docs/system-backup-d-config-canonical-081-proposal-20261014.sql');
const ownership = ddl('docs/system-backup-d-download-admission-schema-proposal-20261019.sql');
const catalog = computeMigrationCatalog();
const configSchema = ddl('backend/internal/db/migrations/066_add_system_backup_config_and_operations.sql').match(/^CREATE TABLE IF NOT EXISTS system_backup_configs \([\s\S]+?^\) ENGINE=InnoDB[^;]*;/m)?.[0];
if(!configSchema) throw new Error('Exact config schema unavailable');
const effectiveConfig = JSON.parse(ddl('docs/evidence/a-config-canonical-request-vectors-20261014.json')).vectors[0].input.request.config;
const output = 'backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json';
const input = {kind:'a_download_mfa_probe_inputs.v1',catalog_sha256:catalog.hash,migration_files:fs.readdirSync('backend/internal/db/migrations').filter(f=>f.endsWith('.sql')).sort(),canonical_ddl:canonical,canonical_sha256:hash(canonical),ownership_ddl:ownership,ownership_sha256:hash(ownership),config_schema_ddl:configSchema,effective_config:effectiveConfig};
// Seed data is a tracked mirror. Normal validation refuses divergence; only an
// explicit refresh writes it, and neither mode installs or executes SQL.
const bytes = JSON.stringify(input,null,2)+'\n';
if(process.argv.includes('--refresh')) fs.writeFileSync(output,bytes);
else if(fs.readFileSync(output,'utf8')!==bytes) throw new Error('MFA seed differs from current catalog/candidate DDL');
console.log(JSON.stringify({output,catalog:input.catalog_sha256,files:input.migration_files.length,canonical:input.canonical_sha256,ownership:input.ownership_sha256,sql_executed:false}));
