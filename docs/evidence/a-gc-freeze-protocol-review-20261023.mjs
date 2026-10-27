// A's local protocol decision, not a joint A/D approval or deployed grant.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const request='docs/evidence/d-gc-freeze-protocol-review-request-20261023.json',r=json(request);
const documentationDrift=[];
for(const p of r.inputs){
 const current=sha(read(p.path));
 if(current!==p.sha256 && p.path==='docs/system-backup-d-independent-work-20261023.md')documentationDrift.push({path:p.path,requested_sha256:p.sha256,current_sha256:current});
 else assert.equal(current,p.sha256,'request drift: '+p.path);
}
const v=json(r.validation);
for(const p of ['exit_code','linux_build_exit'])assert.equal(v[p],0);
for(const p of ['inputs_stable','owner_removed','default_vet'])assert.equal(v[p],true);
for(const p of ['actual_mysql','collector_wired','role_approved','dependencies_installed'])assert.equal(v[p],false);
assert.equal(v.error,null);assert.equal(path.dirname(v.owner),root);assert.match(path.basename(v.owner),/^\.tmp-d-freeze-protocol-[a-f0-9]{32}$/);assert.equal(fs.existsSync(v.owner),false);
const events=read(path.relative(root,v.log)).toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
assert.ok(!events.some(e=>['fail','skip','build-fail'].includes(e.Action)));
assert.equal(events.filter(e=>e.Action==='pass'&&!e.Test).length,1);
assert.deepEqual(events.filter(e=>e.Action==='run').map(e=>e.Test).sort(),events.filter(e=>e.Action==='pass'&&e.Test).map(e=>e.Test).sort());
const code=read('backend/internal/systembackupevidence/download_retention_gc_freeze.go').toString('utf8');
for(const s of ['sql.OpenDB(c.Connector)','db.SetMaxIdleConns(0)','conn.BeginTx(ctx','LOCK INSTANCE FOR BACKUP','UNLOCK INSTANCE','errDownloadGCFreezeCommitUnknown','driver.ErrBadConn'])assert.ok(code.includes(s));
const requirements='docs/evidence/d-gc-backup-lock-protocol-requirements-20261021.json';
const groups=json(requirements).actual_acceptance_groups;
assert.equal(groups.length,12);
const report={kind:'a_gc_freeze_local_protocol_review.v1',decision:'private_protocol_candidate_locally_reviewed_joint_protocol_and_actual_acceptance_pending',scope:'exact_candidate_connection_transaction_outcomes_only',reviewed_boundaries:['explicit_separate_privilege_profile_required','global_freeze_before_metadata_and_existing_transaction_lock_prefix','fresh_private_session_and_one_RR_transaction','known_commit_retained_after_cancellation','unknown_commit_rollback_release_reported_separately_no_retry','discard_request_not_server_release_evidence','original_authorization_and_cleanup_deadline_not_extended'],local_candidate_pass_events:events.filter(e=>e.Test&&e.Action==='pass').length,required_actual_groups:groups.map(g=>g.id),joint_A_D_approval:false,grants_approved:false,collector_wired:false,full_GC_accepted:false,actual_mysql:false,production_approved:false,dependencies_installed:false,cleanup_verified:true,source_files:r.inputs,artifacts:[request,r.validation,path.relative(root,v.source).replaceAll('\\','/'),path.relative(root,v.log).replaceAll('\\','/'),requirements,'docs/system-backup-a-gc-freeze-review-20261023.md','docs/evidence/a-gc-freeze-protocol-review-20261023.mjs'].map(pin)};
report.supporting_documentation_drift=documentationDrift;
report.source_files=r.inputs.map(p=>({path:p.path,sha256:sha(read(p.path))}));
const out='docs/evidence/a-gc-freeze-protocol-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else{assert.ok(process.argv.includes('--check'));assert.deepEqual(json(out),report);}
console.log('A_GC_PROTOCOL_LOCAL_REVIEW actual_groups=12 joint_approval=no actual_mysql=no');
