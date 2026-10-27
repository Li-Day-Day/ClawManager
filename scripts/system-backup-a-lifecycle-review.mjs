// Offline A review of D's bounded lifecycle evidence. No cluster access or writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readHandoff} from './system-backup-a-provider-handoff-preflight.mjs';
import {sources,validateResult} from './system-backup-d-lifecycle.mjs';

export const evidenceFile = 'docs/evidence/system-backup-d-lifecycle-d-lc-387dab09ff2a1367ca4b5b56-run.json';
export const evidenceHash = '99fc68a174daa0785fbbb9b552f7f2fe05432daa284b8aad8d3123a9625fdcd9';
const roles=['generate','unwrap','capture','acceptance','catalog'];
const signers=roles.slice(2);
const secs=t=>Date.parse(t)/1000;
function expectedTrace(run) {
  const out=[];
  const add=(pod,action,method,path,http_status)=>out.push({pod,action,method,path,http_status});
  const admin=(action,method,path,code)=>add('admin',action,method,path,code);
  const key=(role,g)=>`transit/keys/${run}-${role}-${g}`;
  const policy=role=>`sys/policies/acl/${run}-${role}`;
  const issue=()=>admin('issue','POST','auth/token/create',200);
  const probe=(role,g='old',code=200,group='control',target=role)=>add(`${group}-${role}`,'probe','POST',
    (target==='generate'?'transit/datakey/plaintext/':target==='unwrap'?'transit/decrypt/':'transit/sign/')+run+'-'+(['generate','unwrap'].includes(target)?'kms':target)+'-'+g,code);
  for(const r of ['kms',...signers])for(const g of ['old','new']) {
    admin('key-create','GET',key(r,g),404);admin('key-create','POST',key(r,g),200);admin('key-create','GET',key(r,g),200);
  }
  for(const r of roles) {admin('policy-old','GET',policy(r),404);admin('policy-old','POST',policy(r),204);issue();}
  probe('generate');
  for(const r of roles) {
    issue();probe(r,'old',200,'revoke');admin('revoke','POST','auth/token/revoke-accessor',204);
    probe(r);probe(r,'old',403,'revoke');probe(r);
    issue();probe(r,'old',200,'expire');probe(r);probe(r,'old',403,'expire');probe(r);
  }
  probe('generate');probe('unwrap');for(const r of signers)probe(r);
  for(const r of ['generate',...signers]) {admin('policy-new','GET',policy(r),200);admin('policy-new','POST',policy(r),204);}
  probe('generate','new');probe('unwrap','new');probe('generate','old',403);probe('unwrap');
  probe('unwrap','new',400);probe('unwrap','old',400);probe('unwrap','old',403);probe('generate','new',403);
  for(const r of signers) {
    probe(r,'new');probe(r,'old',403);probe(r,'new',403);probe(r,'new',403);
    for(const other of signers.filter(x=>x!==r))probe(r,'new',403,'control',other);
  }
  for(const r of ['kms',...signers])for(const g of ['old','new'])admin('key-check','GET',key(r,g),200);
  for(const r of roles)admin('tokens-remove','POST','auth/token/revoke-accessor',204);
  for(const r of roles)for(const [method,code] of [['GET',200],['DELETE',204],['GET',404]])admin('policy-remove',method,policy(r),code);
  for(const r of ['kms',...signers])for(const g of ['old','new']) {
    admin('key-remove','GET',key(r,g),200);admin('key-remove','POST',key(r,g)+'/config',200);
    admin('key-remove','DELETE',key(r,g),204);admin('key-remove','GET',key(r,g),404);
  }
  return out;
}

export function review(v) {
  const h=readHandoff();
  validateResult(v,v.run_id,'run',h,sources().bindings); // Includes six real Ed25519 verifications and negatives.
  assert.equal(v.status,'passed');assert.equal(v.action,'run');
  assert.deepEqual(v.events.map(({pod,action,method,path,http_status})=>({pod,action,method,path,http_status})),expectedTrace(v.run_id));
  const start=secs(v.started_at),finish=secs(v.finished_at);
  for(const [i,e] of v.events.entries()) {
    assert(e.observed_unix>=start && e.observed_unix<=finish);
    if(i)assert(e.observed_unix>v.events[i-1].observed_unix);
  }
  for(const field of ['accessor_hmac'])assert.equal(new Set(Object.values(v.identity_refs).map(x=>x[field])).size,15);
  assert.equal(new Set(Object.values(v.identity_refs).map(x=>x.secret_ref.uid)).size,15);
  assert.equal(new Set(Object.values(v.pod_refs).map(x=>x.uid)).size,16);
  // Match every observation to a distinct provider request/response pair.
  // Responses without request_id are correlated by serial order, path, method and time,
  // not treated as cryptographic attestations of the client identity.
  const pairs=new Map();
  for(const row of v.audit_rows) {if(!pairs.has(row.request_id))pairs.set(row.request_id,[]);pairs.get(row.request_id).push(row);}
  assert.equal(pairs.size,v.events.length);
  const ordered=[...pairs.values()].map(rows=>{
    assert.equal(rows.length,2);const req=rows.find(r=>r.type==='request'),res=rows.find(r=>r.type==='response');
    assert(req && res);assert(secs(req.time)<=secs(res.time));return {req,res};
  }).sort((a,b)=>secs(a.req.time)-secs(b.req.time));
  for(const [i,e] of v.events.entries()) {
    const {req,res}=ordered[i];
    for(const r of [req,res]) {
      assert.equal(r.path,e.path);assert.equal(r.operation,{GET:'read',POST:'update',DELETE:'delete'}[e.method]);
      assert(Math.abs(secs(r.time)-e.observed_unix)<1);
      if(e.request_id)assert.equal(r.request_id,e.request_id);
    }
    assert.equal(res.error,[400,403].includes(e.http_status));
    if(e.pod!=='admin') {
      const expected=e.http_status===403 && /^(revoke|expire)-/.test(e.pod)?'control-or-unresolved':e.pod;
      assert.equal(req.identity,expected);assert.equal(res.identity,expected);
    }
  }
  const expiryMargins=[];
  for(const life of v.lifecycle) {
    const role=life.role;
    for(const group of ['revoke','expire']) {
      const alias=group+'-'+role;
      const events=v.events.filter(e=>e.pod===alias);
      assert.deepEqual(events.map(e=>e.http_status),[200,403]);
      const [positive,negative]=events, id=v.identity_refs[alias], expiry=secs(id.expire_time);
      assert(positive.observed_unix>=id.creation_time && positive.observed_unix<expiry);
      const idx=v.events.indexOf(negative);
      for(const control of [v.events[idx-1],v.events[idx+1]]) {
        assert.equal(control.pod,'control-'+role);assert.equal(control.path,negative.path);assert.equal(control.http_status,200);
        assert(control.observed_unix<secs(v.identity_refs['control-'+role].expire_time));
      }
      const revokes=v.audit_rows.filter(r=>r.type==='response' && r.path==='auth/token/revoke-accessor' && r.identity===alias);
      if(group==='expire') {
        assert(negative.observed_unix>=expiry+10);assert.equal(revokes.length,0);
        assert(positive.observed_unix<=secs(life.expiry_positive_at) && secs(life.expiry_positive_at)<expiry);
        assert(negative.observed_unix<=secs(life.expiry_denied_at));
        expiryMargins.push(negative.observed_unix-expiry);
      } else {
        assert.equal(revokes.length,1);assert.equal(revokes[0].error,false);
        assert(secs(revokes[0].time)>positive.observed_unix && secs(revokes[0].time)<negative.observed_unix);
        assert(negative.observed_unix<expiry); // Natural expiry cannot explain the revocation denial.
      }
    }
    const removed=v.audit_rows.filter(r=>r.type==='response' && r.path==='auth/token/revoke-accessor' && r.identity==='control-'+role);
    assert.equal(removed.length,1);assert.equal(removed[0].error,false);
    assert(secs(removed[0].time)>Math.max(...v.events.filter(e=>e.action==='probe').map(e=>e.observed_unix)));
  }
  return {checks:14,signatures_verified:6,lifecycle_groups:10,events_checked:v.events.length,audit_rows_checked:v.audit_rows.length,
    minimum_expiry_denial_seconds_after_expiration:Math.min(...expiryMargins),key_absence_observations:8,policy_absence_observations:5,
    cleanup_report_accepted:true,independent_cluster_requery:false,operator_process_exit_code:null,
    acceptance:'accepted_for_isolated_lifecycle_and_named_ref_rotation_only',provider_capability_approved:false,evidence_registered:false};
}

export function reviewFile() {
  const bytes=readFileSync(new URL('../'+evidenceFile,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),evidenceHash);
  return review(JSON.parse(bytes));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(reviewFile(),null,2));}
  catch {console.error('A offline lifecycle review failed; no remote actions performed.');process.exitCode=1;}
}
