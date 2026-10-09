#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMigrationCatalog } from './system-backup-contract-check.mjs';
import { computeSchemaHash, observationFromRecords } from './system-backup-schema-hash.mjs';
import { compareDSchemaRecords } from './system-backup-schema-diff.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = raw => createHash('sha256').update(raw).digest('hex');
const normalized = path => readFileSync(resolve(root, path), 'utf8').replace(/\r\n?/g, '\n');

export function receiveBaseline(transcript) {
  assert.ok(Buffer.byteLength(transcript) <= 80 * 1024 * 1024, 'oversized transcript');
  const lines = transcript.split(/\r?\n/);
  const captures = lines.filter(line => line.startsWith('D_FRESH_BASELINE_JSON='));
  assert.equal(captures.length, 1, 'one fresh capture required');
  const capture = JSON.parse(captures[0].slice('D_FRESH_BASELINE_JSON='.length));
  assert.equal(capture.kind, 'd_fresh_baseline_capture');
  assert.equal(capture.status, 'candidate_not_approved');
  assert.match(capture.namespace, /^sbk-mig-[0-9]{12}-[a-f0-9]{4}$/);
  assert.match(capture.namespace_uid, /^[a-f0-9-]{36}$/);
  assert.ok(lines.includes(`CLEANED namespace=${capture.namespace} uid=${capture.namespace_uid}`), 'namespace cleanup unverified');
  const catalog = computeMigrationCatalog();
  assert.equal(capture.inputs.catalog_sha256, catalog.hash, 'current catalog mismatch');
  assert.equal(capture.inputs.filenames.length, catalog.file_count);
  assert.deepEqual(capture.inputs.filenames, readdirSync(resolve(root, 'backend/internal/db/migrations')).filter(f => f.endsWith('.sql')).sort(), 'migration filenames mismatch');
  for (const [key, path] of [['bootstrap_sha256', 'deployments/mysql/000_database.sql'], ['capture_sql_sha256', 'contracts/system-backup/v12/schema-hash-capture.mysql.sql']]) {
    assert.equal(capture.inputs[key], sha(normalized(path)), `transferred ${key} mismatch`);
  }
  for (const key of ['zero_tables_before_replay', 'writer_stopped', 'repeated_capture_matched']) assert.equal(capture[key], true);
  assert.match(capture.app_image, /@sha256:[a-f0-9]{64}$/);
  assert.match(capture.mysql_image, /@sha256:[a-f0-9]{64}$/);
  assert.match(capture.server_uuid, /^[a-f0-9-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(capture.started_at)) && Date.parse(capture.finished_at) >= Date.parse(capture.started_at));
  assert.equal(sha(capture.records), capture.records_sha256, 'raw metadata hash mismatch');
  const observation = observationFromRecords(capture.records);
  const registry = JSON.parse(readFileSync(resolve(root, 'contracts/system-backup/v12/schema-registry.json'), 'utf8'));
  const expected = registry.objects.map(o => `${o.object_type}:${o.name}`).sort();
  const actual = observation.objects.map(o => `${o.object_type}:${o.name}`).sort();
  assert.deepEqual(actual, expected, 'fresh object inventory differs from current registry');
  const { records, ...publicCapture } = capture;
  return { ...publicCapture, kind: 'd_fresh_schema_baseline_receipt',
    transcript_sha256: sha(transcript), schema: computeSchemaHash(observation),
    exact_inventory_matched: true, isolated_namespace_cleanup_reported: true,
    trust: 'operator_ssh_capture_locally_recomputed_not_signed_or_registered',
    production_schema_compared: false, historical_sql_equivalence_verified: false,
    registered_evidence: null, approved_reviewers: [] };
}

// Consume raw records only inside the caller's private scratch lifetime. A
// summary receipt cannot enter this path, and no reference artifact is retained.
export function compareBaseline(transcript, live) {
  const receipt = receiveBaseline(transcript);
  const capture = JSON.parse(transcript.split(/\r?\n/).find(l => l.startsWith('D_FRESH_BASELINE_JSON=')).slice('D_FRESH_BASELINE_JSON='.length));
  assert.equal(live.kind, 'd_live_schema_capture');
  assert.equal(live.records_sha256, sha(live.records));
  assert.equal(live.capture_sql_sha256, capture.inputs.capture_sql_sha256);
  assert.equal(live.identity_stable, true);
  assert.notEqual(live.server_uuid, capture.server_uuid, 'fresh must be independent of target');
  const registry = JSON.parse(readFileSync(resolve(root, 'contracts/system-backup/v12/schema-registry.json')));
  const diff = compareDSchemaRecords(capture.records, live.records, registry);
  return { ...receipt, production_schema_compared: true, comparison: {
    target: live.target, server_uuid: live.server_uuid, records_sha256: live.records_sha256,
    matched: diff.matched, table_count: diff.table_count, difference_count: diff.difference_count,
    paths: diff.differences.map(d => d.path), truncated: diff.differences_truncated,
    scope: 'D_columns_indexes_foreign_keys_and_server_version', upgrade_080_approved: false } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.length === 3 || (process.argv.length === 5 && process.argv[3] === '--compare-live'));
    const transcript = readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '');
    const result = process.argv.length === 5 ? compareBaseline(transcript, JSON.parse(readFileSync(process.argv[4], 'utf8').replace(/^\uFEFF/, ''))) : receiveBaseline(transcript);
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error('Baseline receipt rejected: inspect local tests/input bindings; raw metadata withheld.');
    process.exitCode = 1;
  }
}
