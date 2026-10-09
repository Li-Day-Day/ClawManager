import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { captureRemoteSchemaHashCandidate, sshCommand } from './system-backup-schema-hash-ssh.mjs';

const uid = '11111111-1111-4111-8111-111111111111';
const records = [
  ['metadata', { server_version: '8.4.8', sql_mode: 'STRICT_TRANS_TABLES' }],
  ['table', { name: 'd_example' }],
  ['column', { table_name: 'd_example', name: 'id', ordinal_position: 1, normalized_type: 'bigint', nullable: 0, default: null, character_set: null, collation: null, extra: '', generation_expression: null }],
].map(([kind, data]) => `${kind}\t${JSON.stringify(data)}`).join('\n') + '\n';

function fixture(t, { changed = false, failed = false, malformed = false, mismatch = false, unknownRecord = false, failedAfter = false, passwordLogin = false } = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'd-ssh-schema-test-'));
  t.after(() => { assert.deepEqual(readdirSync(temporaryRoot), []); rmdirSync(temporaryRoot); });
  let calls = 0;
  return {
    host: 'operator@master.example', kubectlContext: 'kubernetes-admin@kubernetes', namespace: 'clawmanager-test-system', database: 'clawmanager',
    captureSql: 'SELECT 1;', temporaryRoot, passwordLogin,
    inventory: { plan_version: 'system-backup-plan.v12', objects: [{ object_type: 'table', name: mismatch ? 'missing_table' : 'd_example' }] },
    migrationCatalog: { algorithm: 'sha256-length-prefixed-filename-normalized-content-v1', hash: 'b'.repeat(64) },
    runCommand(executable, args, options) {
      calls += 1;
      assert.equal(executable, 'ssh');
      assert.equal(options.shell, false);
      assert.ok(args.includes(`BatchMode=${passwordLogin ? 'no' : 'yes'}`));
      assert.ok(args.includes('StrictHostKeyChecking=yes'));
      if (passwordLogin) {
        assert.deepEqual(options.stdio, ['pipe', 'pipe', 'inherit']);
        assert.equal(options.windowsHide, false);
        assert.equal(options.timeout, 120_000);
        assert.match(args.at(-1), / 2>\/dev\/null$/);
        assert.ok(args.includes('NumberOfPasswordPrompts=1'));
        assert.ok(args.includes('PreferredAuthentications=keyboard-interactive,password'));
      } else {
        assert.equal(options.stdio, undefined);
        assert.equal(options.windowsHide, true);
      }
      assert.ok(!args.at(-1).includes('node'));
      if (calls === 2) {
        assert.equal(options.input, 'SELECT 1;');
        assert.ok(args.at(-1).includes('MYSQL_PASSWORD'));
        return { status: failed ? 1 : 0, stdout: Buffer.from(malformed ? 'PRIVATE_BAD_RECORD' : records + (unknownRecord ? 'PRIVATE_RECORD_TYPE\t{}\n' : '')), stderr: Buffer.from('PRIVATE_REMOTE_ERROR') };
      }
      if (failedAfter && calls === 3) return { status: 1, stdout: Buffer.from('PRIVATE_UID_ERROR'), stderr: Buffer.from('PRIVATE_UID_ERROR') };
      return { status: 0, stdout: Buffer.from(changed && calls === 3 ? uid.replace(/^1/, '2') : uid) };
    },
  };
}

test('SSH capture binds installation, sends local SQL, cleans records and remains candidate', (t) => {
  const result = captureRemoteSchemaHashCandidate(fixture(t));
  assert.equal(result.installation_identity_hash, createHash('sha256').update(`k8s-namespace-uid-v1\0${uid}`).digest('hex'));
  assert.equal(result.status, 'candidate');
  assert.equal(result.inventory_comparison.matched, true);
  assert.equal(result.records_cleanup.verified_absent, true);
  assert.equal(result.registered_evidence, null);
  assert.deepEqual(result.approved_reviewers, []);
});
test('SSH capture rejects installation replacement after cleaning records', (t) => {
  assert.throws(() => captureRemoteSchemaHashCandidate(fixture(t, { changed: true })), /namespace identity changed/);
});
test('SSH capture reports inventory drift without approval', (t) => {
  const result = captureRemoteSchemaHashCandidate(fixture(t, { mismatch: true }));
  assert.equal(result.inventory_comparison.matched, false);
  assert.deepEqual(result.inventory_comparison.missing_object_keys, ['table:missing_table']);
});
test('SSH capture errors suppress private remote output and clean scratch', (t) => {
  for (const mode of [{ failed: true }, { malformed: true }, { unknownRecord: true }, { failedAfter: true }]) {
    assert.throws(() => captureRemoteSchemaHashCandidate(fixture(t, mode)), (error) => {
      assert.doesNotMatch(error.message, /PRIVATE_/);
      return true;
    });
  }
});
test('SSH host rejects option and shell injection; argv uses POSIX quoting', () => {
  for (const host of ['-oProxyCommand=bad', 'user@host;id', '$(id)', 'host/path', 'host\ncommand']) {
    assert.throws(() => sshCommand(host, ['true']), /SSH host/);
  }
  assert.equal(sshCommand('master-alias', ['sh', '-c', "printf '%s' value"]).at(-1), "'sh' '-c' 'printf '\\''%s'\\'' value'");
});

test('password login leaves prompts to SSH and pipes only SQL/output, with strict host checks', (t) => {
  const result = captureRemoteSchemaHashCandidate(fixture(t, { passwordLogin: true }));
  assert.equal(result.status, 'candidate');
  assert.equal(result.inventory_comparison.matched, true);
  assert.equal(result.records_cleanup.verified_absent, true);
  assert.deepEqual(result.approved_reviewers, []);
});

test('password login failures still reject candidates without private query diagnostics', (t) => {
  for (const mode of [{ failed: true }, { failedAfter: true }, { changed: true }]) {
    assert.throws(() => captureRemoteSchemaHashCandidate(fixture(t, { ...mode, passwordLogin: true })), (error) => {
      assert.doesNotMatch(error.message, /PRIVATE_/);
      return true;
    });
  }
});
