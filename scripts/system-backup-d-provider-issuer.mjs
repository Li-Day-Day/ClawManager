import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {identitySSHCommand,normalizeProbeInput} from './system-backup-a-identity-ssh.mjs';
import {readHandoff} from './system-backup-a-provider-handoff-preflight.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const requireValue=v=>{if(!v)throw Error('Issuer result rejected');};
const keys=(v,k)=>requireValue(v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join()===k.split(' ').sort().join());
export function validateIssuerResult(v,{run,installation,h,bindings}) {
  keys(v,'kind run_id namespace namespace_uid intent_uid registry_configmap_uid bindings registry_json registry_sha256 key key_retained active_config_updated attestation_service_ready provider_capability_approved temporary_control_pod_removed');
  requireValue(v.kind==='d_provider_issuer_key_candidate_v1' && v.run_id===run && v.namespace===h.namespace && v.namespace_uid===h.namespace_uid);
  for(const x of [v.intent_uid,v.registry_configmap_uid])requireValue(/^[a-f0-9-]{36}$/.test(x));
  keys(v.bindings,Object.keys(bindings).join(' '));for(const k of Object.keys(bindings))requireValue(v.bindings[k]===bindings[k]);
  requireValue(v.key_retained===true && v.temporary_control_pod_removed===true && v.active_config_updated===false && v.attestation_service_ready===false && v.provider_capability_approved===false);
  keys(v.key,'fingerprint public_key_base64 key_path key_version');
  requireValue(/^[a-f0-9]{64}$/.test(v.key.fingerprint) && v.key.key_path===`transit/keys/${run}-provider-proof-v1` && v.key.key_version==='1');
  const publicKey=Buffer.from(v.key.public_key_base64,'base64');requireValue(publicKey.length===32 && publicKey.toString('base64')===v.key.public_key_base64);
  requireValue(typeof v.registry_json==='string' && Buffer.byteLength(v.registry_json)<16384 && sha(v.registry_json)===v.registry_sha256);
  const r=JSON.parse(v.registry_json);keys(r,'schema_version version scope keys');keys(r.scope,'installation_id audience');
  requireValue(r.schema_version==='system-backup-provider-issuers.draft.v1' && r.version===run && r.scope.installation_id===installation && r.scope.audience==='system-backup-provider-proof' && r.keys.length===1);
  const k=r.keys[0];keys(k,'issuer key_id key_version purpose public_key_base64 not_before not_after revoked target_types proof_types');
  requireValue(k.issuer===`${h.kms.endpoint}/provider-proof/${run}` && k.key_id===`${h.kms.endpoint}/${v.key.key_path}` && k.key_version==='1' && k.purpose==='provider_proof_issuer' && k.public_key_base64===v.key.public_key_base64 && k.revoked===false);
  requireValue(JSON.stringify(k.target_types)==='["external_action","backup_staging","restore_resource"]' && JSON.stringify(k.proof_types)==='["provider_presence","provider_absence","ownership"]');
  requireValue(Number.isFinite(Date.parse(k.not_before)) && Date.parse(k.not_after)-Date.parse(k.not_before)===90*86400000);
  return v;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2),passwordLogin=args.at(-1)==='--ssh-password';if(passwordLogin)args.pop();
    const action=args.shift();
    if(!['create','inspect','cleanup-control'].includes(action) || args[0]!=='--ssh-host' || args[2]!=='--installation-id' || args.length!==(action==='create'?4:6) || action!=='create' && args[4]!=='--run-id')throw Error('usage: create --ssh-host HOST --installation-id installation_ID --ssh-password; inspect|cleanup-control --ssh-host HOST --installation-id installation_ID --run-id RUN --ssh-password');
    const host=args[1],installation=args[3],run=action==='create'?'d-issuer-'+randomBytes(12).toString('hex'):args[5];
    requireValue(/^installation_[A-Za-z0-9._:-]{1,115}$/.test(installation) && /^d-issuer-[a-f0-9]{24}$/.test(run));
    const h=readHandoff(),files={BASE_SOURCE:'system-backup-a-evidence-spike.py',CLIENT_SOURCE:'system-backup-d-lifecycle-client.py',LIFECYCLE_SOURCE:'system-backup-d-lifecycle.py',RUNNER:'system-backup-d-provider-issuer.py'};
    const sources=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,normalizeProbeInput(readFileSync(new URL('./'+p,import.meta.url)))]));
    const bindings=Object.fromEntries(Object.entries(sources).map(([k,b])=>[k.toLowerCase()+'_sha256',sha(b)]));
    const encoded=v=>Buffer.from(v).toString('base64');
    let prefix='import json,base64\n';
    for(const [k,v] of Object.entries({HANDOFF:h,OPTIONS:{action,run_id:run,installation_id:installation},BINDINGS:bindings}))prefix+=`${k}=json.loads(base64.b64decode('${encoded(JSON.stringify(v))}'))\n`;
    for(const [k,v] of Object.entries(sources).filter(([k])=>k!=='RUNNER'))prefix+=`${k}=base64.b64decode('${encoded(v)}').decode('utf-8')\n`;
    const [cmd,...sshArgs]=identitySSHCommand(host,{passwordLogin});sshArgs[sshArgs.length-1]='python3 -B -';
    console.log('run_id='+run);console.log(`RECOVERY: node .\\scripts\\system-backup-d-provider-issuer.mjs cleanup-control --ssh-host ${host} --installation-id ${installation} --run-id ${run}${passwordLogin?' --ssh-password':''}`);
    console.log('inspect requires a completed immutable registry checkpoint. Do not recreate or delete by prefix.');
    const result=spawnSync(cmd,sshArgs,{shell:false,input:Buffer.concat([Buffer.from(prefix),sources.RUNNER]),timeout:360000,maxBuffer:65536,windowsHide:!passwordLogin,stdio:['pipe','pipe',passwordLogin?'inherit':'pipe']});
    if(result.error || result.signal || result.status!==0)throw Error('Issuer preparation failed; root-mounted Pod cleanup may be pending. Retain the run ID. Raw provider output withheld.');
    let parsed;try{parsed=JSON.parse(result.stdout);}catch{throw Error('Invalid issuer response; raw output withheld');}
    if(action==='cleanup-control') {
      keys(parsed,'kind run_id namespace_uid temporary_control_pod_removed');
      requireValue(parsed.kind==='d_provider_issuer_control_cleanup_v1' && parsed.run_id===run && parsed.namespace_uid===h.namespace_uid && parsed.temporary_control_pod_removed===true);
      console.log('CLEANED temporary-control-pod=yes configured-key-and-registry-retained=yes');
      process.exit(0);
    }
    const v=validateIssuerResult(parsed,{run,installation,h,bindings});
    const suffix=action==='inspect'?'-'+randomBytes(4).toString('hex'):'';
    const path=new URL(`../docs/evidence/system-backup-provider-issuer-${run}${suffix}.json`,import.meta.url);
    const registry=new URL(`../docs/evidence/system-backup-provider-issuer-${run}${suffix}.registry.json`,import.meta.url);
    writeFileSync(path,JSON.stringify(v,null,2)+'\n',{flag:'wx'});writeFileSync(registry,v.registry_json,{flag:'wx'});
    console.log('registry='+fileURLToPath(registry));console.log('registry_sha256='+v.registry_sha256);console.log('candidate_only=true active_config_updated=false attestation_service_ready=false');
  } catch {console.error('Issuer command failed or result rejected; retain the run ID and use RECOVERY if remote work started. Raw output withheld.');process.exitCode=1;}
}
