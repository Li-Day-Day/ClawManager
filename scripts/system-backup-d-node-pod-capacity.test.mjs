import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const bash = process.env.BASH_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const source = readFileSync(new URL('./system-backup-d-node-pod-capacity.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
// Every API call is a function stub. There is no fallback to a real kubectl.
const stub = `
exec 3>&2
kubectl() {
  printf 'CALL %s\\n' "$*" >&3
  [[ "$1" == '--context=kubernetes-admin@kubernetes' && "$2" == '--request-timeout=10s' && "$3" == get ]] || return 98
  if [[ "$4" == node ]]; then
    [[ "$#" == 7 && "$5" == node1 && "$6" == -o && "$7" == 'jsonpath={.status.allocatable.pods}' ]] || return 97
    [[ "$MOCK_FAIL" != node ]] || return 19
    printf '%s' "$MOCK_LIMIT"
  elif [[ "$4" == pods ]]; then
    [[ "$#" == 8 && "$5" == --all-namespaces && "$6" == --field-selector=spec.nodeName=node1 && "$7" == -o && "$8" == 'jsonpath={range .items[*]}{"P|"}{.status.phase}{"\\n"}{end}' ]] || return 96
    [[ "$MOCK_FAIL" != pods ]] || return 23
    printf '%s' "$MOCK_ROWS"
  else
    return 95
  fi
}
`;
function run({limit = '110', rows = '', fail = '', args = ['kubernetes-admin@kubernetes', 'node1']} = {}) {
  const result = spawnSync(bash, ['-s', '--', ...args], {
    cwd: root, input: stub + source, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: {...process.env, MOCK_LIMIT: limit, MOCK_ROWS: rows, MOCK_FAIL: fail}
  });
  if (result.error) throw result.error;
  return result;
}
function good(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.match(result.stdout, /read_only=yes scheduler_fit=not_verified/);
  assert.equal(result.stderr.split('\n').filter(s => s.startsWith('CALL ')).length, 2);
  return result.stdout;
}
test('stdin entry counts phases including final unreported phase without printing pod bodies', () => {
  const output = good(run({rows: 'P|Pending\nP|Running\nP|Running\nP|Succeeded\nP|Failed\nP|Unknown\nP|\n'}));
  assert.match(output, /allocatable=110 bound=7 nonterminal=5 pending=1 running=2 terminal=2 unknown_or_unreported=2 /);
});
test('empty successful list is distinguished from failed API query', () => {
  assert.match(good(run()), /bound=0 nonterminal=0 pending=0 running=0 terminal=0 unknown_or_unreported=0 /);
  const failed = run({fail: 'pods'});
  assert.equal(failed.status, 1); assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /stage=pod_phases/);
});
test('110 running plus 57 terminal records remains an observation, never a scheduling approval', () => {
  const output = good(run({rows: 'P|Running\n'.repeat(110) + 'P|Succeeded\n'.repeat(57)}));
  assert.match(output, /allocatable=110 bound=167 nonterminal=110 pending=0 running=110 terminal=57 /);
  assert.doesNotMatch(output, /free=|available=|PASS|fit=yes|approval=yes/);
});
test('zero allocatable is valid and still not an admission decision', () => {
  assert.match(good(run({limit: '0', rows: 'P|Pending\n'})), /allocatable=0 bound=1 nonterminal=1 pending=1 /);
});
test('failed node query stops before pod query and prints no success observation', () => {
  const result = run({fail: 'node'});
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.match(result.stderr, /stage=node_allocatable/);
  assert.equal(result.stderr.split('\n').filter(s => s.startsWith('CALL ')).length, 1);
});
test('missing, signed, fractional, padded and excessive allocatable values fail closed', () => {
  for (const limit of ['', '-1', '+1', '1.5', '01', '110\nother', '1000000000']) {
    const result = run({limit});
    assert.equal(result.status, 1, limit); assert.equal(result.stdout, '', limit);
    assert.match(result.stderr, /stage=invalid_allocatable/);
    assert.equal(result.stderr.split('\n').filter(s => s.startsWith('CALL ')).length, 1);
  }
});
test('malformed API rows and unexpected phases are not ignored or echoed', () => {
  for (const rows of ['private-pod secret-value', 'P|Running\nprivate-pod', 'P|Surprise', 'P|Running\nP|secret-value']) {
    const result = run({rows});
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.match(result.stderr, /stage=invalid_(?:pod_row|phase)/);
    assert.doesNotMatch(result.stderr, /private-pod|secret-value|Surprise/);
  }
});
test('invalid context/node and missing arguments are rejected before all API calls', () => {
  for (const args of [[], ['one'], ['a', 'b', 'c'], ['bad;context', 'node1'], ['ok', '-node'], ['ok', 'node1;bad']]) {
    const result = run({args});
    assert.equal(result.status, 2); assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /CALL /);
  }
});
