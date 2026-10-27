import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { normalizeProbeInput, validateIdentityOutput } from './system-backup-a-identity-ssh.mjs';

const script = fileURLToPath(new URL('./system-backup-a-identity-readonly-probe.sh', import.meta.url)).replaceAll('\\', '/');
const bash = process.env.SYSTEM_BACKUP_BASH ?? (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash');
if (!existsSync(bash)) throw new Error('Existing Bash is required; do not install dependencies');
const mock = String.raw`
kubectl() {
  case "$*" in
    *'config current-context'*) if [[ "$CASE" == context ]]; then printf 'wrong'; else printf 'kubernetes-admin@kubernetes'; fi ;;
    *'insecure-skip-tls-verify'*) if [[ "$CASE" == tls ]]; then printf 'true'; else printf 'false'; fi ;;
    *'cluster.server'*) printf 'https://SYNTHETIC_PRIVATE_ENDPOINT' ;;
    *'get namespace'*) if [[ "$CASE" == uid ]]; then printf 'wrong-namespace'; else printf '337cfe30-2c17-4b8e-b32a-760778b8098e'; fi ;;
    *'auth whoami'*) if [[ "$CASE" == whoami ]]; then printf 'SYNTHETIC_PRIVATE_ERROR' >&2; return 1; else printf 'SYNTHETIC_PRIVATE_ACTOR'; fi ;;
    *'exec deploy/mysql'*) if [[ "$CASE" == sql_error ]]; then printf 'SYNTHETIC_PRIVATE_DB_ERROR' >&2; return 1; elif [[ "$CASE" == counts ]]; then printf '0\t0\nSYNTHETIC_PRIVATE_RESPONSE'; else printf '0\t0'; fi ;;
    *) printf 'unexpected command' >&2; return 91 ;;
  esac
}
export -f kubectl
source "$1"
`;

test('read-only identity script parses without executing kubectl', () => {
  const result = spawnSync(bash, ['--noprofile', '--norc', '-n', script], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
});

test('identity probe accepts authenticated TLS context and rejects unsafe or malformed observations', () => {
  for (const scenario of ['valid', 'context', 'tls', 'uid', 'whoami', 'counts', 'sql_error']) {
    const result = spawnSync(bash, ['--noprofile', '--norc', '-c', mock, 'a-readonly-test', script], {
      encoding: 'utf8', timeout: 10000, env: { ...process.env, CASE: scenario },
    });
    assert.ifError(result.error);
    assert.equal(result.status, scenario === 'valid' ? 0 : 1, `${scenario}: ${result.stderr}`);
    assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_PRIVATE/);
    if (scenario === 'valid') {
      assert.match(result.stdout, /config_rows=0\nactive_installations=0/);
      assert.match(result.stdout, /historical_candidate_authenticated=false/);
      assert.match(result.stdout, /PASS: A current-context identity/);
    } else assert.doesNotMatch(result.stdout, /PASS:/);
  }
});

test('Bash rejects a CR command after PASS, and direct normalized byte input exits zero', () => {
  const definitions = mock.replace('source "$1"', '');
  const source = normalizeProbeInput(readFileSync(script)).toString('utf8');
  // Git Bash's Windows text pipe can normalize CRLF before Bash sees it.
  // Materialize the CR inside Bash on Windows to exercise Linux's observed
  // command semantics; on Linux pass the original trailing CRLF directly.
  const badTail = process.platform === 'win32' ? "$'\\r'\n" : '\r\n';
  const oldInput = Buffer.from(definitions + source + badTail);
  const old = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
    input: oldInput, encoding: 'utf8', timeout: 10000, env: { ...process.env, CASE: 'valid' },
  });
  assert.ifError(old.error);
  assert.match(old.stdout, /PASS: A current-context identity/);
  assert.equal(old.status, 127, old.stderr);
  assert.match(old.stderr, /command not found/);
  const windowsInput = Buffer.from((definitions + source).replaceAll('\n', '\r\n') + '\r\n');
  const fixed = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
    input: normalizeProbeInput(windowsInput), encoding: 'utf8', timeout: 10000, env: { ...process.env, CASE: 'valid' },
  });
  assert.ifError(fixed.error);
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.equal(validateIdentityOutput(Buffer.from(fixed.stdout)), fixed.stdout);
});
