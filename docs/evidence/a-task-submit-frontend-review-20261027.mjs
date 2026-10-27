import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='docs/evidence/d-backups-ui-local-4699befa3b9e4b3a9085feba53fa5e76';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function relative(name){
  const rel=path.isAbsolute(name)?path.relative(root,name).replaceAll('\\','/'):name;
  assert.ok(!path.isAbsolute(rel)&&!rel.split('/').some(p=>['','..','.'].includes(p)));
  return rel;
}
const bytes=name=>fs.readFileSync(path.join(root,relative(name)));
const pin=name=>{const p=relative(name),b=bytes(p);return{path:p,size:b.length,sha256:sha(b)}};
const json=name=>JSON.parse(bytes(name).toString('utf8').replace(/^\uFEFF/,''));
const sorted=values=>[...values].sort();
export function reviewNodeSummary(text,expectedFailure=false){
  const result={};
  for(const field of ['tests','pass','fail','cancelled','skipped','todo']){
    const matches=[...text.matchAll(new RegExp('^[ℹ#] '+field+' (\\d+)\\r?$','gm'))];
    assert.equal(matches.length,1,'Missing or duplicate Node summary '+field);result[field]=Number(matches[0][1]);
  }
  assert.ok(result.tests>0);assert.equal(result.pass+result.fail,result.tests);
  for(const field of ['cancelled','skipped','todo'])assert.equal(result[field],0);
  if(expectedFailure)assert.ok(result.fail>0);else assert.equal(result.fail,0);
  return result;
}
function enumerate(){
  const listed=spawnSync('rg',['--files','frontend/src','frontend/scripts','contracts/system-backup/v12'],{cwd:root,encoding:'utf8'});
  assert.equal(listed.status,0);assert.equal(listed.stderr,'');
  const names=listed.stdout.trim().split(/\r?\n/).map(s=>s.replaceAll('\\','/'));
  names.push('frontend/vite.backups-ui-lab.config.ts','frontend/backups-ui-lab.html','frontend/vite.config.ts',
    'frontend/tsconfig.app.json','frontend/tsconfig.node.json','frontend/postcss.config.js','frontend/tailwind.config.js',
    'frontend/package.json','frontend/package-lock.json','scripts/system-backup-d-backups-ui-validation.ps1');
  return sorted(new Set(names));
}
function derive(){
  const reportName='docs/evidence/d2-task-submit-increment-current-20261027.json',ownerReport=json(reportName);
  assert.equal(ownerReport.kind,'d2_frontend_task_submit_current_increment.v1');
  assert.equal(ownerReport.status,'current_real_service_unit_and_UI_checks_passed');
  for(const p of ownerReport.inputs){const current=pin(p.path);assert.equal(current.sha256,p.sha256);assert.equal(current.size,p.size);}
  const receipt=json(prefix+'.json');assert.equal(receipt.kind,'d_backups_ui_local_validation.v1');assert.equal(receipt.error,null);
  assert.equal(receipt.inputs_stable,true);assert.equal(receipt.owner_removed,true);assert.equal(fs.existsSync(receipt.owner),false);
  assert.equal(receipt.dependencies_installed,false);assert.equal(receipt.browser_served,false);
  assert.equal(receipt.business_backend,false);assert.equal(receipt.production_approved,false);
  assert.equal(relative(receipt.source),prefix+'-source.json');
  const source=json(receipt.source);assert.equal(source.length,335);
  assert.equal(new Set(source.map(p=>p.path)).size,source.length);assert.deepEqual(sorted(source.map(p=>p.path)),enumerate());
  const currentSource=source.map(p=>{const current=pin(p.path);assert.equal(current.sha256,p.sha256);return current;});
  const testFiles=fs.readdirSync(path.join(root,'frontend/scripts')).filter(s=>/^system-backups.*\.test\.mjs$/.test(s)&&s!=='system-backups-verification-lab.test.mjs').sort();
  assert.equal(testFiles.length,11);assert.equal(receipt.steps.length,14);
  const stages=[];
  for(const [i,step] of receipt.steps.entries()){
    assert.equal(step.exit_code,0);const log=pin(step.log);assert.equal(log.sha256,step.log_sha256);
    const text=bytes(log.path).toString('utf8');
    if(i<testFiles.length){
      assert.deepEqual(step.arguments.map(relative),['frontend/scripts/'+testFiles[i]]);
      stages.push({kind:'node_unit',arguments:step.arguments.map(relative),log,...reviewNodeSummary(text)});
    }else if(i===11){
      assert.deepEqual(step.arguments,['node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--incremental','--tsBuildInfoFile',path.join(receipt.owner,'app.tsbuildinfo'),'--pretty','false']);
      assert.equal(text,'');stages.push({kind:'application_typecheck',log,exit_code:0});
    }else if(i===12){
      assert.deepEqual(step.arguments,['node_modules/typescript/bin/tsc','--noEmit','--strict','--skipLibCheck','--target','ES2023','--lib','ES2023,DOM','--module','ESNext','--moduleResolution','bundler','--allowImportingTsExtensions','--esModuleInterop','--types','node','vite.backups-ui-lab.config.ts']);
      assert.equal(text,'');stages.push({kind:'lab_config_typecheck',log,exit_code:0});
    }else{
      assert.deepEqual(step.arguments,['node_modules/vite/bin/vite.js','build','--configLoader','native','--outDir',path.join(receipt.owner,'dist'),'--emptyOutDir']);
      assert.match(text,/built in [0-9.]+s/);stages.push({kind:'frontend_build',log,exit_code:0});
    }
  }
  assert.equal(stages.slice(0,11).reduce((n,s)=>n+s.pass,0),306);
  const before=reviewNodeSummary(bytes('docs/evidence/d2-task-submit-before-20261027.log').toString('utf8'),true);
  assert.equal(before.tests,20);assert.equal(before.pass,9);assert.equal(before.fail,11);
  const fixed=reviewNodeSummary(bytes('docs/evidence/d2-task-submit-fixed-20261027.log').toString('utf8'));
  assert.equal(fixed.tests,20);assert.equal(fixed.pass,20);
  const shared=bytes('frontend/src/pages/admin/backups/backupApiRead.ts').toString('utf8');
  const wrapper=/\/\/ Creation responses use the same existing closed task DTO as list reads\.\r?\nexport function isBackupTaskListResource\(kind: BackupTaskKind, value: unknown\): value is SystemBackupTask \{\r?\n  return Object\.hasOwn\(taskIdentities, kind\) && validTaskListItem\(kind, value\);\r?\n\}\r?\n/g;
  assert.equal([...shared.matchAll(wrapper)].length,1);assert.equal(sha(shared.replace(wrapper,'')),ownerReport.shared_export_reverse_sha256);
  assert.equal(pin('docs/evidence/d2-task-submit-before-20261027.ts.txt').sha256,ownerReport.before_service_sha256);
  return{kind:'a_frontend_task_submit_increment_scope_review.v1',status:'accepted_exact_frontend_unit_types_build_only',
    owner_report:pin(reportName),native_receipt:pin(prefix+'.json'),source_manifest:pin(prefix+'-source.json'),source_files:currentSource,
    stages,tests:306,expected_before_assertion_failures:11,fixed_service_tests:20,shared_validator_reverse_sha256:ownerReport.shared_export_reverse_sha256,
    review_validator:pin('docs/evidence/a-task-submit-frontend-review-20261027.mjs'),
    cleanup_independently_verified:true,current_source_bytes_and_set_verified:true,HTTP_boundary_mocked:true,
    business_backend_contacted:false,actual_SQL:false,production_approved:false,current_backend_baseline_ready:false,
    excluded_scope:['request body contracts','production writer/details','B/C provider/executor chain','browser interaction','real SQL/remote owner tests'],
    tests_repeated_by_receiver:false};
}
function main(){
  const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&extra.length===0);
  const output='docs/evidence/a-task-submit-frontend-reviewed-20261027-r1.json',review=derive();
  if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(review,null,2)+'\n',{flag:'wx'});
  else assert.deepEqual(json(output),review);
  console.log(JSON.stringify({mode,source_files:review.source_files.length,tests:review.tests,owner_removed:true,current_backend_baseline_ready:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
