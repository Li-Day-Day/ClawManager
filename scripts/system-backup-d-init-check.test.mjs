import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkInit, initSource, initTargets, renderInitData, runInitCheck, syncInit } from './system-backup-d-init-check.mjs';

const read = path => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
const source = read(initSource);
test('all four profiles and production site use database-only init', () => {
  assert.equal(runInitCheck().deployments, 5);
  for (const target of initTargets) assert.equal(checkInit(read(target), source), true);
});
test('regeneration preserves surrounding workload documents and is idempotent', () => {
  const before = 'kind: Secret\ndata:\n  unrelated: keep\n---\nkind: ConfigMap\nmetadata:\n  name: clawmanager-mysql-init\n  namespace: custom\ndata:\n  stale.sql: |\n    CREATE TABLE stale(id INT);\n---\nkind: Deployment\nmetadata:\n  name: keep\n';
  const after = syncInit(before, source);
  assert.equal(after, before.replace('data:\n  stale.sql: |\n    CREATE TABLE stale(id INT);\n', renderInitData(source)));
  assert.equal(syncInit(after, source), after);
  assert.equal(syncInit(after.replaceAll('\n', '\r\n'), source), after);
});
test('drift, second init target, application SQL and wrong database are rejected', () => {
  const manifest = read(initTargets[0]);
  assert.throws(() => checkInit(manifest.replace('000_database.sql:', '001_wrong.sql:'), source));
  assert.throws(() => syncInit(manifest + '\n---\nkind: ConfigMap\nmetadata:\n  name: clawmanager-mysql-init\ndata:\n', source));
  assert.throws(() => checkInit(manifest + '\n# CREATE TABLE unexpected(id INT);\n', source));
  assert.throws(() => checkInit(manifest.replace(/value: clawmanager\b/, 'value: wrong_database'), source));
  assert.throws(() => renderInitData(source + '\nINSERT INTO users VALUES (1);'));
});
test('core initializes the embedded ledger before serving and keeps seeds in migrations', () => {
  const db = read('backend/internal/db/db.go');
  assert.match(db, /func Initialize[\s\S]*applyEmbeddedMigrations\(session\)[\s\S]*Session = session/);
  const migration = read('backend/internal/db/migrations/001_init_schema.sql');
  assert.match(migration, /INSERT INTO users/);
  assert.match(migration, /INSERT INTO user_quotas/);
  assert.match(read('backend/cmd/system-backup-migrate/main.go'), /appdb\.ApplyPinnedMigrations\(/);
});
