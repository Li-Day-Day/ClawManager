// A's independent review of one fixed operator run. No remote/test/build calls.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';
const root=path.resolve(import.meta.dirname,'../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(path.join(root,p));
const decode=b=>new TextDecoder(b[0]===255&&b[1]===254?'utf-16le':'utf-8',{fatal:true}).decode(b).replace(/^\uFEFF/,'');
const json=p=>JSON.parse(decode(raw(p))),pin=p=>({path:p,sha256:sha(raw(p)),bytes:raw(p).length});
const exact=(a,b)=>{assert.equal(new Set(a).size,a.length);assert.equal(new Set(b).size,b.length);assert.deepEqual([...a].sort(),[...b].sort());};
const prefix='docs/evidence/d-download-gc-freeze-remote-20261022-084739-1604f031';
const logPath=prefix+'.txt',sourcePath=prefix+'-source.json';
assert.equal(pin(logPath).sha256,'76071f8c77782f8eecbba2745061fc639ff0c563295dafc2bc6b57a2a8b70309');
assert.equal(pin(sourcePath).sha256,'257cece1802b1275041e96a49fd463977577d37d3b0cb82d2b8fadc4de729135');
assert.ok(raw(logPath).length<8*1024*1024);assert.equal(raw(logPath)[0],255);assert.equal(raw(logPath)[1],254);
const originalText=decode(raw(logPath)),text=originalText.replace(/\x1b\[[0-9;]*m/g,'');
const source=json(sourcePath);assert.equal(source.files.length,1519);assert.equal(source.stable_copy_verified,true);
for(const k of ['dependencies_installed','production_approved'])assert.equal(source[k],false);
exact(source.files.map(f=>f.path),source.files.map(f=>f.path));
for(const f of source.files){assert.ok(/^(backend|contracts|scripts|docs)\//.test(f.path));assert.ok(!f.path.includes('\\')&&!f.path.split('/').some(v=>['','.','..'].includes(v)));assert.match(f.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(f.size)&&f.size>=0);}
assert.equal(sha(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),source.source_sha256);
assert.equal(source.source_sha256,'b2557fd28e16cbb419be616164d33123cfc473dfdc0c317d098311c0f85f8b8d');
const files=new Map(source.files.map(f=>[f.path,f]));
const preparationPath='docs/evidence/d-gc-freeze-probe-preparation-20261021.json',prep=json(preparationPath);
assert.equal(pin(preparationPath).sha256,'6361d6f257b45e7d189ec6fcf8ee10a4a4aa2be2946b45e6284ea6bbba3f3210');
const relevant=prep.changed_files.map(f=>({path:f.path,sha256:f.after_sha256}));assert.equal(relevant.length,6);
for(const f of relevant){assert.equal(files.get(f.path)?.sha256,f.sha256);assert.equal(sha(raw(f.path)),f.sha256);}
const probePath='backend/internal/systembackupevidence/download_gc_freeze_mysql_test.go',probe=decode(raw(probePath));
const ddl=['table_create','table_alter','table_drop','table_rename','incoming_foreign_key','procedure_create','procedure_alter','procedure_drop','function_create','function_alter','function_drop','trigger_create','trigger_drop','event_create','event_alter','event_drop','view_create','view_alter','view_algorithm','view_drop','account_create','account_alter','account_drop','account_grant','account_revoke'];
const controls=['privilege_deny','transaction_commit','transaction_rollback','unlock_no_commit','legal_dml','multiple_holders','killed_holder','pool_reuse','temporary_shadow_and_fresh_session'];
const ddlBody=probe.match(/var dGCFreezeDDLs = \[\]dGCFreezeDDL\{([\s\S]*?)\n\}/)?.[1];assert.ok(ddlBody);
assert.deepEqual([...ddlBody.matchAll(/^\s*\{"([a-z_]+)"/gm)].map(m=>m[1]),ddl);
const controlBody=probe.match(/var dGCFreezeControls = \[\]string\{([\s\S]*?)\n\}/)?.[1];assert.ok(controlBody);
assert.deepEqual([...controlBody.matchAll(/"([a-z_]+)"/g)].map(m=>m[1]),controls);
const rootTest='TestDDownloadGCFreezeMySQL',expected=[...ddl,...controls];
const startMatches=[...text.matchAll(/^=== RUN\s+TestDDownloadGCFreezeMySQL\r?$/gm)];assert.equal(startMatches.length,1);
const start=startMatches[0].index,finish=text.indexOf('PASS d-download-gc-freeze-mysql ',start);assert.ok(finish>start);
const remote=text.slice(start,finish),beforeRemote=text.slice(0,start);
assert.doesNotMatch(text,/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^fatal error:|CLEANUP_PENDING|command terminated with exit code [1-9]|Evidence .*gate failed/m);
const runs=[...remote.matchAll(/^=== RUN\s+TestDDownloadGCFreezeMySQL\/(\S+)\r?$/gm)];
assert.deepEqual(runs.map(m=>m[1]),expected);assert.equal(runs.length,34);
const passed=[...remote.matchAll(/^\s+--- PASS: TestDDownloadGCFreezeMySQL\/(\S+) \([0-9.]+s\)\r?$/gm)].map(m=>m[1]);
assert.deepEqual(passed,expected);exact(passed,expected);
const parents=[...remote.matchAll(/^--- PASS: TestDDownloadGCFreezeMySQL \(([0-9.]+)s\)\r?$/gm)];assert.equal(parents.length,1);
assert.equal(Number(parents[0][1]),0.60);assert.equal([...remote.matchAll(/^PASS\r?$/gm)].length,1);
assert.equal([...remote.matchAll(/FREEZE_FIXTURE mysql=8\.4\.8 formal_migrations=96 synthetic_accounts=yes production_approval=no/g)].length,1);
const witnessRegex=/FREEZE_WAIT holder_connection=(\d+) waiter_connection=(\d+) holder_thread=(\d+) waiter_thread=(\d+) holder=SHARED\/EXPLICIT\/GRANTED waiter=INTENTION_EXCLUSIVE\/PENDING case=(\w+)/g;
const witnesses=[...remote.matchAll(witnessRegex)].map(m=>({case:m[5],holder_connection:Number(m[1]),waiter_connection:Number(m[2]),holder_thread:Number(m[3]),waiter_thread:Number(m[4]),position:m.index}));
assert.deepEqual(witnesses.map(w=>w.case),ddl);assert.equal((text.match(/FREEZE_WAIT/g)??[]).length,25);
const connectionThreads=new Map();
for(const w of witnesses){
  for(const k of ['holder_connection','waiter_connection','holder_thread','waiter_thread'])assert.ok(Number.isSafeInteger(w[k])&&w[k]>0);
  assert.notEqual(w.holder_connection,w.waiter_connection);assert.notEqual(w.holder_thread,w.waiter_thread);
  for(const [connection,thread]of [[w.holder_connection,w.holder_thread],[w.waiter_connection,w.waiter_thread]]){if(connectionThreads.has(connection))assert.equal(connectionThreads.get(connection),thread);connectionThreads.set(connection,thread);}
  const i=expected.indexOf(w.case);assert.ok(w.position>runs[i].index&&w.position<runs[i+1].index,'witness must belong to its actual case body');
}
const expectedWitnesses=witnesses.map(({position,...w})=>w);
assert.ok(probe.includes("WHERE OWNER_THREAD_ID=? AND OBJECT_TYPE='BACKUP LOCK'"));
assert.ok(probe.includes('SELECT THREAD_ID FROM performance_schema.threads WHERE PROCESSLIST_ID=?'));
assert.ok(probe.includes('f.command(t, c, "UNLOCK INSTANCE")\n\tf.released(t, id)'));
assert.ok(probe.includes('released DDL did not produce expected metadata'));
const binary='6fe2bdf93660958dbea2506844ea2859bfbda5575928995a0873befc06d35852',inputs='d9c5e055812f2467ed0377337e864ee94e082c13b0cc53d7f4b150c9b8e329c0';
const migrationBinary='384cf45e1fc0b5a3137d3460a2a952ca954c50903d75c41b462f1b52650fa429';
const capsulePath='backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json';assert.equal(sha(raw(capsulePath)),inputs);assert.equal(files.get(capsulePath)?.sha256,inputs);
const phasePath='scripts/system-backup-d-download-gc-freeze-phase.sh',phase=decode(raw(phasePath));
for(const token of ['"${actual%% *}" = "$3"','D_INVARIANT_NAMESPACE_UID="$2"','-test.run "^TestDDownloadGCFreezeMySQL$"','-test.count=1','-test.timeout=900s'])assert.ok(phase.includes(token));
const finalPass=`PASS d-download-gc-freeze-mysql binary_sha256=${binary} inputs_sha256=${inputs} new_cases=34 component=backup-lock-prerequisites freeze_adapter=not_wired scope=synthetic full_gc=not_run role_approval=no human_mfa=no provider_read=no production_approval=no`;
assert.equal(text.split(finalPass).length,2);
assert.ok(text.includes(`LOCAL_PASS d-download-gc-freeze-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${binary} ddl_sha256=${inputs}`));
assert.ok(text.includes(`LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=${migrationBinary}`));
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,96);assert.equal(catalog.hash,'0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe');
const migrationFiles=source.files.filter(f=>/^backend\/internal\/db\/migrations\/[^/]+\.sql$/.test(f.path));assert.equal(migrationFiles.length,96);
for(const f of migrationFiles){assert.equal(raw(f.path).length,f.size);assert.equal(sha(raw(f.path)),f.sha256);}
const catalogHelper='scripts/system-backup-contract-check.mjs';assert.equal(sha(raw(catalogHelper)),files.get(catalogHelper)?.sha256);
assert.ok(text.includes(`PASS pinned-migration-runner binary_sha256=${migrationBinary} catalog_sha256=${catalog.hash}`));
assert.equal([...text.matchAll(/^PASS fresh-migration-replay=001\.\.081 applied=96 exact_filenames=yes(?: .*)?\r?$/gm)].length,1);
const captureFailure='Source file set changed while snapshot was copied: scripts/system-backup-a-field-inventory.test.ps1';
assert.equal(source.capture_attempts,2);assert.deepEqual(source.capture_failures,[captureFailure]);
const snapshots=[...text.matchAll(/^LOCAL_SNAPSHOT config-proof-attempt=(\d+) max=3 build-started=no remote-started=no\r?$/gm)];assert.deepEqual(snapshots.map(m=>m[1]),['1','2']);
const frozen=`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=1519`,frozenAt=text.indexOf(frozen);
assert.ok(frozenAt>snapshots[1].index&&text.indexOf(captureFailure)>snapshots[0].index&&text.indexOf(captureFailure)<snapshots[1].index);
assert.ok(text.includes('discarded this partial copy before retry 2/3. No build or remote action has started.'));
assert.ok(frozenAt<text.search(/^=== RUN/m));
const passes=s=>[...s.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]);
const localGroups=[];let previous=0;
for(const m of beforeRemote.matchAll(/^ok\s+(clawreef\/internal\/\w+)\s+([^\r\n]+)/gm)){
  const part=beforeRemote.slice(previous,m.index),pass=passes(part),ran=[...part.matchAll(/^=== RUN\s+(\S+)\r?$/gm)].map(m=>m[1]);exact(pass,ran);
  localGroups.push({package:m[1],elapsed:m[2],checks:pass.length,roots:pass.filter(v=>!v.includes('/')),inventory_sha256:sha([...pass].sort().join('\n')+'\n')});previous=m.index+m[0].length;
}
assert.equal(localGroups.length,3);
for(const [i,k]of ['security','evidence'].entries()){
  const e=prep.full[k],g=localGroups[i];assert.equal(g.package,e.package);assert.equal(g.checks,e.tests);exact(g.roots,e.roots);
}
assert.equal(localGroups[0].checks+localGroups[1].checks,5019);assert.equal(localGroups[0].roots.length+localGroups[1].roots.length,620);
const seed=localGroups[2];assert.equal(seed.checks,12);exact(seed.roots,prep.tagged_seed.roots);
const standalone=passes(beforeRemote.slice(previous));assert.equal(standalone.length,12);exact(standalone.filter(v=>!v.includes('/')),seed.roots);
assert.equal(sha([...standalone].sort().join('\n')+'\n'),seed.inventory_sha256);
assert.ok(text.includes('LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent writer-candidate=True real_mysql=not_run'));
const runMarkers=[...text.matchAll(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)\r?$/gm)];assert.equal(runMarkers.length,1);
const run=runMarkers[0];assert.equal(run[1],'sbk-mig-261022013337-65ef');assert.equal(run[2],'081b70f6-ce4a-42e8-a672-49847e31324e');assert.equal(run[5],'8.4.8');
assert.equal(run[3],'10.130.14.23:5000/clawmanager@sha256:be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea');
assert.equal(run[4],'10.130.14.23:5000/mysql@sha256:5ea882b1859d3a61814e527215563d809a9f2bf70ffa24c9280f2ff6798f1977');
assert.ok(run.index<start);
const namespaceClean=`CLEANED namespace=${run[1]} uid=${run[2]}`;assert.equal(text.split(namespaceClean).length,2);assert.ok(text.indexOf(namespaceClean)>finish);
for(const marker of ['CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True'])assert.equal(text.split(marker).length,2);
const ownerMatches=[...text.matchAll(/^LOCAL_OWNER config-writer-source=(.+)\r?$/gm)];assert.equal(ownerMatches.length,1);
const owner=path.resolve(ownerMatches[0][1].trim());assert.equal(path.dirname(owner).toLowerCase(),root.toLowerCase());assert.equal(path.basename(owner),'.tmp-d-index-cache-08a0e70a4b674d02818199ad97cbbf39');
assert.ok(text.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.equal(fs.existsSync(owner),false);
assert.deepEqual([...text.matchAll(/^download_gc_freeze_exit=(-?\d+)\r?$/gm)].map(m=>m[1]),['0']);assert.match(text.trimEnd(),/download_gc_freeze_exit=0$/);
const dReceiptPath='docs/evidence/d-download-gc-freeze-actual-accepted-20261022.json',d=json(dReceiptPath);
assert.equal(pin(dReceiptPath).sha256,'a2c00f823dd86085c03fab2d8ab9160e6211d4a9874a2c2a11ecf4945139ed46');
assert.equal(d.log_sha256,pin(logPath).sha256);assert.equal(d.source_sha256,source.source_sha256);assert.deepEqual(d.actual.case_names,expected);assert.deepEqual(d.actual.ddl_wait_witnesses,expectedWitnesses);
assert.equal(d.actual.passed,34);assert.equal(d.actual.outer_exit,0);
for(const k of ['freeze_adapter_wired','full_gc','role_approval','human_mfa','provider_read','production_approval','reviewer_remote_run','current_whole_tree_tested','twelve_protocol_groups_complete'])assert.equal(d.boundaries[k],false);
const protocolPath='docs/evidence/d-gc-backup-lock-protocol-requirements-20261021.json';
const record={kind:'a_download_gc_freeze_actual_independent_review',status:'accepted_34_synthetic_backup_lock_prerequisites_only',
  provenance:'operator-executed raw transcript and frozen source manifest; independently reviewed locally without reconnecting to the remote server',
  log:pin(logPath),log_encoding:'UTF-16LE with BOM; fatal decoding; ANSI removed only for parsing; original bytes preserved',source_manifest:pin(sourcePath),source_sha256:source.source_sha256,source_files:1519,
  preparation:pin(preparationPath),six_prepared_and_current_files_match:relevant,catalog_helper:pin(catalogHelper),
  observed_local_gates:{core_packages:localGroups.slice(0,2).map(({roots,...g})=>({...g,root_count:roots.length,root_names_match_preparation:true})),core_roots:620,core_checks:5019,tagged_seed_checks:12,standalone_seed_checks:12,seed_inventories_identical:true,default_vet_and_frozen_postcheck_reported:true},
  original_capture_retry:{attempts:2,failures:source.capture_failures,partial_copy_discarded_before_build_or_remote:true,ordinary_test_failures_observed:0},
  actual:{root:rootTest,mysql_version:'8.4.8',passed:34,case_names:expected,ddl_wait_witnesses:expectedWitnesses,witnesses_bound_to_case_bodies:true,connection_thread_mapping_consistent:true,elapsed_seconds_observed:Number(parents[0][1]),binary_sha256:binary,inputs_sha256:inputs,migration_binary_sha256:migrationBinary},
  migrations:{fresh_replay:'001..081',files:96,catalog_sha256:catalog.hash,all_original_sql_bytes_match_frozen_manifest:true,historical_upgrade_equivalence_proved:false},
  cleanup:{namespace:run[1],namespace_uid:run[2],namespace_cleanup_reported:true,remote_scratch_cleanup_reported:true,local_cache_cleanup_reported:true,local_owner:owner,local_owner_independently_absent:true,remote_cleanup_independently_checked:false},
  original_socket_close_messages_preserved:(text.match(/close - IO is still pending on closed socket\./g)??[]).length,
  d_receipt:pin(dReceiptPath),remaining_protocol_requirements:pin(protocolPath),
  reviewer_executed_remote_or_sql:false,tests_or_builds_rerun_by_A:false,dependencies_installed_by_A:false,test_or_build_artifacts_created_by_A:false,
  production_role_approved:false,production_freeze_adapter_wired:false,full_gc_accepted:false,human_mfa_verified:false,provider_read_verified:false,production_approved:false,
  current_whole_tree_accepted:false,new_owner_source_baseline_registered:false,complete_twelve_group_protocol_accepted:false,
  reviewer_sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output=path.join(root,'docs/evidence/a-download-gc-freeze-actual-accepted-20261022.json');
if(process.argv[2]==='--check')assert.deepEqual(JSON.parse(fs.readFileSync(output)),record);else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,actual_cases:34,ddl_wait_witnesses:25,local_core_checks:5019,seed_checks_each:12,source_files:1519,owned_directory_absent:true,production_approved:false}));
