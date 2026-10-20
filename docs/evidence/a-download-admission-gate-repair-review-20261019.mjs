import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='a-download-admission-local-gate-repair-20261019-155958-7f3d61e7';
const evidence=path.join(root,'docs/evidence');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=suffix=>fs.readFileSync(path.join(evidence,prefix+suffix));
const checks=[];
function check(name,ok){assert(ok,name);checks.push(name);}
const manifestBytes=read('-source.json');
const source=JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/,''));
const transcript=read('-native.txt').toString('utf8').replaceAll('\r\n','\n');
check('frozen logical source hash recomputed',sha(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===source.source_sha256);
check('stable copy without dependencies or production approval',source.stable_copy_verified===true&&source.dependencies_installed===false&&source.production_approved===false);
check('exact frozen input bound to transcript',transcript.includes(`FROZEN files=${source.files.length} sha256=${source.source_sha256}`));
const parseJSONLines=b=>b.toString('utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
function verifyEvents(events,label){
  check(label+' has no failed/skipped action',!events.some(e=>e.Action==='fail'||e.Action==='skip'));
  const ran=events.filter(e=>e.Action==='run'&&e.Test).map(e=>e.Package+'\0'+e.Test).sort();
  const passed=events.filter(e=>e.Action==='pass'&&e.Test).map(e=>e.Package+'\0'+e.Test).sort();
  check(label+' unique RUN/PASS paired',ran.length>0&&new Set(ran).size===ran.length&&JSON.stringify(ran)===JSON.stringify(passed));
  return passed;
}
const ordinary=parseJSONLines(read('.jsonl'));
const ordinaryPass=verifyEvents(ordinary,'ordinary packages');
const packagePass=ordinary.filter(e=>e.Action==='pass'&&!e.Test).map(e=>e.Package).sort();
check('both full packages passed',JSON.stringify(packagePass)===JSON.stringify(['clawreef/internal/systembackupevidence','clawreef/internal/systembackupsecurity']));
const group=ordinaryPass.filter(p=>p.split('\0')[1].startsWith('TestDownloadRetentionGroup'));
check('original failing expired authority leaf passed once',ordinaryPass.filter(p=>p.endsWith('\0TestDownloadRetentionGroupReconstructsWithoutOriginalCapability/expired_original_authority')).length===1);
check('all six historical reconstruction leaves passed',ordinaryPass.filter(p=>p.includes('\0TestDownloadRetentionGroupReconstructsWithoutOriginalCapability/')).length===6);
check('default vet, frozen postcheck and package exit zero',transcript.includes('NATIVE_EXIT full_two_packages=0')&&transcript.includes('default_vet=yes')&&transcript.includes('FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'));
const seed=parseJSONLines(read('-tagged-seed.txt'));
check('two in-package seed roots and twelve checks pass',verifyEvents(seed,'tagged seeds').length===12&&seed.filter(e=>e.Action==='pass'&&e.Test&&!e.Test.includes('/')).length===2);
const detached=read('-detached-seed.txt').toString('utf8');
check('detached seeds have twelve checks without FAIL/SKIP',(detached.match(/^\s*--- PASS: /gm)||[]).length===12&&!/^\s*--- (FAIL|SKIP):|^FAIL(?:\s|$)/m.test(detached));
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){
  check(stage+' exited zero',transcript.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));
  check(stage+' stderr empty',read('-'+stage+'-stderr.txt').length===0);
}
const binaries=[...transcript.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m=>({name:m[1],sha256:m[2]}));
check('three exact Windows/Linux probe and runner hashes',binaries.length===3&&new Set(binaries.map(p=>p.name)).size===3);
const ownerMatch=transcript.match(/ owner=(.+)$/m);check('owned source path recorded',!!ownerMatch);
const owner=path.resolve(ownerMatch[1].trim());
check('source/cache owner is direct workspace child',path.dirname(owner)===root&&/^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)));
check('source and all temporary build products removed',transcript.includes('CLEANED snapshot=True')&&!fs.existsSync(owner));
check('final wrapper exit zero',transcript.includes('d_admission_native_exit=0'));
const pins=new Map(source.files.map(p=>[p.path,p]));
const fixturePath='backend/internal/systembackupevidence/download_retention_group_test.go';
const fixture=fs.readFileSync(path.join(root,fixturePath));
check('corrected historical fixture matches actual frozen test bytes',sha(fixture)===pins.get(fixturePath)?.sha256);
check('expired authority test advances valid SQL time',fixture.toString('utf8').includes('f.db.now = f.db.now.Add(time.Hour)')&&!fixture.toString('utf8').includes('f.db.record.ClaimUntil.Add(time.Hour)'));
const phasePath='scripts/system-backup-a-download-admission-phase.sh';
const phase=fs.readFileSync(path.join(root,phasePath));
check('current 13+11 SQL dispatch was in the same frozen build inputs',sha(phase)===pins.get(phasePath)?.sha256&&phase.toString('utf8').includes('new_cases=13 result_retention_cases=11'));
const oldOwner=path.join(root,'.tmp-d-index-cache-315ea12f230342209f448365ae73d8f2');
check('failed operator source/cache owner independently absent',!fs.existsSync(oldOwner));
const drift=[];
for(const pin of source.files){const file=path.join(root,pin.path);if(!fs.existsSync(file))drift.push({path:pin.path,reason:'missing'});else {const b=fs.readFileSync(file);if(b.length!==pin.size||sha(b)!==pin.sha256)drift.push({path:pin.path,reason:'changed'});}}
const packages=packagePass.map(name=>{const passed=ordinary.filter(e=>e.Action==='pass'&&e.Package===name&&e.Test);return {package:name,main_pass:passed.filter(e=>!e.Test.includes('/')).length,all_pass:passed.length};});
const report={kind:'a_download_admission_local_gate_repair_review',recorded_at:new Date().toISOString(),checks_passed:checks.length,checks,source_files:source.files.length,source_sha256:source.source_sha256,source_manifest_sha256:sha(manifestBytes),prefix,packages,ordinary_main:packages.reduce((s,p)=>s+p.main_pass,0),ordinary_all:ordinaryPass.length,retention_group_checks:group.length,seed_checks:12,detached_seed_checks:12,binaries,owner,owner_exists:false,current_pinned_drift:drift,new_inputs_not_covered:true,failed_operator_round:'a-download-admission-mysql-remote-20261019-154821-6f3b8aaf.txt',failed_operator_exit:1,actual_sql_expected_cases:24,actual_mysql:false,dependencies_installed:false,production_approved:false,scope:'Current frozen security/evidence packages, historical reconstruction fixture fix, tagged/detached seeds and Windows/Linux payload compilation only. Actual 13+11 admission/result SQL and later working-tree changes remain unaccepted.',supersedes_scope_label:'a-download-admission-local-gate-repair-review-20261019.json used the earlier 13+8 handoff label; these same frozen bytes already include the three added cold-group SQL cases. No tests were rerun for this metadata correction.'};
fs.writeFileSync(path.join(evidence,'a-download-admission-local-gate-repair-review-20261019-r2.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({checks:checks.length,packages,retention_group_checks:group.length,binaries,drift,cleanup_absent:true}));
