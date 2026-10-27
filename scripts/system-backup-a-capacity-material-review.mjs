#!/usr/bin/env node
// Read-only review of existing public capacity formats. No SQL or cluster calls.
import assert from 'node:assert/strict';
import { openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capacityTables, renderCapacityDeployment, sha256 } from './system-backup-d-capacity-deployment.mjs';

// JSON.parse validates syntax. The token pass additionally rejects duplicate
// keys (including escaped spellings), which ordinary JSON.parse overwrites.
export function parseCapacityJSON(raw, limit, integerBytes = false) {
  assert.equal(typeof raw, 'string');
  assert.ok(Buffer.byteLength(raw) > 0 && Buffer.byteLength(raw) <= limit);
  const value = JSON.parse(raw, (key, value, context) => {
    if (integerBytes && (key === 'allocated_bytes' || key === 'available_bytes')) {
      assert.equal(typeof value, 'number');
      assert.match(context.source, /^(0|[1-9][0-9]*)$/);
      return BigInt(context.source);
    }
    return value;
  });
  const stack = [];
  const tokens = raw.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null/g);
  for (const token of tokens) {
    if (token === '{' || token === '[') stack.push({ object: token === '{', keys: new Set(), key: token === '{' });
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',') { if (stack.at(-1)?.object) stack.at(-1).key = true; }
    else if (token.startsWith('"') && stack.at(-1)?.key) {
      const name = JSON.parse(token), top = stack.at(-1);
      assert.ok(!top.keys.has(name));
      top.keys.add(name); top.key = false;
    }
  }
  return value;
}

// Go's UTC time.Time JSON format, preserving all nine fractional digits.
// Reject normalized invalid dates instead of allowing Date.parse to roll them.
export function capacityTimeNS(value) {
  assert.equal(typeof value, 'string');
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.([0-9]{1,9}))?Z$/.exec(value);
  assert.ok(m && !value.startsWith('0000-'));
  const ms = Date.parse(`${m[1]}Z`);
  assert.ok(Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === m[1]);
  const result = BigInt(ms) * 1000000n + BigInt((m[2] ?? '').padEnd(9, '0'));
  assert.notEqual(result, -62135596800000000000n); // time.Time zero
  return result;
}

export function parseCapacityReport(raw, expected) {
  const report = parseCapacityJSON(raw, 4096, true);
  assert.deepEqual(Object.keys(report).sort(), ['server_uuid', 'database', 'observed_at', 'allocated_bytes', 'available_bytes'].sort());
  assert.equal(report.server_uuid, expected.server_uuid);
  assert.equal(report.database, expected.database);
  capacityTimeNS(report.observed_at);
  for (const key of ['allocated_bytes', 'available_bytes']) {
    assert.equal(typeof report[key], 'bigint');
    assert.ok(report[key] >= 0n && report[key] <= 9223372036854775807n);
  }
  return report;
}

// Match the consumer's inclusive five-second age, without millisecond rounding.
export function reviewCapacityReport(raw, identity, expected) {
  assert.equal(identity.server_uuid, expected.server_uuid);
  assert.equal(identity.database, expected.database);
  const report = parseCapacityReport(raw, expected);
  const ageNS = capacityTimeNS(identity.now) - capacityTimeNS(report.observed_at);
  assert.ok(ageNS >= 0n && ageNS <= 5000000000n);
  return { report, ageNS };
}

export function reviewCapacityMaterials({ inputRaw, sourceRaw, reportRaw, identityRaw }) {
  const input = parseCapacityJSON(inputRaw, 65536);
  const rendered = renderCapacityDeployment(input);
  const source = parseCapacityJSON(sourceRaw, 65536);
  assert.deepEqual(source, rendered.source);
  assert.equal(sha256(sourceRaw), rendered.report.config_sha256);
  const identity = parseCapacityJSON(identityRaw, 4096);
  assert.deepEqual(Object.keys(identity).sort(), ['server_uuid', 'database', 'data_directory', 'now'].sort());
  assert.equal(typeof identity.data_directory, 'string');
  assert.equal(identity.data_directory.replace(/\/$/, ''), input.data_directory);
  const { report, ageNS } = reviewCapacityReport(reportRaw, identity, input);
  return {
    status: 'PASS_OFFLINE_CAPACITY_MATERIALS',
    scope: 'public input/config/report consistency at supplied original SQL time',
    input_sha256: sha256(inputRaw), config_sha256: sha256(sourceRaw),
    report_sha256: sha256(reportRaw), sql_identity_sha256: sha256(identityRaw),
    migration_catalog_sha256: input.migration_catalog_sha256,
    table_count: capacityTables().length, age_nanoseconds: String(ageNS),
    allocated_bytes: String(report.allocated_bytes), available_bytes: String(report.available_bytes),
    cluster_contacted: false, database_contacted: false, configuration_activated: false,
    live_freshness_verified: false, physical_storage_verified: false,
    grants_verified: false, collection_duration_verified: false,
  };
}

function readBounded(path, limit) {
  const fd = openSync(resolve(path), 'r');
  try {
    assert.ok(fstatSync(fd).isFile());
    const bytes = Buffer.alloc(limit + 1);
    let size = 0, n;
    while (size < bytes.length && (n = readSync(fd, bytes, size, bytes.length - size, null)) > 0) size += n;
    assert.ok(size > 0 && size <= limit);
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, size));
  } finally { closeSync(fd); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {};
    const names = ['--input', '--source', '--report', '--sql-identity'];
    assert.equal(args.length, 8);
    for (let i = 0; i < args.length; i += 2) {
      assert.ok(names.includes(args[i]) && !Object.hasOwn(options, args[i]) && args[i + 1]);
      options[args[i]] = args[i + 1];
    }
    const result = reviewCapacityMaterials({ inputRaw: readBounded(options['--input'], 65536),
      sourceRaw: readBounded(options['--source'], 65536), reportRaw: readBounded(options['--report'], 4096),
      identityRaw: readBounded(options['--sql-identity'], 4096) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch {
    console.error('Capacity materials rejected: check original public inputs, config bytes, database identity, integer bytes and SQL time; no cluster contacted.');
    process.exitCode = 1;
  }
}
