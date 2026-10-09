#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const initSource = 'deployments/mysql/000_database.sql';
export const initTargets = [
  'deployments/k8s/single-node/clawmanager.yaml',
  'deployments/k8s/cluster/clawmanager.yaml',
  'deployments/k3s/single-node/clawmanager.yaml',
  'deployments/k3s/cluster/clawmanager.yaml',
  'deployments/k8s/sites/nine-node-production/20-clawmanager-production.yaml',
];
const root = fileURLToPath(new URL('../', import.meta.url));
const normalize = text => text.replace(/\r\n?/g, '\n');

export function renderInitData(source) {
  const sql = normalize(source).trimEnd() + '\n';
  // This deliberately supports database creation only. A new table or seed must
  // enter the shared migration ledger, never the MySQL entrypoint path.
  const statements = sql.replace(/^--.*$/gm, '').trim();
  assert.equal(statements, 'CREATE DATABASE IF NOT EXISTS clawmanager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;', 'bootstrap must contain database creation only');
  const hash = createHash('sha256').update(sql).digest('hex');
  return `data:\n  # Generated from ${initSource}; run node scripts/system-backup-d-init-check.mjs --write\n  # normalized-source-sha256: ${hash}\n  000_database.sql: |\n${sql.trimEnd().split('\n').map(line => `    ${line}`).join('\n')}\n`;
}

export function syncInit(manifest, source) {
  const text = normalize(manifest);
  // These repository manifests use top-level document separators. Preserve all
  // other documents and metadata verbatim; reject ambiguous/duplicate targets.
  const documents = text.split(/(?=^---\s*$)/m);
  const matches = documents.map((doc, index) => ({ doc, index })).filter(({ doc }) =>
    /^kind: ConfigMap$/m.test(doc) && /^  name: clawmanager-mysql-init$/m.test(doc));
  assert.equal(matches.length, 1, 'expected one mysql init ConfigMap');
  const { doc, index } = matches[0];
  assert.equal((doc.match(/^data:$/gm) ?? []).length, 1, 'expected one init data block');
  assert.match(doc.slice(doc.search(/^data:\n/m)), /^data:\n(?:[ \t].*\n|\n)*$/, 'unsupported init ConfigMap data layout');
  documents[index] = doc.replace(/^data:\n[\s\S]*$/m, renderInitData(source));
  return documents.join('');
}

export function checkInit(manifest, source) {
  const normalized = normalize(manifest);
  assert.equal(normalized, syncInit(manifest, source), 'deployment init drift; regenerate from canonical database bootstrap');
  assert.doesNotMatch(normalized, /\b(?:CREATE\s+(?:TABLE|TRIGGER|VIEW|PROCEDURE|FUNCTION)|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+users)\b/i, 'application SQL must live in embedded migrations');
  assert.match(normalized, /name: MYSQL_DATABASE\s+value: clawmanager\b/, 'database target mismatch');
  assert.match(normalized, /mountPath: \/docker-entrypoint-initdb\.d\b/, 'database bootstrap is not mounted');
  return true;
}

export function runInitCheck({ write = false, repository = root } = {}) {
  const source = readFileSync(resolve(repository, initSource), 'utf8');
  // Compute every change before writing, so malformed inputs cannot leave a
  // half-regenerated matrix. Existing non-init changes remain untouched.
  const changes = initTargets.map(path => {
    const absolute = resolve(repository, path);
    const before = readFileSync(absolute, 'utf8');
    const after = syncInit(before, source);
    checkInit(after, source);
    return { path, absolute, before, after };
  });
  for (const { path, absolute, before, after } of changes) {
    if (write) {
      if (before !== after) writeFileSync(absolute, after);
    } else assert.equal(normalize(before), after, `${path}: init drift`);
  }
  return { status: 'PASS', deployments: changes.length, table_ddl_in_init: false, schema_source: 'backend/internal/db/migrations', database_mutated: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.slice(2).every(arg => arg === '--write') && process.argv.length <= 3, 'usage: node scripts/system-backup-d-init-check.mjs [--write]');
    console.log(JSON.stringify(runInitCheck({ write: process.argv.includes('--write') })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
