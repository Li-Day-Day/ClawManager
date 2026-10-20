import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const root = fileURLToPath(new URL('..', import.meta.url));
const bash = process.env.BASH_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const source = readFileSync(new URL('./system-backup-fresh-migration-smoke.sh', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('diagnose_mysql_startup() {'), source.indexOf('for tool in kubectl mktemp'));
function run(mode) {
  const script = `set -euo pipefail
CONTEXT=test; RUN_NAMESPACE=sbk-mig-test; RUN_NAMESPACE_UID=namespace-uid; TEST_NODE=node1; RUN_ID=run-id
MODE="$1"
kubectl() {
  printf 'CALL %s\\n' "$*" >&2
  case "$*" in
    *' wait pod/mysql '*) [[ "$MODE" == success ]] && return 0; return 17 ;;
    *' get namespace '*) [[ "$MODE" == namespace-drift ]] && { printf replacement; return; }; printf namespace-uid ;;
    *metadata.labels*) [[ "$MODE" == pod-drift ]] && { printf 'pod-uid other-run'; return; }; printf 'pod-uid run-id' ;;
    *' get pod mysql '*) [[ "$MODE" == diagnostic-error ]] && return 9; printf 'CONTAINER mysql waiting=ErrImageNeverPull\\n' ;;
    *' get events '*) [[ "$MODE" == diagnostic-error ]] && return 9; printf 'EVENT reason=ErrImageNeverPull\\n' ;;
    *' get node '*) [[ "$MODE" == diagnostic-error ]] && return 9; printf 'NODE_CONDITION Ready=True\\n' ;;
    *) return 99 ;;
  esac
}
${functions}
trap 'echo MOCK_CLEANUP >&2' EXIT
wait_for_mysql
echo AFTER_WAIT
`;
  const result = spawnSync(bash, ['-c', script.replaceAll('\r\n', '\n'), 'test', mode], {cwd:root, encoding:'utf8', windowsHide:true});
  if (result.error) throw result.error;
  return result;
}
test('ready MySQL continues without diagnostics', () => {
  const result = run('success');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AFTER_WAIT/);
  assert.doesNotMatch(result.stderr, /MYSQL_STARTUP_DIAGNOSTIC/);
});
test('failed wait diagnoses the original pod before cleanup and preserves exit', () => {
  const result = run('timeout');
  assert.equal(result.status, 17, result.stderr);
  assert.doesNotMatch(result.stdout, /AFTER_WAIT/);
  assert.match(result.stderr, /EVENT reason=ErrImageNeverPull/);
  assert.match(result.stderr, /--field-selector=involvedObject.uid=pod-uid/);
  assert.ok(result.stderr.indexOf('MYSQL_STARTUP_DIAGNOSTIC end') < result.stderr.indexOf('MOCK_CLEANUP'));
  const calls = result.stderr.split('\n').filter(line => line.startsWith('CALL '));
  assert.ok(calls.slice(1).every(line => line.includes('--request-timeout=10s')));
  assert.ok(calls.every(line => !/\b(logs|describe|secrets?)\b/.test(line)));
});
test('changed namespace or pod identity prevents diagnostic reads', () => {
  for (const mode of ['namespace-drift', 'pod-drift']) {
    const result = run(mode);
    assert.equal(result.status, 17, result.stderr);
    assert.doesNotMatch(result.stderr, / get events | get node |CONTAINER mysql/);
    assert.match(result.stderr, /MOCK_CLEANUP/);
  }
});
test('diagnostic API failure still preserves failed wait and cleanup', () => {
  const result = run('diagnostic-error');
  assert.equal(result.status, 17, result.stderr);
  assert.match(result.stderr, /MYSQL_STARTUP_DIAGNOSTIC end/);
  assert.match(result.stderr, /MOCK_CLEANUP/);
});
test('lightweight mode uses the production pod and exits before all SQL', () => {
  const result = spawnSync(bash, ['-n', 'scripts/system-backup-fresh-migration-smoke.sh'], {cwd:root, encoding:'utf8', windowsHide:true});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  assert.equal((source.match(/kind: Pod\nmetadata:\n  name: mysql/g) || []).length, 1);
  assert.match(source, /MySQL startup diagnostic requires an exclusive run/);
  assert.match(source, /MySQL startup diagnostic cannot run migrations/);
  assert.ok(source.indexOf('test_image_pull_policy=Never', source.indexOf('if [[ "$MYSQL_STARTUP_ONLY"')) > 0);
  assert.match(source, /wait_for_mysql\r?\nif \[\[ "\$MYSQL_STARTUP_ONLY" == 1 \]\]; then[\s\S]*?MYSQL_STARTUP_PASS[\s\S]*?exit 0\r?\nfi\r?\n\r?\nmysql_query\(\)/);
});
