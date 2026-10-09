import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identitySSHCommand, normalizeProbeInput } from './system-backup-a-identity-ssh.mjs';
import { readHandoff } from './system-backup-a-provider-handoff-preflight.mjs';

const runPattern = /^a-ev-[a-f0-9]{24}$/;
const diagnosticCodes = new Set(['none','other','AccessDenied','NoSuchKey','BadDigest','PreconditionFailed','SignatureDoesNotMatch','InvalidAccessKeyId','NotImplemented',
  'XAmzContentChecksumMismatch','XAmzContentSHA256Mismatch','InvalidRequest','InvalidArgument','InvalidDigest','InternalError','SlowDown',
  'tls_verification_failed','provider_timeout','provider_transport_failed','client_failed']);
function validObservation(v) {
  return v && Object.keys(v).sort().join() === ['role','action','object','http_status','error_code'].sort().join() &&
    ['read','write','delete'].includes(v.role) && ['put','put-conflict','put-bad-checksum','get','range','head','delete','outside-get','list','tls-negative'].includes(v.action) &&
    ['payload','bad-checksum'].includes(v.object) && (v.http_status === null || Number.isInteger(v.http_status) && v.http_status >= 100 && v.http_status <= 599) && diagnosticCodes.has(v.error_code);
}
export const expectedChecks = ['write-sha256','conditional-create-conflict','read-content-sha256','range-content','bad-checksum-rejected',
  'read-put-conflict-denied','read-delete-denied','write-get-denied','write-delete-denied','delete-get-denied','delete-put-conflict-denied',
  'read-outside-get-denied','read-list-denied','write-outside-get-denied','write-list-denied','delete-outside-get-denied','delete-list-denied','tls-ca-and-hostname-denials'];
export function validateSpike(value, runId, action, handoff) {
  if (value?.kind === 'a_evidence_spike_failure_v1' && value.run_id === runId && /^[a-z_-]{1,80}$/.test(value.stage)) {
    return {kind:value.kind,run_id:runId,stage:value.stage};
  }
  const keys = ['kind','status','run_id','namespace','namespace_uid','action','started_at','finished_at','failed_stage','checks_passed',
    'observations','objects_removed','pods_removed','recovery_intent_retained','provider_capability_approved','evidence_registered','production_scoped_grant_verified'];
  if (!value || Object.keys(value).sort().join() !== keys.sort().join() || value.kind !== 'a_evidence_spike_v2' || !['passed','failed'].includes(value.status) ||
    value.run_id !== runId || value.action !== action || value.namespace !== handoff.namespace || value.namespace_uid !== handoff.namespace_uid ||
    !Number.isFinite(Date.parse(value.started_at)) || !Number.isFinite(Date.parse(value.finished_at)) || Date.parse(value.finished_at) < Date.parse(value.started_at) ||
    !/^[a-z_-]{1,80}$/.test(value.failed_stage) || !Array.isArray(value.checks_passed) || value.checks_passed.length > 18 ||
    value.checks_passed.some(s=> typeof s!=='string' || !/^[a-z0-9-]{1,70}$/.test(s)) ||
    !Array.isArray(value.observations) || value.observations.length > 32 || !value.observations.every(validObservation) ||
    ['objects_removed','pods_removed','recovery_intent_retained'].some(k=>typeof value[k]!=='boolean') ||
    ['provider_capability_approved','evidence_registered','production_scoped_grant_verified'].some(k=>value[k]!==false)) throw Error('remote result rejected');
  if (value.status === 'passed' && (!value.objects_removed || !value.pods_removed || value.recovery_intent_retained || value.failed_stage !== 'none' ||
      (action === 'run' && JSON.stringify(value.checks_passed) !== JSON.stringify(expectedChecks)))) throw Error('incomplete success rejected');
  return value;
}

export function runSpike({host,passwordLogin,action,runId,run=spawnSync}) {
  if (!['run','cleanup'].includes(action) || !runPattern.test(runId)) throw Error('invalid action or run ID');
  const h=readHandoff();
  const client=normalizeProbeInput(readFileSync(new URL('./system-backup-a-evidence-client.py',import.meta.url)));
  const options={action,run_id:runId};
  const decode=v=>`json.loads(base64.b64decode('${Buffer.from(JSON.stringify(v)).toString('base64')}'))`;
  const prefix=`import json,base64\nOPTIONS=${decode(options)}\nHANDOFF=${decode(h)}\nCLIENT_SOURCE=base64.b64decode('${client.toString('base64')}').decode('utf-8')\n`;
  const [cmd,...args]=identitySSHCommand(host,{passwordLogin}); args[args.length-1]='python3 -B -';
  const input=Buffer.concat([Buffer.from(prefix),normalizeProbeInput(readFileSync(new URL('./system-backup-a-evidence-spike.py',import.meta.url)))]);
  const result=run(cmd,args,{shell:false,input,timeout:1_500_000,maxBuffer:32768,windowsHide:!passwordLogin,stdio:['pipe','pipe',passwordLogin?'inherit':'pipe']});
  if(result.error || result.signal) throw Error('SSH interrupted or timed out; cleanup status unknown; use the printed recovery command');
  let value;
  try { value=validateSpike(JSON.parse(result.stdout),runId,action,h); }
  catch { throw Error('SSH/remote result unavailable or rejected; cleanup status unknown; use the printed recovery command'); }
  return {value,success:result.status===0 && value.status==='passed'};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2); const password=args.at(-1)==='--ssh-password'; if(password)args.pop();
    const action=args.shift();
    if(!['run','cleanup'].includes(action) || args[0]!=='--ssh-host' || args.length!==(action==='run'?2:4) || (action==='cleanup' && args[2]!=='--run-id')) throw Error('usage: run --ssh-host HOST --ssh-password; cleanup --ssh-host HOST --run-id RUN_ID --ssh-password');
    const host=args[1]; identitySSHCommand(host,{passwordLogin:password});
    const runId=action==='run'?'a-ev-'+randomBytes(12).toString('hex'):args[3];
    if(!runPattern.test(runId))throw Error('invalid run ID');
    console.log('run_id='+runId);
    console.log(`RECOVERY: node .\\scripts\\system-backup-a-evidence-spike.mjs cleanup --ssh-host ${host} --run-id ${runId}${password?' --ssh-password':''}`);
    const {value,success}=runSpike({host,passwordLogin:password,action,runId});
    console.log(JSON.stringify(value,null,2)); if(!success)process.exitCode=1;
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
