#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMigrationCatalog } from './system-backup-contract-check.mjs';
import { validateSchemaHashCandidate } from './system-backup-schema-hash-evidence.mjs';

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '..');
export function receiveSchemaCandidate(bytes, { expectedSHA256, ...bindings }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 256 * 1024) throw new Error('candidate size is invalid');
  if (typeof expectedSHA256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedSHA256)) throw new Error('expected file SHA-256 is required');
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  if (fileHash !== expectedSHA256) throw new Error('candidate file checksum mismatch');
  let candidate;
  try { candidate = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('candidate is not valid UTF-8 JSON'); }
  validateSchemaHashCandidate(candidate, bindings);
  return {
    kind: 'system_backup_d_candidate_receipt', contract_version: candidate.contract_version,
    status: 'candidate_received_not_approved', candidate_file_sha256: fileHash,
    observed_schema_hash: candidate.result.hash, object_count: candidate.result.object_count,
    capture_record_count: candidate.capture_record_count,
    repository_bindings_match: true, cleanup_reported_verified: true,
    raw_records_independently_recomputed: false, installation_identity_authenticated: false,
    registered_evidence: null, required_reviewers: ['A', 'B', 'C'], approved_reviewers: [],
    schema_hash_evidence_present: false,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--candidate' || args[2] !== '--sha256') {
    throw new Error('usage: node scripts/system-backup-schema-candidate-receipt.mjs --candidate <file> --sha256 <expected-file-hash>');
  }
  const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const receipt = receiveSchemaCandidate(readFileSync(resolve(args[1])), {
    expectedSHA256: args[3], inventory: json('docs/system-backup-restore-schema-inventory.json'),
    migrationCatalog: computeMigrationCatalog(),
    captureSql: readFileSync(join(root, 'contracts/system-backup/v12/schema-hash-capture.mysql.sql'), 'utf8'),
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === script) {
  try { main(); } catch {
    process.stderr.write('candidate receipt validation failed; check CLI arguments, pinned file checksum, repository bindings and candidate/cleanup state\n');
    process.exitCode = 1;
  }
}
