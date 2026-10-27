import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const pin=f=>{const b=read(f);return {path:f,size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};};
const prefix='docs/evidence/a-owner-eof-20261023-084028';
const receipt=json(prefix+'.json');assert.equal(receipt.passed,false);assert.equal(receipt.cleanup,true);
assert.equal(path.dirname(receipt.owner),root);assert.match(path.basename(receipt.owner),/^\.tmp-a-evidence-[a-f0-9]{32}$/);assert.equal(fs.existsSync(receipt.owner),false);
const log=read(prefix+'.txt').toString('utf8');
assert.match(log,/End time: 20261023091201/);
const stages=[],latest=new Map();
for(const line of log.split(/\r?\n/)){
  if(!line.startsWith('{'))continue;let e;try{e=JSON.parse(line);}catch{continue;}
  if(e.Action==='start'){const stage={package:e.Package,pass:0,failed:[],terminal:null};stages.push(stage);latest.set(e.Package,stage);}
  const s=latest.get(e.Package);if(!s)continue;
  if(e.Action==='pass'&&e.Test)s.pass++;
  if(e.Action==='fail'&&e.Test)s.failed.push(e.Test);
  if(['pass','fail'].includes(e.Action)&&!e.Test)s.terminal=e.Action;
}
assert.equal(stages.length,3);
assert.equal(stages[0].pass,17);assert.equal(stages[0].terminal,'pass');
const evidence=stages[1],producer=stages[2];
assert.equal(evidence.package,'clawreef/internal/systembackupevidence');assert.equal(evidence.pass,3089);assert.equal(evidence.terminal,'fail');
assert.deepEqual(evidence.failed,['TestDownloadRuntimeAdmittedHTTPWithAtomicSQLSTSAndTransit/success','TestDownloadRuntimeAdmittedHTTPWithAtomicSQLSTSAndTransit']);
assert.equal(producer.package,'clawreef/internal/systembackupproducer');assert.equal(producer.pass,784);assert.equal(producer.terminal,'pass');
const result={kind:'a_runtime_full_failure_review.v1',date:'2026-10-23',status:'full_evidence_failed_preserved_no_baseline',evidence:[prefix+'.json',prefix+'.txt','docs/evidence/a-runtime-full-failure-review-20261023.mjs'].map(pin),stages,cleanup:{owner:receipt.owner,independently_absent:true},actual_sql:false,dependencies_installed:false,baseline_accepted:false,frozen_postcheck_not_provided:true,current_runtime_repair_tested:false,production_approved:false};
const output='docs/evidence/a-runtime-full-failure-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log('A_FULL_EVIDENCE_FAILURE_PRESERVED producer=passed targeted=passed evidence=failed cleanup=verified');
