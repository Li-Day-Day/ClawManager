import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw = p => fs.readFileSync(path.join(workspace,p));
const read = p => decode(raw(p));
const inputNames = ['scripts/system-backup-d-node-pod-capacity.sh','scripts/system-backup-mysql-startup-diagnostic.ps1','scripts/system-backup-d-node-pod-capacity.test.mjs','scripts/system-backup-d-node-pod-capacity-dispatch.test.ps1','scripts/system-backup-mysql-startup.test.mjs','scripts/system-backup-fresh-migration-smoke.sh'];
const inputs = inputNames.map(p => {const b=raw(p);return {path:p,size:b.length,sha256:sha256(b)};});
const files = [];
const evidence = name => {const p='docs/evidence/'+name;const b=raw(p);files.push({path:p,size:b.length,sha256:sha256(b)});return decode(b);};
const tests = evidence('d-node-pod-capacity-tests-20261020-r2.txt');
assert.match(tests, /tests 13\r?\n/);assert.match(tests, /pass 13\r?\n/);assert.match(tests, /fail 0\r?\n/);assert.match(tests, /skipped 0\r?\n/);
const names = [...tests.matchAll(/^✔ (.+) \([0-9.]+ms\)$/gm)].map(m=>m[1]);
assert.equal(names.length,13);assert.equal(new Set(names).size,13);
assert.doesNotMatch(tests, /✖|AssertionError|not ok/);
for(const version of ['pwsh5','pwsh7']){
  const t=evidence(`d-node-pod-capacity-dispatch-${version}-20261020-r3.txt`);
  assert.equal((t.match(/^PASS node-pod-capacity-dispatch:/gm)||[]).length,2);assert.doesNotMatch(t,/Exception|At C:|throw /);
}
const validation=evidence('d-node-pod-capacity-local-validation-20261020-r1.txt');
assert.equal((validation.match(/^PASS offline-wrapper /gm)||[]).length,3);
const owned=[];
const normalizedBashSHA=sha256(Buffer.from(read('scripts/system-backup-d-node-pod-capacity.sh'),'utf8'));
for(const mode of ['pwsh5-capacity','pwsh7-capacity','pwsh7-original-startup']){
  const t=evidence(`d-node-pod-capacity-local-${mode}-20261020-r1.txt`);
  const owner=[...t.matchAll(/^LOCAL_OWNER mysql-startup-source=(.+)$/gm)];assert.equal(owner.length,1);
  const p=owner[0][1].trim();assert.equal(path.dirname(path.resolve(p)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(p),/^\.tmp-a-mysql-startup-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(p),false);owned.push({path:p,exists:false});
  assert.match(t,/^CLEANED mysql-startup-local=True$/m);assert.match(t,/^mysql_startup_diagnostic_exit=0 sql_cases=not_run$/m);
  assert.doesNotMatch(t,/^NODE_POD_CAPACITY context=|CLEANUP_PENDING|Exception/m);
  if(mode.endsWith('capacity')){
    assert.ok(t.includes(`NODE_POD_CAPACITY_PREPARED files=1 source_sha256=${normalizedBashSHA} build=not_run sql_cases=not_run cluster_writes=no scheduler_fit=not_verified`));
    assert.doesNotMatch(t,/MYSQL_STARTUP_PREPARED/);
  }else assert.match(t,/^MYSQL_STARTUP_PREPARED files=98 bundle_sha256=[a-f0-9]{64} build=not_run sql_cases=not_run$/m);
}
assert.equal(new Set(owned.map(p=>p.path)).size,3);
const rejected = ['d-node-pod-capacity-tests-20261020-r1.txt',...['pwsh5','pwsh7'].flatMap(v=>[1,2].map(n=>`d-node-pod-capacity-dispatch-${v}-20261020-r${n}.txt`))];
for(const name of rejected){const t=evidence(name);assert.match(t,/fail 6|Ambiguous preparation plan|Ambiguous early read-only branch/);}
const record={
  kind:'d_node_pod_capacity_read_only_local_preparation',recorded_at:new Date().toISOString(),
  inputs_recorded_after_checks:inputs,normalized_capacity_script_sha256:normalizedBashSHA,evidence_files:files,
  accepted_bash_checks:13,capacity_checks:8,existing_startup_checks:5,test_names:names,
  powershell_dispatch:{pwsh5:2,pwsh7:2},offline_native_wrappers:['pwsh5-capacity','pwsh7-capacity','pwsh7-original-startup'],
  owned_cleanup:owned,failed_attempts_preserved:rejected,
  failed_attempt_reason:'Initial test observers counted stub calls on stderr suppressed by the production script, and AST selectors included additive/conditional assignments. Tests now observe a separate descriptor and select the actual initial plan/early dispatch branch. The original failed logs remain.',
  dependencies_installed:false,go_build:false,go_tests:false,ssh_run:false,actual_sql_cases:0,cluster_writes:false,live_capacity_verified:false,
  scheduler_fit:'not_verified',production_approved:false,whole_worktree_verified:false,
  reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
  scope:'Read-only node allocatable and bound-pod phase observations; API errors/malformed values do not become empty/free capacity. Local stubbed Bash, both PowerShell parsers/dispatch and no-Remote wrappers only. This is not a live scheduler/admission, MySQL, capacity-remediation or deployment acceptance.'
};
const output=path.join(workspace,'docs/evidence/d-node-pod-capacity-preparation-20261020.json');
if(process.argv.includes('--check')){const saved=JSON.parse(fs.readFileSync(output,'utf8'));record.recorded_at=saved.recorded_at;assert.deepEqual(record,saved);}
else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:'accepted_local_read_only_preparation',checks:13,powershell_versions:2,offline_wrappers:3,owned_scratch_absent:3,ssh_run:false,sql_cases:0}));
