// Exact non-dependency composition only; never a new test or SQL result.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const tested='docs/evidence/a-owner-gc-full-accepted-20261023.json';
const a=json(tested),old=json(a.source);
assert.equal(sha(read(a.source)),a.source_manifest_sha256);
assert.equal(sha(read(a.events)),a.events_sha256);
assert.deepEqual(a.owner_baseline,{main:636,all:5138});
const stem='docs/evidence/a-owner-dependency-freeze-20261023-r4';
const s=json(stem+'-source.json'),n=json(stem+'-native.json');
for(const m of [old,s]){
 assert.equal(m.stable_copy_verified,true);assert.equal(m.dependencies_installed,false);
 assert.equal(new Set(m.files.map(p=>p.path)).size,m.files.length);
 assert.equal(sha(m.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'),m.source_sha256);
}
assert.equal(n.exit,0);assert.equal(n.source_postcheck,true);assert.equal(n.removed,true);
assert.equal(n.source_sha256,s.source_sha256);assert.deepEqual(n.platforms_completed,['windows','linux']);
assert.deepEqual(n.roots,['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/cmd/system-backup-migrate']);
assert.equal(path.dirname(n.owner),root);assert.match(path.basename(n.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(n.owner),false);
for(const platform of n.platforms_completed){
 const imports=read(stem+'-'+platform+'-imports.txt').toString('utf8').trim().split(/\r?\n/);
 for(const p of n.roots)assert.ok(imports.includes(p));
 assert.ok(!imports.some(p=>/^clawreef\/internal\/systembackupresources(?:\s|\.|$)/.test(p)));
 assert.equal(read(stem+'-'+platform+'-stderr.txt').length,0);
}
const scope=p=>/^(backend|contracts)\//.test(p.path);
const before=new Map(old.files.filter(scope).map(p=>[p.path,p]));
const after=new Map(s.files.filter(scope).map(p=>[p.path,p]));
const changed=[],added=[];
for(const [p,v] of before){assert.ok(after.has(p),'removed input '+p);if(JSON.stringify(v)!==JSON.stringify(after.get(p)))changed.push(p);}
for(const p of after.keys())if(!before.has(p))added.push(p);
for(const p of [...changed,...added])assert.ok(p.startsWith('backend/internal/systembackupresources/') || p.startsWith('backend/cmd/server/') && p.endsWith('_mysql_test.go'),'owner dependency changed: '+p);
// Also preserve every script that participates in the original owner runner.
const exemptions=new Set(['scripts/system-backup-d-resources-mysql-validation.ps1','scripts/system-backup-d-resources-readback-phase.sh','scripts/system-backup-d-gc-freeze-review-request.mjs','scripts/system-backup-d-independent-work-review.mjs']);
for(const p of old.files.filter(p=>p.path.startsWith('scripts/')&&!exemptions.has(p.path)))assert.deepEqual(s.files.find(v=>v.path===p.path),p);
const report={kind:'a_owner_unchanged_dependency_readback_composition.v1',date:'2026-10-23',status:'owner_inventory_retained_after_non_dependency_layout_changes',source:stem+'-source.json',source_manifest_sha256:sha(read(stem+'-source.json')),source_sha256:s.source_sha256,source_files:s.files.length,events:a.events,events_sha256:a.events_sha256,inventory_source_sha256:old.source_sha256,owner_baseline:a.owner_baseline,tested_source:a.source,tested_source_manifest_sha256:a.source_manifest_sha256,changed_ordinary_inputs:changed.sort(),added_ordinary_inputs:added.sort(),ordinary_owner_dependency_inputs_unchanged:true,tagged_dependency_graph_resolved:true,platforms:['windows','linux'],resources_in_owner_dependency_closure:false,current_resources_package_accepted:false,tests_repeated:false,actual_SQL:false,human_mfa:false,dependencies_installed:false,production_approved:false,current_whole_worktree_verified:false,cleanup:{owner:n.owner,independently_absent:true},evidence:[tested,stem+'-source.json',stem+'-native.json',stem+'-windows-imports.txt',stem+'-windows-stderr.txt',stem+'-linux-imports.txt',stem+'-linux-stderr.txt',stem+'.ps1','docs/evidence/a-owner-gc-dependency-review-20261023-r4.mjs'].map(pin)};
const output='docs/evidence/a-owner-gc-dependency-accepted-20261023-r4.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),report);}
console.log('A_OWNER_GC_DEPENDENCY_R4 owner_checks=5138 resources_approval=no actual_SQL=no');
