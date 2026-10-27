import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const bash = process.env.BASH_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const hash = data => createHash('sha256').update(data).digest('hex');
const uid = '11111111-1111-4111-8111-111111111111';

// Native process boundaries are mocked. This validates fail-closed dispatch,
// not kubectl, SQL, namespaces or an actual Linux test binary.
for (const mode of ['success', 'binary-drift', 'inputs-drift', 'namespace-drift', 'marker-failure', 'upload-failure', 'probe-failure']) {
  test(`login-state phase ${mode}`, () => {
    const scratch = mkdtempSync(join(root, '.tmp-a-login-state-phase-'));
    try {
      writeFileSync(join(scratch, 'probe'), 'synthetic probe');
      writeFileSync(join(scratch, 'inputs'), 'synthetic inputs');
      const result = spawnSync(bash, ['-c', `set -uo pipefail
RUN_ID=260930120000-abcd
RUN_NAMESPACE=sbk-mig-$RUN_ID
RUN_NAMESPACE_UID=${uid}
CONTEXT=test
D_EMBEDDED_MIGRATION_COMPLETED=1
D_INVARIANT_BINARY="$1/probe"
D_PROVIDER_REGISTRATION_DDL="$1/inputs"
log="$1/calls"
mysql_query() {
  printf 'marker\\n' >> "$log"
  [ "$MODE" != marker-failure ]
}
kubectl() {
  case "$*" in
    *"get namespace"*)
      if [ "$MODE" = namespace-drift ]; then printf '22222222-2222-4222-8222-222222222222'; else printf '%s' "$RUN_NAMESPACE_UID"; fi;;
    *"exec pod/mysql -- uname -m"*) echo x86_64;;
    *"exec -i pod/mysql"*)
      printf 'upload\\n' >> "$log"
      cat >/dev/null
      [ "$MODE" != upload-failure ];;
    *"exec pod/mysql -- sh -c"*)
      printf '%s\\n' "$*" >> "$log"
      [ "$MODE" != probe-failure ];;
    *) return 99;;
  esac
}
# Deliberately source in a conditional (errexit cannot protect this branch).
if source scripts/system-backup-a-login-state-phase.sh; then exit 0; else exit 7; fi
`, 'probe-test', scratch.replaceAll('\\', '/')], {
        cwd: root, encoding: 'utf8', windowsHide: true,
        env: { ...process.env, MODE: mode,
          D_INVARIANT_BINARY_SHA256: mode === 'binary-drift' ? '0'.repeat(64) : hash('synthetic probe'),
          D_PROVIDER_REGISTRATION_DDL_SHA256: mode === 'inputs-drift' ? '0'.repeat(64) : hash('synthetic inputs') },
      });
      if (result.error) throw result.error;
      assert.equal(result.status, mode === 'success' ? 0 : 7, result.stderr);
      assert.equal(result.stdout.includes('PASS a-login-state-mysql'), mode === 'success');
      const calls = existsSync(join(scratch, 'calls')) ? readFileSync(join(scratch, 'calls'), 'utf8') : '';
      if (mode.endsWith('drift')) assert.equal(calls, '', 'identity/input failure must precede mutation');
      if (mode === 'marker-failure') assert.equal(calls, 'marker\n');
      if (mode === 'upload-failure') assert.equal(calls, 'marker\nupload\n');
      if (mode === 'success' || mode === 'probe-failure') {
        assert.ok(calls.includes('^TestALoginStateMySQL$'));
        assert.ok(calls.includes('-test.count=1 -test.timeout=180s'));
        assert.ok(calls.includes('D_PROVIDER_REGISTRATION_DDL=/tmp/a-login-state-inputs.json'));
        assert.ok(!calls.includes('TestALoginSessionsMySQL'));
      }
    } finally {
      const resolved = realpathSync(scratch);
      assert.equal(dirname(resolved), root);
      assert.match(basename(resolved), /^\.tmp-a-login-state-phase-[A-Za-z0-9]+$/);
      rmSync(resolved, { recursive: true, force: true });
      assert.ok(!existsSync(resolved));
    }
  });
}
