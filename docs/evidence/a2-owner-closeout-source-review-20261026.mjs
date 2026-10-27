// Independent format and rejection review. No Go, network or test scratch.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateCloseoutSource} from './a-owner-closeout-source-20261023.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=fs.readFileSync(p);return {path:p,size:b.length,sha256:sha(b)}};
const sourcePath='docs/evidence/d-local-closeout-53f39288bb914e1ca2f2bd9287e7874a-source.json';
const receiptPath='docs/evidence/a-owner-profile-supplement-a1af4a2e2f5645c79fadfade1051f398.json';
const base=read(sourcePath),supp=read(receiptPath);
const positives=[base,read(supp.source)];
for(const s of positives)validateCloseoutSource(s);
const reseal=s=>{s.source_sha256=sha(s.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');};
const cases=[
 ['wrong_format',s=>{s.kind='d_index_group_source_snapshot';}],
 ['copy_unverified',s=>{s.stable_copy_verified=false;}],
 ['dependencies_installed',s=>{s.dependencies_installed=true;}],
 ['extra_top_field',s=>{s.approved=true;}],
 ['missing_top_field',s=>{delete s.stable_copy_verified;}],
 ['empty_files',s=>{s.files=[];},true],
 ['duplicate_path',s=>{s.files.splice(1,0,{...s.files[0]});},true],
 ['unsorted_paths',s=>{s.files.reverse();},true],
 ['extra_entry_field',s=>{s.files[0].approved=true;},true],
 ['missing_entry_field',s=>{delete s.files[0].size;},true],
 ['null_entry',s=>{s.files[0]=null;}],
 ['unknown_root',s=>{s.files[0].path='outside/file.go';},true],
 ['traversal',s=>{s.files[0].path='backend/../file.go';},true],
 ['absolute_path',s=>{s.files[0].path='C:/outside/file.go';},true],
 ['backslash',s=>{s.files[0].path='backend/sub\\file.go';},true],
 ['drive_or_stream_colon',s=>{s.files[0].path='backend/file:stream.go';},true],
 ['control_character',s=>{s.files[0].path='backend/file\u0000.go';},true],
 ['empty_segment',s=>{s.files[0].path='backend//file.go';},true],
 ['dot_segment',s=>{s.files[0].path='backend/./file.go';},true],
 ['excluded_directory',s=>{s.files[0].path='backend/cache/file.go';},true],
 ['unsupported_extension',s=>{s.files[0].path='backend/file.exe';},true],
 ['negative_size',s=>{s.files[0].size=-1;},true],
 ['fractional_size',s=>{s.files[0].size=1.5;},true],
 ['unsafe_size',s=>{s.files[0].size=Number.MAX_SAFE_INTEGER+1;},true],
 ['string_size',s=>{s.files[0].size='1';},true],
 ['upper_case_hash',s=>{s.files[0].sha256='A'.repeat(64);},true],
 ['short_hash',s=>{s.files[0].sha256='a'.repeat(63);},true],
 ['wrong_aggregate_digest',s=>{s.source_sha256='0'.repeat(64);}],
 ['changed_file_hash_without_reseal',s=>{s.files[0].sha256=s.files[0].sha256==='0'.repeat(64)?'1'.repeat(64):'0'.repeat(64);}],
 ['changed_file_size_without_reseal',s=>{s.files[0].size++;}]
];
for(const [name,mutate,updateDigest]of cases){
 const s=structuredClone(base);mutate(s);if(updateDigest)reseal(s);
 assert.throws(()=>validateCloseoutSource(s),undefined,`Accepted invalid source: ${name}`);
}
const supplementCommand=['docs/evidence/a-owner-profile-supplement-review-20261023.mjs',receiptPath,'--check'];
const originalArgs=process.argv;
try{
 process.argv=[process.execPath,...supplementCommand];
 await import('./a-owner-profile-supplement-review-20261023.mjs');
}finally{process.argv=originalArgs;}
const absent='docs/evidence/a2-incomplete-owner-control-20261026.json';
assert.equal(fs.existsSync(absent),false);
const outputs=['docs/evidence/a-owner-current-composed-native-20261023.jsonl','docs/evidence/a-owner-current-composed-local-accepted-20261023.json'];
const outputState=()=>outputs.map(p=>fs.existsSync(p)?pin(p):{path:p,absent:true});
const before=outputState();
const incompleteCommand=['docs/evidence/a-owner-current-composed-review-20261023.mjs',absent,receiptPath,'--write'];
let denied;
try{
 process.argv=[process.execPath,...incompleteCommand];
 await import('./a-owner-current-composed-review-20261023.mjs');
}catch(error){denied=error;}finally{process.argv=originalArgs;}
assert.equal(denied?.name,'AssertionError');
assert.match(denied.message,/terminal full and supplement receipts required before acceptance/);
assert.deepEqual(outputState(),before,'Incomplete gate changed acceptance outputs');
assert.equal(fs.existsSync(absent),false);
const report={kind:'a2_closeout_source_format_fix_review.v1',decision:'exact_format_fix_reviewed_full_owner_gate_not_accepted',positive_actual_manifests:positives.length,rejection_cases:cases.map(c=>c[0]),rejections_with_recomputed_digest:cases.filter(c=>c[2]).map(c=>c[0]),execution:'in_process_cli_modules_no_child_process',supplement_check:{command:supplementCommand,completed_without_error:true},incomplete_gate_check:{command:incompleteCommand,assertion_rejected:true,acceptance_outputs_unchanged:true,control_file_created:false},source_files:base.files.length,source_sha256:base.source_sha256,backend_contracts_including_tagged_match:true,Go_or_builds_run:false,network_contacted:false,test_scratch_created:false,dependencies_installed:false,actual_SQL:false,current_owner_baseline_accepted:false,GC_finalizer_approved:false,production_approved:false,inputs:[sourcePath,receiptPath,supp.source,'docs/evidence/a-owner-closeout-source-20261023.mjs',supplementCommand[0],incompleteCommand[0],'docs/evidence/d-resources-mysql-actual-review-20261023.mjs','docs/evidence/a2-owner-closeout-source-review-20261026.mjs'].map(pin)};
const output='docs/evidence/a2-owner-closeout-source-reviewed-20261026.json';
assert.ok(['--write','--check'].includes(process.argv[2]));
if(process.argv[2]==='--write')fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(read(output),report);
console.log(`A2_CLOSEOUT_SOURCE_FIX_REVIEWED positive=${positives.length} rejected=${cases.length} supplement_check=passed incomplete_gate=rejected artifacts_unchanged=yes owner_baseline=no`);
