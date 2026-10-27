// Metadata composition for exact non-dependency changes; never SQL acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const pin=f=>({path:f,size:read(f).length,sha256:sha(read(f))});
const accepted='docs/evidence/a-owner-gc-full-accepted-20261023.json';
const a=json(accepted);
assert.equal(a.status,'complete_frozen_owner_profile_accepted_ordinary_worktree_delta_requires_separate_review');
assert.deepEqual(a.owner_baseline,{main:636,all:5138});
assert.equal(a.prior_complete_checks_preserved,5105);
assert.equal(a.outer_owner_independently_absent,true);
assert.equal(sha(read(a.source)),a.source_manifest_sha256);
assert.equal(sha(read(a.events)),a.events_sha256);
const old=json(a.source),stem='docs/evidence/a-owner-dependency-freeze-20261023-r3';
const source=json(stem+'-source.json'),n=json(stem+'-native.json');
assert.equal(old.source_sha256,'a2e69921b109dbf12fa7ed9b40689332feb93f99834e3c3ad97a8016e9f4246b');
assert.equal(source.source_sha256,'58e8675e0213ad3542957108b625e9cc85b14a762bd5275e4ca7830ea9688a3b');
for(const s of [old,source]){
  assert.equal(s.stable_copy_verified,true);assert.equal(s.dependencies_installed,false);
  assert.equal(new Set(s.files.map(p=>p.path)).size,s.files.length);
  assert.equal(sha(Buffer.from(s.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n')),s.source_sha256);
}
assert.equal(n.exit,0);assert.equal(n.source_postcheck,true);assert.equal(n.source_sha256,source.source_sha256);assert.equal(n.removed,true);
assert.deepEqual(n.platforms_completed,['windows','linux']);
assert.deepEqual(n.roots,['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/cmd/system-backup-migrate']);
assert.equal(n.resources_absent_from_completed_graphs,true);
for(const k of ['tests_executed','actual_sql','dependencies_installed'])assert.equal(n[k],false);
assert.equal(path.dirname(n.owner),root);assert.match(path.basename(n.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(n.owner),false);
for(const platform of n.platforms_completed){
  const imports=read(stem+'-'+platform+'-imports.txt').toString('utf8').trim().split(/\r?\n/);
  for(const p of n.roots)assert.ok(imports.includes(p));
  assert.ok(!imports.some(p=>/^clawreef\/internal\/systembackupresources(?:\s|\.|$)/.test(p)));
  assert.equal(read(stem+'-'+platform+'-stderr.txt').length,0);
}
// Include tagged files too: no new owner test or embed/module input is exempted.
const scope=p=>/^(backend|contracts)\//.test(p.path);
const before=new Map(old.files.filter(scope).map(p=>[p.path,p]));
const after=new Map(source.files.filter(scope).map(p=>[p.path,p]));
const changed=[];
for(const [name,p] of before){assert.ok(after.has(name));if(JSON.stringify(after.get(name))!==JSON.stringify(p))changed.push(name);}
assert.deepEqual(changed.sort(),[
  'backend/internal/systembackupresources/restore_fields_sql.go',
  'backend/internal/systembackupresources/restore_fields_sql_test.go',
  'backend/internal/systembackupresources/restore_readback.go'
].sort());
const added=[...after.keys()].filter(p=>!before.has(p)).sort();
assert.deepEqual(added,['backend/internal/systembackupresources/restore_write.go','backend/internal/systembackupresources/restore_write_test.go'].sort());
const excludedScripts=new Set(['scripts/system-backup-d-gc-freeze-review-request.mjs','scripts/system-backup-d-independent-work-review.mjs']);
for(const p of old.files.filter(p=>p.path.startsWith('scripts/')&&!excludedScripts.has(p.path))){assert.deepEqual(source.files.find(f=>f.path===p.path),p);}
const result={kind:'a_owner_unchanged_dependency_readback_composition.v1',date:'2026-10-23',status:'owner_inventory_retained_after_non_dependency_layout_changes',source:stem+'-source.json',source_manifest_sha256:sha(read(stem+'-source.json')),source_sha256:source.source_sha256,source_files:source.files.length,events:a.events,events_sha256:a.events_sha256,inventory_source_sha256:old.source_sha256,owner_baseline:a.owner_baseline,tested_source:a.source,tested_source_manifest_sha256:a.source_manifest_sha256,changed_ordinary_inputs:changed,added_ordinary_inputs:added,ordinary_owner_dependency_inputs_unchanged:true,tagged_dependency_graph_resolved:true,platforms:['windows','linux'],resources_in_owner_dependency_closure:false,current_resources_package_accepted:false,tests_repeated:false,actual_SQL:false,human_mfa:false,dependencies_installed:false,production_approved:false,current_whole_worktree_verified:false,cleanup:{owner:n.owner,independently_absent:true},evidence:[accepted,stem+'-source.json',stem+'-native.json',stem+'-windows-imports.txt',stem+'-windows-stderr.txt',stem+'-linux-imports.txt',stem+'-linux-stderr.txt',stem+'.ps1','docs/evidence/a-owner-gc-dependency-review-20261023-r3.mjs'].map(pin)};
const output='docs/evidence/a-owner-gc-dependency-accepted-20261023-r3.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else{assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log('A_OWNER_GC_DEPENDENCY_R3 checks=5138 platforms=windows,linux resources_approval=no actual_SQL=no');
