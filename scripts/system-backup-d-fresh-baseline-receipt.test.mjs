import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { receiveBaseline, compareBaseline } from './system-backup-d-fresh-baseline-receipt.mjs';
import { computeMigrationCatalog } from './system-backup-contract-check.mjs';
const sha = v => createHash('sha256').update(v).digest('hex');
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n?/g, '\n');

function fixture() {
  // Synthetic structure tests validation only; it is never persisted as live evidence.
  const registry = JSON.parse(read('contracts/system-backup/v12/schema-registry.json'));
  const rows = [['metadata', { server_version: '8.4.8', sql_mode: '' }]];
  for (const obj of registry.objects) {
    assert.equal(obj.object_type, 'table');
    rows.push(['table', { name: obj.name }]);
    rows.push(['column', { table_name: obj.name, name: 'fixture_id', ordinal_position: 1, normalized_type: 'bigint', nullable: 0, default: null, character_set: null, collation: null, extra: '', generation_expression: null }]);
  }
  const records = rows.map(([t, v]) => `${t}\t${JSON.stringify(v)}`).join('\n')+'\n';
  const capture = { kind: 'd_fresh_baseline_capture', status: 'candidate_not_approved', namespace: 'sbk-mig-260929120000-abcd', namespace_uid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    server_uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', app_image: 'test.invalid/app@sha256:'+'a'.repeat(64), mysql_image: 'test.invalid/mysql@sha256:'+'b'.repeat(64),
    started_at: '2026-09-29T12:00:00Z', finished_at: '2026-09-29T12:00:01Z',
    inputs: { catalog_sha256: computeMigrationCatalog().hash, filenames: readdirSync(new URL('backend/internal/db/migrations/', root)).filter(f => f.endsWith('.sql')).sort(),
      bootstrap_sha256: sha(read('deployments/mysql/000_database.sql')), capture_sql_sha256: sha(read('contracts/system-backup/v12/schema-hash-capture.mysql.sql')) },
    zero_tables_before_replay: true, writer_stopped: true, repeated_capture_matched: true, records, records_sha256: sha(records) };
  return capture;
}
const transcript = c => `D_FRESH_BASELINE_JSON=${JSON.stringify(c)}\nCLEANED namespace=${c.namespace} uid=${c.namespace_uid}\n`;

test('locally recomputes canonical hash without raw records or approval', () => {
  const r = receiveBaseline(transcript(fixture()));
  assert.match(r.schema.hash, /^[a-f0-9]{64}$/);
  assert.equal(r.records, undefined);
  assert.equal(r.registered_evidence, null);
  assert.deepEqual(r.approved_reviewers, []);
  assert.equal(r.production_schema_compared, false);
});
test('rejects missing cleanup, duplicate envelopes, raw corruption and stale catalog', () => {
  const c = fixture();
  assert.throws(() => receiveBaseline(`D_FRESH_BASELINE_JSON=${JSON.stringify(c)}\n`));
  assert.throws(() => receiveBaseline(transcript(c)+transcript(c)));
  const corrupt = structuredClone(c); corrupt.records += '\n';
  assert.throws(() => receiveBaseline(transcript(corrupt)), /raw metadata hash/);
  c.inputs.catalog_sha256 = '0'.repeat(64);
  assert.throws(() => receiveBaseline(transcript(c)), /catalog mismatch/);
});
test('rejects changed bootstrap, nonempty initial schema, incomplete inventory', () => {
  const c = fixture(); c.inputs.bootstrap_sha256 = '0'.repeat(64);
  assert.throws(() => receiveBaseline(transcript(c)), /bootstrap_sha256/);
  const d = fixture(); d.zero_tables_before_replay = false;
  assert.throws(() => receiveBaseline(transcript(d)));
  const e = fixture(); e.records = e.records.split('\n').slice(0, 3).join('\n')+'\n'; e.records_sha256 = sha(e.records);
  assert.throws(() => receiveBaseline(transcript(e)), /object inventory/);
});

test('controlled comparison rejects summaries/self comparison and emits paths only', () => {
  const c = fixture();
  const live = {kind:'d_live_schema_capture', records:c.records, records_sha256:sha(c.records), capture_sql_sha256:c.inputs.capture_sql_sha256,
    identity_stable:true, server_uuid:'cccccccc-cccc-cccc-cccc-cccccccccccc', target:{namespace:'fixture'}};
  assert.equal(compareBaseline(transcript(c), live).comparison.matched, true);
  assert.throws(() => compareBaseline(JSON.stringify(receiveBaseline(transcript(c))), live));
  assert.throws(() => compareBaseline(transcript(c), {...live, server_uuid:c.server_uuid}), /independent/);
  assert.throws(() => compareBaseline(transcript(c), {...live, identity_stable:false}));
  live.records = live.records.replaceAll('bigint', 'PRIVATE_DEFAULT');
  live.records_sha256 = sha(live.records);
  const r = compareBaseline(transcript(c), live);
  assert.equal(r.comparison.matched, false);
  assert.ok(r.comparison.difference_count > 0);
  assert.ok(!JSON.stringify(r).includes('PRIVATE_DEFAULT'));
  assert.equal(r.comparison.upgrade_080_approved, false);
});
