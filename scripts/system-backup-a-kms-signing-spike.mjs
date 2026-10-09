import {spawnSync} from 'node:child_process';
import {createPublicKey, randomBytes, verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {identitySSHCommand, normalizeProbeInput} from './system-backup-a-identity-ssh.mjs';
import {readHandoff} from './system-backup-a-provider-handoff-preflight.mjs';

const purposes = {capture:'capture_certificate', acceptance:'acceptance_record', catalog:'catalog_record'};
export const expectedChecks = ['kms-roundtrip-v1','generate-unwrap-denied','unwrap-generate-denied','generate-wrong-context-denied','generate-wrong-bits-denied','unwrap-unwrap-wrong-context-denied',
  ...Object.keys(purposes).map(r=>r+'-metadata-and-sign-v1'),
  ...Object.entries(purposes).flatMap(([r,p])=>[r+'-wrong-version-denied',...Object.values(purposes).filter(v=>v!==p).map(v=>r+'-cross-'+v.replaceAll('_','-')+'-denied')])];
const pattern = /^a-ks-[a-f0-9]{24}$/;
const keys = ['kind','status','run_id','namespace','namespace_uid','action','started_at','finished_at','failed_stage','checks_passed','observations','public_proofs','pods_removed','recovery_intent_retained','provider_capability_approved','evidence_registered','production_scoped_grant_verified','token_lifecycle_verified','rotation_history_verified'];
function require(ok) {if(!ok) throw Error('remote result rejected');}
export function validateResult(v,runId,action,h) {
  if(v?.kind==='a_kms_signing_failure_v1' && v.run_id===runId && /^[a-z_-]{1,80}$/.test(v.stage)) return {kind:v.kind,run_id:runId,stage:v.stage};
  require(v && Object.keys(v).sort().join()===keys.toSorted().join());
  require(v.kind==='a_kms_signing_spike_v1' && ['passed','failed'].includes(v.status) && v.run_id===runId && v.action===action && v.namespace===h.namespace && v.namespace_uid===h.namespace_uid);
  require(Number.isFinite(Date.parse(v.started_at)) && Number.isFinite(Date.parse(v.finished_at)) && Date.parse(v.finished_at)>=Date.parse(v.started_at) && /^[a-z_-]{1,80}$/.test(v.failed_stage));
  require(['provider_capability_approved','evidence_registered','production_scoped_grant_verified','token_lifecycle_verified','rotation_history_verified'].every(k=>v[k]===false));
  require(typeof v.pods_removed==='boolean' && typeof v.recovery_intent_retained==='boolean');
  require(Array.isArray(v.checks_passed) && v.checks_passed.length<=18 && v.checks_passed.every((c,i)=>c===expectedChecks[i]));
  require(Array.isArray(v.observations) && v.observations.length<=32 && v.observations.every(o=>o && Object.keys(o).sort().join()==='action,http_status,role' && ['generate','unwrap',...Object.keys(purposes)].includes(o.role) && ['generate','unwrap','wrong-context','wrong-bits','unwrap-wrong-context','metadata','sign','wrong-version'].includes(o.action) && (o.http_status===null || Number.isInteger(o.http_status) && o.http_status>=100 && o.http_status<=599)));
  require(Array.isArray(v.public_proofs) && v.public_proofs.length<=3);
  const checked=[];
  for (const [i,proof] of v.public_proofs.entries()) {
    require(proof && Object.keys(proof).sort().join()==='purpose,signature' && proof.purpose===Object.values(purposes)[i] && typeof proof.signature==='string');
    const sig=Buffer.from(proof.signature,'base64');
    require(sig.length===64 && sig.toString('base64')===proof.signature);
    const raw=Buffer.from(h.signing[proof.purpose].public_key_base64,'base64'); require(raw.length===32);
    const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
    const payload=Buffer.from(`A-provider-spike/${runId}/${proof.purpose}`);
    require(verify(null,payload,key,sig) && !verify(null,Buffer.concat([payload,Buffer.from('tampered')]),key,sig));
    checked.push(proof.purpose);
  }
  require(new Set(Object.values(h.signing).map(r=>r.public_key_base64)).size===3);
  if(v.status==='passed') require(v.pods_removed && !v.recovery_intent_retained && v.failed_stage==='none' && (action==='cleanup' ? !v.checks_passed.length && !v.public_proofs.length : v.checks_passed.length===18 && checked.length===3));
  const {public_proofs,...safe}=v;
  return {...safe,independent_ed25519_verified:checked};
}

export function runSpike({host,passwordLogin,action,runId,run=spawnSync}) {
  require(pattern.test(runId) && ['run','cleanup'].includes(action));
  const h=readHandoff();
  const source=name=>normalizeProbeInput(readFileSync(new URL(name,import.meta.url)));
  const b64=v=>Buffer.from(v).toString('base64');
  const prefix=`import json,base64\nHANDOFF=json.loads(base64.b64decode('${b64(JSON.stringify(h))}'))\nOPTIONS=json.loads(base64.b64decode('${b64(JSON.stringify({action,run_id:runId}))}'))\nBASE_SOURCE=base64.b64decode('${b64(source('./system-backup-a-evidence-spike.py'))}').decode('utf-8')\nCLIENT_SOURCE=base64.b64decode('${b64(source('./system-backup-a-kms-signing-client.py'))}').decode('utf-8')\n`;
  const [cmd,...args]=identitySSHCommand(host,{passwordLogin}); args[args.length-1]='python3 -B -';
  const result=run(cmd,args,{shell:false,input:Buffer.concat([Buffer.from(prefix),source('./system-backup-a-kms-signing-spike.py')]),timeout:1_500_000,maxBuffer:32768,windowsHide:!passwordLogin,stdio:['pipe','pipe',passwordLogin?'inherit':'pipe']});
  if(result.error || result.signal)throw Error('SSH interrupted; cleanup unknown; use printed RECOVERY command');
  let value;
  try {value=validateResult(JSON.parse(result.stdout),runId,action,h);}
  catch {throw Error('Remote result or independent signature verification rejected; use printed RECOVERY command to check cleanup');}
  return {value,success:result.status===0 && value.status==='passed'};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2), password=args.at(-1)==='--ssh-password'; if(password)args.pop();
    const action=args.shift();
    if(!['run','cleanup'].includes(action) || args[0]!=='--ssh-host' || args.length!==(action==='run'?2:4) || action==='cleanup' && args[2]!=='--run-id')throw Error('usage: run --ssh-host HOST --ssh-password; cleanup --ssh-host HOST --run-id RUN_ID --ssh-password');
    const host=args[1]; identitySSHCommand(host,{passwordLogin:password});
    const runId=action==='run'?'a-ks-'+randomBytes(12).toString('hex'):args[3]; require(pattern.test(runId));
    console.log('run_id='+runId);
    console.log(`RECOVERY: node .\\scripts\\system-backup-a-kms-signing-spike.mjs cleanup --ssh-host ${host} --run-id ${runId}${password?' --ssh-password':''}`);
    const {value,success}=runSpike({host,passwordLogin:password,action,runId});
    console.log(JSON.stringify(value,null,2)); if(!success)process.exitCode=1;
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
