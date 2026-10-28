import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const registryBytes = fs.readFileSync(path.join(root, 'contracts/system-backup/v12/schema-registry.json'));
const registry = JSON.parse(registryBytes);
// Test-only registry. It must never replace or approve the repository registry.
registry.contract_status = 'frozen';
Object.assign(registry.schema_hash, { status: 'observed', hash: 'a'.repeat(64), evidence: { public_id: 'sev_fixture', sha256: 'b'.repeat(64) } });
Object.assign(registry.summary, { policy_recorded: registry.objects.length, policy_pending: 0, cross_review_pending: 0 });
for (const object of registry.objects) { object.decision_status = 'frozen'; object.approved_cross_reviewers = object.required_cross_reviewers; }
const migrations = fs.readdirSync(path.join(root, 'backend/internal/db/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => ({ name, sha256: hash(fs.readFileSync(path.join(root, 'backend/internal/db/migrations', name))) }));
const output = JSON.stringify({ kind: 'd_resources_mysql_synthetic_inputs.v1', production_approved: false, registry_sha256: hash(registryBytes), migrations, registry }) + '\n';
const destination = path.join(root, 'backend/internal/systembackupresources/testdata/restore-readback-mysql-inputs.json');
if (process.argv.includes('--write')) fs.writeFileSync(destination, output);
else if (fs.readFileSync(destination, 'utf8') !== output) throw new Error('resources MySQL fixture inputs differ; regenerate and review');
console.log(`RESOURCES_MYSQL_INPUTS_OK migrations=${migrations.length} synthetic_registry=yes production=no`);
