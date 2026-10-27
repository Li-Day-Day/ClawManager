import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validateReceipt,validateManifest,validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(p);
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const local=p=>{const v=path.resolve(root,p);assert.ok(v.startsWith(root+path.sep));return v;};
const fkCases=Object.freeze(['reparent_items','reparent_reports','reparent_both','reparent_existing_parent','delete_children_and_parent','server_cascade_control_rollback','server_rejects_orphan_1452','late_common_failure_rollback','final_denial_after_reparent_rollback','unique_conflict_after_new_parent_rollback']);
export const cases=fkCases;
export const writerCases=Object.freeze(['commit_updates_then_select_only_readback','insert_into_complete_empty_target','delete_complete_row_set','later_common_stage_rollback','final_authority_failure_rollback','late_sql_failure_rollback','old_rr_snapshot_rejects_current_drift','existing_primary_row_lock','empty_primary_range_lock']);
export const validateFKTranscript=(text,r,meta)=>validateWriteTranscript(text,r,meta,true);
export const validateWriterTranscript=(text,r,meta)=>validateWriteTranscript(text,r,meta,false);
function validateWriteTranscript(text,r,{migrationCount,lastMigration,catalogHash},isFK){
 const probe=isFK?'TestAResourcesWriteFKMySQL':'TestDResourcesWriteMySQL';
 const cases=isFK?fkCases:writerCases;
 const lines=text.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').split('\n');
 assert.ok(!lines.some(l=>/CLEANUP_PENDING|CLEANUP_SKIPPED|--- FAIL:|--- SKIP:|^FAIL(?:\s|$)|panic:|fatal error:/.test(l)),'failed or unclean transcript');
 const one=(pattern)=>{const m=lines.flatMap((l,i)=>{const a=pattern.exec(l);return a?[{m:a,i}]:[];});assert.equal(m.length,1,'missing/duplicate '+pattern);return m[0];};
 const run=one(/^RUN namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36}) app_image=\S+ mysql_image=\S+ mysql_version=8\.4\.\S+$/);
 const migration=one(/^PASS pinned-migration-runner binary_sha256=([a-f0-9]{64}) catalog_sha256=([a-f0-9]{64})$/);
 assert.equal(migration.m[1],r.migration_binary_sha256);assert.equal(migration.m[2],catalogHash);
 const replay=one(/^PASS fresh-migration-replay=001\.\.([0-9]+) applied=([0-9]+) exact_filenames=yes d_columns=blob\/blob\/blob\/char$/);
 assert.equal(replay.m[1],lastMigration);assert.equal(+replay.m[2],migrationCount);
 const start=one(new RegExp('^=== RUN   '+probe+'$'));
 const fixture=one(/^\s+\S+\.go:\d+: RESOURCES_FIXTURE mysql=8\.4\.\S+ migrations=(\d+) tables=44 clone=LIKE foreign_key_proof=no synthetic_registry=yes$/);
 assert.equal(+fixture.m[1],migrationCount);
 const fk=isFK?one(/^\s+\S+\.go:\d+: FK_SCHEMA canonical_and_owned=matched job_relations=2 cascade=yes checks=1$/):fixture;
 const runs=lines.flatMap(l=>l.startsWith('=== RUN   '+probe+'/')?[l.slice(('=== RUN   '+probe+'/').length)]:[]);
 const passed=lines.flatMap(l=>{const m=new RegExp('^\\s+--- PASS: '+probe+'/([^ ]+) \\([0-9.]+s\\)$').exec(l);return m?[m[1]]:[];});
 assert.deepEqual(runs.toSorted(),cases.toSorted());assert.deepEqual(passed.toSorted(),cases.toSorted());
 assert.ok(!lines.some(l=>/^=== RUN   Test/.test(l)&&l!=='=== RUN   '+probe&&!l.startsWith('=== RUN   '+probe+'/')),'mixed roots');
 const semantic=one(isFK?/^\s+\S+\.go:\d+: PASS a-resources-write-fk-mysql cases=10 declared_job_fks=2 checks=1 synthetic_proofs=yes production=no$/:/^\s+\S+\.go:\d+: PASS resources-write-mysql cases=9 tables=9 independent_select_only=yes synthetic_proofs=yes foreign_key_proof=no ddl_freeze_proof=no production=no$/);
 for(const c of cases){const i=lines.indexOf('=== RUN   '+probe+'/'+c);const end=lines.findIndex(l=>l.trimStart().startsWith('--- PASS: '+probe+'/'+c+' ('));assert.ok(i>fk.i&&end>i&&end<semantic.i);}
 const db=one(/^\s+\S+\.go:\d+: CLEANED resources-mysql-owned-database-and-user=yes$/);
 const done=one(new RegExp('^--- PASS: '+probe+' \\([0-9.]+s\\)$'));
 const pass=one(/^PASS$/);
 const phase=one(isFK?/^PASS a-resources-write-fk-mysql cases=10 binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64}) synthetic_proofs=yes full_restore=no production=no$/:/^PASS d-resources-write-mysql cases=9 binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64}) synthetic_proofs=yes full_restore=no production=no$/);
 assert.equal(phase.m[1],r.binary_sha256);assert.equal(phase.m[2],r.inputs_sha256);
 const ns=one(/^CLEANED namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})$/);
 assert.equal(ns.m[1],run.m[1]);assert.equal(ns.m[2],run.m[2]);
 const scratch=one(/^CLEANED resources-remote-scratch=yes$/);
 const owner=one(/^CLEANED resources-local-owner=(.+) removed=True$/);assert.equal(owner.m[1],r.owner);
 const ordered=[run,migration,replay,start,fixture,...(isFK?[fk]:[]),semantic,db,done,pass,phase,ns,scratch,owner];
 assert.ok(ordered.every((v,i)=>!i||v.i>ordered[i-1].i),'event order');
 return {namespace:run.m[1],namespace_uid:run.m[2],remote_cases:cases.length};
}
export const reviewFK=(file,transcript)=>reviewTransaction(file,transcript,'writer-fk');
export const reviewWriter=(file,transcript)=>reviewTransaction(file,transcript,'writer');
function reviewTransaction(receiptFile,transcriptFile,suite){
 const file=local(receiptFile),prefix=file.slice(0,-5),r=json(file);
 assert.match(path.basename(file),/^d-resources-mysql-\d{8}-\d{6}-[a-f0-9]{8}\.json$/);
 assert.equal(r.suite,suite);validateReceipt({...r,suite:'readback'});
 assert.equal(r.steps[1].command[5],'^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$');
 assert.equal(path.resolve(r.source),prefix+'-source.json');assert.equal(path.dirname(r.owner),root);
 assert.match(path.basename(r.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(r.owner),false);
 const source=json(local(r.source));validateManifest(source);
 const allFiles=[file,local(r.source)],unrelated=[];
 const critical=p=>p.startsWith('backend/internal/systembackupresources/')||p.startsWith('backend/internal/db/migrations/')||p.startsWith('backend/cmd/system-backup-migrate/')||['backend/go.mod','backend/go.sum','backend/internal/systembackupcontroller/bootstrap.go','scripts/system-backup-d-resources-mysql-validation.ps1','scripts/system-backup-d-resources-readback-phase.sh','scripts/system-backup-d-resources-mysql-inputs.mjs','scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-config-proof-source.ps1','scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-migration-phase.sh','scripts/system-backup-a-business-history-phase.sh'].includes(p);
 for(const p of source.files){const f=local(p.path),same=fs.existsSync(f)&&raw(f).length===p.size&&sha(raw(f))===p.sha256;if(critical(p.path))assert.ok(same,'critical input drift '+p.path);else if(!same)unrelated.push(p.path);}
 for(const dir of ['backend/internal/systembackupresources','backend/internal/db/migrations','backend/cmd/system-backup-migrate']){
  const disk=fs.readdirSync(local(dir),{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>path.relative(root,path.join(e.parentPath,e.name)).replaceAll('\\','/')).filter(p=>/\.(go|json|sql)$/.test(p)).sort();
  assert.deepEqual(disk,source.files.filter(p=>p.path.startsWith(dir+'/')&&/\.(go|json|sql)$/.test(p.path)).map(p=>p.path).sort());
 }
 const events=r.steps.map((s,i)=>{const f=local(s.log);assert.equal(f,prefix+'-step-'+i+'.jsonl');allFiles.push(f);const b=raw(f);assert.equal(sha(b),s.log_sha256);return i<2?validateGoEvents(b.toString('utf8')):null;});
 assert.deepEqual(events[1],['TestAResourcesWriteFKMySQLSeed','TestDResourcesReadbackMySQLSeed','TestDResourcesWriteMySQLSeed']);
 const prior=local('docs/evidence/a-writer-fk-20261023-134215-75d1f525-fixed.jsonl');allFiles.push(prior);
 assert.equal(sha(raw(prior)),'53900185217d620cc37a4839fcc524e685274d912f7172134298427c38585a83','original complete ordinary inventory bytes');
 const names=validateGoEvents(raw(prior).toString('utf8'),JSON.parse(raw(prior).toString('utf8').split(/\r?\n/)[0]).Package);
 assert.equal(names.length,843);assert.ok(names.every(n=>events[0].includes(n)),'old tests lost');
 const capsulePath=local('backend/internal/systembackupresources/testdata/restore-readback-mysql-inputs.json'),capsule=json(capsulePath);
 assert.equal(capsule.kind,'d_resources_mysql_synthetic_inputs.v1');assert.equal(capsule.production_approved,false);
 assert.equal(sha(raw(capsulePath)),r.inputs_sha256);
 for(const p of capsule.migrations)assert.equal(source.files.find(f=>f.path==='backend/internal/db/migrations/'+p.name)?.sha256,p.sha256);
 const catalog=/ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/.exec(raw(local('backend/internal/systembackupcontroller/bootstrap.go')).toString('utf8'))?.[1];assert.match(catalog,/^[a-f0-9]{64}$/);
 const transcript=local(transcriptFile??prefix+'.txt');allFiles.push(transcript);
 const validate=suite==='writer-fk'?validateFKTranscript:validateWriterTranscript;
 const remote=validate(raw(transcript).toString('utf8'),r,{migrationCount:capsule.migrations.length,lastMigration:capsule.migrations.at(-1).name.split('_')[0],catalogHash:catalog});
 return {kind:suite==='writer-fk'?'a_resources_writer_fk_actual_review.v1':'a_resources_writer_actual_review.v1',scope:suite==='writer-fk'?'two_declared_job_foreign_keys_only':'nine_storage_tables_transaction_only',...remote,local_pass_events:events[0].length,old_pass_events_preserved:names.length,source_sha256:source.source_sha256,unrelated_source_drift:unrelated,cleanup_recorded:true,local_owner_absent:true,remote_cleanup_independently_queried:false,generic_FK_UNIQUE_accepted:false,B_C_rules_accepted:false,physical_capacity_accepted:false,production_approved:false,dependencies_installed:false,artifacts:allFiles.map(f=>({path:path.relative(root,f).replaceAll('\\','/'),sha256:sha(raw(f))})),reviewer_sha256:sha(raw(fileURLToPath(import.meta.url)))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),file=args.shift();assert.ok(file,'explicit receipt required');let transcript,out;while(args.length){const k=args.shift(),v=args.shift();assert.ok(v);if(k==='--transcript'){assert.equal(transcript,undefined);transcript=v;}else{assert.equal(k,'--out');assert.equal(out,undefined);out=v;}}const result=reviewFK(file,transcript);if(out){const dest=local(out);assert.ok(dest.startsWith(path.join(root,'docs/evidence')+path.sep));fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}console.log(JSON.stringify(result,null,2));}
 catch(e){console.error('A_WRITER_FK_ACTUAL_REJECTED: '+e.message);process.exitCode=1;}
}
