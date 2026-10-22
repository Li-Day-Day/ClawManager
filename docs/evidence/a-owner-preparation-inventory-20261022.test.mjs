import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {deriveOwnerPreparationInventory,ownerInventoryEvents} from './a-owner-preparation-inventory-20261022.mjs';
import {localStages,canonicalLocalName,decode,sha256,workspace} from './a-download-owners-actual-review-20261020.mjs';

// This historical LOCAL preparation is not actual SQL evidence. The prior
// event list is synthesized only in memory to test metadata adaptation.
const read=name=>fs.readFileSync(path.join(workspace,'docs/evidence',name));
const logBytes=read('a-download-owners-local-repair-20261020-144930-6819f05e.txt');
const sourceBytes=read('a-download-owners-local-repair-source-20261020-144930-6819f05e.json');
const text=decode(logBytes),stages=localStages(text);
const prior=stages.slice(0,2).flatMap(s=>[...s.names.map(canonicalLocalName).flatMap(Test=>[{Package:s.package,Test,Action:'run'},{Package:s.package,Test,Action:'pass'}]),{Package:s.package,Action:'pass'}]);
const priorNativeEventsBytes=Buffer.from(prior.map(JSON.stringify).join('\n')+'\n');
const input={logBytes,sourceBytes,priorNativeEventsBytes,exists:()=>false};
const inventory=deriveOwnerPreparationInventory(input);
const changedLog=change=>({...input,logBytes:Buffer.from(change(text))});

test('derived metadata preserves complete names and remains explicitly non-SQL',()=>{
 assert.equal(inventory.origin,'derived_from_verified_verbose_local_transcript_not_native_Go_JSON');
 assert.equal(inventory.packages.reduce((n,p)=>n+p.pass_events,0),4623);
 assert.equal(inventory.scopes.actual_MySQL,false);
 const adapted=ownerInventoryEvents(inventory,inventory.source_sha256);
 assert.equal(adapted.filter(e=>e.Action==='pass'&&e.Test).length,4623);
 assert.equal(adapted.filter(e=>e.Action==='pass'&&!e.Test).length,2);
});
for(const [name,change] of [
 ['missing postcheck',s=>s.replace('LOCAL_PASS config-writer-frozen-postcheck=yes','postcheck omitted')],
 ['missing exact cleanup',s=>s.replace('LOCAL_CLEANUP config-writer-source-owned=','cleanup omitted=')],
 ['actual remote run appended',s=>s+'\nRUN namespace=fixture\n'],
 ['skip masked by package pass',s=>s.replace('--- PASS:','--- SKIP:')],
 ['timeout masked by package pass',s=>s+'\npanic: test timed out after 15m0s\n'],
 ['outer failure appended',s=>s+'\nlocal_validation_exit=1\n'],
 ['wrong source binding',s=>s.replace('source_sha256=','source_sha256=wrong')],
 ['duplicate complete package summary',s=>s+'\nok clawreef/internal/systembackupevidence 1.0s\n'],
])test(name,()=>assert.throws(()=>deriveOwnerPreparationInventory(changedLog(change))));

test('removing matching RUN and PASS still cannot remove a prior test',()=>{
 const name=stages[0].names.find(n=>!n.includes('/'));
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const changed=text.replace(new RegExp('^=== RUN\\s+'+escaped+'\\s*\\n','m'),'').replace(new RegExp('^\\s*--- PASS: '+escaped+' \\([^\\n]+\\n','m'),'');
 assert.notEqual(changed,text);
 assert.throws(()=>deriveOwnerPreparationInventory({...input,logBytes:Buffer.from(changed)}),/previous test omitted/);
});
test('all thirteen packaged and detached seed checks are independently required',()=>{
 const name='TestASQLTaskDownloadOwnersMySQLSeed';
 const remove=s=>s.replace(new RegExp('^=== RUN\\s+'+name+'\\s*\\n','m'),'').replace(new RegExp('^\\s*--- PASS: '+name+' \\([^\\n]+\\n','m'),'');
 assert.throws(()=>deriveOwnerPreparationInventory(changedLog(remove)));
 const at=stages[2].end;
 assert.throws(()=>deriveOwnerPreparationInventory({...input,logBytes:Buffer.from(text.slice(0,at)+remove(text.slice(at)))}));
});
test('live owner is rejected despite a cleanup report',()=>assert.throws(()=>deriveOwnerPreparationInventory({...input,exists:()=>true})));
test('prior native baseline must itself contain both package completions',()=>{
 const bad=prior.filter(e=>e.Test||e.Package!==stages[0].package);
 assert.throws(()=>deriveOwnerPreparationInventory({...input,priorNativeEventsBytes:Buffer.from(bad.map(JSON.stringify).join('\n'))}));
});
test('unsafe source path is rejected even with a recomputed digest',()=>{
 const source=JSON.parse(decode(sourceBytes));source.files[0].path='backend/../private';source.source_sha256=sha256(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n');
 assert.throws(()=>deriveOwnerPreparationInventory({...input,sourceBytes:Buffer.from(JSON.stringify(source))}));
});
for(const [name,mutate] of [
 ['SQL status cannot be substituted',i=>{i.scopes.actual_MySQL=true;}],
 ['duplicate names cannot substitute for coverage',i=>{i.packages[0].tests[1]=i.packages[0].tests[0];}],
 ['counts cannot replace names',i=>{i.packages[0].pass_events++;}],
 ['package substitution rejected',i=>{i.packages[0].package='other/package';}],
 ['unknown scope is rejected',i=>{i.scopes.approved=true;}],
 ['wrong inventory format rejected',i=>{i.kind='native_go_json';}],
])test(name,()=>{const i=structuredClone(inventory);mutate(i);assert.throws(()=>ownerInventoryEvents(i,inventory.source_sha256));});
test('a pinned inventory cannot move to a different source',()=>assert.throws(()=>ownerInventoryEvents(inventory,'f'.repeat(64))));
