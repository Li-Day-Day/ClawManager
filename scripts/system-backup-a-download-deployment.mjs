#!/usr/bin/env node
// Public offline composition. No kubectl, SQL, provider, credential reads or apply.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {emptyTemplate as registrationTemplate,renderDeployment} from './system-backup-d-deployment.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(resolve(root,path),'utf8');
const bytes=value=>JSON.stringify(value,null,2)+'\n';
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const sha=/^[0-9a-f]{64}$/,version=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const name=/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/,user=/^[A-Za-z0-9_]{1,32}$/;
const prefix='/run/system-backup';
const source=read('backend/cmd/system-backup-registration/download_deployment.go');
const grantsSource=read('backend/cmd/system-backup-registration/download_grants.go');
export const downloadPaths={runtime:prefix+'/download/runtime.json',grants:prefix+'/download/grants.json',dsn:prefix+'/download-credentials/dsn',journal:prefix+'/download-journal/failure.jsonl',oidc:prefix+'/download-oidc'};
export const readinessPath=read('backend/cmd/system-backup-registration/download_readiness.go').match(/const downloadReadinessPath = "([^"]+)"/)?.[1];
assert.ok(readinessPath?.startsWith('/internal/'));
function fields(type,text=source){const body=text.match(new RegExp(`type ${type} struct \\{([\\s\\S]*?)\\r?\\n\\}`))?.[1];assert.ok(body,type);const names=[...body.matchAll(/`json:"([a-z0-9_]+)"`/g)].map(m=>m[1]);assert.ok(names.length);return names;}
function closed(value,names,label){assert.ok(value&&typeof value==='object'&&!Array.isArray(value),label);assert.deepEqual(Object.keys(value).sort(),[...names].sort(),label);}
function text(value,max=2048){assert.ok(typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value));return value;}
function integer(value,min,max){assert.ok(Number.isSafeInteger(value)&&value>=min&&value<=max);}
function resource(value){text(value,63);assert.match(value,name);}
function https(value,originOnly=false){text(value);assert.ok(value.startsWith('https://')&&!/[?#\s]/.test(value));const u=new URL(value);assert.ok(!u.username&&!u.password&&u.hostname);if(originOnly)assert.match(value,/^https:\/\/[^/?#]+$/);}
function key(value){closed(value,fields('downloadReferencePins'),'key');assert.match(value.identity_hash,sha);assert.match(value.version,version);}
function timestamp(value){text(value,40);assert.match(value,/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z$/);const date=new Date(value);assert.ok(Number.isFinite(date.getTime()));assert.equal(date.toISOString().slice(0,19),value.slice(0,19));}
function tokenPath(index){return downloadPaths.oidc+'/'+(index===0?'transit-token':`transit-${index}-token`);}

// Parse the existing candidate's write closure/minimum; do not invent or apply grants.
const writable=new Map([...grantsSource.match(/var downloadWritableTables = map\[string\]map\[string\]bool\{([\s\S]*?)\r?\n\}/)[1].matchAll(/"([a-z_]+)":\s*\{([^}]+)\}/g)].map(m=>[m[1],new Set([...m[2].matchAll(/"([A-Z ]+)": true/g)].map(v=>v[1]))]));
const minimum=new Map([...grantsSource.match(/for table, required := range map\[string\]\[\]string\{([\s\S]*?)\r?\n\s*\} \{/)[1].matchAll(/"([a-z_]+)":\s*\{([^}]+)\}/g)].map(m=>[m[1],[...m[2].matchAll(/"([A-Z ]+)"/g)].map(v=>v[1])]));
assert.ok(writable.size>=10&&minimum.size>=18);
export function requiredDownloadPrivileges(){return Object.fromEntries([...minimum].map(([table,privileges])=>[table,[...privileges]]));}
function grantPins(pins,c){
  closed(pins,fields('downloadGrantPins',grantsSource),'SQL pins');assert.equal(pins.schema_version,'system-backup-download-sql-pins.v1');
  for(const [field,value]of [['server_uuid',c.server_uuid],['database',c.database],['user',c.database_user]])assert.equal(pins[field],value);
  assert.ok(Array.isArray(pins.statements)&&pins.statements.length>0&&pins.statements.length<=256);assert.equal(new Set(pins.statements).size,pins.statements.length);
  const grantee=`(?:'${c.database_user}'|\x60${c.database_user}\x60)@(?:'[^']+'|\x60[^\x60]+\x60)`;
  const usage=new RegExp(`^GRANT USAGE ON \\*\\.\\* TO ${grantee}$`),lock=new RegExp('^GRANT LOCK TABLES ON `'+c.database+'`\\.\\* TO '+grantee+'$');
  const tableGrant=new RegExp('^GRANT ([A-Z ,]+) ON `'+c.database+'`\\.`([A-Za-z0-9_]+)` TO '+grantee+'$');
  let locks=0;const tables=new Map();
  for(const statement of pins.statements){
    text(statement,2048);if(usage.test(statement))continue;if(lock.test(statement)){locks++;continue;}
    const match=statement.match(tableGrant);assert.ok(match,'closed grant syntax required');const table=match[2];
    assert.ok(/^(?:system_backup_|system_restore_)/.test(table)||['system_backups','users','audit_logs','schema_migrations'].includes(table));
    const privileges=match[1].split(', ');assert.equal(new Set(privileges).size,privileges.length);
    for(const privilege of privileges)assert.ok(privilege==='SELECT'||writable.get(table)?.has(privilege));
    if(!tables.has(table))tables.set(table,new Set());for(const privilege of privileges)tables.get(table).add(privilege);
  }
  assert.equal(locks,1);for(const [table,privileges]of minimum)for(const privilege of privileges)assert.ok(tables.get(table)?.has(privilege),table+' '+privilege);
}

export function emptyDownloadTemplate(){return {schema_version:'system-backup-download-kubernetes.v1',registration:registrationTemplate(),download:JSON.parse(read('deployments/k8s/system-backup-download.template.json')),sql_pins:JSON.parse(read('deployments/k8s/system-backup-download-sql-pins.template.json')),bindings:{download_credentials_secret:'',journal_pvc:''},readiness_server_name:'',projected_token_seconds:600};}
export function downloadRequirements(){return {status:'blocked',scope:'offline public composition only',required:['registration public deployment input','original download pins and measured budgets','actual expected direct SQL grants','separate download DSN Secret reference','preprovisioned single-writer journal PVC reference','server certificate hostname'],paths:downloadPaths,required_sql_candidate_privileges:requiredDownloadPrivileges(),external_checks_required:['review both SQL account profiles and distinct users','verify image digest includes this command and exact catalog','verify actual CA ConfigMap bytes and server certificate','verify original material deadlines, measured budgets and live capacity','verify projected issuer, subject, audiences and provider ACLs','verify journal PVC ReadWriteOncePod and distinct physical storage','verify mounted journal owner, private mode, fsGroup/CSI behavior and reserved capacity','complete actual owner SQL, personal MFA and provider/restore E2E'],kubernetes_contacted:false,sql_executed:false,production_approval:false};}

export function renderDownloadDeployment(input){
  closed(input,['schema_version','registration','download','sql_pins','bindings','readiness_server_name','projected_token_seconds'],'download Kubernetes input');assert.equal(input.schema_version,'system-backup-download-kubernetes.v1');
  const result=renderDeployment(input.registration),c=input.download,b=input.registration.runtime;
  closed(c,fields('downloadDeployment'),'download runtime');assert.equal(c.schema_version,'system-backup-download-deployment.v1');
  assert.equal(c.registration_runtime_sha256,result.report.runtime_sha256);
  for(const [field,base]of [['server_uuid','expected_server_uuid'],['database','expected_database'],['installation_id','installation_id'],['config_version','config_version']])assert.equal(c[field],b[base]);
  assert.match(c.installation_id,/^installation_[A-Za-z0-9_-]{1,115}$/);assert.match(c.database,/^[A-Za-z0-9_]{1,64}$/);
  assert.match(c.database_user,user);assert.notEqual(c.database_user.toLowerCase(),'root');assert.match(c.config_sha256,sha);
  assert.equal(c.grants_file,downloadPaths.grants);assert.equal(c.journal_path,downloadPaths.journal);
  assert.ok(typeof c.root==='string'&&c.root.length<=1024&&/^[A-Za-z0-9._/-]+$/.test(c.root)&&c.root.split('/').every(v=>v&&v!=='.'&&v!=='..'));
  key(c.store);key(c.read);for(const field of ['authority_until','materials_until','audit_minimum_retain_until'])timestamp(c[field]);
  integer(c.large_smoke_bytes,1,549755813888);integer(c.admission_reservation_bytes,3*8192,1048576);integer(c.result_reservation_bytes,2048,1048576);integer(c.journal_max_bytes,4096,1073741824);
  closed(c.s3,fields('downloadS3Pins'),'S3');closed(c.sts,fields('downloadSTSPins'),'STS');https(c.s3.endpoint,true);https(c.sts.endpoint,true);https(c.sts.issuer);
  assert.match(c.s3.region,/^[a-z0-9][a-z0-9-]{0,62}$/);assert.match(c.s3.bucket,/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);assert.ok(!c.s3.bucket.includes('..'));
  assert.match(c.sts.role_arn,/^arn:(aws|aws-cn|aws-us-gov):iam::[0-9]{12}:role\/[A-Za-z0-9_+=,.@/-]{1,512}$/);assert.ok(c.sts.role_arn.split('/').slice(1).every(p=>p&&p!=='.'&&p!=='..'));
  text(c.sts.audience,255);assert.equal(c.sts.token_file,downloadPaths.oidc+'/s3-token');
  const deployment=result.manifest.items.find(v=>v.kind==='Deployment'),pod=deployment.spec.template.spec,container=pod.containers[0];
  assert.equal(c.sts.subject,`system:serviceaccount:${input.registration.namespace}:${pod.serviceAccountName}`);
  const caKeys=new Map();function ca(record){assert.match(record.ca_file,/^\/run\/system-backup\/ca\/[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/);assert.match(record.ca_sha256,sha);if(caKeys.has(record.ca_file))assert.equal(caKeys.get(record.ca_file),record.ca_sha256);caKeys.set(record.ca_file,record.ca_sha256);}
  ca(c.s3);ca(c.sts);assert.ok(Array.isArray(c.transit)&&c.transit.length>0&&c.transit.length<=128);
  const keys=new Set(),roles=new Set(),policies=new Set();
  for(const [index,t]of c.transit.entries()){
    closed(t,fields('downloadTransitPins'),'Transit');https(t.endpoint,true);key(t.key);integer(t.key_version,1,4294967295);ca(t);
    for(const field of ['key_name','mount','role','policy'])assert.match(t[field],/^[A-Za-z0-9_-]{1,128}$/);assert.ok(!['root','default'].includes(t.policy.toLowerCase()));
    text(t.audience,255);assert.notEqual(t.audience,c.sts.audience);assert.equal(t.token_file,tokenPath(index));
    for(const [set,value]of [[keys,t.key.identity_hash+'\0'+t.key.version],[roles,t.endpoint+'/'+t.mount+'/'+t.role],[policies,t.endpoint+'/'+t.policy]]){assert.ok(!set.has(value));set.add(value);}
  }
  grantPins(input.sql_pins,c);const grantsRaw=bytes(input.sql_pins);assert.equal(c.grants_sha256,hash(grantsRaw));assert.ok(Buffer.byteLength(grantsRaw)<=65536);
  closed(input.bindings,['download_credentials_secret','journal_pvc'],'download bindings');for(const value of Object.values(input.bindings))resource(value);
  const baseBindings=input.registration.bindings;for(const [key,value]of Object.entries(baseBindings))if(key.endsWith('_secret'))assert.notEqual(input.bindings.download_credentials_secret,value);
  assert.notEqual(input.bindings.journal_pvc,baseBindings.capacity_pvc);
  text(input.readiness_server_name,253);assert.match(input.readiness_server_name,/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/);integer(input.projected_token_seconds,600,3600);
  const raw=bytes(c),digest=hash(raw);assert.ok(Buffer.byteLength(raw)<=65536);const configName='sbk-download-'+digest.slice(0,16);
  const labels=structuredClone(deployment.metadata.labels);
  result.manifest.items.push({apiVersion:'v1',kind:'ConfigMap',metadata:{name:configName,namespace:input.registration.namespace,labels},immutable:true,data:{'runtime.json':raw,'grants.json':grantsRaw}});
  pod.volumes.push({name:'download',configMap:{name:configName,optional:false,defaultMode:288,items:[{key:'runtime.json',path:'runtime.json'},{key:'grants.json',path:'grants.json'}]}},{name:'download-credentials',secret:{secretName:input.bindings.download_credentials_secret,optional:false,defaultMode:288,items:[{key:'dsn',path:'dsn'}]}},{name:'download-journal',persistentVolumeClaim:{claimName:input.bindings.journal_pvc,readOnly:false}},{name:'download-oidc',projected:{defaultMode:288,sources:[{serviceAccountToken:{audience:c.sts.audience,expirationSeconds:input.projected_token_seconds,path:'s3-token'}},...c.transit.map((t,i)=>({serviceAccountToken:{audience:t.audience,expirationSeconds:input.projected_token_seconds,path:basename(tokenPath(i))}}))]}});
  for(const [name,mountPath,readOnly]of [['download',prefix+'/download',true],['download-credentials',prefix+'/download-credentials',true],['download-journal',prefix+'/download-journal',false],['download-oidc',downloadPaths.oidc,true]])container.volumeMounts.push({name,mountPath,readOnly});
  container.command.push('--download-runtime',downloadPaths.runtime);
  container.env.push({name:'SYSTEM_BACKUP_DOWNLOAD_RUNTIME_SHA256',value:digest},{name:'SYSTEM_BACKUP_DOWNLOAD_DSN_FILE',value:downloadPaths.dsn});
  container.readinessProbe.exec.command.push('--check-live-url','https://127.0.0.1:9443'+readinessPath,'--probe-server-name',input.readiness_server_name);
  assert.ok(!container.readinessProbe.exec.command.includes('--download-runtime'));
  pod.securityContext.fsGroupChangePolicy='OnRootMismatch';
  deployment.spec.template.metadata.annotations['clawmanager.io/download-runtime-sha256']=digest;
  deployment.spec.template.metadata.annotations['clawmanager.io/required-journal-access-mode']='ReadWriteOncePod';
  return {report:{...result.report,download_runtime_sha256:digest,sql_grants_sha256:c.grants_sha256,download_credentials:'separate_secret_and_connection_pool_required',readiness:'existing_process_journal_plus_exec_configuration_check',required_ca_configmap_keys:[...caKeys.keys()].map(path=>basename(path)).sort(),original_deadlines_preserved:true,journal_file_created:false,sql_grants_applied:false,sql_role_approved:false,real_storage_verified:false,projected_oidc_verified:false,production_approval:false,external_checks_required:downloadRequirements().external_checks_required},manifest:result.manifest};
}

// JSON.parse alone loses duplicate keys and permits lone escaped surrogates.
export function decodeDownloadInput(raw){
  assert.ok(raw.length<=1048576);const source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw),value=JSON.parse(source);assert.ok(value&&typeof value==='object'&&!Array.isArray(value));let at=0,nodes=0;
  function space(){while(/[\t\r\n ]/.test(source[at]??'!'))at++;}
  function string(){const start=at++;while(at<source.length){if(source[at]==='\\'){at+=2;continue;}if(source[at++]==='"')break;}const text=JSON.parse(source.slice(start,at));for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=text.charCodeAt(++i);assert.ok(next>=0xdc00&&next<=0xdfff);}else assert.ok(n<0xdc00||n>0xdfff);}return text;}
  function walk(depth){assert.ok(depth<=32&&++nodes<=20000);space();const token=source[at++];if(token==='"'){at--;string();return;}if(token==='{'||token==='['){const close=token==='{'?'}':']',seen=new Set();space();while(source[at]!==close){if(token==='{'){space();assert.equal(source[at],'"');const key=string();assert.ok(!seen.has(key));seen.add(key);space();assert.equal(source[at++],':');}walk(depth+1);space();if(source[at]===close)break;assert.equal(source[at++],',');space();}assert.equal(source[at++],close);return;}while(at<source.length&&!/[\s,\]}]/.test(source[at]))at++;}
  walk(0);space();assert.equal(at,source.length);return value;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length===3&&process.argv[2]==='--requirements'){console.log(bytes(downloadRequirements()));process.exitCode=2;}
    else if((process.argv.length===3||process.argv.length===5)&&process.argv[2]==='--template'){const raw=bytes(emptyDownloadTemplate());if(process.argv.length===5){assert.equal(process.argv[3],'--output');writeFileSync(resolve(process.argv[4]),raw,{flag:'wx'});console.log(bytes({status:'template_written',production_approval:false}));}else console.log(raw);}
    else{assert.ok(process.argv.length===4||process.argv.length===6);assert.equal(process.argv[2],'--input');if(process.argv.length===6)assert.equal(process.argv[4],'--output');const input=decodeDownloadInput(readFileSync(resolve(process.argv[3]))),result=renderDownloadDeployment(input);if(process.argv.length===6)writeFileSync(resolve(process.argv[5]),bytes(result.manifest),{flag:'wx'});console.log(bytes(result.report));}
  }catch{console.error('Download deployment input rejected; no cluster, SQL or provider contacted.');process.exitCode=1;}
}
