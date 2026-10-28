import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';

export const remainingOrdinaryPackages=['internal/systembackupproducer','internal/systembackupsecurity','internal/systembackupresources','internal/systembackupread','internal/systembackupevidence','cmd/server'];
export const bootstrapRepairSeedRoots=['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapEntryMySQLSeed'];
export function validateBootstrapRepairSeeds(text){
  const names=validateGoEvents(text,'clawreef/internal/systembackupevidence');
  assert.deepEqual(names,bootstrapRepairSeedRoots,'Only the three missing local bootstrap seed roots may run');
  return {kind:'d2_bootstrap_repair_seed_inventory.v1',names,actual_mysql:false,source_scope_accepted:false};
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function validateOrdinaryInventory(text, packages, parentText){
  assert.ok(Array.isArray(packages)&&packages.length>0);
  assert.equal(new Set(packages).size,packages.length);
  assert.ok(packages.every(p=>remainingOrdinaryPackages.includes(p)));
  const rows=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
  const parentRows=parentText.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
  assert.deepEqual([...new Set(rows.map(r=>r.Package))].sort(),packages.map(p=>'clawreef/'+p).sort());
  const checked=packages.map(relative=>{
    const pkg='clawreef/'+relative;
    const names=validateGoEvents(rows.filter(r=>r.Package===pkg).map(r=>JSON.stringify(r)).join('\n'),pkg);
    const previous=validateGoEvents(parentRows.filter(r=>r.Package===pkg).map(r=>JSON.stringify(r)).join('\n'),pkg);
    for(const name of previous)assert.ok(names.includes(name),`Previous complete test omitted: ${pkg}::${name}`);
    return {package:pkg,roots:names.filter(n=>!n.includes('/')).length,pass_events:names.length,parent_names_preserved:previous.length};
  });
  return {kind:'d2_current_ordinary_inventory.v1',packages:checked,all_selected_packages_complete:true,parent_scope_accepted:false,actual_mysql:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='--bootstrap-seeds'){
    assert.equal(process.argv.length,4);
    const log=path.resolve(process.argv[3]),root=path.resolve(import.meta.dirname,'../..');
    assert.equal(path.dirname(log),path.join(root,'docs/evidence'));assert.match(path.basename(log),/^d2-current-ordinary-native-[a-f0-9]{32}\.bootstrap-seeds\.jsonl$/);
    process.stdout.write(JSON.stringify(validateBootstrapRepairSeeds(fs.readFileSync(log,'utf8')))+'\n');
    process.exit(0);
  }
  assert.equal(process.argv.length,6,'Usage: ordinary-inventory OWNER LOG PARENT_RECEIPT PARENT_SHA256');
  const root=path.resolve(import.meta.dirname,'../..'),owner=path.resolve(process.argv[2]);
  assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.lstatSync(owner).isSymbolicLink(),false);assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
  const token=path.basename(owner).slice('.tmp-d-index-cache-'.length),log=path.resolve(process.argv[3]);
  assert.equal(log,path.join(root,`docs/evidence/d2-current-ordinary-native-${token}.full.jsonl`));
  const parentPath=path.resolve(process.argv[4]);assert.equal(path.dirname(parentPath),path.join(root,'docs/evidence'));assert.match(path.basename(parentPath),/^d-bootstrap-entry-native-[a-f0-9]{32}\.json$/);
  assert.match(process.argv[5],/^[a-f0-9]{64}$/);const bytes=fs.readFileSync(parentPath);assert.equal(sha(bytes),process.argv[5]);
  const parent=JSON.parse(bytes.toString('utf8'));assert.equal(parent.kind,'d_bootstrap_entry_native.v1');assert.equal(parent.full_exit,0);
  const packages=JSON.parse(fs.readFileSync(path.join(owner,'ordinary-packages.json'),'utf8'));
  const result=validateOrdinaryInventory(fs.readFileSync(log,'utf8'),packages,fs.readFileSync(parentPath.replace(/\.json$/,'.full.jsonl'),'utf8'));
  process.stdout.write(JSON.stringify(result)+'\n');
}
