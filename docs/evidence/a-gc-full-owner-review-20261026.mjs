// Independent frozen-candidate intake. No Go execution or D request rewriting.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const local=p=>{const f=path.resolve(root,p);assert.ok(f.startsWith(root+path.sep));return f;};
const read=p=>fs.readFileSync(local(p)),json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:path.relative(root,local(p)).replaceAll('\\','/'),size:read(p).length,sha256:sha(read(p))});
const requestPath='docs/evidence/d-gc-full-review-request-20261026.json',request=json(requestPath),source=json(request.source_manifest),receipt=json(request.receipt);
assert.equal(request.kind,'d_gc_full_owner_review_request.v1');assert.equal(request.source_sha256,'093f6b84d87d70bafc2819b351d1d36874dea32cd35e89420461f218e8eb8def');
assert.deepEqual(Object.keys(source).sort(),['dependencies_installed','files','kind','source_sha256','stable_copy_verified']);assert.equal(source.kind,'d_gc_full_frozen_source.v1');assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);assert.equal(source.files.length,1644);
const names=source.files.map(p=>p.path);assert.deepEqual(names,[...new Set(names)].sort());
for(const p of source.files){assert.deepEqual(Object.keys(p).sort(),['path','sha256','size']);assert.match(p.path,/^(backend|contracts|scripts|docs)\//);assert.ok(!p.path.includes('\\')&&!p.path.split('/').some(v=>['..','.',''].includes(v)));assert.ok(Number.isSafeInteger(p.size)&&p.size>=0);assert.match(p.sha256,/^[a-f0-9]{64}$/);}
assert.equal(sha(Buffer.from(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')),source.source_sha256);assert.equal(source.source_sha256,request.source_sha256);
assert.equal(receipt.kind,'d_gc_full_local_validation.v1');assert.equal(receipt.error,null);assert.equal(receipt.frozen_inputs_stable,true);assert.equal(receipt.owner_removed,true);assert.equal(local(receipt.source_manifest),local(request.source_manifest));
for(const key of ['dependencies_installed','actual_mysql','production_approved'])assert.equal(receipt[key],false);
assert.deepEqual(receipt.steps.map(s=>[s.name,s.exit_code]),[['adapter',0],['complete',0],['linux-tagged',0]]);
for(const p of request.owned_inputs){assert.deepEqual(pin(p.path),p,'owned GC source changed');assert.deepEqual(source.files.find(f=>f.path===p.path),p);}
const ev='clawreef/internal/systembackupevidence',md='clawreef/internal/systembackupgcmetadata';
const complete=read(request.complete.log).toString('utf8'),adapter=read(request.adapter.log).toString('utf8');
assert.equal(sha(Buffer.from(complete)),request.complete.sha256);assert.equal(sha(Buffer.from(adapter)),request.adapter.sha256);
const rows=complete.trim().split(/\r?\n/).map(JSON.parse);
assert.deepEqual([...new Set(rows.map(e=>e.Package))].sort(),[ev,md].sort());
const inventory=[ev,md].map(pkg=>{const tests=validateGoEvents(rows.filter(e=>e.Package===pkg).map(JSON.stringify).join('\n')+'\n',pkg);return {package:pkg,tests,roots:tests.filter(n=>!n.includes('/')).length,events:tests.length};});
assert.equal(inventory.reduce((n,p)=>n+p.roots,0),409);assert.equal(inventory.reduce((n,p)=>n+p.events,0),3493);
const full=validateGoEvents(adapter,ev);assert.equal(full.length,33);assert.equal(full.filter(n=>!n.includes('/')).length,4);
for(const t of full)assert.ok(inventory[0].tests.includes(t));
for(const suffix of ['commit','late_authority','late_hold'])assert.ok(full.includes('TestDownloadGCFullSystemProducerCollect/'+suffix),'missing public producer path '+suffix);
const oldPath='docs/evidence/a-owner-final-native-20261026.jsonl';
const oldRows=read(oldPath).toString('utf8').trim().split(/\r?\n/).map(JSON.parse).filter(e=>e.Package===ev);
const old=validateGoEvents(oldRows.map(JSON.stringify).join('\n')+'\n',ev);
for(const t of old)assert.ok(inventory[0].tests.includes(t),'previous owner test omitted '+t);
const runnerPath='scripts/system-backup-d-gc-full-local-validation.ps1',runner=read(runnerPath).toString('utf8');
for(const text of ["$env:GOPROXY='off'","$env:GOSUMDB='off'","$env:GOTOOLCHAIN='local'","'-mod=readonly'","'-count=1'","'-tags','systembackup_mysql'","'./internal/systembackupevidence','./internal/systembackupgcmetadata'"])assert.ok(runner.includes(text));
assert.ok(!runner.includes('-vet=off'));assert.equal(read(receipt.steps[2].log).length,0);
const owners=new Set(request.owners.map(o=>o.path));assert.ok(owners.has(receipt.owner));assert.equal(owners.size,5);
for(const owner of owners){assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(owner),false);}
const inputs=[requestPath,request.source_manifest,request.receipt,request.adapter.log,request.complete.log,receipt.steps[2].log,oldPath,'docs/evidence/a-gc-full-owner-review-20261026.mjs',...request.owned_inputs.map(p=>p.path)];
const report={kind:'a_gc_full_frozen_owner_candidate_acceptance.v1',status:'accepted_exact_frozen_full_owner_call_chain_not_production_gc',source_sha256:source.source_sha256,source_files:1644,owned_current_GC_inputs_match_frozen:true,whole_current_worktree_approved:false,packages:inventory.map(({tests,...p})=>p),previous_evidence_pass_names_preserved:old.length,public_full_roots:4,public_full_pass_events:33,system_producer_public_commit_and_two_late_rejections:true,linux_tagged_compile_exit:0,linux_binary_hash_recorded:false,source_postcheck:true,owners_independently_absent:[...owners].sort(),reviewed_boundaries:['explicit full profile and mandatory original authority; legacy Policy cannot silently enable freeze','separate closed full grants shape plus original complete grant hash; unchanged Early role','original config, worker, peer and expiry scope; held observer before transaction','fixed protected work completion, post-ticket finalizer, sole commit and explicit release/discard','task and producer public owner paths with late mutation rollback','unknown commit/rollback/release preserved; no batch cursor advancement'],historical_15ff_suite_timeout_not_accepted:true,actual_mysql:false,real_domain_policy_or_protocol_authority_approved:false,actual_twelve_groups_accepted:false,physical_capacity_or_takeover_accepted:false,dependencies_installed:false,Go_or_builds_repeated:false,production_approved:false,goal_complete:false,inputs:[...new Set(inputs)].sort().map(pin)};
const output='docs/evidence/a-gc-full-owner-reviewed-20261026.json';assert.ok(['--write','--check'].includes(process.argv[2])&&process.argv.length===3);
if(process.argv[2]==='--write')fs.writeFileSync(local(output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});else assert.deepEqual(json(output),report);
console.log(`A_GC_FULL_FROZEN_OWNER_ACCEPTED source=093f roots=409 events=3493 old_evidence=${old.length} public=4/33 actual_mysql=no production=no`);
