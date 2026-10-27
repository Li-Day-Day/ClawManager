import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'backend/internal/systembackupsecurity/testdata/config_backfill_identity_vectors.json');
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
function jcs(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
}

// Independent flattening of the accepted synthetic public ConfigValues vector;
// this does not call the Go SQL projection or create historical source files.
const config = read('docs/evidence/a-config-canonical-request-vectors-20261014.json').vectors[0].input.request.config;
const original = jcs(config);
const materialized = {
  enabled: config.enabled ? '1' : '0', alert_profile: config.alert_profile,
  minimum_recovery_points: String(config.minimum_recovery_points),
};
for (const group of ['durations', 'capacity', 'concurrency', 'preflight_limits']) {
  for (const [name, value] of Object.entries(config[group])) {
    const column = group === 'preflight_limits' ? `preflight_${name}` : name;
    materialized[column] = name === 'source_size_safety_factor' ? value.toFixed(2) : String(value);
  }
}
for (const registry of config.registries) {
  materialized[`${registry.registry_kind}_registry_version`] = registry.version;
  materialized[`${registry.registry_kind}_registry_sha256`] = registry.sha256;
}
for (const ref of config.references) {
  materialized[`${ref.purpose}_identity_hash`] = ref.identity_hash;
  materialized[`${ref.purpose}_ref_version`] = ref.version;
}
const target = {
  TargetServerUUID: '12345678-1234-1234-1234-123456789abc', TargetDatabase: 'Claw_Synthetic',
  InstallationID: 'installation_backfill_identity', Version: 3,
  ConfigSHA256: hash(original), ConfigSizeBytes: Buffer.byteLength(original),
};
const rowFacts = {
  ...target, RowID: '18446744073709551615', SchemaVersion: 'system-backup-config.v1',
  RowVersion: 1, CopiedFromVersion: null, CreatedBy: 'operator:合成', ChangeReason: null,
  CreatedAt: '2026-10-15T01:02:03.123456Z', Materialized: materialized,
};
function rowBody(facts) {
  return {
    domain: 'clawmanager.system-backup.config-canonical-backfill-row.v1',
    target_server_uuid: facts.TargetServerUUID, target_database: facts.TargetDatabase,
    row_id: facts.RowID, schema_version: facts.SchemaVersion, origin_installation_id: facts.InstallationID,
    version: facts.Version, row_version: facts.RowVersion, copied_from_version: facts.CopiedFromVersion,
    config_sha256: facts.ConfigSHA256, config_size_bytes: facts.ConfigSizeBytes,
    created_by: facts.CreatedBy, change_reason: facts.ChangeReason, created_at: facts.CreatedAt,
    materialized: facts.Materialized,
  };
}
const provenanceFacts = {
  ...target, SourceIssuer: 'archive-authority:合成', SourceID: 'archive://synthetic/config/original',
  SourceVersion: 'immutable-v1', AttestationSHA256: 'a'.repeat(64),
};
function provenanceBody(facts) {
  return {
    domain: 'clawmanager.system-backup.config-canonical-backfill-provenance.v1',
    target_server_uuid: facts.TargetServerUUID, target_database: facts.TargetDatabase,
    origin_installation_id: facts.InstallationID, config_version: facts.Version,
    original_config_sha256: facts.ConfigSHA256, original_config_size_bytes: facts.ConfigSizeBytes,
    source_issuer: facts.SourceIssuer, source_id: facts.SourceID, source_version: facts.SourceVersion,
    attestation_sha256: facts.AttestationSHA256,
  };
}
function vector(kind, name, facts, originalSource = original) {
  const canonical = jcs(kind === 'row' ? rowBody(facts) : provenanceBody(facts));
  return { kind, name, facts, original_canonical: kind === 'row' ? originalSource : undefined, canonical, sha256: hash(canonical) };
}
function decimalVector(value) {
  const changed = structuredClone(config);
  changed.capacity.source_size_safety_factor = value;
  const source = jcs(changed);
  const facts = { ...rowFacts, ConfigSHA256: hash(source), ConfigSizeBytes: Buffer.byteLength(source), Materialized: { ...materialized, source_size_safety_factor: value.toFixed(2) } };
  return vector('row', `fixed-decimal-${value.toFixed(2)}`, facts, source);
}
const generated = {
  profile: 'a-config-canonical-backfill-identities.v1',
  purpose: 'Synthetic representation parity only; no authenticated provenance, original historical source or runtime grant',
  vectors: [
    vector('row', 'unsigned-id-null-metadata', rowFacts),
    vector('row', 'copied-version-reason', { ...rowFacts, RowID: '7', CopiedFromVersion: 1, ChangeReason: '合成回填' }),
    vector('provenance', 'exact-target-and-archive-record', provenanceFacts),
    vector('provenance', 'preserved-unicode-and-whitespace', { ...provenanceFacts, SourceID: '  合成/原文\n记录  ', SourceVersion: 'immutable-v2' }),
    ...[1, 1.5, 2].map(decimalVector),
  ],
};
if (process.argv.includes('--write-vectors') || process.argv.includes('--replace-vectors')) writeFileSync(destination, `${JSON.stringify(generated, null, 2)}\n`, { flag: process.argv.includes('--replace-vectors') ? 'w' : 'wx' });
const saved = JSON.parse(readFileSync(destination, 'utf8'));

test('independent backfill identity vectors have exact JCS and SHA-256', () => {
  assert.deepEqual(saved, JSON.parse(JSON.stringify(generated)));
  for (const vector of saved.vectors) {
    assert.equal(jcs(JSON.parse(vector.canonical)), vector.canonical);
    assert.equal(hash(vector.canonical), vector.sha256);
  }
});

test('row fingerprint covers every formal 066 config column except the separately checked canonical field', () => {
  const ddl = readFileSync(join(root, 'backend/internal/db/migrations/066_add_system_backup_config_and_operations.sql'), 'utf8').split('  UNIQUE KEY')[0];
  const columns = [...ddl.matchAll(/^  ([a-z][a-z0-9_]*) (?:BIGINT|VARCHAR|CHAR|INT|BOOLEAN|ENUM|DECIMAL|DATETIME)\b/gm)].map(match => match[1]);
  const metadata = ['id', 'schema_version', 'origin_installation_id', 'version', 'copied_from_version', 'config_sha256', 'config_size_bytes', 'created_by', 'change_reason', 'row_version', 'created_at'];
  assert.deepEqual([...metadata, ...Object.keys(materialized)].sort(), columns.sort());
  assert.equal(materialized.source_size_safety_factor, Number(materialized.source_size_safety_factor).toFixed(2));
  assert.ok(!Object.hasOwn(rowBody(rowFacts), 'canonical_config_json'));
  assert.ok(!Object.hasOwn(rowBody(rowFacts), 'active_config_version'));
});

test('row and provenance identities use separate domains and exact nullable/text facts', () => {
  assert.notEqual(saved.vectors[0].sha256, saved.vectors[1].sha256);
  assert.notEqual(saved.vectors[2].sha256, saved.vectors[3].sha256);
  assert.equal(JSON.parse(saved.vectors[0].canonical).row_id, '18446744073709551615');
  assert.equal(JSON.parse(saved.vectors[0].canonical).change_reason, null);
  assert.equal(JSON.parse(saved.vectors[1].canonical).change_reason, '合成回填');
  assert.equal(JSON.parse(saved.vectors[3].canonical).source_id, '  合成/原文\n记录  ');
});

test('formal 066 CHECK constraints use UTF-8 byte limits and forbid empty nonnull reasons', () => {
  const ddl = readFileSync(join(root, 'backend/internal/db/migrations/066_add_system_backup_config_and_operations.sql'), 'utf8');
  assert.match(ddl, /CHECK \(OCTET_LENGTH\(created_by\) BETWEEN 1 AND 128\)/);
  assert.match(ddl, /CHECK \(change_reason IS NULL OR OCTET_LENGTH\(change_reason\) BETWEEN 1 AND 512\)/);
  const contract = read('docs/evidence/a-config-backfill-identity-contract-20261015-r2.json');
  assert.equal(contract.row.created_by_max_utf8_bytes, 128);
  assert.equal(contract.row.change_reason_max_utf8_bytes, 512);
  assert.equal(contract.row.empty_nonnull_reason_allowed, false);
  for (const vector of saved.vectors.filter(value => value.kind === 'row')) {
    assert.ok(Buffer.byteLength(vector.facts.CreatedBy) <= 128);
    if (vector.facts.ChangeReason !== null) assert.ok(Buffer.byteLength(vector.facts.ChangeReason) >= 1 && Buffer.byteLength(vector.facts.ChangeReason) <= 512);
  }
});
