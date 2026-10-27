import {spawnSync} from 'node:child_process';
import {createHash, createPublicKey, randomBytes, verify} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {identitySSHCommand, normalizeProbeInput} from './system-backup-a-identity-ssh.mjs';
import {readHandoff} from './system-backup-a-provider-handoff-preflight.mjs';

const roles=['generate','unwrap','capture','acceptance','catalog'];
const purposes={capture:'capture_certificate',acceptance:'acceptance_record',catalog:'catalog_record'};
const groups=['revoke','expire','control'];
const pattern=/^d-lc-[a-f0-9]{24}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const expectedChecks=[...roles.flatMap(r=>[r+'-revoked-with-control',r+'-expired-with-control']),
  'kms-named-ref-cutover-and-history',...Object.keys(purposes).map(r=>r+'-named-ref-cutover')];
const assert=ok=>{if(!ok)throw Error('lifecycle result rejected; use printed RECOVERY command');};
const shape=(v,keys)=>assert(v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join()===keys.split(' ').sort().join());
const time=v=>assert(typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|\+00:00)$/.test(v) && Number.isFinite(Date.parse(v)));
const b64=(v,n)=>{assert(typeof v==='string');const b=Buffer.from(v,'base64');assert(b.length===n && b.toString('base64')===v);return b;};
const canonical=v=>JSON.stringify(v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=name=>normalizeProbeInput(readFileSync(new URL(name,import.meta.url)));
export function sources() {
  const files={base:source('./system-backup-a-evidence-spike.py'),client:source('./system-backup-d-lifecycle-client.py'),
    runner:source('./system-backup-d-lifecycle.py'),audit:source('./system-backup-d-lifecycle-audit.py')};
  const bindings=Object.fromEntries(Object.entries(files).map(([k,v])=>[k+'_sha256',sha(v)]));
  bindings.handoff_sha256='c6d15516cc4b9f32dd1f4cffaa767c050ff2f2315df4509ad086c7aa51eccf4b';
  return {files,bindings};
}
export function ref(h,run,role,generation) {
  return {endpoint:h.kms.endpoint,namespace_uid:h.namespace_uid,key_path:`transit/keys/${run}-${role}-${generation}`,key_version:1};
}
export function payload(h,run,role,generation) {
  return Buffer.from(canonical({run_id:run,purpose:purposes[role],ref:ref(h,run,role,generation),message:'D lifecycle synthetic signature'}));
}
export function validateResult(v,run,action,h,bindings) {
  assert(pattern.test(run));
  if(v?.kind==='d_lifecycle_failure_v1') {
    shape(v,'kind run_id stage');assert(v.run_id===run && ['guard','cleanup','audit','probe','issue','revoke','audit-config','key-create','key-check','key-remove','policy-old','policy-new','policy-remove','tokens-remove'].includes(v.stage));
    return v;
  }
  shape(v,'kind run_id action status started_at finished_at failed_stage namespace namespace_uid bindings owner_uid endpoint ca_sha256 tools_image context_base64 identity_refs key_refs pod_refs lifecycle checks_passed public_proofs events cleanup_verified recovery_intent_retained provider_capability_approved evidence_registered production_scoped_grant_verified disaster_recovery_eligible audit_rows audit_scope');
  assert(v.kind==='d_lifecycle_v1' && v.run_id===run && v.action===action && ['passed','failed'].includes(v.status));
  assert(v.namespace===h.namespace && v.namespace_uid===h.namespace_uid && uuid.test(v.owner_uid));
  assert(v.endpoint===h.kms.endpoint && v.ca_sha256===h.ca_sha256 && v.tools_image===h.tools_image);
  assert(canonical(v.bindings)===canonical(bindings));
  assert(v.context_base64===Buffer.from(h.namespace_uid+'/'+run+'/capture').toString('base64'));
  time(v.started_at);time(v.finished_at);assert(Date.parse(v.finished_at)>=Date.parse(v.started_at));
  assert(['none','guard','cleanup','audit','probe','issue','revoke','audit-config','key-create','key-check','key-remove','policy-old','policy-new','policy-remove','tokens-remove'].includes(v.failed_stage));
  for(const k of ['provider_capability_approved','evidence_registered','production_scoped_grant_verified','disaster_recovery_eligible'])assert(v[k]===false);
  assert(typeof v.cleanup_verified==='boolean' && v.recovery_intent_retained===!v.cleanup_verified);
  assert(v.audit_scope==='provider-file-audit-closed-projection; unsigned-operator-evidence');
  const aliases=groups.flatMap(g=>roles.map(r=>g+'-'+r));
  assert(v.pod_refs && Object.keys(v.pod_refs).every(k=>['admin',...aliases].includes(k)));
  for(const [alias,p] of Object.entries(v.pod_refs)) {shape(p,'name uid');assert(p.name===run+'-'+alias && uuid.test(p.uid));}
  assert(v.identity_refs && Object.keys(v.identity_refs).every(k=>aliases.includes(k)));
  for(const [alias,id] of Object.entries(v.identity_refs)) {
    shape(id,'secret_ref creation_time expire_time ttl_seconds renewable accessor_hmac');shape(id.secret_ref,'secret_name uid resource_version');
    assert(id.secret_ref.secret_name===run+'-'+alias && uuid.test(id.secret_ref.uid) && /^\d+$/.test(id.secret_ref.resource_version));
    assert(Number.isInteger(id.creation_time) && id.creation_time>0 && id.renewable===false && id.ttl_seconds===({expire:240,revoke:900,control:3600}[alias.split('-')[0]]));
    time(id.expire_time);assert(Math.abs(Date.parse(id.expire_time)/1000-id.creation_time-id.ttl_seconds)<2);
    assert(/^hmac-sha256:[a-f0-9]{64}$/.test(id.accessor_hmac));
  }
  const names=['kms',...Object.keys(purposes)].flatMap(r=>['old','new'].map(g=>r+'-'+g));
  assert(v.key_refs && Object.keys(v.key_refs).every(k=>names.includes(k)));
  for(const [name,k] of Object.entries(v.key_refs)) {
    const [role,generation]=name.split('-');shape(k,role==='kms'?'fingerprint ref':'fingerprint ref public_key_base64');
    assert(hash.test(k.fingerprint) && canonical(k.ref)===canonical(ref(h,run,role,generation)));
    if(role!=='kms')b64(k.public_key_base64,32);
  }
  assert(Array.isArray(v.lifecycle) && v.lifecycle.length<=5);
  for(const [i,l] of v.lifecycle.entries()) {
    shape(l,'role revoked_at expiry_positive_at expiry_denied_at elapsed_seconds propagation_tolerance_seconds');
    assert(l.role===roles[i] && l.propagation_tolerance_seconds===10 && Number.isFinite(l.elapsed_seconds) && l.elapsed_seconds>=250 && l.elapsed_seconds<=600);
    time(l.revoked_at);time(l.expiry_positive_at);time(l.expiry_denied_at);
    const expiry=Date.parse(v.identity_refs['expire-'+l.role].expire_time);
    assert(Date.parse(l.expiry_positive_at)<expiry && Date.parse(l.expiry_denied_at)>=expiry+10000);
  }
  assert(Array.isArray(v.checks_passed) && v.checks_passed.length<=expectedChecks.length && v.checks_passed.every((x,i)=>x===expectedChecks[i]));
  assert(Array.isArray(v.public_proofs) && v.public_proofs.length<=6);
  const proofNames=['old','new'].flatMap(g=>Object.keys(purposes).map(r=>r+'-'+g));
  const publicKeys=Object.values(v.key_refs).filter(x=>x.public_key_base64).map(x=>x.public_key_base64);
  assert(new Set(publicKeys).size===publicKeys.length);
  for(const [i,p] of v.public_proofs.entries()) {
    shape(p,'role generation payload_base64 public_key_base64 signature_base64');
    assert(p.role+'-'+p.generation===proofNames[i]);
    assert(p.public_key_base64===v.key_refs[proofNames[i]].public_key_base64);
    const message=payload(h,run,p.role,p.generation), signature=b64(p.signature_base64,64);
    assert(p.payload_base64===message.toString('base64'));
    const publicKey=raw=>createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),b64(raw,32)]),format:'der',type:'spki'});
    assert(verify(null,message,publicKey(p.public_key_base64),signature));
    assert(!verify(null,Buffer.concat([message,Buffer.from('tampered')]),publicKey(p.public_key_base64),signature));
    for(const other of Object.keys(purposes).filter(r=>r!==p.role))assert(!verify(null,payload(h,run,other,p.generation),publicKey(p.public_key_base64),signature));
    for(const other of publicKeys.filter(k=>k!==p.public_key_base64))assert(!verify(null,message,publicKey(other),signature));
  }
  const paths=new Set(['auth/token/create','auth/token/revoke-accessor']);
  for(const r of roles)paths.add('sys/policies/acl/'+run+'-'+r);
  for(const n of names)for(const prefix of ['transit/keys/','transit/datakey/plaintext/','transit/decrypt/','transit/sign/']) {
    paths.add(prefix+run+'-'+n);if(prefix==='transit/keys/')paths.add(prefix+run+'-'+n+'/config');
  }
  assert(Array.isArray(v.events) && v.events.length<=1024);
  for(const e of v.events) {
    shape(e,'path method http_status request_id observed_unix pod action');
    assert(paths.has(e.path) && ['GET','POST','DELETE'].includes(e.method) && [200,204,400,403,404].includes(e.http_status));
    assert(e.request_id===null || uuid.test(e.request_id));assert(Number.isFinite(e.observed_unix) && e.observed_unix>0);
    assert(['admin',...aliases].includes(e.pod) && ['probe','issue','revoke','key-create','key-check','key-remove','policy-old','policy-new','policy-remove','tokens-remove'].includes(e.action));
  }
  assert(Array.isArray(v.audit_rows) && v.audit_rows.length<=4096);
  for(const row of v.audit_rows) {
    shape(row,'request_id type time path operation identity error');time(row.time);
    assert(uuid.test(row.request_id) && ['request','response'].includes(row.type) && paths.has(row.path) && ['read','update','create','delete','list'].includes(row.operation));
    assert([...aliases,'control-or-unresolved'].includes(row.identity) && typeof row.error==='boolean');
  }
  if(v.status==='passed') {
    assert(v.cleanup_verified && v.failed_stage==='none');
    if(action==='run')assert(v.checks_passed.length===14 && v.lifecycle.length===5 && v.public_proofs.length===6 && Object.keys(v.identity_refs).length===15 && Object.keys(v.key_refs).length===8 && Object.keys(v.pod_refs).length===16 && v.audit_rows.length>0);
    // Bind provider success observations to both audit records, also checked remotely.
    for(const e of v.events.filter(e=>e.request_id))assert(['request','response'].every(t=>v.audit_rows.some(r=>r.request_id===e.request_id && r.type===t)));
    for(const l of v.lifecycle) {
      assert(['request','response'].every(t=>v.audit_rows.some(r=>r.path==='auth/token/revoke-accessor' && r.identity==='revoke-'+l.role && r.type===t)));
      assert(!v.audit_rows.some(r=>r.path==='auth/token/revoke-accessor' && r.identity==='expire-'+l.role && Date.parse(r.time)<=Date.parse(l.expiry_denied_at)));
    }
  }
  return v;
}

export function runLifecycle({host,passwordLogin,action,runId,run=spawnSync}) {
  assert(pattern.test(runId) && ['run','cleanup'].includes(action));
  const h=readHandoff(), {files,bindings}=sources();
  const encode=v=>Buffer.from(v).toString('base64');
  const prefix=`import json,base64\nHANDOFF=json.loads(base64.b64decode('${encode(JSON.stringify(h))}'))\nOPTIONS=json.loads(base64.b64decode('${encode(JSON.stringify({action,run_id:runId}))}'))\nBINDINGS=json.loads(base64.b64decode('${encode(JSON.stringify(bindings))}'))\n`+
    [['BASE_SOURCE',files.base],['CLIENT_SOURCE',files.client],['AUDIT_SOURCE',files.audit]].map(([k,v])=>`${k}=base64.b64decode('${encode(v)}').decode('utf-8')\n`).join('');
  const [cmd,...args]=identitySSHCommand(host,{passwordLogin});args[args.length-1]='python3 -B -';
  const result=run(cmd,args,{shell:false,input:Buffer.concat([Buffer.from(prefix),files.runner]),timeout:3_000_000,maxBuffer:1024*1024,
    windowsHide:!passwordLogin,stdio:['pipe','pipe',passwordLogin?'inherit':'pipe']});
  if(result.error || result.signal)throw Error('SSH interrupted; cleanup unknown; use printed RECOVERY command');
  let v;try{v=validateResult(JSON.parse(result.stdout),runId,action,h,bindings);}catch{throw Error('Remote output/signature/audit validation failed; use printed RECOVERY command');}
  return {value:v,success:result.status===0 && v.status==='passed'};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2), passwordLogin=args.at(-1)==='--ssh-password';if(passwordLogin)args.pop();
    const action=args.shift();
    if(action==='verify' && args.length===2 && args[0]==='--file') {
      const v=JSON.parse(readFileSync(args[1],'utf8'));
      validateResult(v,v.run_id,v.action,readHandoff(),sources().bindings);
      assert(v.kind==='d_lifecycle_v1' && v.action==='run' && v.status==='passed');
      console.log('PASS: local signatures, ref/purpose/tamper negatives, audit bindings and cleanup report checked; unsigned evidence');
    } else {
      if(!['run','cleanup'].includes(action) || args[0]!=='--ssh-host' || args.length!==(action==='run'?2:4) || action==='cleanup' && args[2]!=='--run-id')throw Error('usage: run --ssh-host HOST --ssh-password; cleanup --ssh-host HOST --run-id RUN --ssh-password; verify --file FILE');
      const host=args[1];identitySSHCommand(host,{passwordLogin});
      const runId=action==='run'?'d-lc-'+randomBytes(12).toString('hex'):args[3];assert(pattern.test(runId));
      console.log('run_id='+runId);
      console.log(`RECOVERY: node .\\scripts\\system-backup-d-lifecycle.mjs cleanup --ssh-host ${host} --run-id ${runId}${passwordLogin?' --ssh-password':''}`);
      const {value,success}=runLifecycle({host,passwordLogin,action,runId});
      const suffix=action==='cleanup'?'-'+randomBytes(4).toString('hex'):'';
      const path=new URL(`../docs/evidence/system-backup-d-lifecycle-${runId}-${action}${suffix}.json`,import.meta.url);
      writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
      console.log('redacted_result='+fileURLToPath(path));console.log('status='+(value.status??'failed'));
      if(!success)process.exitCode=1;
    }
  } catch {console.error('Lifecycle command failed; retain the printed run ID and use RECOVERY if a remote run started. Raw output withheld.');process.exitCode=1;}
}
