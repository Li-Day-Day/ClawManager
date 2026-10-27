import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,lstatSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {renderDeployment} from './system-backup-d-deployment.mjs';
import {decodeDownloadInput,downloadPaths,downloadRequirements,emptyDownloadTemplate,readinessPath,renderDownloadDeployment,requiredDownloadPrivileges} from './system-backup-a-download-deployment.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const digest=raw=>createHash('sha256').update(raw).digest('hex');
const bytes=value=>JSON.stringify(value,null,2)+'\n';
const sha='a'.repeat(64);
function repinGrants(input){input.download.grants_sha256=digest(bytes(input.sql_pins));}
function synthetic(){
  const input=emptyDownloadTemplate(),base=input.registration,c=input.download;
  base.namespace='synthetic-backup';base.image=`example.invalid/synthetic@sha256:${sha}`;
  for(const record of [base.runtime,base.bootstrap])for(const key of Object.keys(record))if(record[key]==='')record[key]=key.endsWith('sha256')||key==='s3_identity_hash'?sha:`synthetic-${key}`;
  for(const record of [base.runtime,base.bootstrap]){record.expected_server_uuid='11111111-2222-4333-8444-555555555555';record.expected_database='synthetic_test';record.installation_id='installation_synthetic';}
  base.runtime.transit_endpoint='https://transit.invalid';base.runtime.s3_endpoint='https://s3.invalid';
  for(const key of Object.keys(base.bindings))base.bindings[key]='synthetic-'+key.replaceAll('_','-');
  const kinds=JSON.parse(readFileSync(new URL('../contracts/system-backup/v12/admin-control-resources.schema.json',import.meta.url))).$defs.RegistryReference.properties.registry_kind.enum;
  base.registry_items=kinds.map((kind,index)=>{const prefix={provider_proof_issuers:'provider',strong_auth_issuers:'strong',rbac_bindings:'rbac'}[kind];return {key:`registry-${index}.json`,path:`${kind}/${prefix?base.runtime[`${prefix}_registry_version`]:'v1'}/${sha}.json`};});
  base.nonce_items=[{key:'nonce',path:`${sha}/v1`}];
  Object.assign(c,{registration_runtime_sha256:renderDeployment(base).report.runtime_sha256,server_uuid:base.runtime.expected_server_uuid,database:base.runtime.expected_database,installation_id:base.runtime.installation_id,database_user:'download_reader',config_version:1,config_sha256:'b'.repeat(64),root:'evidence',store:{identity_hash:'c'.repeat(64),version:'store-v1'},read:{identity_hash:'d'.repeat(64),version:'read-v1'},authority_until:'2027-01-01T00:00:00.123456Z',materials_until:'2027-01-01T00:00:00.000001Z',audit_minimum_retain_until:'2027-01-02T00:00:00Z',large_smoke_bytes:1,admission_reservation_bytes:65536,result_reservation_bytes:65536,journal_max_bytes:4096});
  Object.assign(c.s3,{endpoint:'https://s3.invalid',region:'us-east-1',bucket:'synthetic-evidence',ca_sha256:sha});
  Object.assign(c.sts,{endpoint:'https://sts.invalid',role_arn:'arn:aws:iam::123456789012:role/evidence-reader',issuer:'https://issuer.invalid',audience:'download-sts',subject:`system:serviceaccount:${base.namespace}:system-backup-registration`,ca_sha256:sha});
  Object.assign(c.transit[0],{endpoint:'https://transit.invalid',key:{identity_hash:'e'.repeat(64),version:'kek-v1'},key_name:'evidence',key_version:1,mount:'jwt',role:'download-reader',policy:'download-decrypt',audience:'download-unwrap',ca_sha256:sha});
  Object.assign(input.sql_pins,{server_uuid:c.server_uuid,database:c.database,user:c.database_user});
  const grantee="'download_reader'@'%'";
  input.sql_pins.statements=['GRANT USAGE ON *.* TO '+grantee,`GRANT LOCK TABLES ON \`${c.database}\`.* TO ${grantee}`,...Object.entries(requiredDownloadPrivileges()).map(([table,privileges])=>`GRANT ${privileges.join(', ')} ON \`${c.database}\`.\`${table}\` TO ${grantee}`)];
  repinGrants(input);input.bindings={download_credentials_secret:'synthetic-download-credentials',journal_pvc:'synthetic-download-journal'};input.readiness_server_name='registration.synthetic.invalid';
  return input;
}
function runtime(result){return result.manifest.items.find(v=>v.kind==='Deployment');}

test('empty template stays blocked and requirements never assert external approval',()=>{
  assert.throws(()=>renderDownloadDeployment(emptyDownloadTemplate()));
  const r=downloadRequirements();assert.equal(r.status,'blocked');assert.equal(r.kubernetes_contacted,false);assert.equal(r.sql_executed,false);assert.equal(r.production_approval,false);assert.ok(r.external_checks_required.some(v=>v.includes('ReadWriteOncePod')));
});
test('public config bytes match all SHA pins and input stays unchanged',()=>{
  const input=synthetic(),before=bytes(input),result=renderDownloadDeployment(input),pod=runtime(result).spec.template.spec,container=pod.containers[0];
  assert.equal(bytes(input),before);assert.equal(result.manifest.items.length,8);
  const cm=result.manifest.items.find(v=>v.kind==='ConfigMap'&&v.data['grants.json']);assert.ok(cm.immutable);
  assert.equal(digest(cm.data['runtime.json']),container.env.find(v=>v.name==='SYSTEM_BACKUP_DOWNLOAD_RUNTIME_SHA256').value);
  assert.equal(digest(cm.data['grants.json']),JSON.parse(cm.data['runtime.json']).grants_sha256);
  assert.equal(JSON.parse(cm.data['runtime.json']).registration_runtime_sha256,result.report.runtime_sha256);
  assert.deepEqual(container.command.slice(-2),['--download-runtime',downloadPaths.runtime]);
  assert.equal(container.env.find(v=>v.name==='SYSTEM_BACKUP_DOWNLOAD_DSN_FILE').value,downloadPaths.dsn);
  for(const field of ['authority_until','materials_until','audit_minimum_retain_until'])assert.equal(JSON.parse(cm.data['runtime.json'])[field],input.download[field]);
});
test('single writer workload remains stopped and mounted journal is isolated',()=>{
  const result=renderDownloadDeployment(synthetic()),deployment=runtime(result),pod=deployment.spec.template.spec,c=pod.containers[0];
  assert.equal(deployment.spec.replicas,0);assert.equal(deployment.spec.strategy.type,'Recreate');assert.ok(result.manifest.items.filter(v=>v.kind==='Job').every(v=>v.spec.suspend));
  assert.equal(pod.securityContext.fsGroupChangePolicy,'OnRootMismatch');assert.equal(deployment.spec.template.metadata.annotations['clawmanager.io/required-journal-access-mode'],'ReadWriteOncePod');
  assert.deepEqual(c.volumeMounts.filter(v=>!v.readOnly).map(v=>v.name),['download-journal']);
  assert.notEqual(pod.volumes.find(v=>v.name==='capacity').persistentVolumeClaim.claimName,pod.volumes.find(v=>v.name==='download-journal').persistentVolumeClaim.claimName);
  assert.ok(!result.manifest.items.some(v=>['Secret','PersistentVolumeClaim','Role','ClusterRole'].includes(v.kind)));
  for(const job of result.manifest.items.filter(v=>v.kind==='Job'))assert.ok(!job.spec.template.spec.volumes.some(v=>v.name.startsWith('download')));
  assert.equal(result.report.real_storage_verified,false);assert.equal(result.report.journal_file_created,false);assert.equal(result.report.sql_grants_applied,false);assert.equal(result.report.production_approval,false);
});
test('readiness contacts the current process without loading a second journal',()=>{
  const input=synthetic(),pod=runtime(renderDownloadDeployment(input)).spec.template.spec,c=pod.containers[0],args=c.readinessProbe.exec.command;
  assert.ok(args.includes('--check-activation'));assert.ok(!args.includes('--download-runtime'));assert.equal(args[args.indexOf('--check-live-url')+1],'https://127.0.0.1:9443'+readinessPath);assert.equal(args[args.indexOf('--probe-server-name')+1],input.readiness_server_name);
  assert.equal(c.startupProbe.tcpSocket.port,'https');assert.equal(c.securityContext.readOnlyRootFilesystem,true);
});
test('OIDC is explicitly projected per audience and credentials have one key',()=>{
  const input=synthetic(),pod=runtime(renderDownloadDeployment(input)).spec.template.spec;
  assert.equal(pod.automountServiceAccountToken,false);
  const tokens=pod.volumes.find(v=>v.name==='download-oidc').projected;
  assert.equal(tokens.defaultMode,288);assert.deepEqual(tokens.sources.map(v=>v.serviceAccountToken.audience),[input.download.sts.audience,input.download.transit[0].audience]);
  assert.deepEqual(tokens.sources.map(v=>v.serviceAccountToken.path),['s3-token','transit-token']);assert.ok(tokens.sources.every(v=>v.serviceAccountToken.expirationSeconds===600));
  const secret=pod.volumes.find(v=>v.name==='download-credentials').secret;assert.deepEqual(secret.items,[{key:'dsn',path:'dsn'}]);assert.equal(secret.secretName,input.bindings.download_credentials_secret);
});
test('multiple historical Transit mappings retain independent key roles and projected paths',()=>{
  const input=synthetic(),t=structuredClone(input.download.transit[0]);Object.assign(t,{endpoint:'https://old-transit.invalid',key:{identity_hash:'f'.repeat(64),version:'old:1'},key_name:'old-evidence',role:'old-read',policy:'old-decrypt',audience:'old-unwrap',token_file:downloadPaths.oidc+'/transit-1-token',ca_file:'/run/system-backup/ca/old-transit.crt'});input.download.transit.push(t);
  const result=renderDownloadDeployment(input),tokens=runtime(result).spec.template.spec.volumes.find(v=>v.name==='download-oidc').projected.sources;
  assert.equal(tokens.length,3);assert.equal(tokens[2].serviceAccountToken.path,'transit-1-token');assert.equal(tokens[2].serviceAccountToken.audience,'old-unwrap');assert.deepEqual(result.report.required_ca_configmap_keys,['old-transit.crt','s3.crt','transit.crt']);
});
test('wrong identities, pins, paths, original dates and budgets fail before rendering',()=>{
  for(const mutate of [v=>v.download.server_uuid='wrong',v=>v.download.database='other',v=>v.download.installation_id='installation_other',v=>v.download.config_version=2,v=>v.download.registration_runtime_sha256='0'.repeat(64),v=>v.download.grants_sha256='0'.repeat(64),v=>v.download.database_user='root',v=>v.download.journal_path='/tmp/failure',v=>v.download.grants_file='/tmp/grants',v=>v.download.authority_until='0001-01-01T00:00:00Z',v=>v.download.materials_until='2027-02-30T00:00:00Z',v=>v.download.large_smoke_bytes=0,v=>v.download.admission_reservation_bytes=1,v=>v.download.result_reservation_bytes=1,v=>v.download.journal_max_bytes=0,v=>v.download.journal_max_bytes=2**31,v=>v.download.password='PRIVATE']){const input=synthetic();mutate(input);assert.throws(()=>renderDownloadDeployment(input));}
});
test('credential/PVC alias, confused workload identity and unsafe provider mapping fail',()=>{
  for(const mutate of [v=>v.bindings.download_credentials_secret=v.registration.bindings.runtime_credentials_secret,v=>v.bindings.download_credentials_secret=v.registration.bindings.migration_credentials_secret,v=>v.bindings.journal_pvc=v.registration.bindings.capacity_pvc,v=>v.download.sts.subject='system:serviceaccount:other:other',v=>v.download.sts.token_file=v.download.transit[0].token_file,v=>v.download.transit[0].audience=v.download.sts.audience,v=>v.download.transit[0].token_file='/tmp/token',v=>v.download.transit[0].policy='root',v=>v.download.transit.push(structuredClone(v.download.transit[0])),v=>v.download.s3.endpoint='http://s3.invalid',v=>v.download.sts.endpoint='https://user:PRIVATE@sts.invalid',v=>v.download.transit[0].ca_file=downloadPaths.dsn,v=>v.download.sts.ca_sha256='b'.repeat(64),v=>v.readiness_server_name='',v=>v.projected_token_seconds=599,v=>v.projected_token_seconds=3601]){const input=synthetic();mutate(input);assert.throws(()=>renderDownloadDeployment(input));}
});
test('SQL pins preserve the startup write closure and require complete task reads',()=>{
  for(const statement of ['GRANT ALL PRIVILEGES ON `synthetic_test`.* TO \'download_reader\'@\'%\'','GRANT UPDATE ON `synthetic_test`.`audit_logs` TO \'download_reader\'@\'%\'','GRANT UPDATE ON `synthetic_test`.`users` TO \'download_reader\'@\'%\'','GRANT DELETE ON `synthetic_test`.`system_backup_evidence` TO \'download_reader\'@\'%\'','GRANT \'role\'@\'%\' TO \'download_reader\'@\'%\'','GRANT USAGE ON *.* TO \'download_reader\'@\'%\' IDENTIFIED BY \'PRIVATE\'']){const input=synthetic();input.sql_pins.statements.push(statement);repinGrants(input);assert.throws(()=>renderDownloadDeployment(input));}
  for(const missing of ['system_backups','system_restore_drills','system_backup_preflights','system_backup_artifact_verifications','LOCK TABLES']){const input=synthetic();input.sql_pins.statements=input.sql_pins.statements.filter(s=>!s.includes(missing));repinGrants(input);assert.throws(()=>renderDownloadDeployment(input));}
});
test('strict public JSON rejects duplicates, lossy Unicode, BOM and nonobjects',()=>{
  for(const raw of ['{"x":1,"x":2}','{"x":{"y":1,"y":2}}','{"x":"\\ud800"}','{"x":"\\udc00"}','{} {}','null','[]','\uFEFF{}'])assert.throws(()=>decodeDownloadInput(Buffer.from(raw)));
  assert.throws(()=>decodeDownloadInput(Buffer.from([123,34,120,34,58,34,255,34,125])));
  assert.deepEqual(decodeDownloadInput(Buffer.from('{"x":"\\ud83d\\ude00","a":[1,true,null,{}]}')),{x:'😀',a:[1,true,null,{}]});
});
test('CLI writes UTF-8 templates and manifests exclusively, hides invalid private input and cleans its test files',()=>{
  const dir=mkdtempSync(join(root,'.tmp-a-download-render-'));
  try{
    const script=resolve(root,'scripts/system-backup-a-download-deployment.mjs'),inputPath=join(dir,'public.json'),outputPath=join(dir,'manifest.json'),templatePath=join(dir,'template.json');
    execFileSync(process.execPath,[script,'--template','--output',templatePath],{stdio:'pipe'});assert.deepEqual(decodeDownloadInput(readFileSync(templatePath)),emptyDownloadTemplate());
    writeFileSync(inputPath,bytes(synthetic()));const report=JSON.parse(execFileSync(process.execPath,[script,'--input',inputPath,'--output',outputPath],{encoding:'utf8',stdio:'pipe'}));assert.equal(report.status,'renderable');const original=readFileSync(outputPath);
    assert.throws(()=>execFileSync(process.execPath,[script,'--input',inputPath,'--output',outputPath],{stdio:'pipe'}));assert.deepEqual(readFileSync(outputPath),original);
    writeFileSync(inputPath,'{"PRIVATE":"PRIVATE","PRIVATE":"PRIVATE"}');try{execFileSync(process.execPath,[script,'--input',inputPath,'--output',join(dir,'rejected.json')],{stdio:'pipe'});assert.fail('invalid input accepted');}catch(error){assert.equal(error.status,1);assert.ok(!String(error.stderr).includes('PRIVATE'));assert.ok(!existsSync(join(dir,'rejected.json')));}
  }finally{assert.equal(dirname(resolve(dir)),resolve(root));assert.match(dir.split(/[\\/]/).at(-1),/^\.tmp-a-download-render-/);assert.equal(lstatSync(dir).isSymbolicLink(),false);rmSync(dir,{recursive:true,force:true});}
  assert.equal(existsSync(dir),false);
});
