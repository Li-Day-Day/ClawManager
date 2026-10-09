import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { identityHash, passLine, normalizeProbeInput, identitySSHCommand, runIdentityProbe } from './system-backup-a-identity-ssh.mjs';

const output = `probe_started_at=2026-09-23T08:11:58Z
probe_finished_at=2026-09-23T08:11:59Z
installation_identity_hash=${identityHash}
authenticated_subject_hash=2ab5b50639ef8b442162959a649780159c93c6df126378aea952ee1b392dc795
config_rows=0
active_installations=0
tls_verification_enabled=true
namespace_identity_stable=true
temporary_artifacts_created=false
historical_candidate_authenticated=false
evidence_registered=false
${passLine}
`;
const bytes = readFileSync(new URL('./system-backup-a-identity-readonly-probe.sh', import.meta.url));
const run = (response, options = {}) => runIdentityProbe({ host: 'root@10.130.14.23', scriptBytes: bytes, runCommand: () => response, ...options });

test('byte input normalizes CRLF, lone CR, BOM and PowerShell trailing CR without adding another line', () => {
  for (const input of ['printf test\n', 'printf test\r\n', 'printf test\n\r\n', '\ufeffprintf test\r\n\r\n']) {
    assert.deepEqual(normalizeProbeInput(Buffer.from(input)), Buffer.from('printf test\n'));
  }
  assert.throws(() => normalizeProbeInput(Buffer.from([0xff])));
  assert.throws(() => normalizeProbeInput(Buffer.from('bad\0input')));
});

test('password and key SSH modes pipe exact bytes without shell, preserve host verification and leave passwords to console', () => {
  for (const passwordLogin of [false, true]) {
    let called = false;
    assert.equal(run({ status: 0, stdout: Buffer.from(output) }, { passwordLogin, scriptBytes: Buffer.from('printf test\r\n\r\n'), runCommand(executable, args, options) {
      called = true;
      assert.equal(executable, 'ssh');
      assert.equal(args.at(-2), 'root@10.130.14.23');
      assert.equal(args.at(-1), 'bash --noprofile --norc -s');
      assert.ok(args.includes('StrictHostKeyChecking=yes'));
      assert.ok(args.includes(`BatchMode=${passwordLogin ? 'no' : 'yes'}`));
      if (passwordLogin) assert.ok(args.includes('NumberOfPasswordPrompts=1'));
      assert.equal(options.shell, false);
      assert.equal(options.timeout, 120_000);
      assert.equal(options.windowsHide, !passwordLogin);
      assert.deepEqual(options.stdio, ['pipe', 'pipe', passwordLogin ? 'inherit' : 'pipe']);
      assert.deepEqual(options.input, Buffer.from('printf test\n'));
      return { status: 0, stdout: Buffer.from(output) };
    } }), output);
    assert.equal(called, true);
  }
});

test('PASS with exit 127, authentication failure, timeout or signal never becomes successful evidence', () => {
  for (const response of [{ status: 127 }, { status: 255 }, { status: 0, signal: 'SIGTERM' }, { status: 0, error: new Error('SYNTHETIC_PRIVATE') }]) {
    assert.throws(() => run({ stdout: Buffer.from(output), ...response }), error => {
      assert.match(error.message, /no successful result accepted/); assert.doesNotMatch(error.message, /SYNTHETIC_PRIVATE/); return true;
    });
  }
});

test('exit zero still rejects missing, duplicate, unexpected or conflicting output fields', () => {
  for (const bad of [output.replace(passLine, ''), output + 'PRIVATE_UNEXPECTED\n', output.replace('config_rows=0', 'config_rows=secret'), output.replace(identityHash, 'b'.repeat(64)), output.replace('namespace_identity_stable=true', 'namespace_identity_stable=false'), output.replace('evidence_registered=false', 'evidence_registered=true'), output.replace('config_rows=0', 'active_installations=0')]) {
    assert.throws(() => run({ status: 0, stdout: Buffer.from(bad) }), /output rejected/);
  }
});

test('host rejects backslash, option and shell injection', () => {
  for (const host of ['root\\@10.130.14.23', '-oProxyCommand=bad', 'host;id', '$(id)', 'host\nother']) assert.throws(() => identitySSHCommand(host));
});
