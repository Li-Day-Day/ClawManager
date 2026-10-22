// In-memory fake observations for tests. Never write as production evidence.
import {createHash} from 'node:crypto';
import {fieldTemplate} from './system-backup-a-field-evidence.mjs';
import {capacityTemplate,renderCapacityDeployment} from './system-backup-d-capacity-deployment.mjs';
import {requiredDownloadPrivileges} from './system-backup-a-download-deployment.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const uid=n=>'11111111-2222-4333-8444-'+String(n).padStart(12,'0');
export function syntheticFieldFixture(scriptBytes,{native=false,socketObserver=false}={}){
  const plan=fieldTemplate(),tables=Object.keys(requiredDownloadPrivileges()).sort();
  const target=(role,n)=>({pod:role+'-pod',pod_uid:uid(n),container:'runtime',credential_env:{user:'MYSQL_USER',password:'MYSQL_PASSWORD',host:'MYSQL_HOST',port:'MYSQL_PORT'},ssl_ca_file:'/run/system-backup/ca/mysql.crt',expected_user:role==='observer'?'root':'cm_'+role,tables:[...tables]});
  plan.observer=target('observer',1);plan.profiles=Object.fromEntries(['registration','download','collector'].map((r,i)=>[r,target(r,i+2)]));
  plan.materials=[{name:'ca',configmap:'public-ca',configmap_uid:uid(10),key:'ca.crt',sha256:'a'.repeat(64),kind:'ca_pem'},{name:'original-authority',configmap:'public-authority',configmap_uid:uid(11),key:'public.json',sha256:'b'.repeat(64),kind:'public_json'}];
  for(const [i,role]of ['data','report','journal'].entries()){
    const pod=role==='journal'?{pod:'journal-pod',pod_uid:uid(30),container:'runtime'}:plan.profiles.collector;
    const mount=role==='data'?'/var/lib/mysql':'/run/system-backup/'+(role==='report'?'capacity':'download-journal');
    plan.volumes[role]={pod:pod.pod,pod_uid:pod.pod_uid,container:pod.container,mount_path:mount,file_path:mount+(role==='data'?'/auto.cnf':role==='report'?'/report.json':'/failure.jsonl'),pvc:role+'-pvc',pvc_uid:uid(40+i),pv_uid:uid(50+i),sub_path:'',minimum_available_bytes:4096};
  }
  plan.capacity_input={...capacityTemplate(),context:plan.context,namespace:plan.namespace,namespace_uid:plan.namespace_uid,server_uuid:plan.server_uuid,database:plan.database,image:'example.invalid/fixture@sha256:'+'c'.repeat(64),mysql_pod:plan.observer.pod,mysql_pod_uid:plan.observer.pod_uid,mysql_container:'runtime',mysql_node:'test-node',mysql_data_pvc:'data-pvc',collector_db_user:'cm_collector',collector_uid:65532,credentials_secret:'existing-collector-secret',report_pvc:'report-pvc'};
  plan.profiles.collector.tables=[...renderCapacityDeployment(plan.capacity_input).source.tables];
  plan.observer.tables=[...new Set([...tables,...plan.profiles.collector.tables])].sort();
  if(native){for(const [role,t]of [['observer',plan.observer],...Object.entries(plan.profiles)]){delete t.credential_env;delete t.ssl_ca_file;t.dsn_env=role==='download'?'SYSTEM_BACKUP_DOWNLOAD_DSN_FILE':'SYSTEM_BACKUP_REGISTRATION_DSN_FILE';t.inspector_sha256='e'.repeat(64);}}
  if(socketObserver){const t=plan.observer;delete t.credential_env;delete t.ssl_ca_file;delete t.dsn_env;delete t.inspector_sha256;t.password_env='MYSQL_ROOT_PASSWORD';t.socket_path='/var/run/mysqld/mysqld.sock';}
  const planBytes=Buffer.from(JSON.stringify(plan,null,2)+'\n');
  const profiles=['observer',...Object.keys(plan.profiles)].map(role=>{
    const target=role==='observer'?plan.observer:plan.profiles[role],grants=[`GRANT SELECT ON \`clawmanager\`.\`users\` TO '${target.expected_user}'@'%'`];
    return {role,identity:{server_uuid:plan.server_uuid,database:plan.database,current_user:target.expected_user+'@%',current_role:'NONE',sql_time:'2026-10-21T00:00:01Z'},direct_grants:grants,direct_grants_sha256:sha(grants.slice().sort().join('\n')+'\n'),metadata:target.tables.map(table=>({kind:'table',table,engine:'InnoDB',collation:'utf8mb4_0900_ai_ci'})),active_role_none:true,one_readonly_connection:true,revocation_tested:false,permissions_approved:false,...(role==='observer'?{}:{metadata_matches_observer:true})};
  });
  for(const p of profiles){const t=p.role==='observer'?plan.observer:plan.profiles[p.role];p.sql_connection_kind=t.dsn_env?'mounted_dsn_native':t.socket_path?'local_socket_observer':'existing_environment_mysql';p.native_inspector_sha256=t.inspector_sha256??null;}
  const materials=plan.materials.map(p=>({name:p.name,kind:p.kind,configmap_uid:p.configmap_uid,sha256:p.sha256,bytes:100,...(p.kind==='ca_pem'?{not_expired_at_probe:true,chain_hostname_and_provider_acl_verified:false}:{original_deadlines_and_authority_verified:false})}));
  for(const m of materials)if(m.kind==='ca_pem'){m.certificate_count=1;m.certificates=[{subject:'CN = Fixture CA',issuer:'CN = Fixture CA',not_before_text:'Oct 21 00:00:00 2026 GMT',not_after_text:'Oct 28 00:00:00 2026 GMT',der_sha256:'a'.repeat(64),not_expired_at_probe:true}];}
  const volumes=Object.entries(plan.volumes).map(([role,p],i)=>({role,pod_uid:p.pod_uid,pvc_uid:p.pvc_uid,pv_uid:p.pv_uid,backing_sha256:String(i+1).repeat(64),access_modes:[role==='journal'?'ReadWriteOncePod':'ReadWriteMany'],mount_read_only:role==='data',sub_path:'',process_uid:65532,process_gid:65532,directory_owner_mode:'0:65532:2770',file_owner_mode:'65532:65532:640',available_bytes:'3276800',filesystem_bytes:'4096000',minimum_available_bytes:'4096',physical_reservation_proven:false,atomic_replace_and_cross_pod_visibility_tested:false,single_writer_fencing_verified:false}));
  for(const v of volumes){v.physical_backend_isolation_proven=false;v.actual_mount_read_only=v.role==='data';}
  const sourceRaw=JSON.stringify(renderCapacityDeployment(plan.capacity_input).source,null,2)+'\n',report={server_uuid:plan.server_uuid,database:plan.database,observed_at:'2026-10-21T00:00:00Z',allocated_bytes:1000,available_bytes:3276800},reportRaw=JSON.stringify(report)+'\n',identityRaw=JSON.stringify({server_uuid:plan.server_uuid,database:plan.database,data_directory:'/var/lib/mysql/',now:'2026-10-21T00:00:01Z'})+'\n';
  const result={kind:'a-field-evidence.v1',status:'READ_ONLY_FACTS_COLLECTED_REVIEW_REQUIRED',observed_at:'2026-10-21T00:00:02Z',namespace:plan.namespace,namespace_uid:plan.namespace_uid,server_uuid:plan.server_uuid,database:plan.database,profiles,materials,volumes,capacity:{source_raw:sourceRaw,report_raw:reportRaw,identity_raw:identityRaw,collector_check_report:report,collector_check_ran:true,report_written_by_probe:false,original_source_bytes_preserved:true,source_sha256:sha(sourceRaw),report_sha256:sha(reportRaw),physical_reservation_proven:false},blockers:[],cluster_mutated:false,database_mutated:false,dependencies_installed:false,credentials_exported:false,production_approved:false,complete_field_acceptance:false,plan_sha256:sha(planBytes)};
  result.capacity.declared_image=plan.capacity_input.image;result.capacity.observed_image_id='containerd://sha256:'+'f'.repeat(64);
  const envelope={kind:'a_field_evidence_transport.v1',status:'COLLECTED_REVIEW_REQUIRED',ssh_target:'test@example.invalid',plan_sha256:sha(planBytes),script_sha256:sha(scriptBytes),payload_sha256:'d'.repeat(64),ssh_exit:0,result,production_approved:false};
  return {plan,planBytes,envelope,scriptBytes};
}
