// Offline shell lifecycle tests. kubectl is replaced; no cluster is contacted.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root=fileURLToPath(new URL('../',import.meta.url));
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const stub=`kubectl() {
set -eu
printf '%s\\n' "$*" >> "$AAUDIT_LEDGER"
case "$*" in
 *'get pods -l app=mysql'*) echo mysql-source;;
 *'get pod mysql-source'*imageID*) echo 'mysql@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';;
 *'get pod mysql-source'*nodeName*) echo testnode;;
 *'get node'*Ready*) echo True;;
 *'get node'*metadata.labels*) echo testnode;;
 *'get node'*allocatable.pods*) echo 'A_AUDIT_NODE allocatable_pods=110 capacity_pods=110';;
 *'get node'*) echo False;;
 *'create -f - -o jsonpath='*) cat >/dev/null; if [[ "$AAUDIT_MODE" == lost_create ]];then return 1;fi; echo 11111111-2222-3333-4444-555555555555;;
 *'create -f -'*) cat >/dev/null; touch "$AAUDIT_STATE";;
 *'get namespace'*metadata.uid*)
   if [[ ( "$AAUDIT_MODE" == drift || "$AAUDIT_MODE" == wait_uid_drift ) && -f "$AAUDIT_STATE" ]];then echo 99999999-2222-3333-4444-555555555555;else echo 11111111-2222-3333-4444-555555555555;fi;;
 *'get namespace'*test-run*) echo "$AAUDIT_RUN";;
 *'get namespace'*--ignore-not-found*) if [[ "$AAUDIT_MODE" == absent_error ]];then return 1;fi;;
 *'get serviceaccount default'*) echo serviceaccount/default;;
 *'exec mysql -- uname -m'*) echo x86_64;;
 *'exec -i mysql'*) cat >/dev/null;;
 *'exec mysql'*) if [[ "$AAUDIT_MODE" == sql_error && "$*" == *-test.run* ]];then return 23;fi;;
 *'delete namespace'*) if [[ "$AAUDIT_MODE" == delete_error ]];then return 1;fi;;
 *'wait --for='*) if [[ "$AAUDIT_MODE" == wait_* || "$AAUDIT_MODE" == startup_wait ]];then return 19;fi;;
 *'get pod mysql'*metadata.uid*)
   if [[ "$AAUDIT_MODE" == wait_pod_drift ]];then echo '66666666-2222-3333-4444-555555555555 other-run';else echo "66666666-2222-3333-4444-555555555555 $AAUDIT_RUN";fi;;
 *'get pod mysql'*) echo 'A_AUDIT_POD phase=Pending node= reason=';echo 'A_AUDIT_CONDITION PodScheduled=False reason=Unschedulable';;
 *'get events'*) if [[ "$AAUDIT_MODE" == wait_api_error ]];then return 3;fi; echo 'A_AUDIT_EVENT Warning reason=FailedScheduling count=1';echo 'A_AUDIT_SCHEDULING 0/2 nodes are available: 1 Too many pods, 1 node selector mismatch';;
 *'get pods --all-namespaces'*) if [[ "$AAUDIT_MODE" == wait_api_error ]];then return 3;fi; for ((i=0;i<110;i++));do echo pod-$i;done;;
 *) echo 'unexpected mocked kubectl invocation' >&2; return 1;;
esac
}
export -f kubectl
`;
function exercise(mode) {
  const owned=mkdtempSync(join(root,'.tmp-a-live-audit-mysql-'));
  try {
    writeFileSync(join(owned,'kubectl'),stub);
    writeFileSync(join(owned,'probe.sh'),readFileSync(join(root,'scripts/system-backup-a-live-audit-mysql.sh'),'utf8').replaceAll('\r\n','\n'));
    const run='aaudit-20261022000000-'+randomBytes(4).toString('hex');
    const wrapper=`set -eu
local_dir="$1"
if command -v cygpath >/dev/null;then local_dir="$(cygpath -u "$local_dir")";fi
run="$2"
remote="/tmp/$run"
mkdir -- "$remote"
trap 'rm -f -- "$remote/probe.sh" "$remote/probe.test"; rmdir -- "$remote" 2>/dev/null || true' EXIT
cp -- "$local_dir/probe.sh" "$remote/probe.sh"
printf 'offline fake binary' > "$remote/probe.test"
mode=audit
if [[ "$3" == startup* ]];then mode=startup;rm -- "$remote/probe.test";fi
export PATH="$local_dir:$PATH" AAUDIT_RUN="$run" AAUDIT_LEDGER="$local_dir/ledger" AAUDIT_STATE="$local_dir/state" AAUDIT_MODE="$3"
source "$local_dir/kubectl"
binary_sha="$(printf '%064d' 0)"
if [[ "$mode" == audit ]];then binary_sha="$(sha256sum "$remote/probe.test" | cut -d' ' -f1)";fi
script_sha="$(sha256sum "$remote/probe.sh" | cut -d' ' -f1)"
if [[ "$3" == hash ]];then binary_sha=0000000000000000000000000000000000000000000000000000000000000000;fi
set +e
bash "$remote/probe.sh" "$run" "$binary_sha" "$script_sha" "$mode"
status=$?
set -e
[[ ! -e "$remote" ]] || { echo UPLOAD_CLEANUP_MISSING; exit 99; }
exit "$status"
`;
    const result=spawnSync(bash,['-c',wrapper,'offline-test',owned,run,mode],{encoding:'utf8',timeout:120000});
    if(result.error)throw result.error;
    let ledger='';try{ledger=readFileSync(join(owned,'ledger'),'utf8');}catch{}
    return {...result,ledger};
  } finally {
    assert.equal(dirname(resolve(owned)),resolve(root));
    assert.ok(owned.startsWith(join(root,'.tmp-a-live-audit-mysql-')));
    rmSync(owned,{recursive:true,force:true});
  }
}
test('offline shell removes its namespace and uploads after a completed mocked SQL run',()=>{
  const r=exercise('normal');assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.stdout,/A_AUDIT_CLEANUP .*absent=yes/);assert.match(r.ledger,/delete namespace aaudit-/);
  assert.doesNotMatch(r.stdout+r.stderr,/UPLOAD_CLEANUP_MISSING/);
});
test('offline shell refuses namespace deletion when its UID has changed',()=>{
  const r=exercise('drift');assert.equal(r.status,1,r.stdout+r.stderr);
  assert.match(r.stderr,/absent=unverified/);assert.doesNotMatch(r.ledger,/delete namespace/);
  assert.doesNotMatch(r.stdout+r.stderr,/UPLOAD_CLEANUP_MISSING/);
});
test('offline shell rejects changed uploads before any kubectl call and cleans them',()=>{
  const r=exercise('hash');assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(r.ledger,'');
  assert.doesNotMatch(r.stdout+r.stderr,/UPLOAD_CLEANUP_MISSING/);
});
for(const mode of ['absent_error','delete_error']) {
  test(`offline shell does not claim namespace absence after ${mode}`,()=>{
    const r=exercise(mode);assert.equal(r.status,1,r.stdout+r.stderr);
    assert.match(r.stderr,/A_AUDIT_CLEANUP .*absent=unverified/);
    assert.doesNotMatch(r.stdout,/A_AUDIT_CLEANUP .*absent=yes/);
    assert.match(r.stdout,/A_AUDIT_UPLOAD_CLEANUP absent=yes/);
  });
}
test('offline shell preserves failed SQL status and still cleans its resources',()=>{
  const r=exercise('sql_error');assert.equal(r.status,23,r.stdout+r.stderr);
  assert.match(r.stdout,/A_AUDIT_CLEANUP .*absent=yes/);
  assert.match(r.stdout,/A_AUDIT_UPLOAD_CLEANUP absent=yes/);
  assert.match(r.stdout,/A_AUDIT_REMOTE_EXIT=23/);
  assert.doesNotMatch(r.stdout,/A_AUDIT_SQL_PASS/);
});
test('offline shell recovers its namespace UID after a lost creation response',()=>{
  const r=exercise('lost_create');assert.equal(r.status,1,r.stdout+r.stderr);
  assert.match(r.stdout,/A_AUDIT_CLEANUP .*uid=11111111-2222-3333-4444-555555555555 absent=yes/);
  assert.match(r.ledger,/delete namespace aaudit-/);
  assert.doesNotMatch(r.stdout,/A_AUDIT_SQL_PASS/);
});

test('readiness failure records pod saturation before cleanup, preserves exit and never dispatches SQL',()=>{
  const r=exercise('wait_full');assert.equal(r.status,19,r.stdout+r.stderr);
  assert.match(r.stderr,/Too many pods/);assert.match(r.stderr,/allocatable_pods=110/);
  assert.match(r.stderr,/nonterminal_pods=110/);assert.match(r.stderr,/PodScheduled=False/);
  assert.match(r.stdout,/A_AUDIT_CLEANUP .*absent=yes/);assert.match(r.stdout,/A_AUDIT_REMOTE_EXIT=19/);
  assert.ok(r.ledger.indexOf('get events')<r.ledger.indexOf('delete namespace'));
  assert.doesNotMatch(r.ledger,/exec mysql|exec -i mysql| logs | describe |get secret/);
  assert.doesNotMatch(r.stdout,/A_AUDIT_SQL_PASS|A_AUDIT_STARTUP_PASS/);
});

test('diagnostic API failure does not hide the readiness failure or skip cleanup',()=>{
  const r=exercise('wait_api_error');assert.equal(r.status,19,r.stdout+r.stderr);
  assert.match(r.stderr,/nonterminal_pods=unverified/);assert.match(r.stdout,/A_AUDIT_CLEANUP .*absent=yes/);
});

for(const [mode,skipped] of [['wait_uid_drift','namespace_identity_unverified'],['wait_pod_drift','pod_identity_unverified']]) {
  test(`readiness diagnostics refuse unrelated resource identity: ${mode}`,()=>{
    const r=exercise(mode);assert.equal(r.status,mode==='wait_uid_drift'?1:19,r.stdout+r.stderr);
    assert.match(r.stderr,new RegExp(`skipped=${skipped}`));assert.doesNotMatch(r.ledger,/get events|get pods --all-namespaces/);
    if(mode==='wait_uid_drift')assert.doesNotMatch(r.ledger,/delete namespace/);
  });
}

for(const mode of ['startup','startup_wait']) {
  test(`startup-only mode uses the same Pod without a test binary or SQL dispatch: ${mode}`,()=>{
    const r=exercise(mode);assert.equal(r.status,mode==='startup'?0:19,r.stdout+r.stderr);
    assert.match(r.stdout,/A_AUDIT_CLEANUP .*absent=yes/);assert.match(r.stdout,/A_AUDIT_UPLOAD_CLEANUP absent=yes/);
    assert.doesNotMatch(r.ledger,/exec mysql|exec -i mysql/);assert.doesNotMatch(r.stdout,/A_AUDIT_SQL_PASS/);
    if(mode==='startup')assert.match(r.stdout,/A_AUDIT_STARTUP_PASS .*sql_cases=not_run/);
    else assert.match(r.stderr,/Too many pods/);
  });
}
