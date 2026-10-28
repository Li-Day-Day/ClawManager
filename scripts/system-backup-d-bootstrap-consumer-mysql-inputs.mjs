import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n?/g, '\n');
const sources = {
  producer_vectors: 'contracts/system-backup/v12/producer-authority-vectors.json',
  evidence_examples: 'contracts/system-backup/v12/a-owned-redacted-examples.json',
  config_vectors: 'docs/evidence/a-config-canonical-request-vectors-20261014.json',
  candidate_ddl: 'contracts/system-backup/v12/producer-authority-candidate.sql',
};
const content = Object.fromEntries(Object.entries(sources).map(([key, name]) => [key, read(name)]));
const migrations = fs.readdirSync(path.join(root, 'backend/internal/db/migrations')).filter(name => name.endsWith('.sql')).sort();
const catalog = crypto.createHash('sha256').update('system-backup-migration-catalog.v1\0');
const frame = value => {
  const bytes = Buffer.from(value), size = Buffer.alloc(8);
  size.writeBigUInt64BE(BigInt(bytes.length)); catalog.update(size).update(bytes);
};
for (const name of migrations) { frame(name); frame(read('backend/internal/db/migrations/' + name)); }
const catalogHash = catalog.digest('hex');
const controller = read('backend/internal/systembackupcontroller/bootstrap.go');
if (migrations.length !== 96 || !controller.includes('"' + catalogHash + '"')) throw new Error('formal migration catalog differs');
const config = JSON.parse(content.config_vectors).vectors[0].input.request.config;
if (config.enabled !== false) throw new Error('disabled synthetic config required');
const output = JSON.stringify({
  kind: 'd_bootstrap_consumer_mysql_synthetic_inputs.v1', production_approved: false,
  authority: 'constructor-fixed synthetic deployment; no production grant, provider, or physical capacity approval',
  sources: Object.entries(sources).map(([key, name]) => ({ name, normalized_sha256: sha(content[key]) })),
  migration_catalog_sha256: catalogHash, migrations,
  candidate_ddl: content.candidate_ddl, candidate_ddl_sha256: sha(content.candidate_ddl),
  producer_vectors: content.producer_vectors, evidence_examples: content.evidence_examples, config,
}) + '\n';
const destination = path.join(root, 'backend/internal/systembackupevidence/testdata/bootstrap-consumer-mysql-inputs.json');
if (process.argv.includes('--write')) fs.writeFileSync(destination, output);
else if (fs.readFileSync(destination, 'utf8') !== output) throw new Error('bootstrap MySQL inputs drifted; regenerate and review');
console.log(`BOOTSTRAP_CONSUMER_MYSQL_INPUTS_OK migrations=${migrations.length} catalog=${catalogHash} synthetic_authority=yes production=no`);
