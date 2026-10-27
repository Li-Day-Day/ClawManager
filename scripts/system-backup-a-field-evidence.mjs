#!/usr/bin/env node
// Offline preparation/review of existing field evidence. Never invokes transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {decodeDownloadInput,requiredDownloadPrivileges} from './system-backup-a-download-deployment.mjs';
import {reviewCapacityMaterials,parseCapacityJSON} from './system-backup-a-capacity-material-review.mjs';
import {renderCapacityDeployment} from './system-backup-d-capacity-deployment.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const keys=(v,list)=>assert.deepEqual(Object.keys(v).sort(),list.slice().sort());
const json=(input,limit=1048576)=>{
  const b=Buffer.isBuffer(input)?input:Buffer.from(input);assert.ok(b.length>0&&b.length<=limit);
  if(b.length<=1048576)return decodeDownloadInput(b);
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(b),value=parseCapacityJSON(raw,limit);let nodes=0;
  const walk=(v,depth)=>{assert.ok(depth<=32&&++nodes<=2000000);if(typeof v==='string'){for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=v.charCodeAt(++i);assert.ok(n>=0xdc00&&n<=0xdfff);}else assert.ok(c<0xdc00||c>0xdfff);}}else if(v&&typeof v==='object'){for(const[k,x]of Object.entries(v)){walk(k,depth+1);walk(x,depth+1);}}};walk(value,0);return value;
};
const read=(p,max=1048576)=>{const b=fs.readFileSync(p);assert.ok(b.length>0&&b.length<=max);return b;};
export function fieldTemplate(){return {version:'a-field-evidence.v1',context:'kubernetes-admin@kubernetes',namespace:'clawmanager-zhanghui08-system',namespace_uid:'337cfe30-2c17-4b8e-b32a-760778b8098e',server_uuid:'f1f5f76a-95f5-11f1-b08e-366835b4a029',database:'clawmanager',observer:null,profiles:{},materials:[],volumes:{},capacity_input:null};}
export function checkFieldScope(plan){
  assert.equal(plan.version,'a-field-evidence.v1');assert.ok(plan.observer&&plan.profiles.registration&&plan.profiles.download&&plan.profiles.collector);
  for(const[role,t]of [['observer',plan.observer],...Object.entries(plan.profiles)]){
    const base=['pod','pod_uid','container','expected_user','tables'];
    if(t.dsn_env){keys(t,[...base,'dsn_env','inspector_sha256']);assert.match(t.inspector_sha256,/^[a-f0-9]{64}$/);const env={registration:'SYSTEM_BACKUP_REGISTRATION_DSN_FILE',download:'SYSTEM_BACKUP_DOWNLOAD_DSN_FILE',collector:'SYSTEM_BACKUP_REGISTRATION_DSN_FILE',gc:'SYSTEM_BACKUP_GC_DSN_FILE'};if(role==='observer')assert.ok(Object.values(env).includes(t.dsn_env));else assert.equal(t.dsn_env,env[role]);}
    else if(t.socket_path){keys(t,[...base,'socket_path','password_env']);assert.equal(role,'observer');assert.match(t.password_env,/^[A-Z][A-Z0-9_]{0,127}$/);assert.match(t.socket_path,/^\/[A-Za-z0-9_.\/-]+$/);assert.ok(!t.socket_path.split('/').slice(1).some(p=>['','.','..'].includes(p)));}
    else{keys(t,[...base,'credential_env','ssl_ca_file']);keys(t.credential_env,['user','password','host','port']);for(const v of Object.values(t.credential_env))assert.match(v,/^[A-Z][A-Z0-9_]{0,127}$/);assert.match(t.ssl_ca_file,/^\/run\/[A-Za-z0-9_.\/-]+$/);assert.ok(!t.ssl_ca_file.split('/').slice(1).some(p=>['','.','..'].includes(p)));}
    if(role!=='observer')assert.notEqual(t.expected_user.toLowerCase(),'root');
  }
  const required=Object.keys(requiredDownloadPrivileges());assert.ok(required.every(t=>plan.profiles.download.tables.includes(t)),'download metadata scope omits required tables');
  assert.ok(Object.values(plan.profiles).every(p=>p.tables.every(t=>plan.observer.tables.includes(t))));
  const renderedCapacity=renderCapacityDeployment(plan.capacity_input);
  assert.ok(renderedCapacity.source.tables.every(t=>plan.profiles.collector.tables.includes(t)),'collector metadata scope omits capacity tables');
  for(const key of ['context','namespace','namespace_uid','server_uuid','database'])assert.equal(plan.capacity_input[key],plan[key]);
  assert.equal(plan.profiles.collector.expected_user,plan.capacity_input.collector_db_user);
  assert.equal(plan.volumes.data.mount_path,plan.capacity_input.data_directory);assert.equal(plan.volumes.data.pvc,plan.capacity_input.mysql_data_pvc);assert.equal(plan.volumes.report.pvc,plan.capacity_input.report_pvc);
  assert.equal(plan.volumes.data.file_path,plan.capacity_input.data_directory+'/auto.cnf');assert.equal(plan.volumes.data.sub_path,plan.capacity_input.mysql_data_subpath);
  assert.equal(plan.volumes.report.mount_path,'/run/system-backup/capacity');assert.equal(plan.volumes.report.file_path,'/run/system-backup/capacity/report.json');assert.equal(plan.volumes.report.sub_path,'');
  assert.equal(plan.volumes.journal.mount_path,'/run/system-backup/download-journal');assert.equal(plan.volumes.journal.file_path,'/run/system-backup/download-journal/failure.jsonl');assert.equal(plan.volumes.journal.sub_path,'');
  for(const role of ['data','report'])for(const key of ['pod','pod_uid','container'])assert.equal(plan.volumes[role][key],plan.profiles.collector[key]);
  return {status:'SOURCE_REQUIRED_DOWNLOAD_TABLE_SCOPE_PRESENT',required_download_tables:required.length,production_approved:false};
}
export function fieldRequirements(){
  const reviewed=[
    ['state','docs/evidence/a-live-chain-state-review-20261021.json','6cd6e752b6dcf9a00f112846aa4e037777c3242e021365c640bb13654e015293','docs/evidence/a-live-chain-inventory-20261021-165643-8f7e94df.txt','e97836518eaf9f30a0a3916cf93e036b593758391dce7e43ae3477f8f661bc63'],
    ['environment','docs/evidence/a-live-chain-environment-review-20261021.json','d0f21a03dfaa0ad5b006e2ae6f8ef32e24eebdda18ebc61fcbef7b44ac6109af','docs/evidence/a-live-chain-inventory-20261021-164009-e5ca2d0f.txt','b2bb4dc5c7e55f6465f8f2650eab62530cd0954fdf9cf890d6740140b90baa55']
  ].map(([kind,p,pin,originalPath,originalPin])=>{const b=read(path.join(root,p));assert.equal(sha(b),pin);const v=json(b);assert.equal(v.source.path,originalPath);assert.equal(v.source.sha256,originalPin);const original=read(path.join(root,originalPath),4194304);assert.equal(sha(original),originalPin);return {kind,path:p,sha256:pin,original:originalPath,original_sha256:originalPin};});
  return {status:'PREPARATION_REQUIRED_NO_REMOTE_STARTED',scope:'actual identities, original materials, capacity and report/journal volumes',existing_observations:reviewed,required_existing_facts:['separate non-root registration and download connection references and UID-pinned running Pods','privileged observer for identical complete metadata queries','original public materials/CA ConfigMap UID, key and original byte SHA','data/report/journal Pod mount, PVC/PV UID and measured byte budget','original capacity input/source/report and contemporaneous SQL identity'],known_observed_blockers:['latest reviewed config_rows=0 and installation absent','reviewed deployment lacks independent download runtime and journal claim','reviewed provider lab CA expired; no authority renewed by this tool','installed bootstrap reported 30 missing adapters; subsequent source edits are not deployment evidence'],collection_remains_required:['actual runtime connection and direct grants/complete metadata parity','current original authority/material deadlines and provider ACL/OIDC','five-second capacity report under actual collector identity and statfs provenance','actual volume permissions/backing separation and physical reservation','separately authorized revocation/atomic visibility/fencing and provider/MFA/E2E'],credentials_in_public_plan:false,cluster_contacted:false,database_contacted:false,production_approved:false};
}
export function reviewFieldEnvelope({planBytes,envelopeBytes,scriptBytes,capacity}){
  const plan=json(planBytes),envelope=json(envelopeBytes,32*1024*1024);
  checkFieldScope(plan);
  keys(envelope,['kind','status','ssh_target','plan_sha256','script_sha256','payload_sha256','ssh_exit','result','production_approved']);
  assert.equal(envelope.kind,'a_field_evidence_transport.v1');assert.equal(envelope.production_approved,false);
  assert.equal(envelope.plan_sha256,sha(planBytes));assert.equal(envelope.script_sha256,sha(scriptBytes));assert.match(envelope.payload_sha256,/^[a-f0-9]{64}$/);
  const b=envelope.result;assert.ok(b&&typeof b==='object');
  assert.equal(b.kind,'a-field-evidence.v1');assert.equal(b.plan_sha256,sha(planBytes));
  for(const name of ['namespace','namespace_uid','server_uuid','database'])assert.equal(b[name],plan[name]);
  for(const name of ['cluster_mutated','database_mutated','dependencies_installed','credentials_exported','production_approved','complete_field_acceptance'])assert.equal(b[name],false);
  assert.ok(Array.isArray(b.blockers)&&b.blockers.every(s=>typeof s==='string'&&/^[a-zA-Z0-9_.-]{1,160}$/.test(s)));
  const pending=['direct_grants_need_closed_policy_and_role_approval','original_material_deadlines_oidc_provider_acl_need_independent_review','physical_reservation_atomic_visibility_and_writer_fencing_need_separate_evidence','production_revocation_not_executed','full_gc_human_mfa_and_restore_e2e_not_executed'];
  if(envelope.ssh_exit!==0||envelope.status!=='COLLECTED_REVIEW_REQUIRED'||b.status!=='READ_ONLY_FACTS_COLLECTED_REVIEW_REQUIRED'||b.blockers.length)return {status:'BLOCKED',blockers:b.blockers,ssh_exit:envelope.ssh_exit,production_approved:false,complete_field_acceptance:false};
  const profileNames=['observer',...Object.keys(plan.profiles)].sort();assert.deepEqual(b.profiles.map(p=>p.role).sort(),profileNames);
  assert.ok(plan.observer&&plan.profiles.registration&&plan.profiles.download&&Object.keys(plan.volumes).length===3);
  const observer=b.profiles.find(p=>p.role==='observer'),users=[];
  for(const p of b.profiles){
    const expected=p.role==='observer'?plan.observer:plan.profiles[p.role];
    const connectionKind=expected.dsn_env?'mounted_dsn_native':expected.socket_path?'local_socket_observer':'existing_environment_mysql';assert.equal(p.sql_connection_kind,connectionKind);assert.equal(p.native_inspector_sha256,expected.inspector_sha256??null);
    assert.equal(p.identity.server_uuid,plan.server_uuid);assert.equal(p.identity.database,plan.database);assert.equal(p.identity.current_user.split('@')[0],expected.expected_user);assert.equal(p.one_readonly_connection,true);
    assert.equal(p.direct_grants_sha256,sha(p.direct_grants.slice().sort().join('\n')+'\n'));assert.ok(p.direct_grants.length>0&&p.direct_grants.every(s=>/^GRANT [^\r\n\x00]{1,4096}$/.test(s)));
    assert.equal(p.revocation_tested,false);assert.equal(p.permissions_approved,false);
    assert.deepEqual(p.metadata.filter(r=>r.kind==='table').map(r=>r.table).sort(),expected.tables.slice().sort());
    if(p.role!=='observer'){
      assert.notEqual(expected.expected_user.toLowerCase(),'root');users.push(expected.expected_user);assert.equal(p.identity.current_role,'NONE');assert.equal(p.active_role_none,true);
      const metadata=observer.metadata.filter(r=>r.kind==='routine'||expected.tables.includes(r.table)||(['foreign_key','referential_rule'].includes(r.kind)&&expected.tables.includes(r.referenced_table)));
      assert.deepEqual(p.metadata,metadata);assert.equal(p.metadata_matches_observer,true);
    }
  }
  assert.equal(new Set(users).size,users.length);
  assert.deepEqual(b.materials.map(m=>m.name).sort(),plan.materials.map(m=>m.name).sort());
  assert.ok(plan.materials.some(m=>m.kind==='ca_pem')&&plan.materials.some(m=>m.kind==='public_json'));
  for(const m of b.materials){
    const p=plan.materials.find(p=>p.name===m.name);assert.equal(m.configmap_uid,p.configmap_uid);assert.equal(m.sha256,p.sha256);assert.equal(m.kind,p.kind);assert.ok(Number.isSafeInteger(m.bytes)&&m.bytes>0);
    if(m.kind==='ca_pem'){
      assert.equal(m.not_expired_at_probe,true);assert.equal(m.chain_hostname_and_provider_acl_verified,false);
      assert.ok(Number.isSafeInteger(m.certificate_count)&&m.certificate_count>0);assert.equal(m.certificates.length,m.certificate_count);
      for(const c of m.certificates){keys(c,['subject','issuer','not_before_text','not_after_text','der_sha256','not_expired_at_probe']);assert.match(c.der_sha256,/^[a-f0-9]{64}$/);assert.equal(c.not_expired_at_probe,true);for(const key of ['subject','issuer','not_before_text','not_after_text'])assert.ok(typeof c[key]==='string'&&c[key].length>0&&c[key].length<=65536);}
    }else assert.equal(m.original_deadlines_and_authority_verified,false);
  }
  assert.deepEqual(b.volumes.map(v=>v.role).sort(),['data','journal','report']);
  for(const v of b.volumes){
    const p=plan.volumes[v.role];for(const key of ['pod_uid','pvc_uid','pv_uid'])assert.equal(v[key],p[key]);
    assert.match(v.backing_sha256,/^[a-f0-9]{64}$/);assert.match(v.available_bytes,/^(0|[1-9][0-9]*)$/);assert.match(v.filesystem_bytes,/^[1-9][0-9]*$/);
    assert.equal(v.minimum_available_bytes,String(p.minimum_available_bytes));assert.ok(BigInt(v.available_bytes)>=BigInt(v.minimum_available_bytes)&&BigInt(v.available_bytes)<=BigInt(v.filesystem_bytes)&&BigInt(v.filesystem_bytes)<=9223372036854775807n);
    assert.match(v.directory_owner_mode,/^[0-9]+:[0-9]+:[0-7]{3,4}$/);assert.match(v.file_owner_mode,/^[0-9]+:[0-9]+:[0-7]{3}$/);
    assert.ok(Number.isSafeInteger(v.process_uid)&&v.process_uid>0&&Number.isSafeInteger(v.process_gid)&&v.process_gid>=0);
    assert.equal(v.sub_path,p.sub_path);
    assert.equal(typeof v.actual_mount_read_only,'boolean');assert.equal(v.actual_mount_read_only,v.mount_read_only);
    if(['data','report'].includes(v.role)){assert.equal(v.process_uid,plan.capacity_input.collector_uid);assert.equal(v.process_gid,plan.capacity_input.report_gid);}
    if(v.role==='data')assert.equal(v.mount_read_only,true);
    if(v.role==='journal'){const parts=v.file_owner_mode.split(':');assert.equal(Number(parts[0]),v.process_uid);assert.ok(['600','640'].includes(parts[2]));assert.equal(v.mount_read_only,false);assert.ok(v.access_modes.includes('ReadWriteOncePod'));}
    if(v.role==='report'){assert.equal(v.directory_owner_mode.split(':').slice(1).join(':'),'65532:2770');assert.equal(v.file_owner_mode.split(':').slice(1).join(':'),'65532:640');assert.ok(v.access_modes.includes('ReadWriteMany'));}
    for(const key of ['physical_reservation_proven','physical_backend_isolation_proven','atomic_replace_and_cross_pod_visibility_tested','single_writer_fencing_verified'])assert.equal(v[key],false);
  }
  assert.equal(new Set(b.volumes.map(v=>v.backing_sha256)).size,3);
  assert.ok(b.capacity&&b.capacity.collector_check_ran===true&&b.capacity.report_written_by_probe===false&&b.capacity.original_source_bytes_preserved===true&&b.capacity.physical_reservation_proven===false);
  assert.equal(b.capacity.declared_image,plan.capacity_input.image);assert.ok(typeof b.capacity.observed_image_id==='string'&&b.capacity.observed_image_id.length>0);
  assert.equal(b.capacity.source_sha256,sha(b.capacity.source_raw));assert.equal(b.capacity.report_sha256,sha(b.capacity.report_raw));
  const bundledCapacity={inputRaw:JSON.stringify(plan.capacity_input,null,2)+'\n',sourceRaw:b.capacity.source_raw,reportRaw:b.capacity.report_raw,identityRaw:b.capacity.identity_raw};
  if(capacity){assert.deepEqual(json(capacity.inputRaw),plan.capacity_input);for(const key of ['sourceRaw','reportRaw','identityRaw'])assert.equal(capacity[key],bundledCapacity[key]);}
  const capacityReview=reviewCapacityMaterials(capacity??bundledCapacity);
  return {status:'READ_ONLY_FACTS_REVIEWED_REMAINING_ACCEPTANCE_REQUIRED',plan_sha256:sha(planBytes),envelope_sha256:sha(envelopeBytes),script_sha256:sha(scriptBytes),source_provenance:'operator_executed_transport_receipt_not_an_independent_remote_reconnection',runtime_profiles:users.length,public_materials:b.materials.length,volumes:3,capacity:capacityReview,pending,production_approved:false,complete_field_acceptance:false,reviewer_contacted_cluster:false,reviewer_executed_sql:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length===1&&args[0]==='--requirements'){console.log(JSON.stringify(fieldRequirements(),null,2));process.exitCode=2;}
    else if(args.length===3&&args[0]==='--template'&&args[1]==='--output'){fs.writeFileSync(path.resolve(args[2]),JSON.stringify(fieldTemplate(),null,2)+'\n',{flag:'wx'});console.log('PUBLIC_PLAN_TEMPLATE_WRITTEN_INCOMPLETE_NO_REMOTE_STARTED');}
    else if(args.length===3&&args[0]==='--check-scope'&&args[1]==='--plan'){console.log(JSON.stringify(checkFieldScope(json(read(args[2])))));}
    else{
      const allowed=['--plan','--receipt','--capacity-input','--capacity-source','--capacity-report','--sql-identity'],o={};assert.equal(args.length%2,0);for(let i=0;i<args.length;i+=2){assert.ok(allowed.includes(args[i])&&!o[args[i]]);o[args[i]]=args[i+1];}assert.ok(o['--plan']&&o['--receipt']);
      const capacityArgs=allowed.slice(2);assert.ok(capacityArgs.every(k=>!!o[k])||capacityArgs.every(k=>!o[k]));
      const capacity=o['--capacity-input']?{inputRaw:read(o['--capacity-input'],65536).toString('utf8'),sourceRaw:read(o['--capacity-source'],65536).toString('utf8'),reportRaw:read(o['--capacity-report'],4096).toString('utf8'),identityRaw:read(o['--sql-identity'],4096).toString('utf8')}:undefined;
      const result=reviewFieldEnvelope({planBytes:read(o['--plan']),envelopeBytes:read(o['--receipt'],32*1024*1024),scriptBytes:read(new URL('./system-backup-a-field-evidence.py',import.meta.url)),capacity});console.log(JSON.stringify(result,null,2));if(result.status==='BLOCKED')process.exitCode=2;
    }
  }catch{console.error('Field evidence rejected: check original public plan, exact tool/transport pins, actual SQL identities, metadata and volume bindings. No remote actions executed by reviewer.');process.exitCode=1;}
}
