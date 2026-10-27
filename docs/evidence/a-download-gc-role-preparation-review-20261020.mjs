import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const evidence=path.join(root,'docs/evidence');
const base='a-download-gc-role-20261020-r2';
const read=name=>fs.readFileSync(path.join(evidence,name));
const normalized=b=>b.toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const checks=[];
function check(name,ok){assert(ok,name);checks.push(name);}
const sourceBytes=read(base+'-source.json');
const source=JSON.parse(normalized(sourceBytes));
const logBytes=read(base+'-native.txt');
const log=normalized(logBytes);
check('stable offline unapproved source',source.stable_copy_verified===true&&source.dependencies_installed===false&&source.production_approved===false);
check('source logical SHA recomputed',sha(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===source.source_sha256);
check('source bound to local gate',log.includes(`source_sha256=${source.source_sha256} files=${source.files.length}`));
check('no Go assertion failure skip or panic',!/^\s*--- (FAIL|SKIP):|^panic:|^fatal error:/m.test(log));
const toolCrashes=[...log.matchAll(/(?:vet|asm|compile)\.exe: exit status 0xc000(?:0043|026b)/g)].length;
const toolRetries=[...log.matchAll(/Windows vet\/asm\/compile process exited with a known tool crash; retrying the SAME/g)].length;
const buildFailures=[...log.matchAll(/^FAIL(?:[ \t]+[^\n]+)?[ \t]*$/gm)];
check('only explicitly recorded pre-test compiler failure may precede successful retry',buildFailures.length===0||(toolCrashes>0&&toolRetries>0&&buildFailures.every(m=>m.index<log.indexOf('=== RUN')&&(m[0]==='FAIL'||m[0].endsWith('[build failed]')))));
const summaries=[...log.matchAll(/^ok\s+(\S+)\s+([0-9.]+s)\s*$/gm)];
check('two ordinary packages and tagged seed package',JSON.stringify(summaries.map(m=>m[1]))===JSON.stringify(['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupevidence']));
function paired(label,part){
  const ran=[...part.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m=>m[1]).sort();
  const passed=[...part.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]).sort();
  check(label+' unique complete RUN/PASS',new Set(ran).size===ran.length&&ran.length>0&&JSON.stringify(ran)===JSON.stringify(passed));
  return {roots:passed.filter(p=>!p.includes('/')).length,all:passed.length,names:passed};
}
let offset=0;
const stages=summaries.map((summary,index)=>{
  const result=paired('stage '+index,log.slice(offset,summary.index));
  offset=summary.index+summary[0].length;
  return {package:summary[1],...result};
});
const seedNames=['TestADownloadGCRoleMySQLSeed','TestASensitiveDownloadMFAMySQLSeed',...['actual_config_required_cells','duplicate','unknown','trailing','catalog','ddl','budget'].map(n=>'TestASensitiveDownloadMFAMySQLSeed/'+n)].sort();
check('tagged seed exact two roots nine checks',JSON.stringify(stages[2].names)===JSON.stringify(seedNames));
const detachedEnd=log.indexOf('LOCAL_PASS config-standalone-seed=yes',offset);
check('standalone seed gate present',detachedEnd>offset);
const detached=paired('detached seed',log.slice(offset,detachedEnd));
check('empty-directory binary exact two roots nine checks',JSON.stringify(detached.names)===JSON.stringify(seedNames));
for(const marker of [
  'LOCAL_PASS isolated-go-telemetry=off',
  'VALIDATION_SCOPE download-gc-role-only=yes isolated-candidate-accounts=yes privileged-metadata-observer=yes maintenance=absent full-gc=not-run role-approval=no production-approval=no real_mysql=not_run',
  'PASS download-gc-role-dispatch:',
  'LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=False',
  'CLEANED local-registration-build-cache=True',
  'a_download_gc_role_local_exit=0',
  'Windows PowerShell',
])check(marker,log.includes(marker));
check('local gate never started namespace or actual SQL root',!/^RUN namespace=|^=== RUN\s+TestADownloadGCRoleMySQL(?:\s|\/)/m.test(log));
const probe=log.match(/^LOCAL_PASS a-download-gc-role-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/m);
const runner=log.match(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/m);
check('Linux probe and migration runner compiled and pinned',!!probe&&!!runner);
check('input capsule hash current',probe[2]===sha(fs.readFileSync(path.join(root,'backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json'))));
const owner=log.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)?.[1].trim();
check('exact source cache binary owner absent',!!owner&&path.dirname(path.resolve(owner))===root&&/^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner))&&!fs.existsSync(owner));
check('owned source cleanup logged',log.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));
const current=normalized(read(base+'-current-files.txt')).trim().split('\n');
check('current source file set equals frozen set',JSON.stringify(current.toSorted())===JSON.stringify(source.files.map(p=>p.path).toSorted()));
for(const pin of source.files){
  const target=path.resolve(root,pin.path);
  check('current source pin '+pin.path,target.startsWith(root+path.sep)&&fs.existsSync(target)&&fs.statSync(target).size===pin.size&&sha(fs.readFileSync(target))===pin.sha256);
}
const fixture=fs.readFileSync(path.join(root,'backend/internal/systembackupevidence/download_gc_role_a_mysql_test.go'),'utf8');
check('seed validates actual shared early hint',fixture.includes('validGCEarlyScope(source.c, aGCRoleHint(source.c))')&&fixture.includes('x.hint = aGCRoleHint(x.c)')&&!fixture.includes('"sbo_'));
check('SQL errors exclude raw queries and secrets',fixture.includes('mysql_errno=%d')&&!fixture.includes('t.Fatal(err)')&&!fixture.includes('t.Fatal(e)'));
const caseBlock=fixture.match(/var aGCRoleCases = \[\]string\{([\s\S]*?)\n\}/)?.[1];
const cases=[...caseBlock.matchAll(/"([a-z_]+)"/g)].map(m=>m[1]);
check('ten actual SQL cases pending, unique names',cases.length===10&&new Set(cases).size===10);
const transportName='a-download-gc-role-transport-20261020-r2.txt';
const transport=normalized(read(transportName));
check('two PowerShell versions six profiles each and two Bash parses',transport.includes('TRANSPORT_PASS powershell_versions=2 profiles_each=6 bash_syntax=2 postcheck=yes remote=no build=no')&&[...transport.matchAll(/^TRANSPORT_SHELL_PASS /gm)].length===2);
const transportPins=[...transport.matchAll(/^TRANSPORT_PIN path=(\S+) sha256=([a-f0-9]{64})$/gm)];
check('ten transport inputs bound',transportPins.length===10);
for(const [,file,digest] of transportPins)check('transport current '+file,sha(fs.readFileSync(path.join(root,file)))===digest);
const firstLogBytes=read('a-download-gc-role-20261020-r1-native.txt');
const firstLog=normalized(firstLogBytes);
const firstOwner=firstLog.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)?.[1].trim();
check('first failure retained as local vet failure before remote',firstLog.includes('missing ... in args forwarded to print-like function')&&firstLog.includes('a_download_gc_role_local_exit=1')&&!/^RUN namespace=/m.test(firstLog));
check('first source cache and binaries removed',!!firstOwner&&path.dirname(path.resolve(firstOwner))===root&&!fs.existsSync(firstOwner)&&firstLog.includes(`LOCAL_CLEANUP config-writer-source-owned=${firstOwner} removed=True`));
const report={
  kind:'a_download_gc_restricted_role_local_preparation',recorded_at:new Date().toISOString(),checks_passed:checks.length,checks,
  source_sha256:source.source_sha256,source_manifest_sha256:sha(sourceBytes),source_files:source.files.length,raw_log_sha256:sha(logBytes),transport_log_sha256:sha(read(transportName)),
  ordinary:stages.slice(0,2).map(({names,...r})=>r),ordinary_all:stages.slice(0,2).reduce((n,p)=>n+p.all,0),
  tagged_seed_checks:stages[2].all,detached_seed_checks:detached.all,
  linux_probe_sha256:probe[1],input_capsule_sha256:probe[2],linux_migration_runner_sha256:runner[1],
  windows_tool_crash_lines:toolCrashes,windows_same_command_retries:toolRetries,retained_pre_test_build_failure_lines:buildFailures.length,
  cleanup:{owner,all_owned_products_removed:true},actual_sql_cases_pending:cases,actual_mysql:false,maintenance_receipts:'absent',full_gc:false,role_approval:false,dependencies_installed:false,production_approved:false,
  first_failed_run:{log_sha256:sha(firstLogBytes),owner:firstOwner,cleaned:true,exit:1,reason:'default vet found an incorrect print-like forwarding helper in the concurrent GC-task test; the already-corrected concurrent files are included in r2'},
  superseded:'r1 also used earlier probe fixture bytes; only r2 is accepted for the final probe. r1 remains a failed local run and is not SQL evidence.',
  scope:'Offline Go regressions/default vet, two seed roots in-package and from an empty directory, Windows/Linux probe and Linux migration builds, exclusive dispatch and shell syntax. No restricted account, metadata visibility, revoke, real row lock, Collect, provider or production execution has occurred.',
};
fs.writeFileSync(path.join(evidence,'a-download-gc-role-preparation-accepted-20261020-r2.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({checks:checks.length,source_files:report.source_files,ordinary:report.ordinary,seed:report.tagged_seed_checks,detached:report.detached_seed_checks,actual_mysql:false,all_owned_products_removed:true}));
