import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=process.cwd(),id='0f34460abce44e279a1f2c92d19bb11c';
const prefix='docs/evidence/d-gc-full-local-'+id;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const manifest=read(prefix+'-source.json'),receipt=read(prefix+'.json');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.source_sha256,'093f6b84d87d70bafc2819b351d1d36874dea32cd35e89420461f218e8eb8def');
assert.equal(manifest.files.length,1644);
assert.equal(receipt.error,null);assert.equal(receipt.frozen_inputs_stable,true);assert.equal(receipt.owner_removed,true);
assert.deepEqual(receipt.steps.map(s=>[s.name,s.exit_code]),[['adapter',0],['complete',0],['linux-tagged',0]]);
assert.equal(fs.existsSync(receipt.owner),false);
function summary(stage) {
  const file=prefix+'-'+stage+'.jsonl';
  const rows=fs.readFileSync(file,'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(rows.filter(r=>r.Action==='fail'||r.Action==='skip').length,0);
  const passed=rows.filter(r=>r.Action==='pass'&&r.Test);
  const packages=rows.filter(r=>r.Action==='pass'&&!r.Test).map(r=>r.Package).sort();
  const expected=stage==='complete'?['clawreef/internal/systembackupevidence','clawreef/internal/systembackupgcmetadata'].sort():['clawreef/internal/systembackupevidence'];
  assert.deepEqual(packages,expected);
  return {log:file,roots:passed.filter(r=>!r.Test.includes('/')).length,pass_events:passed.length,failures:0,skips:0,packages,sha256:sha(fs.readFileSync(file))};
}
const adapter=summary('adapter'),complete=summary('complete');
assert.equal(adapter.roots,4);assert.equal(adapter.pass_events,33);
assert.equal(complete.roots,409);assert.equal(complete.pass_events,3493);
const files=['backend/internal/systembackupevidence/download_retention_gc.go','backend/internal/systembackupevidence/download_retention_gc_batch.go','backend/internal/systembackupevidence/download_retention_gc_freeze.go','backend/internal/systembackupevidence/download_retention_gc_freeze_work.go','backend/internal/systembackupevidence/download_retention_gc_full.go','backend/internal/systembackupevidence/download_retention_gc_full_test.go','scripts/system-backup-d-gc-full-local-validation.ps1','scripts/system-backup-d-gc-full-snapshot.mjs'];
const owned=files.map(p=>{const expected=manifest.files.find(f=>f.path===p);assert.ok(expected,p);assert.equal(sha(fs.readFileSync(p)),expected.sha256,p+' drifted');return expected;});
const changed=manifest.files.filter(p=>!fs.existsSync(p.path)||sha(fs.readFileSync(p.path))!==p.sha256).map(p=>p.path);
const specials=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const original=new Set(manifest.files.map(p=>p.path));
const excluded=new Set(['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__']);
function enumerate(dir){
  assert.equal(fs.lstatSync(dir).isSymbolicLink(),false);
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const p=dir+'/'+entry.name;assert.equal(entry.isSymbolicLink(),false);
    if(entry.isDirectory())return excluded.has(entry.name)?[]:enumerate(p);
    return entry.isFile()&&/\.(go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p)&&(!p.startsWith('docs/')||/^docs\/[^/]+\.sql$/.test(p)||specials.has(p))?[p]:[];
  });
}
const added=['backend','contracts','scripts','docs'].flatMap(enumerate).filter(p=>!original.has(p)).sort();
const owners=['a3c29cd48ce046798cca776513236a6e','df418c405fa74842a51da2314346230b','3dc604ee48d549e18f8ec86d7d3a39a1','97ca70d1ce184d4dbee04adc0a8e3ec3',id].map(token=>{
  const p=path.join(root,'.tmp-d-index-cache-'+token);assert.equal(fs.existsSync(p),false,p);return {path:p,absent:true};
});
const result={kind:'d_gc_full_owner_review_request.v1',status:'request_A_independent_review_of_exact_local_owner_candidate',source_sha256:manifest.source_sha256,source_manifest:prefix+'-source.json',receipt:prefix+'.json',owned_inputs:owned,adapter,complete,linux_tagged_compile_exit:0,frozen_source_postcheck:true,owners,live_changed_frozen_inputs:changed,live_added_build_inputs:added,whole_live_tree_ready:changed.length===0&&added.length===0,scope:'explicit_full_owner_call_chain_requires_real_deployment_authority_and_complete_domain_policy',dependencies_installed:false,actual_mysql:false,production_approved:false,full_production_gc_accepted:false,pending:['A exact source independent review','real protocol authority and complete domain Policy','actual twelve MySQL protocol groups including empty-to-new program DDL','physical capacity and release/takeover proof'],historical_failed_complete:'15ff source reached 600s suite timeout; no complete acceptance; exact owner removed'};
const mode=process.argv[2]??'--check';
assert.ok(mode==='--check'||mode==='--write','use --check or --write NEW_FILE');
if(mode==='--write')assert.ok(process.argv[3],'--write requires a new evidence filename');
const output=path.resolve(process.argv[3]??'docs/evidence/d-gc-full-review-request-20261026.json');
assert.equal(path.dirname(output),path.join(root,'docs','evidence'));assert.equal(path.extname(output),'.json');
if(mode==='--write') {
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
} else {
  const existing=read(output);
  for(const field of ['kind','status','source_sha256','source_manifest','receipt','owned_inputs','adapter','complete','linux_tagged_compile_exit','frozen_source_postcheck','owners','scope','dependencies_installed','actual_mysql','production_approved','full_production_gc_accepted','pending','historical_failed_complete'])assert.deepEqual(existing[field],result[field],field);
  // Historical live-tree observations in an issued request are immutable.
  // Report current drift separately; never rewrite a delivered request.
}
process.stdout.write(JSON.stringify({mode,request_sha256:sha(fs.readFileSync(output)),status:result.status,adapter,complete,linux_tagged_compile_exit:0,owners_absent:owners.length,current_live_changed_inputs:changed,current_live_added_inputs:added,request_rewritten:mode==='--write'})+'\n');
