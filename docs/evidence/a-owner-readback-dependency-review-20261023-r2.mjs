import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const pin=f=>({path:f,sha256:sha(read(f))});
const accepted='docs/evidence/a-owner-current-full-accepted-20261023.json',a=json(accepted);
assert.equal(a.owner_baseline.all,5105);assert.equal(sha(read(a.source)),a.source_manifest_sha256);assert.equal(sha(read(a.events)),a.events_sha256);
const old=json(a.source),stem='docs/evidence/a-owner-dependency-freeze-20261023-r2',source=json(stem+'-source.json'),n=json(stem+'-native.json');
for(const s of [old,source]){assert.equal(new Set(s.files.map(p=>p.path)).size,s.files.length);assert.equal(sha(Buffer.from(s.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n')),s.source_sha256);}
assert.equal(n.exit,0);assert.equal(n.source_postcheck,true);assert.equal(n.source_sha256,source.source_sha256);assert.equal(n.removed,true);
for(const k of ['tests_executed','actual_sql','dependencies_installed','resources_in_dependency_closure'])assert.equal(n[k],false);
assert.equal(path.dirname(n.owner),root);assert.match(path.basename(n.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(n.owner),false);
const imports=read(stem+'-imports.txt').toString('utf8').trim().split(/\r?\n/);
for(const p of ['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence'])assert.ok(imports.includes(p));
assert.ok(!imports.some(p=>/^clawreef\/internal\/systembackupresources(?:\s|\.|$)/.test(p)));assert.equal(read(stem+'-stderr.txt').length,0);
const ordinary=p=>/^(backend|contracts)\//.test(p.path)&&!p.path.endsWith('_mysql_test.go');
const before=new Map(old.files.filter(ordinary).map(p=>[p.path,p])),after=new Map(source.files.filter(ordinary).map(p=>[p.path,p]));
const fixture='backend/internal/systembackupresources/restore_fields_sql_test.go';
const changed=[];
for(const [name,p] of before){assert.ok(after.has(name));if(JSON.stringify(after.get(name))!==JSON.stringify(p))changed.push(name);}
assert.deepEqual(changed,[fixture]);
assert.equal(after.get(fixture).sha256,'78db9f6aa1116a92a6010849e8af7da683641775d11a76c01d7999068a4fcb91');
assert.equal(sha(read(fixture)),after.get(fixture).sha256);
const added=[...after.keys()].filter(p=>!before.has(p)).sort();
assert.deepEqual(added,['backend/internal/systembackupresources/restore_five.go','backend/internal/systembackupresources/restore_five_test.go','backend/internal/systembackupresources/restore_readback.go','backend/internal/systembackupresources/restore_readback_test.go','backend/internal/systembackupresources/testdata/restore-readback-mysql-inputs.json'].sort());
for(const p of old.files.filter(p=>p.path.startsWith('scripts/')))assert.deepEqual(source.files.find(f=>f.path===p.path),p);
const resource='docs/evidence/a-resources-readback-reviewed-20261023.json',r=json(resource),request=json(r.request.path);
assert.equal(r.pass_events,678);assert.equal(r.production_approved,false);
for(const f of added){const p=after.get(f);assert.equal(sha(read(f)),p.sha256);if(f.includes('/restore_readback.'))assert.deepEqual(p,request.source_files.find(p=>p.path===f));}
const result={kind:'a_owner_unchanged_dependency_readback_composition.v1',date:'2026-10-23',status:'owner_inventory_retained_after_non_dependency_layout_changes',source:stem+'-source.json',source_manifest_sha256:sha(read(stem+'-source.json')),source_sha256:source.source_sha256,source_files:source.files.length,events:a.events,events_sha256:a.events_sha256,inventory_source_sha256:old.source_sha256,owner_baseline:a.owner_baseline,tested_source:a.source,tested_source_manifest_sha256:a.source_manifest_sha256,changed_ordinary_inputs:changed,added_ordinary_inputs:added,ordinary_owner_dependency_inputs_unchanged:true,tagged_dependency_graph_resolved:true,resources_in_owner_dependency_closure:false,current_resources_package_accepted:false,resource_fixture_delta:'test-only optional table values; nil retains previous fixture',tests_repeated:false,actual_SQL:false,dependencies_installed:false,production_approved:false,current_whole_worktree_verified:false,cleanup:{owner:n.owner,independently_absent:true},evidence:[accepted,stem+'-source.json',stem+'-native.json',stem+'-imports.txt',stem+'-stderr.txt','docs/evidence/a-owner-dependency-freeze-20261023-r2.ps1',resource,r.request.path,'docs/evidence/a-owner-readback-dependency-review-20261023-r2.mjs'].map(pin)};
const output='docs/evidence/a-owner-readback-dependency-accepted-20261023-r2.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log('A_OWNER_DEPENDENCY_COMPOSITION_R2 checks=5105 changed=1 added=5 resources_approval=no actual_SQL=no');
