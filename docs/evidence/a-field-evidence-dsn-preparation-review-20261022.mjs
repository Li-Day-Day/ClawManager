// Preparation evidence only. Does not execute tests, SSH, SQL or deployment.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fieldRequirements} from '../../scripts/system-backup-a-field-evidence.mjs';
const root=path.resolve(import.meta.dirname,'../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(path.join(root,p)),json=p=>JSON.parse(raw(p));
const pin=p=>({path:p,sha256:sha(raw(p)),bytes:raw(p).length});
const nativePath='docs/evidence/a-field-dsn-native-accepted-20261021.json',native=json(nativePath);
assert.equal(native.status,'compiled_and_unit_tested_native_inspector_no_actual_sql');
assert.equal(native.complete_cmd_checks,84);assert.equal(native.old_cmd_checks_retained,49);
assert.equal(native.actual_mysql_executed,false);assert.equal(native.image_built_or_deployed,false);
assert.equal(sha(raw(native.source)),native.source_manifest_sha256);assert.equal(sha(raw(native.native)),native.native_sha256);
for(const f of native.program_files){assert.equal(sha(raw(f.path)),f.sha256);assert.equal(raw(f.path).length,f.size);}
for(const s of native.stages){assert.equal(s.exit,0);assert.equal(sha(raw(s.stdout)),s.stdout_sha256);assert.equal(sha(raw(s.stderr)),s.stderr_sha256);}
const summaryPath='docs/evidence/a-field-evidence-dsn-terminal-summaries-20261022.json',summaries=json(summaryPath);
assert.match(summaries.provenance,/not saved raw terminal logs/);
assert.deepEqual(summaries.tests.map(t=>[t.suite,t.exit]),[['python',0],['node',0],['powershell51',0],['powershell7',0]]);
assert.equal(summaries.tests[0].tests,13);assert.equal(summaries.tests[1].pass,41);assert.equal(summaries.tests[1].fail,0);
const inventoryLogs=['python','ps51','ps7'].map(s=>pin('docs/evidence/a-field-public-inventory-'+s+'-20261022-terminal.txt'));
assert.match(raw(inventoryLogs[0].path).toString(),/Ran 8 tests in /);assert.match(raw(inventoryLogs[0].path).toString(),/\nOK\r?\n/);
for(const p of inventoryLogs.slice(1))assert.match(raw(p.path).toString(),/PASS field-public-inventory wrapper:/);
const explicit=[
  'scripts/system-backup-a-field-evidence.py','scripts/system-backup-a-field-evidence.ps1','scripts/system-backup-a-field-evidence.mjs',
  'scripts/system-backup-a-field-evidence_test.py','scripts/system-backup-a-field-evidence.test.ps1','scripts/system-backup-a-field-evidence.test.mjs',
  'scripts/system-backup-a-field-evidence-fixture.mjs',
  'scripts/system-backup-a-field-inventory.py','scripts/system-backup-a-field-inventory.ps1',
  'scripts/system-backup-a-field-inventory_test.py','scripts/system-backup-a-field-inventory.test.ps1',
  'backend/cmd/system-backup-registration/download_deployment.go','backend/cmd/system-backup-registration/download_grants.go',
  'backend/cmd/system-backup-registration/download_readiness.go','backend/internal/systembackupsecurity/registration_runtime.go',
  'backend/internal/systembackupsecurity/bootstrap_deployment.go',
  'contracts/system-backup/v12/schema-registry.json','contracts/system-backup/v12/verifier-contract.schema.json',
  ...fs.readdirSync(path.join(root,'backend/internal/db/migrations')).filter(p=>p.endsWith('.sql')).map(p=>'backend/internal/db/migrations/'+p),
  ...native.program_files.map(f=>f.path)
];
// Include the complete local ESM import closure; explicitly include Python,
// because the native Go source snapshot intentionally does not include .py.
const all=new Set();
function add(p){if(all.has(p))return;all.add(p);if(p.endsWith('.mjs'))for(const m of raw(p).toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))add(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1])));}
explicit.forEach(add);const inputs=[...all].sort().map(pin);
const historicalPath='docs/evidence/a-field-evidence-local-20261021-native.json',historical=json(historicalPath);
assert.ok(historical.retained_failures.some(f=>f.node_hex==='0xc0000142'));
const owned=[...native.owned_directories_independently_absent,...summaries.tests.filter(t=>t.owned_directory).map(t=>path.join(root,t.owned_directory)),
  '.tmp-a-field-inventory-03575ab115fc4939858aaff9f218399c','.tmp-a-field-inventory-92292f3d0695444cb85d95600e5d6bc6'].map(p=>path.resolve(root,p));
for(const p of owned){assert.equal(path.dirname(p).toLowerCase(),root.toLowerCase());assert.equal(fs.existsSync(p),false);}
assert.deepEqual(fs.readdirSync(root).filter(p=>/^\.tmp-a-field-(?:evidence|wrapper|inventory)-/.test(p)),[]);
const source=json(native.source),previousPath='docs/evidence/a-download-gc-role-mysql-remote-source-20261021-164523-7cba478a.json',previous=json(previousPath);
const previousFiles=new Map(previous.files.map(f=>[f.path,f.sha256]));
const dependencyLog=native.stages.find(s=>s.stage==='owner-dependencies').stdout;
const dependencyDirs=new Set(raw(dependencyLog).toString('utf8').split(/\r?\n/).map(l=>l.split(' ')[0]).filter(l=>/^clawreef\/internal\//.test(l)&&!l.endsWith('.test')).map(l=>'backend/'+l.slice('clawreef/'.length)+'/'));
const changedOwnerInputs=source.files.filter(f=>[...dependencyDirs].some(d=>f.path.startsWith(d))&&previousFiles.get(f.path)!==f.sha256).map(f=>f.path).sort();
assert.deepEqual(changedOwnerInputs,[
  'backend/internal/systembackupread/verification_detail.go','backend/internal/systembackupread/verification_detail_test.go',
  'backend/internal/systembackupsecurity/providerproof_registry.go','backend/internal/systembackupsecurity/registration_runtime.go',
  'backend/internal/systembackupsecurity/strongauth_registry.go'
]);
const record={kind:'a_field_evidence_dsn_preparation',status:'local_preparation_verified_actual_field_collection_pending',
  source_scope:'Exact listed current files; Go command matches its frozen native source. Not approval of the whole current worktree or the owner gate.',
  inputs,native_receipt:pin(nativePath),native_source_sha256:native.source_sha256,native_source_files:native.source_files,
  native_cmd_checks:84,old_cmd_checks_retained:49,binaries:native.binaries,
  field_terminal_summaries:pin(summaryPath),terminal_summary_limit:'Original field-script test terminals were not persisted as raw files; this record retains reported completed tool results with chunk/session references.',
  field_tests:{node:41,python:13,powershell_versions:['5.1','7'],synthetic_transport_only:true},
  inventory_tests:{python:8,powershell_versions:['5.1','7'],logs:inventoryLogs,synthetic_transport_only:true},
  existing_observations:fieldRequirements().existing_observations,
  historical_candidate:pin('docs/evidence/a-field-evidence-candidate-preparation-20261021.json'),retained_failures:pin(historicalPath),
  native_earlier_failure:native.previous_capture_failure,owned_directories_independently_absent:owned,
  owner_source_gate:{comparison_previous:pin(previousPath),comparison_native_source:pin(native.source),dependency_log:pin(dependencyLog),changed_inputs:changedOwnerInputs,
    new_owner_source_baseline_registered:false,previous_5019_tests_reused_for_changed_inputs:false,new_full_owner_source_tests_required:true},
  dependencies_installed:false,test_build_artifacts_created:true,test_build_artifacts_retained:false,
  image_built_or_deployed:false,ssh_executed:false,actual_sql_executed:false,actual_field_evidence_accepted:false,production_approved:false,
  next_required:'Operator public inventory when deployment state is unknown; then reviewed image supporting the inspector, original public references and actual collection. No role10 or GC18 repeat.',
  reviewer_sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output=path.join(root,'docs/evidence/a-field-evidence-dsn-preparation-20261022.json');
if(process.argv[2]==='--check')assert.deepEqual(JSON.parse(fs.readFileSync(output)),record);else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,cmd_checks:84,node:41,python:13,public_inventory_python:8,owned_products_absent:true,actual_field_evidence_accepted:false,new_owner_source_baseline_registered:false}));
