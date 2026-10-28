import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const prefix='docs/evidence/d-gc-full-profile-prep-a35a7d5728ca439885a18bc5e330b7c2',receipt=read(prefix+'.json'),manifest=read(prefix+'-source.json');
assert.equal(manifest.source_sha256,'3bdf32b2014892f68fc932bdbcc40e4ba0ebd7fd74c01eca4765c8127b1355dc');
assert.equal(receipt.error,null);assert.equal(receipt.seed_exit,0);assert.equal(receipt.linux_compile_exit,0);assert.match(receipt.linux_binary_sha256,/^[a-f0-9]{64}$/);assert.equal(receipt.frozen_source_postcheck,true);assert.equal(receipt.owner_removed,true);assert.equal(fs.existsSync(receipt.owner),false);
const rows=fs.readFileSync(receipt.seed_log,'utf8').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(rows.filter(r=>r.Action==='fail'||r.Action==='skip').length,0);
assert.deepEqual(rows.filter(r=>r.Action==='pass'&&r.Test).map(r=>r.Test),['TestDDownloadGCFullProfileMySQLSeed']);
assert.equal(rows.filter(r=>r.Action==='pass'&&!r.Test&&r.Package==='clawreef/internal/systembackupevidence').length,1);
const code='backend/internal/systembackupevidence/download_gc_full_profile_mysql_test.go',frozen=manifest.files.find(p=>p.path===code);
assert.ok(frozen);assert.equal(sha(fs.readFileSync(code)),frozen.sha256);
const scriptPaths=['scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-config-writer-validation.ps1','scripts/system-backup-d-download-gc-full-profile-phase.sh','scripts/system-backup-d-download-gc-full-profile-dispatch.test.ps1','scripts/system-backup-d-gc-full-profile-prepare.ps1','scripts/system-backup-d-gc-full-profile-cache-seed.mjs'];
const scripts=scriptPaths.map(p=>{const bytes=fs.readFileSync(p),old=manifest.files.find(x=>x.path===p);return {path:p,size:bytes.length,sha256:sha(bytes),matches_compile_snapshot:old?.sha256===sha(bytes)};});
const phase=fs.readFileSync(scriptPaths[2],'utf8');
for(const literal of ['-test.list "^TestDDownloadGCFullProfileMySQL$"','-eq 31','--- SKIP:','public_collect=no','full_group=no','full_gc=not_run','production_approval=no'])assert.ok(phase.includes(literal));
const old=read('docs/evidence/a-gc-full-owner-reviewed-20261026.json');
assert.equal(old.source_sha256,'093f6b84d87d70bafc2819b351d1d36874dea32cd35e89420461f218e8eb8def');
const ownerInputs=read('docs/evidence/d-gc-full-review-request-20261026.json').owned_inputs;
for(const p of ownerInputs)assert.equal(sha(fs.readFileSync(p.path)),p.sha256,p.path);
const changedGo=manifest.files.filter(p=>p.path.startsWith('backend/')&&/\.(go|mod|sum)$/.test(p.path)&&(!fs.existsSync(p.path)||sha(fs.readFileSync(p.path))!==p.sha256)).map(p=>p.path);
const result={kind:'d_gc_full_profile_preparation_review_request.v1',status:'request_A_limited_native_seed_compile_and_dispatch_review_not_actual_MySQL',compile_source_manifest:prefix+'-source.json',compile_source_sha256:manifest.source_sha256,receipt:prefix+'.json',native_seed_roots:1,native_seed_pass_events:1,actual_profile_cases_executed:0,profile_catalog_cases:31,linux_compile_exit:0,linux_binary_sha256:receipt.linux_binary_sha256,binary_deleted:true,owner_absent:receipt.owner,tagged_probe:frozen,current_scripts:scripts,post_snapshot_script_delta:'phase and dispatch gained exact test-list/root/31-leaf/no-SKIP guards; current dispatch exit0 and Git Bash -n exit0; Go unchanged for this probe',previous_owner_093f_inputs_still_match:true,changed_frozen_go_dependencies:changedGo,whole_current_tree_ready:false,remote_command_document:'docs/system-backup-d-gc-remote-preparation-20261026.md',public_collect_actual_ready:false,complete_group_fixture_ready:false,real_protocol_authority_approved:false,production_approved:false,actual_MySQL:false,dependencies_installed:false,remaining_local_work:['actual expired canonical group SQL fixture','complete real domain/protocol authority integration','public Full Collect late rollback and fault/release/takeover actual probe','independent full group binary/dispatch/receiver'],note:'31 Full-profile protocol cases are distinct from old role10/GC42 and do not close all twelve requirement groups'};
const output='docs/evidence/d-gc-full-profile-preparation-request-20261026.json',mode=process.argv[2]??'--check';assert.ok(['--write','--check'].includes(mode));
if(mode==='--write')fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});else {const prior=read(output);for(const [key,value]of Object.entries(result))if(key!=='changed_frozen_go_dependencies')assert.deepEqual(prior[key],value,key);}
process.stdout.write(JSON.stringify({mode,status:result.status,native_seed_roots:1,profile_catalog_cases:31,actual_profile_cases_executed:0,linux_compile_exit:0,owner_absent:true,current_scripts:scripts.map(p=>({path:p.path,matches_compile_snapshot:p.matches_compile_snapshot})),current_frozen_go_dependency_drift:changedGo,public_collect_actual_ready:false})+'\n');
