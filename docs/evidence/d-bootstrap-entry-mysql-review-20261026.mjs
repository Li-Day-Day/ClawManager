import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateManifest, validateGoEvents } from './d-resources-mysql-actual-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..'),probe='TestDBootstrapEntryMySQL';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const local=name=>{const p=path.resolve(root,name);assert.ok(p.startsWith(root+path.sep),'outside workspace');return p;};
const raw=name=>fs.readFileSync(local(name));
const text=name=>raw(name).toString('utf8').replace(/^\uFEFF/,'');
const json=name=>JSON.parse(text(name));
export const cases=Object.freeze(['schema_absent_first','schema_partial_first','schema_full_no_domain_first','schema_full_unconfigured_first','hidden_c1_a_only','history_schema_absent','history_full_no_domain','history_configured_open','history_configured_closed','history_configured_revoked','history_wrong_hash','history_wrong_version','history_unconfigured_open','history_unconfigured_closed','history_unconfigured_revoked','history_admin_revoked','history_authority_revoked','late_domain_mutation','scope_gap_lock','wrong_context','wrong_transaction','commit_lost']);
const allowedHistory=name=>['history_schema_absent','history_full_no_domain'].includes(name)||name.startsWith('history_configured_');
const domainCases=name=>name.startsWith('history_configured_')||name.startsWith('history_unconfigured_')||['schema_full_unconfigured_first','history_wrong_hash','history_wrong_version','late_domain_mutation'].includes(name);
const configured=name=>name.startsWith('history_configured_')||['history_wrong_hash','history_wrong_version','late_domain_mutation'].includes(name);
const variants=name=>domainCases(name)&&(/_(closed|revoked)$/.test(name)||['history_wrong_hash','history_wrong_version'].includes(name));
const catalog='0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe';

export function validateEntryTranscript(input,receipt){
 const lines=input.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').split('\n');
 assert.ok(!lines.some(s=>/CLEANUP_PENDING|CLEANUP_SKIPPED|--- FAIL:|--- SKIP:|^FAIL(?:\s|$)|panic:|fatal error:/.test(s)),'failure, skip or unclean run');
 const one=re=>{const found=lines.flatMap((s,i)=>{const m=re.exec(s);return m?[{m,i}]:[];});assert.equal(found.length,1,'missing/duplicate '+re);return found[0];};
 const run=one(/^RUN namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36}) app_image=(\S+@sha256:[a-f0-9]{64}) mysql_image=(\S+@sha256:[a-f0-9]{64}) mysql_version=(8\.4\.\d+)$/);
 const migration=one(/^\{"config_activated":.*\}$/);
 assert.deepEqual(JSON.parse(migration.m[0]),{config_activated:false,historical_equivalence_verified:false,history_review_sha256:'',human_mfa_verified:false,migration_catalog_sha256:catalog,migration_count:96,result:'PASS'});
 const migrate=one(/^PASS pinned-migration-runner binary_sha256=([a-f0-9]{64}) catalog_sha256=([a-f0-9]{64})$/);assert.equal(migrate.m[1],receipt.migration_binary_sha256);assert.equal(migrate.m[2],catalog);
 const replay=one(/^PASS fresh-migration-replay=001\.\.096 applied=96 exact_filenames=yes d_columns=blob\/blob\/blob\/char$/);
 const start=one(new RegExp('^=== RUN   '+probe+'$'));
 assert.deepEqual(lines.filter(s=>s.startsWith('=== RUN   '+probe+'/')).map(s=>s.slice(('=== RUN   '+probe+'/').length)).toSorted(),cases.toSorted());
 assert.deepEqual(lines.flatMap(s=>{const m=new RegExp('^\\s+--- PASS: '+probe+'/([^ ]+) \\([0-9.]+s\\)$').exec(s);return m?[m[1]]:[];}).toSorted(),cases.toSorted());
 assert.ok(!lines.some(s=>/^=== RUN   Test/.test(s)&&s!=='=== RUN   '+probe&&!s.startsWith('=== RUN   '+probe+'/')),'mixed roots');
 for(const name of cases){
  const begin=lines.indexOf('=== RUN   '+probe+'/'+name),end=lines.findIndex(s=>s.trimStart().startsWith('--- PASS: '+probe+'/'+name+' ('));
  assert.ok(begin>start.i&&end>begin,'case order');const scoped=lines.slice(begin,end);
  const exact=re=>{assert.equal(scoped.filter(s=>re.test(s)).length,1,'missing/duplicate scoped '+name+' '+re);};
  const c1=['schema_absent_first','history_schema_absent','commit_lost'].includes(name)?0:name==='schema_partial_first'?1:8;
  const history=name.startsWith('history_')||name==='late_domain_mutation';
  exact(new RegExp(': ENTRY_FIXTURE migrations=96 canonical_A=8 c1='+c1+' foreign_key_checks=1 history_pre_C1='+history+' authority=synthetic$'));
  exact(/: CLEANED evidence run-owned database$/);
  let result='denied A_D_rows=unchanged';
  if(allowedHistory(name))result='history capacity_callbacks=0 A_D_rows=unchanged';
  if(name==='schema_absent_first')result='created capacity_callbacks=1 disabled_v1=yes';
  if(name==='commit_lost')result='commit_unknown_then_history capacity_callbacks=1 A_D_rows=unchanged_on_retry';
  if(name==='scope_gap_lock')result='gap_observed_then_released A_rows=unchanged direct_domain_rows=1';
  exact(new RegExp(': ENTRY_RESULT case='+name+' result='+result+'$'));
  if(domainCases(name))exact(new RegExp(': ENTRY_DOMAIN provision=real_DomainOpener configured='+configured(name)+' management_authority=synthetic$'));
  if(variants(name))exact(/: ENTRY_DOMAIN_VARIANT canonical_codec=yes controlled_fixture_only=yes$/);
  if(name==='hidden_c1_a_only'){
   exact(/: ENTRY_VISIBILITY real_tables=8 metadata_visible=0 direct_error=1142 identity=A_tables_only A_prefix_access=verified helper_denied=yes$/);
   exact(/: CLEANED entry run-owned mysql account$/);
  }
  if(name==='late_domain_mutation')exact(/: ENTRY_LATE_DOMAIN mutation_rows=1 original_tx=yes stage=final_authorize$/);
  if(name==='scope_gap_lock')exact(/: ENTRY_GAP index=PRIMARY insertion_intention=yes actual_wait_graph=yes direct_installation_lock=no$/);
 }
 const counts=[[/ENTRY_FIXTURE /,22],[/ENTRY_RESULT /,22],[/: CLEANED evidence run-owned database$/,22],[/ENTRY_DOMAIN provision=/,cases.filter(domainCases).length],[/ENTRY_DOMAIN_VARIANT /,cases.filter(variants).length],[/ENTRY_VISIBILITY /,1],[/ENTRY_LATE_DOMAIN /,1],[/ENTRY_GAP /,1],[/: CLEANED entry run-owned mysql account$/,1]];
 for(const [re,count] of counts)assert.equal(lines.filter(s=>re.test(s)).length,count,'unscoped or extra '+re);
 const done=one(new RegExp('^--- PASS: '+probe+' \\([0-9.]+s\\)$')),pass=one(/^PASS$/);
 const phase=one(/^PASS d-bootstrap-entry-mysql cases=22 binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64}) visibility=typed1142 domain_gap=actual_wait authority=synthetic physical_capacity=no production=no$/);
 assert.equal(phase.m[1],receipt.binary_sha256);assert.equal(phase.m[2],receipt.inputs_sha256);
 const clean=one(/^CLEANED namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})$/);assert.equal(clean.m[1],run.m[1]);assert.equal(clean.m[2],run.m[2]);
 const scratch=one(/^CLEANED bootstrapConsumer-remote-scratch=yes$/),owner=one(/^CLEANED bootstrapConsumer-local-owner=(.+) removed=True$/);assert.equal(owner.m[1],receipt.owner);
 const exit=one(/^bootstrap_entry_exit=0$/),sequence=[run,migration,migrate,replay,start,done,pass,phase,clean,scratch,owner,exit];assert.ok(sequence.every((v,i)=>!i||v.i>sequence[i-1].i),'phase/cleanup order');
 return {namespace:run.m[1],namespace_uid:run.m[2],app_image:run.m[3],mysql_image:run.m[4],mysql_version:run.m[5],actual_mysql_cases:22};
}

export function reviewEntry(receiptFile,transcript){
 const r=json(receiptFile),source=json(r.source);validateManifest(source);
 assert.equal(r.kind,'d_bootstrap_entry_mysql_preparation.v1');assert.equal(r.suite,'bootstrap-entry');assert.equal(r.error,null);
 for(const k of ['owner_removed','source_postcheck','remote_requested','remote_scratch_removed','synthetic_proofs'])assert.equal(r[k],true,k);
 for(const k of ['dependencies_installed','actual_mysql_results_accepted','production_approved'])assert.equal(r[k],false,k);
 assert.match(r.owner,/[\\/]\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(local(r.owner)),false);
 for(const k of ['binary_sha256','migration_binary_sha256','inputs_sha256'])assert.match(r[k],/^[a-f0-9]{64}$/);
 const commands=[['go','test','-tags','systembackup_mysql','-run','^TestDBootstrap(ConsumerMySQLSeed|ConsumerRangesMySQLSeed|EntryMySQLSeed|OriginalMaterialsMySQLSeed)$','-count=1','-timeout=180s','-json','./internal/systembackupevidence'],['go','test','-c','-tags','systembackup_mysql','-o',path.join(r.owner,'bundle/d-bootstrap-entry.test'),'./internal/systembackupevidence'],['go','build','-o',path.join(r.owner,'bundle/system-backup-migrate'),'./cmd/system-backup-migrate']];
 assert.equal(r.steps.length,3);for(const [i,s] of r.steps.entries()){assert.equal(s.exit_code,0);assert.equal(s.platform,i===0?'windows':'linux');assert.deepEqual(s.command,commands[i]);assert.equal(sha(raw(s.log)),s.log_sha256);}
 assert.deepEqual(validateGoEvents(text(r.steps[0].log),'clawreef/internal/systembackupevidence'),['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapEntryMySQLSeed','TestDBootstrapOriginalMaterialsMySQLSeed']);
 const selected=name=>name.startsWith('backend/internal/systembackupproducer/')||name.startsWith('backend/internal/systembackupsecurity/')||name.startsWith('backend/internal/systembackupevidence/')||name.startsWith('backend/internal/systembackupnoncebootstrap/')||name.startsWith('backend/internal/systembackupcatrust/')||name.startsWith('backend/internal/systembackupbootstrapsecurity/')||name.startsWith('backend/internal/db/migrations/')||name.startsWith('contracts/')||/^scripts\/system-backup-(?:d-bootstrap|fresh-migration|smoke-contract|d-invariants|d-migration|d-index-source|a-config-proof-source)/.test(name)||['backend/go.mod','backend/go.sum','backend/internal/systembackupcontroller/bootstrap.go'].includes(name);
 const critical=source.files.filter(p=>selected(p.path));assert.ok(critical.length>100);
 const current=[];const walk=dir=>{for(const e of fs.readdirSync(local(dir),{withFileTypes:true})){if(/^(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)$/.test(e.name))continue;const name=dir+'/'+e.name;assert.equal(e.isSymbolicLink(),false);if(e.isDirectory())walk(name);else if(/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(name)&&selected(name))current.push(name);}};
 for(const dir of ['backend','contracts','scripts'])walk(dir);assert.deepEqual(current.toSorted(),critical.map(p=>p.path).toSorted());
 for(const p of critical){assert.equal(raw(p.path).length,p.size,p.path);assert.equal(sha(raw(p.path)),p.sha256,p.path);}
 assert.equal(source.files.find(p=>p.path==='backend/internal/systembackupevidence/testdata/bootstrap-consumer-mysql-inputs.json')?.sha256,r.inputs_sha256);
 return {kind:'d_bootstrap_entry_mysql_actual_review.v1',result:'PASS',...validateEntryTranscript(text(transcript),r),source_sha256:source.source_sha256,source_files:source.files.length,current_critical_inputs_match:true,terminal_exit:0,source_postcheck:true,test_build_products_removed:true,synthetic_authority:true,physical_capacity_verified:false,provider_permission_verified:false,production_approved:false,new_remote_run_executed_by_receiver:false,original_wrapper_rewritten:false,artifacts:[receiptFile,r.source,transcript,...r.steps.map(s=>s.log)].map(name=>({path:path.relative(root,local(name)).replaceAll('\\','/'),sha256:sha(raw(name))}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [receipt,transcript,output,mode,...extra]=process.argv.slice(2);assert.ok(receipt&&transcript&&output&&!extra.length&&(mode===undefined||mode==='--check'));
 assert.equal(path.dirname(local(output)),path.join(root,'docs/evidence'));const result=reviewEntry(receipt,transcript);
 if(mode==='--check')assert.deepEqual(json(output),result);else fs.writeFileSync(local(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log('BOOTSTRAP_ENTRY_MYSQL_ACTUAL_ACCEPTED cases=22 source='+result.source_sha256+' cleanup=yes production=no');
}
