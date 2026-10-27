// Independent acceptance of D's ordinary inventory and additive 081 repair.
// The original controller failure remains failed; no actual SQL is accepted.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,raw,json,decode,sha256,manifest,events,inventory,changed,exact} from './a-frozen-validation-utils-20261021.mjs';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';
const dPath='docs/evidence/d-prune-identity-preparation-20261021.json',d=json(dPath);
assert.equal(d.status,'local_repair_validated_actual_rerun_pending');assert.equal(d.old_070_preserved,true);assert.equal(d.one_check_predicate_repaired,true);
const first='docs/evidence/d-prune-identity-20261021-r1-full',final='docs/evidence/d-prune-identity-20261021-r1-controller';
const sourcePath='docs/evidence/d-prune-identity-published-context-20261021.json',source=manifest(sourcePath),firstSource=json(first+'-source.json'),finalSource=json(final+'-source.json');
for(const s of [firstSource,finalSource]){assert.equal(sha256(s.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),s.source_sha256);assert.equal(s.files.length,1475);}
const full=events(first+'.jsonl');assert.equal(full.some(e=>['skip','build-fail'].includes(e.Action)),false);
exact(full.filter(e=>e.Test&&e.Action==='fail').map(e=>e.Test),['TestQueueBudgetMetricsRenderCompleteClosedPrometheusSampleSet','TestSQLQueueBudgetReaderEmitsOnlyClosedLowCardinalitySamples']);
exact(full.filter(e=>!e.Test&&e.Action==='fail').map(e=>e.Package),['clawreef/internal/systembackupcontroller']);
assert.equal(full.filter(e=>e.Test&&e.Action==='run').length,6332);assert.equal(full.filter(e=>e.Test&&e.Action==='pass').length,6330);
const controller=inventory(final+'.jsonl',['clawreef/internal/systembackupcontroller']);assert.equal(controller.length,191);
exact(controller.map(e=>e.Test),full.filter(e=>e.Test&&e.Action==='run'&&e.Package==='clawreef/internal/systembackupcontroller').map(e=>e.Test));
exact(changed(finalSource,firstSource),['backend/internal/systembackupcontroller/metrics_http_test.go','backend/internal/systembackupcontroller/sql_queue_budget_test.go','backend/internal/systembackupevidence/download_admission_audit_mysql_test.go','scripts/system-backup-d-download-audit-bundle.mjs']);
for(const [prefix,expected] of [[first,1],[final,0],['docs/evidence/d-prune-identity-20261021-r2-probe',0]]){
  const n=json(prefix+'-native.json'),s=json(prefix+'-source.json'),r=d.runs.find(r=>r.prefix===prefix);
  assert.equal(n.exit,expected);assert.equal(n.default_vet,true);assert.equal(n.source_postcheck,true);assert.equal(n.dependencies_installed,false);assert.equal(n.remote,false);assert.equal(n.source_sha256,s.source_sha256);
  for(const [suffix,key] of [['-source.json','source_manifest_sha256'],['.jsonl','events_sha256'],['-native.json','native_sha256']])assert.equal(sha256(raw(prefix+suffix)),r[key]);
  assert.equal(raw(prefix+'-stderr.txt').length,0);
}
exact(changed(source,finalSource),['backend/internal/systembackupevidence/download_gc_role_a_mysql_test.go','backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go']);
const aRolePath='docs/evidence/a-download-gc-role-drift-fixture-accepted-20261021.json',aRole=json(aRolePath),aSource=manifest(aRole.source);
for(const p of changed(source,finalSource)){assert.deepEqual(source.files.find(f=>f.path===p),aSource.files.find(f=>f.path===p));}
// Publication's seventeen repair inputs and both A tagged inputs match current.
for(const p of source.files.filter(f=>/^(backend|contracts)\//.test(f.path)||d.changes.includes(f.path))){const b=raw(p.path);assert.equal(b.length,p.size,p.path);assert.equal(sha256(b),p.sha256,p.path);}
const packages=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence'];
const selected=full.filter(e=>packages.includes(e.Package));assert.equal(selected.some(e=>['fail','skip','build-fail'].includes(e.Action)),false);
for(const p of packages){exact(selected.filter(e=>e.Package===p&&e.Test&&e.Action==='run').map(e=>e.Test),selected.filter(e=>e.Package===p&&e.Test&&e.Action==='pass').map(e=>e.Test));assert.equal(selected.filter(e=>e.Package===p&&!e.Test&&e.Action==='pass').length,1);}
const passed=selected.filter(e=>e.Test&&e.Action==='pass');assert.equal(passed.length,5019);assert.equal(passed.filter(e=>!e.Test.includes('/')).length,620);
const old=inventory('docs/evidence/a-check-evidence-binding-20261021-r2.jsonl',['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupread','clawreef/internal/systembackupproducer','clawreef/internal/systembackupgcmetadata']).filter(e=>packages.includes(e.Package));
exact(passed.map(e=>e.Package+'\0'+e.Test),old.map(e=>e.Package+'\0'+e.Test));
const migration='backend/internal/db/migrations/081_fix_system_backup_prune_item_identity.sql',ddl=decode(raw(migration));
assert.ok(ddl.includes('DROP CHECK chk_sb_prune_item_identity'));assert.ok(ddl.includes("artifact_public_id REGEXP '^sbk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'"));assert.doesNotMatch(ddl,/DROP FOREIGN KEY|FOREIGN_KEY_CHECKS/);
const old070='backend/internal/db/migrations/070_add_system_backup_prune_authority.sql';assert.equal(sha256(raw(old070)),aSource.files.find(f=>f.path===old070).sha256);
const catalog=computeMigrationCatalog();assert.deepEqual(catalog,d.catalog);assert.equal(catalog.file_count,96);
const cleanup=json(d.cleanup.receipt);assert.equal(sha256(raw(d.cleanup.receipt)),d.cleanup.sha256);assert.equal(cleanup.removed,true);assert.equal(cleanup.process_terminal,true);assert.equal(cleanup.source_postcheck,true);assert.equal(fs.existsSync(cleanup.absolute_owner),false);
const probe='docs/evidence/d-prune-identity-20261021-r2-probe',probePass=inventory(probe+'.jsonl',['clawreef/internal/systembackupevidence']);assert.equal(probePass.length,29);
const detached=decode(raw(probe+'-detached.txt'));exact([...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m=>m[1]),probePass.map(e=>e.Test));exact([...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]),probePass.map(e=>e.Test));assert.match(detached,/\nPASS\s*$/);
for(const suffix of ['-windows.stderr','-detached.stderr','-linux.stderr','-migration.stderr','-audit-inputs.stderr'])assert.equal(raw(probe+suffix).length,0);
const tap=decode(raw('docs/evidence/d-prune-identity-20261021-r3-node.tap'));assert.match(tap,/^# tests 94\r?$/m);assert.match(tap,/^# pass 94\r?$/m);assert.match(tap,/^# fail 0\r?$/m);
const eventPath='docs/evidence/a-prune-identity-owner-baseline-20261021.jsonl';
// Derive exact original lines, never synthesize or change a test outcome.
const projected=decode(raw(first+'.jsonl')).trim().split('\n').filter(line=>packages.includes(JSON.parse(line).Package)).join('\n')+'\n';
const record={kind:'a_prune_identity_ordinary_baseline_independent_acceptance',status:'accepted_frozen_96_catalog_ordinary_inventory_only',source:sourcePath,source_manifest_sha256:sha256(raw(sourcePath)),source_sha256:source.source_sha256,source_files:1475,events:eventPath,events_sha256:sha256(projected),original_events:first+'.jsonl',original_events_sha256:sha256(raw(first+'.jsonl')),original_full_exit:1,original_controller_failures_retained:2,controller_retest:{prefix:final,main:143,all:191,exit:0},complete_six_package_coverage:{main:919,all:6332,kind:'five_passed_packages_and_complete_controller_retest'},owner_baseline:{main:620,all:5019},old_owner_checks_retained:5019,catalog,old_070_preserved:true,additive_081:true,d_receipt:dPath,d_receipt_sha256:sha256(raw(dPath)),a_tagged_preparation:aRolePath,a_tagged_preparation_sha256:sha256(raw(aRolePath)),a_new_tagged_roots_not_executed_by_D:true,actual_sql_cases_executed:0,actual_96_file_migration_proved:false,actual_GC_task_eighteen_accepted:false,production_approved:false,dependencies_installed:false,cleanup:d.cleanup.receipt,cleanup_sha256:d.cleanup.sha256,owned_directory_independently_absent:true,current_whole_worktree_verified:false,reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output='docs/evidence/a-prune-identity-baseline-accepted-20261021.json';
if(process.argv[2]==='--check'){assert.equal(decode(raw(eventPath)),projected);assert.deepEqual(json(output),record);}
else{assert.deepEqual(process.argv.slice(2),['--write']);for(const p of [eventPath,output])assert.equal(fs.existsSync(path.join(workspace,p)),false);fs.writeFileSync(path.join(workspace,eventPath),projected,{flag:'wx'});fs.writeFileSync(path.join(workspace,output),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,owner_checks:5019,controller_retest:191,catalog_files:96,actual_sql:false,cleanup_absent:true}));
