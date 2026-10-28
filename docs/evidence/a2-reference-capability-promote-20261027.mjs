import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {compose} from './a2-reference-capability-supplement-review-20261027-r2.mjs';

// Feed the current rg --files --hidden backend contracts scripts inventory on
// stdin. Promotion is allowed only after the exact composed native review.
const [prefix,mode,...extra]=process.argv.slice(2);
assert.ok(prefix&&['--write','--check'].includes(mode)&&!extra.length,
  'Usage: rg --files --hidden backend contracts scripts | node <this-file> <absolute-supplement-prefix> --write|--check');
const root=path.resolve(import.meta.dirname,'../..');
const decoder='backend/internal/systembackupbootstrapsecurity/reference.go';
const regression='backend/internal/systembackupbootstrapsecurity/reference_contract_parity_test.go';
const candidate='docs/evidence/a2-reference-capability-parity-candidate-20261026.go.txt';
const testCandidate='docs/evidence/a2-reference-capability-parity-test-candidate-20261026.go.txt';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=raw(p);return{path:p,size:b.length,sha256:sha(b)};};
const sourceInventory=fs.readFileSync(0,'utf8');
const composed=compose(prefix),reviewFile=prefix+'.composed.json';
assert.deepEqual(json(reviewFile),composed,'composed review must already exist and replay exactly');
const expected=new Map(composed.source_files.map(p=>[p.path,p]));
const listed=sourceInventory.trim().split(/\r?\n/).filter(Boolean).map(p=>p.replaceAll('\\','/')).sort();
assert.equal(new Set(listed).size,listed.length);
const required=[...expected.keys()].filter(p=>/^(backend|contracts|scripts)\//.test(p));
assert.deepEqual(listed,required.filter(p=>mode==='--check'||p!==regression).sort(),'current source paths differ');
const ownerArtifact=prefix+'.promoted.json';
function assertPlain(p) {
  const absolute=path.resolve(root,p);assert.ok(absolute.startsWith(root+path.sep));
  let cursor=absolute;
  while(cursor!==root){if(fs.existsSync(cursor))assert.equal(fs.lstatSync(cursor).isSymbolicLink(),false);cursor=path.dirname(cursor);}
}
for(const p of expected.keys()) assertPlain(p);
if(mode==='--write') {
  assert.equal(fs.existsSync(ownerArtifact),false,'promotion receipt exists');
  assert.equal(fs.existsSync(path.join(root,regression)),false,'live regression already exists');
  assert.equal(sha(raw(decoder)),'99de31e723c22e1b3f8cbf33f0689054ae7ec589bab0c4c3e3666c26ca083022');
  for(const [p,want] of expected)if(![decoder,regression].includes(p))assert.deepEqual(pin(p),want,'current source differs: '+p);
  for(const [p,input] of [[decoder,candidate],[regression,testCandidate]]){
    const b=raw(input);assert.equal(b.length,expected.get(p).size);assert.equal(sha(b),expected.get(p).sha256);
  }
  const before=raw(decoder);let testWritten=false;
  try {
    fs.writeFileSync(path.join(root,decoder),raw(candidate));
    fs.writeFileSync(path.join(root,regression),raw(testCandidate),{flag:'wx'});testWritten=true;
    for(const [p,want] of expected)assert.deepEqual(pin(p),want,'post-promotion source differs: '+p);
    const result={kind:'a2_reference_capability_exact_candidate_promotion.v1',status:'exact_composed_candidate_promoted',composed_review:pin(reviewFile),changed_source:[pin(decoder),pin(regression)],all_candidate_source_files:expected.size,source_postcheck:true,Go_repeated:false,failed_native_parent_preserved:true,current_whole_baseline_accepted:false,actual_SQL:false,production_approved:false,goal_complete:false,driver:pin(path.relative(root,process.argv[1]).replaceAll('\\','/'))};
    fs.writeFileSync(ownerArtifact,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  }catch(error){fs.writeFileSync(path.join(root,decoder),before);if(testWritten)fs.unlinkSync(path.join(root,regression));throw error;}
}else {
  const r=json(ownerArtifact);assert.equal(r.status,'exact_composed_candidate_promoted');assert.deepEqual(r.composed_review,pin(reviewFile));
  assert.equal(r.source_postcheck,true);assert.equal(r.all_candidate_source_files,expected.size);
  assert.deepEqual(r.driver,pin(path.relative(root,process.argv[1]).replaceAll('\\','/')));
  for(const [p,want] of expected)assert.deepEqual(pin(p),want,'promoted current source differs: '+p);
  assert.deepEqual(r.changed_source,[pin(decoder),pin(regression)]);
}
console.log(JSON.stringify({mode,promotion:pin(ownerArtifact),status:'exact_composed_candidate_promoted'}));
