// Receiver boundary review only. It never accepts/registers an owner baseline.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateCloseoutSource} from './a-owner-closeout-source-20261023.mjs';
import {frozenMigrationCatalog} from './a-download-owners-actual-review-20261020.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(bytes(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:bytes(p).length,sha256:sha(bytes(p))});
const sourcePath='docs/evidence/d-local-closeout-a9b3f627a8134e5798ca12b34880d1af-source.json';
const source=json(sourcePath),sourceBefore=pin(sourcePath);
validateCloseoutSource(source);
assert.equal(source.source_sha256,'41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16');
const extras=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
function walk(dir){
 assert.equal(fs.lstatSync(path.resolve(root,dir)).isSymbolicLink(),false);
 return fs.readdirSync(path.resolve(root,dir),{withFileTypes:true}).flatMap(e=>{
  const p=dir+'/'+e.name;assert.equal(e.isSymbolicLink(),false);
  if(e.isDirectory())return ['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__'].includes(e.name)?[]:walk(p);
  return e.isFile()&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p)&&(!p.startsWith('docs/')||/^docs\/[^/]+\.sql$/.test(p)||extras.has(p))?[p]:[];
 });
}
const currentFiles=()=>['backend','contracts','scripts','docs'].flatMap(walk).sort();
assert.deepEqual(currentFiles(),source.files.map(p=>p.path));
for(const p of source.files)assert.deepEqual(pin(p.path),p);
assert.deepEqual(currentFiles(),source.files.map(p=>p.path));
const derived={kind:'a_reviewed_owner_preparation_source.v1',source_sha256:source.source_sha256,files:structuredClone(source.files),stable_copy_verified:true,dependencies_installed:false,production_approved:false,origin:'review_metadata_from_verified_closeout_snapshot_not_a_new_native_snapshot',origin_manifests:[sourceBefore],approval_scope:'complete_owner_local_preparation_only',actual_SQL:false};
assert.deepEqual(derived.files,source.files);
assert.equal(sha(derived.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),source.source_sha256);
const catalog=frozenMigrationCatalog(derived);
assert.equal(catalog.file_count,96);
assert.deepEqual(pin(sourcePath),sourceBefore,'Original native source manifest changed');
const parserLog='docs/evidence/a2-owner-finalizer-native-tests-20261026.txt';
const tested=bytes(parserLog).toString('utf8');
assert.match(tested,/tests 16\s*\r?\n/);assert.match(tested,/pass 16\s*\r?\n/);
for(const field of ['fail','cancelled','skipped','todo'])assert.match(tested,new RegExp(field+' 0\\s*\\r?\\n'));
assert.match(tested,/A2_OWNER_NATIVE_TEST_EXIT=0\s*$/);
const absent='docs/evidence/a2-incomplete-final-owner-control-20261026.json';
assert.equal(fs.existsSync(path.resolve(root,absent)),false);
const outputs=['docs/evidence/a-owner-final-source-20261026.json','docs/evidence/a-owner-final-native-20261026.jsonl','docs/evidence/a-owner-final-local-accepted-20261026.json'];
const outputState=()=>outputs.map(p=>fs.existsSync(path.resolve(root,p))?pin(p):{path:p,absent:true});
const before=outputState(),savedArgs=process.argv;
let rejected;
try{process.argv=[process.execPath,'docs/evidence/a-owner-final-local-review-20261026.mjs',absent,'--write'];await import('./a-owner-final-local-review-20261026.mjs');}
catch(error){rejected=error;}finally{process.argv=savedArgs;}
assert.equal(rejected?.name,'AssertionError');assert.match(rejected.message,/terminal receipts required; no acceptance or baseline may be written/);
assert.deepEqual(outputState(),before);assert.equal(fs.existsSync(path.resolve(root,absent)),false);
const report={kind:'a2_owner_final_receiver_boundary_review.v1',decision:'source_derivation_and_missing_terminal_rejection_reviewed_not_final_gate_acceptance',source:sourceBefore,source_files:source.files.length,source_sha256:source.source_sha256,current_complete_set_and_bytes_match_at_review:true,derived_metadata_proposal_only:true,derived_kind:derived.kind,derived_files_and_source_digest_unchanged:true,original_native_manifest_unchanged:true,catalog,native_parser_regressions:16,native_parser_test_log:pin(parserLog),missing_terminal_control_rejected:true,three_acceptance_outputs_unchanged:true,incomplete_control_file_created:false,Go_or_builds_run_by_this_review:false,dependencies_installed:false,scratch_created:false,actual_SQL:false,owner_baseline_approved:false,finalizer_F1_to_F10_runtime_gate_accepted:false,production_approved:false,inputs:['docs/evidence/a-owner-final-local-review-20261026.mjs','docs/evidence/a-owner-finalizer-native-20261026.mjs','docs/evidence/a-owner-finalizer-native-20261026.test.mjs','docs/evidence/a-owner-closeout-source-20261023.mjs','docs/evidence/a-download-owners-actual-review-20261020.mjs','docs/evidence/d-resources-mysql-actual-review-20261023.mjs','docs/evidence/a2-owner-final-receiver-review-20261026.mjs'].map(pin)};
const output='docs/evidence/a2-owner-final-receiver-reviewed-20261026.json';
assert.ok(['--write','--check'].includes(process.argv[2]));
if(process.argv[2]==='--write')fs.writeFileSync(path.resolve(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),report);
console.log(`A2_FINAL_OWNER_RECEIVER_REVIEWED files=${source.files.length} parser_cases=16 derived_digest=unchanged incomplete_gate=rejected artifacts=unchanged baseline=no`);
