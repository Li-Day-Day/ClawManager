import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {reviewGoEvents} from './a-bootstrap-entry-phase-review-20261027.mjs';

export const originalPackages=['internal/systembackupproducer','internal/systembackupbootstrapsecurity','internal/systembackupsecurity',
  'internal/systembackupresources','internal/systembackupread','internal/systembackupevidence','cmd/server',
  'internal/systembackupnoncebootstrap','internal/systembackupcatrust','cmd/system-backup-bootstrap'].map(p=>'clawreef/'+p);
export const parityPackages=['cmd/system-backup-bootstrap','internal/systembackupbootstrapmaterials',
  'internal/systembackupbootstrapsecurity','internal/systembackupcatrust','internal/systembackupnoncebootstrap'].map(p=>'clawreef/'+p);
export const remainingPackages=['internal/systembackupproducer','internal/systembackupsecurity','internal/systembackupresources',
  'internal/systembackupread','internal/systembackupevidence','cmd/server'].map(p=>'clawreef/'+p);
const sorted=xs=>[...xs].sort();
const seed='clawreef/internal/systembackupevidence';
export function reviewCurrentRepairEvents({parentText,parityFullText,currentFullText,paritySeedText,currentSeedsText}){
  const parent=reviewGoEvents(parentText,originalPackages);
  const parity=reviewGoEvents(parityFullText,parityPackages);
  const current=reviewGoEvents(currentFullText,remainingPackages);
  const rows=text=>text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
  const names=text=>rows(text).filter(r=>r.Action==='pass'&&r.Test).map(r=>r.Package+'::'+r.Test);
  const accepted=new Set([...names(parityFullText),...names(currentFullText)]);
  const required=names(parentText);assert.equal(new Set(required).size,required.length);
  for(const name of required)assert.ok(accepted.has(name),'Original native test omitted by current repair: '+name);
  const paritySeed=reviewGoEvents(paritySeedText,[seed],['TestDBootstrapOriginalMaterialsMySQLSeed']);
  const currentSeeds=reviewGoEvents(currentSeedsText,[seed],['TestDBootstrapConsumerMySQLSeed',
    'TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapEntryMySQLSeed']);
  assert.deepEqual(paritySeed.root_names,[seed+'::TestDBootstrapOriginalMaterialsMySQLSeed']);
  assert.equal(paritySeed.passed_events,1);assert.equal(currentSeeds.roots,3);assert.equal(currentSeeds.passed_events,3);
  return{kind:'a_bootstrap_current_repair_native_inventory.v1',original_packages:sorted(originalPackages),
    current_complete_packages:sorted([...parityPackages,...remainingPackages]),original_test_events_preserved:required.length,
    current_test_events:accepted.size,current_roots:parity.roots+current.roots,parity_full:parity,current_full:current,
    original_full_roots:parent.roots,bootstrap_seeds:[...paritySeed.root_names,...currentSeeds.root_names].sort(),
    source_scope_accepted:false,native_start_authorized:false,actual_SQL:false};
}
function main(){
  const [mode,ordinaryPrefix,parityPrefix,output,...extra]=process.argv.slice(2);
  assert.ok(['--write','--check'].includes(mode)&&ordinaryPrefix&&parityPrefix&&output&&!extra.length);
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const relative=name=>{const rel=path.relative(root,path.resolve(root,name)).replaceAll('\\','/');
    assert.match(rel,/^docs\/evidence\/[A-Za-z0-9_.-]+$/);return rel;};
  const read=name=>fs.readFileSync(path.join(root,relative(name)));
  const json=name=>JSON.parse(read(name).toString('utf8').replace(/^\uFEFF/,''));
  const pin=name=>{const b=read(name);return{path:relative(name),size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}};
  const ordinary=json(ordinaryPrefix+'.json'),parity=json(parityPrefix+'.composed.json');
  assert.equal(ordinary.kind,'d2_current_ordinary_complete_native.v1');assert.equal(ordinary.status,'passed_selected_complete_ordinary_packages');
  for(const key of ['Go_started','tests_started','source_precheck','windows_source_postcheck','bootstrap_seed_source_postcheck',
    'frozen_source_unchanged','owner_removed'])assert.equal(ordinary[key],true,key);
  assert.equal(ordinary.actual_mysql,false);assert.equal(ordinary.production_approved,false);assert.equal(fs.existsSync(ordinary.owner),false);
  assert.equal(parity.kind,'a2_reference_capability_composed_candidate_review.v1');assert.equal(parity.status,'passed_exact_candidate_windows_and_supplement');
  assert.equal(parity.windows_source_postcheck,true);assert.equal(parity.snapshot_postcheck,true);assert.equal(parity.owners_independently_absent,true);
  assert.equal(parity.actual_SQL,false);assert.equal(parity.production_approved,false);
  const parentPrefix='docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8';
  const parityOldPrefix='docs/evidence/a2-reference-capability-native-9c2f727f86c548a38792cebd423489e7';
  const logs=[parentPrefix+'.full.jsonl',parityOldPrefix+'.full.jsonl',ordinaryPrefix+'.full.jsonl',
    parityPrefix+'.tagged_seed.jsonl',ordinaryPrefix+'.bootstrap-seeds.jsonl'];
  const value={...reviewCurrentRepairEvents(Object.fromEntries(['parentText','parityFullText','currentFullText','paritySeedText','currentSeedsText']
    .map((key,i)=>[key,read(logs[i]).toString('utf8')]))),
    native_receipts:[pin(ordinaryPrefix+'.json'),pin(parityPrefix+'.composed.json')],logs:logs.map(pin),
    review_validator:pin('docs/evidence/a-bootstrap-current-repair-inventory-20261027.mjs')};
  if(mode==='--write')fs.writeFileSync(path.join(root,relative(output)),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  else assert.deepEqual(json(output),value);
  console.log(JSON.stringify({mode,packages:value.current_complete_packages.length,preserved:value.original_test_events_preserved,
    seeds:value.bootstrap_seeds.length,source_scope_accepted:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
