// Independent review of the frozen native inspector. No test/build/SQL actions.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,raw,json,decode,sha256,manifest,exact,inventory} from './a-frozen-validation-utils-20261021.mjs';
const prefix='docs/evidence/a-field-dsn-native-20261021-r2',source=manifest(prefix+'-source.json'),native=json(prefix+'-native.json');
assert.equal(native.kind,'a_field_dsn_native_validation');assert.equal(native.exit,0);assert.equal(native.source_postcheck,true);assert.equal(native.source_sha256,source.source_sha256);assert.equal(native.source_files,source.files.length);
for(const k of ['default_vet','removed'])assert.equal(native[k],true);
for(const k of ['dependencies_installed','remote','actual_mysql','production_approved','original_cache_modified','test_results_reused'])assert.equal(native[k],false);
assert.equal(path.dirname(path.resolve(native.owner)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(native.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(native.owner),false);
exact(native.stages.map(s=>s.stage),['tests','owner-dependencies','build-windows','build-linux']);
const stages=native.stages.map(s=>{
  assert.equal(s.attempt,1);assert.equal(s.exit,0);assert.ok(s.arguments.includes('-mod=readonly'));
  const out='docs/evidence/'+s.stdout,err='docs/evidence/'+s.stderr;assert.equal(raw(err).length,0);
  return {...s,stdout:out,stderr:err,stdout_sha256:sha256(raw(out)),stderr_sha256:sha256(raw(err))};
});
const passed=inventory(stages.find(s=>s.stage==='tests').stdout,['clawreef/cmd/system-backup-registration']);
assert.equal(passed.length,84);assert.equal(passed.filter(e=>!e.Test.includes('/')).length,20);
const old=inventory('docs/evidence/a-download-process-20261020-r1-packages.jsonl',['clawreef/cmd/system-backup-registration']),names=new Set(passed.map(e=>e.Test));
assert.equal(old.length,49);assert.ok(old.every(e=>names.has(e.Test)));assert.equal(passed.length-old.length,35);
const newRoots=passed.filter(e=>!e.Test.includes('/')&&e.Test.startsWith('TestFieldInspection')).map(e=>e.Test);assert.equal(newRoots.length,6);
const programFiles=source.files.filter(f=>f.path.startsWith('backend/cmd/system-backup-registration/'));
for(const f of programFiles){const b=raw(f.path);assert.equal(b.length,f.size);assert.equal(sha256(b),f.sha256);}
const previous=manifest('docs/evidence/a-download-gc-role-mysql-remote-source-20261021-164523-7cba478a.json');
const mainPath='backend/cmd/system-backup-registration/main.go',main=decode(raw(mainPath));
const flagLine='\tinspectSQL := flag.Bool("inspect-sql-evidence", false, "read-only SQL identity/grants/metadata from a public stdin request and an existing mounted DSN")\n';
assert.ok(main.includes(flagLine));let reconstructed=main.replace(flagLine,'');const start=reconstructed.indexOf('\tif *inspectSQL {'),end=reconstructed.indexOf('\tcapacityMode :=',start);assert.ok(start>0&&end>start);reconstructed=reconstructed.slice(0,start)+reconstructed.slice(end);
assert.ok([sha256(reconstructed),sha256(reconstructed.replace(/\n/g,'\r\n'))].includes(previous.files.find(f=>f.path===mainPath).sha256));
exact(native.binaries.map(b=>b.goos),['windows','linux']);for(const b of native.binaries){assert.equal(b.goarch,'amd64');assert.match(b.sha256,/^[a-f0-9]{64}$/);assert.ok(b.bytes>0);}
const failedPath='docs/evidence/a-field-dsn-native-20261021-r1-native.json',failed=json(failedPath);assert.equal(failed.exit,1);assert.equal(failed.source_sha256,null);assert.equal(failed.stages.length,0);assert.equal(failed.removed,true);assert.equal(fs.existsSync(failed.owner),false);
const record={kind:'a_native_mounted_dsn_readonly_inspector_preparation',status:'compiled_and_unit_tested_native_inspector_no_actual_sql',source:prefix+'-source.json',source_manifest_sha256:sha256(raw(prefix+'-source.json')),source_sha256:source.source_sha256,source_files:source.files.length,native:prefix+'-native.json',native_sha256:sha256(raw(prefix+'-native.json')),stages,program_files:programFiles,complete_cmd_roots:20,complete_cmd_checks:84,old_cmd_checks_retained:49,new_cmd_checks:35,new_roots:newRoots,binaries:native.binaries,original_main_reconstructed_after_removing_only_new_flag_and_dispatch:true,previous_capture_failure:{path:failedPath,sha256:sha256(raw(failedPath)),exit:1,reason:'source snapshot owner.txt marker missing; failed before Go; corrected for r2',retained:true},owned_directories_independently_absent:[native.owner,failed.owner],dependencies_installed:false,actual_mysql_executed:false,image_built_or_deployed:false,production_approved:false,entire_worktree_accepted:false,reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output='docs/evidence/a-field-dsn-native-accepted-20261021.json';
if(process.argv[2]==='--check')assert.deepEqual(json(output),record);else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(path.join(workspace,output),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,cmd_tests:84,retained:49,windows_linux:true,owned_products_absent:true,actual_mysql_executed:false}));
