import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const base=path.join(dir,'a-gc-audit-resource-20261020-r2');
const text=f=>fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const checks=[];function check(name,value){assert(value,name);checks.push(name);}
const native=text(base+'-native.txt'),consoleText=text(base+'-console.txt');
const log=native+'\n'+consoleText;
const manifest=JSON.parse(text(base+'-source.json'));
check('stable offline unapproved snapshot',manifest.stable_copy_verified===true&&manifest.dependencies_installed===false&&manifest.production_approved===false);
check('logical source SHA recomputed',sha(manifest.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===manifest.source_sha256);
check('source bound to run',log.includes(`LOCAL_SOURCE sha256=${manifest.source_sha256} files=${manifest.files.length}`));
check('final postcheck exit and cleanup',log.includes('LOCAL_PASS audit-resource-postcheck=yes default-vet=yes dependencies-installed=no remote=not-run actual_mysql=not-run')&&log.includes('a_gc_audit_resource_local_exit=0')&&log.includes('CLEANED audit-resource-source-cache-overlay=True'));
const owner=log.match(/LOCAL_OWNER audit-resource=(.+) process_id=/)?.[1];
check('exact owned cache source overlays absent',!!owner&&path.dirname(owner)===root&&/^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner))&&!fs.existsSync(owner));
const test='TestAGCDirectAuditResourcePublishedInteger';
const stageNames=['targeted','wrong-type','public-string','unpublished-fk','evidence-full'];
const expected={
  'wrong-type':[test,test+'/published_int',test+'/wrong_type'].sort(),
  'public-string':[test,test+'/published_int'].sort(),
  'unpublished-fk':[test,test+'/unexpected_fk'].sort(),
};
const stageRecords=[];
for(const stage of stageNames){
  const match=log.match(new RegExp(`STAGE_ACCEPTED name=${stage} attempt=([1-3]) expected_counterfactual=(True|False)`));
  check(stage+' accepted exactly once',!!match&&[...log.matchAll(new RegExp(`STAGE_ACCEPTED name=${stage} `,'g'))].length===1);
  const attempt=Number(match[1]),file=base+'-'+stage+'-attempt'+attempt+'.jsonl';
  const events=text(file).trim().split('\n').map(JSON.parse);
  check(stage+' no skip/build failure',!events.some(e=>e.Action==='skip'||e.Action==='build-fail'||e.FailedBuild));
  const ran=events.filter(e=>e.Test&&e.Action==='run').map(e=>e.Test).sort();
  const passed=events.filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test).sort();
  const failed=events.filter(e=>e.Test&&e.Action==='fail').map(e=>e.Test).sort();
  check(stage+' unique RUN and complete terminal results',new Set(ran).size===ran.length&&JSON.stringify(ran)===JSON.stringify([...passed,...failed].sort()));
  if(expected[stage]){
    check(stage+' exact independent assertion failures',JSON.stringify(failed)===JSON.stringify(expected[stage])&&ran.length===4&&match[2]==='True');
    check(stage+' expected package test failure not compiler failure',events.filter(e=>!e.Test&&e.Action==='fail'&&e.Package==='clawreef/internal/systembackupevidence').length===1);
  }else{
    check(stage+' genuine regression success',failed.length===0&&match[2]==='False'&&events.filter(e=>!e.Test&&e.Action==='pass'&&e.Package==='clawreef/internal/systembackupevidence').length===1);
    if(stage==='targeted')check('targeted four checks',passed.length===4&&passed.filter(n=>!n.includes('/')).length===1);
  }
  check(stage+' stderr empty',text(base+'-'+stage+'-attempt'+attempt+'-stderr.txt').trim()==='');
  for(let n=1;n<attempt;n++){
    const earlier=base+'-'+stage+'-attempt'+n;
    const raw=text(earlier+'.jsonl'),stderr=text(earlier+'-stderr.txt');
    const es=raw.trim().split('\n').map(JSON.parse);
    check(stage+' retry '+n+' only known tool crash',/(?:asm|compile|vet)\.exe: exit status 0xc000(?:0043|026b)/.test(raw+stderr)&&!es.some(e=>e.Test&&e.Action==='fail'));
  }
  stageRecords.push({stage,attempt,expected_counterfactual:!!expected[stage],test_roots:ran.filter(n=>!n.includes('/')).length,checks:ran.length,passed:passed.length,expected_failed_tests:failed,jsonl_sha256:sha(fs.readFileSync(file))});
}
const counterfacts=[...log.matchAll(/COUNTERFACTUAL name=(\S+) overlay_sha256=([a-f0-9]{64}) source_sha256=([a-f0-9]{64})/g)].map(([,name,overlay_sha256,source_sha256])=>({name,overlay_sha256,source_sha256}));
check('three pinned isolated counterfactuals',counterfacts.length===3&&new Set(counterfacts.map(c=>c.name)).size===3);
const scoped=['backend/internal/systembackupevidence/download_retention_gc_references_a_test.go','backend/internal/db/migrations/001_init_schema.sql'];
const currentDrift=[];
for(const pin of manifest.files){
  const file=path.resolve(root,pin.path);check('safe source path '+pin.path,file.startsWith(root+path.sep));
  if(!fs.existsSync(file)||fs.statSync(file).size!==pin.size||sha(fs.readFileSync(file))!==pin.sha256)currentDrift.push(pin.path);
}
const currentFiles=text(base+'-current-files.txt').trim().split('\n');
const frozenSet=new Set(manifest.files.map(p=>p.path)),currentSet=new Set(currentFiles);
const currentAdded=currentFiles.filter(p=>!frozenSet.has(p)),currentRemoved=[...frozenSet].filter(p=>!currentSet.has(p));
check('A regression and published schema still match',scoped.every(p=>manifest.files.some(pin=>pin.path===p)&&!currentDrift.includes(p)));
const ddl=fs.readFileSync(path.join(root,scoped[1]),'utf8');
check('published INT independently observed',/CREATE TABLE IF NOT EXISTS audit_logs\s*\([\s\S]*?\bresource_id INT\s*,/.test(ddl));
const first=path.join(dir,'a-gc-audit-resource-20261020-r1');
const firstLog=text(first+'-native.txt')+'\n'+text(first+'-console.txt');
const firstOwner=firstLog.match(/LOCAL_OWNER audit-resource=(.+) process_id=/)?.[1];
check('first pre-test preparation failure retained and cleaned',firstLog.includes('a_gc_audit_resource_local_exit=1')&&firstLog.includes('CLEANED audit-resource-source-cache-overlay=True')&&!!firstOwner&&path.dirname(firstOwner)===root&&!fs.existsSync(firstOwner));
check('first run never began a Go stage',!fs.readdirSync(dir).some(n=>n.startsWith(path.basename(first)+'-targeted-attempt')));
const report={kind:'a_independent_gc_legacy_audit_resource_regression',recorded_at:new Date().toISOString(),checks_passed:checks.length,checks,
  source_sha256:manifest.source_sha256,source_files:manifest.files.length,source_manifest_sha256:sha(fs.readFileSync(base+'-source.json')),native_log_sha256:sha(fs.readFileSync(base+'-native.txt')),console_log_sha256:sha(fs.readFileSync(base+'-console.txt')),
  stages:stageRecords,counterfactuals:counterfacts,current_pinned_drift:currentDrift,current_added_inputs_not_accepted:currentAdded,current_removed_inputs:currentRemoved,current_whole_worktree_verified:currentDrift.length===0&&currentAdded.length===0&&currentRemoved.length===0,
  schema_fact:'Published 001 audit_logs.resource_id is INT. Backup audit writers leave it NULL and bind public sop_ identities in JSON. An INT column does not establish a private Operation-PK binding.',
  resolution:'Retain the parallel direct-reference implementation which validates the legacy INT column but removes the invalid public sop_ comparison. The independent A fixture overrides schema facts instead of deriving them from the production expectation map. Unpublished FK additions still deny even after outer metadata re-pin.',
  first_run:{exit:1,reason:'pre-test exact counterfactual binding guard stopped after concurrent implementation changes; no Go test/build stage began',owner:firstOwner,cleaned:true},
  cleanup:{owner,source_cache_overlays_removed:true},default_vet:true,dependencies_installed:false,actual_mysql:false,full_gc_policy:false,production_approval:false,
  scope:'Model SQL/collector regression and independent controlled counterfactual assertions over one frozen source. Not actual MySQL typing/coercion/locks, minimal roles, DDL freeze, current authorization, physical capacity, complete policy, or production GC acceptance.',
};
fs.writeFileSync(path.join(dir,'a-gc-audit-resource-accepted-20261020-r2.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({source_files:report.source_files,stages:stageRecords,current_drift:currentDrift,products_removed:true,actual_mysql:false}));
