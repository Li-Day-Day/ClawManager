// Review the operator's exact public receipt. No cluster/SQL/test execution.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {decodeDownloadInput} from '../../scripts/system-backup-a-download-deployment.mjs';
const root=path.resolve(import.meta.dirname,'../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(path.join(root,p)),json=p=>decodeDownloadInput(raw(p));
const pin=p=>({path:p,sha256:sha(raw(p)),bytes:raw(p).length});
const receiptPath='docs/evidence/a-field-public-inventory-20261022-085642-cb639159.json';
const receiptPin=pin(receiptPath);assert.equal(receiptPin.sha256,'07a599af6c63e4bd02105dae0f7592997580f811928127a83367a9253fba9e8d');
const envelope=json(receiptPath),r=envelope.result;
const keys=(o,list)=>assert.deepEqual(Object.keys(o).sort(),[...list].sort());
keys(envelope,['kind','script_sha256','payload_sha256','ssh_target','context','namespace','namespace_uid','ssh_exit','result','production_approved']);
assert.equal(envelope.kind,'a_field_public_inventory_transport.v1');assert.equal(envelope.ssh_target,'root@10.130.14.23');
assert.equal(envelope.ssh_exit,0);assert.equal(envelope.production_approved,false);
const scriptPath='scripts/system-backup-a-field-inventory.py',script=raw(scriptPath);
assert.equal(envelope.script_sha256,'d02c03c1b840bc6c0244aba17ecf93f4c39602b411e5a89232fb2d77c388c35e');
assert.equal(sha(script),envelope.script_sha256);assert.equal(sha(Buffer.from(script.toString('utf8').replaceAll('\r\n','\n'))),envelope.payload_sha256);
const prepPath='docs/evidence/a-field-evidence-dsn-preparation-20261022.json',prep=json(prepPath);
for(const p of [scriptPath,'scripts/system-backup-a-field-inventory.ps1'])assert.equal(pin(p).sha256,prep.inputs.find(f=>f.path===p).sha256);
keys(r,['kind','status','context','namespace','namespace_uid','namespace_before','namespace_after','pods','claims','candidate_roles_with_dsn_variable_names','blockers','missing_candidate_roles','pending','snapshot_atomic','secrets_requested','container_files_read','sql_executed','cluster_mutated','dependencies_installed','production_approved']);
assert.equal(r.kind,'a_field_public_inventory.v1');assert.equal(r.status,'PUBLIC_REFERENCES_OBSERVED_REVIEW_REQUIRED');
for(const k of ['snapshot_atomic','secrets_requested','container_files_read','sql_executed','cluster_mutated','dependencies_installed','production_approved'])assert.equal(r[k],false);
assert.equal(r.context,'kubernetes-admin@kubernetes');assert.equal(r.namespace,'clawmanager-zhanghui08-system');assert.equal(r.namespace_uid,'337cfe30-2c17-4b8e-b32a-760778b8098e');
for(const k of ['context','namespace','namespace_uid'])assert.equal(envelope[k],r[k]);
const uid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const checkIdentity=o=>{assert.match(o.uid,uid);assert.match(o.resource_version,/^[0-9]+$/);assert.equal(typeof o.name,'string');};
for(const k of ['namespace_before','namespace_after']){keys(r[k],['name','uid','resource_version']);checkIdentity(r[k]);assert.equal(r[k].name,r.namespace);assert.equal(r[k].uid,r.namespace_uid);}
assert.deepEqual(r.namespace_before,r.namespace_after);
const containers=[];
for(const p of r.pods){
  keys(p,['name','uid','resource_version','phase','node','owners','containers','volumes']);checkIdentity(p);
  for(const owner of p.owners){keys(owner,['kind','name','uid']);assert.match(owner.uid,uid);}
  assert.equal(new Set(p.volumes.map(v=>v.name)).size,p.volumes.length);
  for(const v of p.volumes){
    assert.ok(['pvc','configmap_reference','secret_reference_only','other_volume'].includes(v.kind));
    keys(v,v.kind==='pvc'?['name','kind','claim','read_only']:v.kind==='other_volume'?['name','kind']:['name','kind','reference_name']);
  }
  for(const c of p.containers){
    keys(c,['name','declared_image','observed_image_id','container_id','ready','restart_count','dsn_references','mounts','native_inspector_capability_verified','runtime_identity_or_role_approved']);
    assert.equal(c.native_inspector_capability_verified,false);assert.equal(c.runtime_identity_or_role_approved,false);
    assert.equal(typeof c.ready,'boolean');assert.ok(Number.isSafeInteger(c.restart_count)&&c.restart_count>=0);
    for(const m of c.mounts){keys(m,['name','path','sub_path','read_only','sub_path_expr_present']);assert.ok(p.volumes.some(v=>v.name===m.name));}
    // This exact receipt contains no explicit DSN references. envFrom and
    // actual process environment were outside the collector's output scope.
    assert.deepEqual(c.dsn_references,[]);containers.push({pod:p.name,pod_uid:p.uid,...c});
  }
}
assert.equal(new Set(r.pods.map(p=>p.uid)).size,r.pods.length);assert.equal(r.pods.length,9);assert.equal(containers.length,9);
assert.equal(r.claims.length,5);assert.equal(new Set(r.claims.map(p=>p.uid)).size,5);
const claimRecords=r.claims.map(c=>{
  keys(c,['name','uid','resource_version','phase','volume_name','storage_class','access_modes','capacity','pv']);checkIdentity(c);assert.equal(c.phase,'Bound');
  const pv=c.pv;keys(pv,['name','uid','resource_version','claim_namespace','claim_name','claim_uid']);checkIdentity(pv);
  assert.equal(pv.name,c.volume_name);assert.equal(pv.claim_namespace,r.namespace);assert.equal(pv.claim_name,c.name);assert.equal(pv.claim_uid,c.uid);
  const mounts=r.pods.flatMap(p=>p.containers.flatMap(container=>container.mounts.flatMap(m=>{
    const v=p.volumes.find(v=>v.name===m.name);
    return v.kind==='pvc'&&v.claim===c.name?[{pod:p.name,pod_uid:p.uid,container:container.name,path:m.path,sub_path:m.sub_path,declared_read_only:m.read_only}]:[];
  })));
  return {...c,observed_pod_mounts:mounts,declared_capacity_is_not_statfs_or_reservation:true};
});
const app=containers.find(c=>c.name==='clawmanager-app'),mysqlPod=r.pods.find(p=>p.name==='mysql-66496b8965-d6tsl');
assert.equal(app.pod_uid,'aabba383-5db9-48a7-a3b7-2b92624c2f3a');
assert.equal(app.observed_image_id,'10.130.14.23:5000/clawmanager@sha256:c16f07c25c6dc8362aa09b7a1e81f5d1204f2812ae542bbcb21a3946975c6c9d');
const historicalPath='docs/evidence/a-live-chain-state-review-20261021.json',historical=json(historicalPath);
assert.equal(app.observed_image_id,historical.deployed_app_image);
const environmentPath='docs/evidence/a-live-chain-environment-review-20261021.json',environment=json(environmentPath);
assert.equal(environment.database.server_uuid,'f1f5f76a-95f5-11f1-b08e-366835b4a029');assert.equal(environment.database.name,'clawmanager');
assert.equal(mysqlPod.uid,'dab1cbf6-ca49-4e16-bd2d-27e70da52004');
const data=claimRecords.find(c=>c.name==='mysql-data'),report=claimRecords.find(c=>c.name==='system-backup-capacity-report');
assert.equal(data.observed_pod_mounts.length,1);assert.equal(data.observed_pod_mounts[0].pod_uid,mysqlPod.uid);assert.equal(data.observed_pod_mounts[0].path,'/var/lib/mysql');
assert.equal(report.observed_pod_mounts.length,0);assert.deepEqual(report.access_modes,['ReadWriteMany']);
const journalMounts=containers.flatMap(c=>c.mounts.filter(m=>m.path==='/run/system-backup/download-journal').map(m=>({pod:c.pod,container:c.name,...m})));
assert.deepEqual(journalMounts,[]);assert.deepEqual(r.claims.filter(c=>c.access_modes.includes('ReadWriteOncePod')),[]);
assert.deepEqual(r.candidate_roles_with_dsn_variable_names,[]);assert.deepEqual(r.missing_candidate_roles,['registration','download','collector']);assert.deepEqual(r.blockers,[]);
const gaps=[
  {priority:1,code:'reviewed_runtime_image_and_original_input_required',observed:'main image ID remains the prior fix18; no inspector capability was executed or approved',required:'reviewed target image/native inspector bytes and original runtime/bootstrap/material inputs; no fabrication of accounts, deadlines or installation'},
  {priority:2,code:'runtime_connection_and_collector_mounts_unproven',observed:'zero explicit supported DSN env references in the nine observed Pod containers; capacity report PVC has zero observed Pod mounts',required:'actual registration/download/collector connections, independent non-root users, original DSNs and data-readonly/report mounts in reviewed runtime'},
  {priority:3,code:'journal_volume_not_observed',observed:'no ReadWriteOncePod claim and no /run/system-backup/download-journal mount in this namespace receipt',required:'independent approved journal volume, actual owner/mode/budget and separately verified single-writer behavior'},
  {priority:4,code:'actual_material_capacity_permission_evidence_missing',observed:'public inventory did not query SQL or read original materials/capacity reports or Unix mount permissions',required:'complete field plan plus original materials/validity, actual users/grants/metadata, five-second original capacity source/report/SQL time and real volume measurements'}
];
const references={kind:'a_field_observed_public_references.v1',status:'REFERENCES_ONLY_INCOMPLETE_NOT_A_FIELD_PLAN',source:receiptPin,
  context:r.context,namespace:r.namespace,namespace_uid:r.namespace_uid,
  mysql:{pod:mysqlPod.name,pod_uid:mysqlPod.uid,container:'mysql',node:mysqlPod.node,data_claim:data},
  capacity_report_claim:report,
  historical_database_identity:{server_uuid:environment.database.server_uuid,database:environment.database.name,source:pin(environmentPath),fresh_sql_identity_verified:false},
  profile_connections:{registration:null,download:null,collector:null,observer:null},materials:[],minimum_available_byte_budgets:null,
  collector_image:null,journal_claim:null,gaps,production_approved:false,complete_field_acceptance:false};
const referencePath='docs/evidence/a-field-observed-references-20261022.json';
const record={kind:'a_field_public_inventory_review.v1',status:'PUBLIC_INVENTORY_REVIEWED_FIELD_PREREQUISITES_MISSING',source:receiptPin,
  provenance:'operator-executed transport receipt; reviewer verified saved bytes/tool/payload/reference bindings without a new remote connection',
  inventory_script:pin(scriptPath),inventory_wrapper:pin('scripts/system-backup-a-field-inventory.ps1'),tested_preparation:pin(prepPath),
  context:r.context,namespace:r.namespace,namespace_uid:r.namespace_uid,namespace_identity_unchanged_within_receipt:true,
  pod_count:9,container_count:9,claim_count:5,explicit_supported_dsn_reference_count:0,reported_missing_candidate_roles:r.missing_candidate_roles,
  app:{pod:app.pod,pod_uid:app.pod_uid,declared_image:app.declared_image,observed_image_id:app.observed_image_id,same_image_id_as_historical_state:true,native_inspector_capability_verified:false},
  claims:claimRecords,read_write_once_pod_claim_count:0,journal_mounts:journalMounts,gaps,
  references_path:referencePath,reference_bytes_sha256:sha(Buffer.from(JSON.stringify(references,null,2)+'\n')),
  collection_scope_limits:['current namespace Pod/PVC/PV metadata only; no deployments, jobs, other namespaces or historical Pods were inventoried',
    'envFrom/actual process env were not collected; explicit env-name absence does not prove absence of all DSN configuration',
    'same image ID is not a new binary byte/capability check or permission approval',
    'PVC capacity is declared storage; no statfs, physical allocation/reservation, actual Unix modes, atomicity or fencing proof',
    'snapshot was not atomic across Kubernetes resources; Pod runtime instances were not guarded by pre/post exec checks',
    'SQL database identity/config rows and provider/material validity were not refreshed'],
  inventory_transport_blockers:r.blockers,full_field_plan_ready:false,actual_sql_executed:false,production_resources_created:false,
  production_approved:false,complete_field_acceptance:false,role10_or_gc18_retest_required:false,
  reviewer_sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))};
const outputPath='docs/evidence/a-field-public-inventory-reviewed-20261022.json';
if(process.argv[2]==='--check'){assert.deepEqual(json(referencePath),references);assert.deepEqual(json(outputPath),record);}
else{assert.deepEqual(process.argv.slice(2),['--write']);for(const p of [referencePath,outputPath])assert.equal(fs.existsSync(path.join(root,p)),false);fs.writeFileSync(path.join(root,referencePath),JSON.stringify(references,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(root,outputPath),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,pods:9,claims:5,report_pvc_observed_mounts:0,explicit_dsn_references:0,rwop_claims:0,complete_field_acceptance:false}));
