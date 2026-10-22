import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fieldTemplate,fieldRequirements,checkFieldScope,reviewFieldEnvelope} from './system-backup-a-field-evidence.mjs';
import {syntheticFieldFixture} from './system-backup-a-field-evidence-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),scriptBytes=fs.readFileSync(new URL('./system-backup-a-field-evidence.py',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const run=f=>reviewFieldEnvelope({planBytes:f.planBytes,envelopeBytes:Buffer.from(JSON.stringify(f.envelope)),scriptBytes:f.scriptBytes});
test('complete synthetic facts retain all remaining production boundaries',()=>{const r=run(syntheticFieldFixture(scriptBytes));assert.equal(r.status,'READ_ONLY_FACTS_REVIEWED_REMAINING_ACCEPTANCE_REQUIRED');assert.equal(r.runtime_profiles,3);assert.equal(r.capacity.status,'PASS_OFFLINE_CAPACITY_MATERIALS');assert.equal(r.capacity.age_nanoseconds,'1000000000');assert.equal(r.complete_field_acceptance,false);assert.equal(r.production_approved,false);assert.ok(r.pending.includes('production_revocation_not_executed'));});
test('current reviewed environment evidence binds exact original logs',()=>{const r=fieldRequirements();assert.equal(r.cluster_contacted,false);assert.equal(r.database_contacted,false);assert.equal(r.existing_observations.length,2);assert.equal(r.known_observed_blockers.length,4);assert.throws(()=>checkFieldScope(fieldTemplate()));});
for(const [name,mutate]of [
  ['original plan hash mismatch',f=>f.envelope.plan_sha256='0'.repeat(64)],
  ['tool byte mismatch',f=>f.scriptBytes=Buffer.from('altered')],
  ['SQL identity mismatch',f=>f.envelope.result.profiles[1].identity.server_uuid='wrong'],
  ['root substituted for runtime user',f=>f.envelope.result.profiles[1].identity.current_user='root@%'],
  ['active SQL role',f=>f.envelope.result.profiles[2].identity.current_role='ACTIVE'],
  ['missing runtime connection',f=>f.envelope.result.profiles.pop()],
  ['grants bytes mismatch',f=>f.envelope.result.profiles[2].direct_grants.push('GRANT ALL PRIVILEGES ON *.* TO root')],
  ['metadata no longer matches observer',f=>f.envelope.result.profiles[2].metadata[0].engine='OTHER'],
  ['missing required metadata table',f=>f.envelope.result.profiles[2].metadata.pop()],
  ['material digest mismatch',f=>f.envelope.result.materials[0].sha256='0'.repeat(64)],
  ['expired CA',f=>f.envelope.result.materials[0].not_expired_at_probe=false],
  ['expired CA later in bundle cannot be hidden',f=>f.envelope.result.materials[0].certificates[0].not_expired_at_probe=false],
  ['missing material',f=>f.envelope.result.materials.pop()],
  ['PVC identity substituted',f=>f.envelope.result.volumes[0].pvc_uid='wrong'],
  ['aliased physical backing',f=>f.envelope.result.volumes[1].backing_sha256=f.envelope.result.volumes[0].backing_sha256],
  ['unsafe journal permissions',f=>f.envelope.result.volumes[2].file_owner_mode='65532:65532:666'],
  ['journal owner mismatch',f=>f.envelope.result.volumes[2].file_owner_mode='0:65532:640'],
  ['journal access mode',f=>f.envelope.result.volumes[2].access_modes=['ReadWriteOnce']],
  ['data mount writable',f=>f.envelope.result.volumes[0].mount_read_only=false],
  ['actual data mount contradicts readonly declaration',f=>f.envelope.result.volumes[0].actual_mount_read_only=false],
  ['report group mismatch',f=>f.envelope.result.volumes[1].file_owner_mode='65532:0:640'],
  ['insufficient actual available bytes',f=>f.envelope.result.volumes[0].available_bytes='4095'],
  ['capacity report missing',f=>f.envelope.result.capacity=null],
  ['collector check not executed',f=>f.envelope.result.capacity.collector_check_ran=false],
  ['capacity source byte hash mismatch',f=>f.envelope.result.capacity.source_raw+=' '],
  ['capacity report beyond original five-second time',f=>{const c=f.envelope.result.capacity,i=JSON.parse(c.identity_raw);i.now='2026-10-21T00:00:05.000000001Z';c.identity_raw=JSON.stringify(i);}],
  ['probe claims wrote report',f=>f.envelope.result.capacity.report_written_by_probe=true],
  ['probe claims physical reservation proven',f=>f.envelope.result.volumes[2].physical_reservation_proven=true],
  ['false production approval',f=>f.envelope.result.production_approved=true],
])test(name,()=>{const f=syntheticFieldFixture(scriptBytes);mutate(f);assert.throws(()=>run(f));});
test('incomplete collector receipt remains blocked even with other facts',()=>{const f=syntheticFieldFixture(scriptBytes);f.envelope.ssh_exit=2;f.envelope.status='BLOCKED';f.envelope.result.status='BLOCKED';f.envelope.result.blockers=['capacity_collector_or_original_materials_unverified'];const r=run(f);assert.equal(r.status,'BLOCKED');assert.equal(r.complete_field_acceptance,false);});
test('original report exactly five seconds old is accepted without rounding',()=>{const f=syntheticFieldFixture(scriptBytes),c=f.envelope.result.capacity,i=JSON.parse(c.identity_raw);i.now='2026-10-21T00:00:05Z';c.identity_raw=JSON.stringify(i);assert.equal(run(f).capacity.age_nanoseconds,'5000000000');});
test('mounted DSNs and original root socket preserve separate real connection references',()=>{const f=syntheticFieldFixture(scriptBytes,{native:true,socketObserver:true});assert.equal(run(f).runtime_profiles,3);assert.equal(f.envelope.result.profiles[0].sql_connection_kind,'local_socket_observer');assert.equal(f.envelope.result.profiles[2].sql_connection_kind,'mounted_dsn_native');});
test('native inspector hash and transport cannot silently fall back to environment credentials',()=>{const f=syntheticFieldFixture(scriptBytes,{native:true});f.envelope.result.profiles[2].sql_connection_kind='existing_environment_mysql';f.envelope.result.profiles[2].native_inspector_sha256=null;assert.throws(()=>run(f));});
test('runtime DSN references cannot be exchanged between roles',()=>{const f=syntheticFieldFixture(scriptBytes,{native:true});f.plan.profiles.download.dsn_env='SYSTEM_BACKUP_REGISTRATION_DSN_FILE';assert.throws(()=>checkFieldScope(f.plan));});
test('complete metadata envelope above one MiB remains bounded and preserves exact inventory',()=>{const f=syntheticFieldFixture(scriptBytes,{native:true});const extra=Array.from({length:1800},(_,i)=>({kind:'column',table:'audit_logs',name:'synthetic_column_'+i,type:'varchar(1000)',nullable:'YES',default_sha256:'a'.repeat(64)}));for(const p of f.envelope.result.profiles)p.metadata.push(...extra);assert.ok(Buffer.byteLength(JSON.stringify(f.envelope))>1048576);assert.equal(run(f).runtime_profiles,3);});
test('large metadata envelope still rejects duplicate JSON fields',()=>{const f=syntheticFieldFixture(scriptBytes,{native:true});const padding='x'.repeat(1100000),raw=JSON.stringify(f.envelope).replace('"ssh_exit":0','"ssh_exit":1,"ssh_exit":0').replace('"result":{','"result":{"public_test_padding":"'+padding+'",');assert.throws(()=>reviewFieldEnvelope({planBytes:f.planBytes,envelopeBytes:Buffer.from(raw),scriptBytes}));});
test('supplied plan cannot shrink authoritative download metadata scope',()=>{const f=syntheticFieldFixture(scriptBytes);f.plan.profiles.download.tables=['users'];assert.throws(()=>checkFieldScope(f.plan));});
test('strict JSON rejects duplicate envelope fields',()=>{const f=syntheticFieldFixture(scriptBytes);const raw=JSON.stringify(f.envelope).replace('"ssh_exit":0','"ssh_exit":1,"ssh_exit":0');assert.throws(()=>reviewFieldEnvelope({planBytes:f.planBytes,envelopeBytes:Buffer.from(raw),scriptBytes}));});
test('actual CLI template creation and no-overwrite; exact owned cleanup',()=>{
  const owned=fs.mkdtempSync(path.join(root,'.tmp-a-field-evidence-')),template=path.join(owned,'plan.json');
  try{
    const cli=path.join(root,'scripts/system-backup-a-field-evidence.mjs'),a=spawnSync(process.execPath,[cli,'--template','--output',template],{encoding:'utf8',windowsHide:true});assert.equal(a.status,0,a.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(template)),fieldTemplate());
    const before=fs.readFileSync(template),b=spawnSync(process.execPath,[cli,'--template','--output',template],{encoding:'utf8',windowsHide:true});assert.equal(b.status,1);assert.deepEqual(fs.readFileSync(template),before);
    const requirements=spawnSync(process.execPath,[cli,'--requirements'],{encoding:'utf8',windowsHide:true});assert.equal(requirements.status,2);assert.equal(JSON.parse(requirements.stdout).cluster_contacted,false);
  }finally{assert.equal(path.dirname(owned),root);assert.match(path.basename(owned),/^\.tmp-a-field-evidence-[A-Za-z0-9]+$/);assert.ok(!fs.lstatSync(owned).isSymbolicLink());fs.rmSync(owned,{recursive:true});assert.equal(fs.existsSync(owned),false);}
});
