import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const bash = process.env.BASH_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
test('history mode dispatches the pinned probe and never reports PASS on probe failure', () => {
  const scratch=mkdtempSync(join(tmpdir(),'d-history-dispatch-'));
  try {
    for(const [mode,exitCode,expectedName] of [['0','0','TestDDatabaseInvariants'],['1','0','TestDReviewedHistoryMySQL'],['1','42','TestDReviewedHistoryMySQL']]) {
      const stub='#!/usr/bin/env bash\nif [ "$1" = -test.list ]; then\n  case "$2" in *ReviewedHistory*) echo TestDReviewedHistoryMySQL;; *) echo TestDDatabaseInvariants;; esac\n  exit 0\nfi\nprintf "%s|%s\\n" "$D_HISTORY_REVIEW_SMOKE" "$*" > "$MOCK_DISPATCH"\nexit "$MOCK_PROBE_EXIT"\n';
      writeFileSync(join(scratch,'probe'),stub);
      writeFileSync(join(scratch,'remote-probe'),stub);
      const hash=createHash('sha256').update(stub).digest('hex');
      const result=spawnSync(bash,['-c',`set -euo pipefail
export MOCK_EXECUTABLE="$(cd "$1" && pwd)/remote-probe"
chmod +x "$MOCK_EXECUTABLE"
kubectl() {
  case "$*" in
    *"get namespace"*) printf '%s' "$RUN_NAMESPACE_UID";;
    *"get pod migration-app"*) printf '%s' "$RUN_ID";;
    *"delete pod migration-app"*) return 0;;
    *"exec pod/mysql -- uname -m"*) echo x86_64;;
    *"exec -i pod/mysql"*) cat >/dev/null;;
    *"exec pod/mysql -- sh -c"*)
      while [ "$1" != -- ]; do shift; done
      shift; shift; shift
      program="$1"; shift
      case "$program" in
        *"/tmp/d-invariants.test"*)
          remote_path=/tmp/d-invariants.test
          program="\${program//$remote_path/$MOCK_EXECUTABLE}"
          bash -c "$program" "$@";;
        *"SET GLOBAL time_zone"*) return 0;;
        *) return 99;;
      esac;;
    *) return 99;;
  esac
}
mysql_query() { return 0; }
RUN_ID=260923120000-abcd
RUN_NAMESPACE=sbk-mig-$RUN_ID
RUN_NAMESPACE_UID=11111111-1111-4111-8111-111111111111
CONTEXT=test
EXPECTED_CATALOG_HASH=${'b'.repeat(64)}
D_INVARIANT_BINARY="$1/probe"
source scripts/system-backup-d-invariants-phase.sh
`,'test',scratch.replaceAll('\\','/')],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,D_INVARIANT_BINARY_SHA256:hash,D_HISTORY_REVIEW_SMOKE:mode,MOCK_DISPATCH:join(scratch,'dispatch.txt').replaceAll('\\','/'),MOCK_PROBE_EXIT:exitCode}});
      if(result.error)throw result.error;
      assert.equal(result.status===0,exitCode==='0',result.stderr);
      const dispatch=readFileSync(join(scratch,'dispatch.txt'),'utf8');
      assert.ok(dispatch.startsWith(mode+'|'),dispatch);
      assert.ok(dispatch.includes('^'+expectedName+'$'),dispatch);
      assert.equal(result.stdout.includes(mode==='1'?'PASS d-reviewed-history':'PASS d-database-invariants'),exitCode==='0',result.stdout);
    }
  } finally { rmSync(scratch,{recursive:true,force:true}); }
});

test('remote phase rejects changed binary/namespace/pod ownership before any mutation', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'd-invariant-negative-'));
  try {
    mkdirSync(join(scratch,'bin'));
    writeFileSync(join(scratch,'probe'), 'synthetic binary: never executed');
    writeFileSync(join(scratch,'bin','kubectl'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$MOCK_LOG"
case "$*" in
  *"get namespace"*) printf '%s' "$MOCK_NAMESPACE_UID";;
  *"get pod migration-app"*) printf '%s' "$MOCK_POD_RUN";;
  *) echo 'unexpected kubectl mutation' >&2; exit 99;;
esac
`);
    const hash = createHash('sha256').update(readFileSync(join(scratch,'probe'))).digest('hex');
    const uid = '11111111-1111-4111-8111-111111111111';
    for (const [name,pin,actualUID,podRun,message,calls] of [
      ['binary','0'.repeat(64),uid,'260923120000-abcd',/probe checksum mismatch/,0],
      ['namespace',hash,'22222222-2222-4222-8222-222222222222','260923120000-abcd',/namespace UID changed/,1],
      ['pod',hash,uid,'different-run',/migration app ownership mismatch/,2],
    ]) {
      const log = join(scratch,`${name}.log`).replaceAll('\\','/');
      const result = spawnSync(bash,['-c',`set -euo pipefail
mock_dir="$(cd "$1" && pwd)"
chmod +x "$mock_dir/bin/kubectl"
export PATH="$mock_dir/bin:$PATH"
export MOCK_LOG="$2"
RUN_ID=260923120000-abcd
RUN_NAMESPACE=sbk-mig-$RUN_ID
RUN_NAMESPACE_UID=${uid}
CONTEXT=test
D_INVARIANT_BINARY="$1/probe"
source scripts/system-backup-d-invariants-phase.sh
`,'test',scratch.replaceAll('\\','/'),log],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,D_INVARIANT_BINARY_SHA256:pin,MOCK_NAMESPACE_UID:actualUID,MOCK_POD_RUN:podRun}});
      if(result.error) throw result.error;
      assert.notEqual(result.status,0,name);
      assert.match(result.stderr,message,name);
      const lines=existsSync(log)?readFileSync(log,'utf8').trim().split('\n'):[];
      assert.equal(lines.length,calls,name);
      assert.ok(lines.every(line=>! /\b(delete|exec|create|apply|patch)\b/.test(line)),name);
    }
  } finally { rmSync(scratch,{recursive:true,force:true}); }
});

test('image phase reports success only for a finished successful probe with logs and identity', () => {
  const scratch=mkdtempSync(join(tmpdir(),'d-probe-image-phase-'));
  const imageRef=`registry.example:5000/d-probe@sha256:${'a'.repeat(64)}`;
  try {
    for(const [exitCode,logsExit,identity,success] of [
      ['0','0','containerd://sha256:'+ 'a'.repeat(64),true],
      ['1','0','containerd://sha256:'+ 'a'.repeat(64),false],
      ['0','77','containerd://sha256:'+ 'a'.repeat(64),false],
      ['0','0','',false],
    ]) {
      const result=spawnSync(bash,['-c',`set -euo pipefail
source scripts/system-backup-smoke-contract.sh
kubectl() {
  case "$*" in
    *"create -f"*) cat > "$MOCK_SPEC";;
    *"terminated.exitCode"*) printf '%s' "$MOCK_EXIT";;
    *"imageID"*) printf '%s' "$MOCK_ID";;
    *"logs pod/"*) echo 'synthetic probe log'; return "$MOCK_LOG_EXIT";;
    *) echo 'unexpected mocked kubectl call' >&2; return 99;;
  esac
}
RUN_ID=260923120000-abcd
RUN_NAMESPACE=sbk-mig-$RUN_ID
RUN_NAMESPACE_UID=11111111-1111-4111-8111-111111111111
CONTEXT=test
TEST_NODE=node1
mysql_ip=10.1.2.3
EXPECTED_CATALOG_HASH=${'b'.repeat(64)}
source scripts/system-backup-d-invariants-image-phase.sh
`],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,D_INVARIANT_IMAGE:imageRef,MOCK_SPEC:join(scratch,'pod.yaml').replaceAll('\\','/'),MOCK_EXIT:exitCode,MOCK_ID:identity,MOCK_LOG_EXIT:logsExit}});
      if(result.error)throw result.error;
      assert.equal(result.status===0,success,result.stderr);
      assert.equal(result.stdout.includes('PASS d-database-invariants'),success);
      const spec=readFileSync(join(scratch,'pod.yaml'),'utf8');
      assert.ok(spec.includes(`image: ${imageRef}`));
      assert.match(spec,/automountServiceAccountToken: false/);
      assert.match(spec,/D_INVARIANT_MYSQL_HOST, value: "10\.1\.2\.3"/);
      assert.match(spec,/secretKeyRef: \{name: migration-db, key: mysql-password\}/);
      assert.match(spec,/podSelector: \{matchLabels: \{app: mysql\}\}/);
    }
  }finally{rmSync(scratch,{recursive:true,force:true});}
});
