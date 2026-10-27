// Review the preparation-only script and its mock tests explicitly. No Go obligation is
// waived and no source selector is changed to hide the additional input.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const baseName='docs/evidence/a-owner-current-reviewed-source-20261027.json',base=json(baseName);
const acceptedName='docs/evidence/a-owner-current-local-accepted-20261027.json',accepted=json(acceptedName);
assert.deepEqual(accepted.source,pin(baseName));assert.equal(accepted.owner_baseline.all,5530);
const script='scripts/system-backup-promql-prepare.ps1',p=pin(script);
assert.equal(p.size,5496);assert.equal(p.sha256,'c6cb38cd748d9f7bb72f309e0946d1a30a820e9417667ea890fa7cf56f3795be');
const testName='scripts/system-backup-promql-prepare.test.ps1',testPin=pin(testName);
assert.equal(testPin.size,6589);assert.equal(testPin.sha256,'06f01fbd4c5c8bb3741db0c52e317f7d72b2bbd4c0700a17852d9249e3deab6e');
const astName='docs/evidence/a-promql-prepare-static-review-20261027.json',ast=json(astName);
assert.equal(ast.sha256,p.sha256);assert.equal(ast.AST_errors,0);assert.equal(ast.script_executed,false);assert.equal(ast.docker_source_commands.length,4);
assert.deepEqual(ast.docker_source_commands,[
 '& docker image inspect $Image',
 '& docker create --pull=never --platform "linux/$Architecture" --network none $info.Id',
 '& docker cp "${containerId}:/bin/promtool" $binary',
 '& docker rm -v $containerId'
]);
const code=read(script).toString('utf8');
for(const required of ["[ValidateSet('amd64', 'arm64')]",'Expected a 64-bit little-endian ELF promtool binary',
 'ELF architecture does not match',"$containerId -notmatch '^[0-9a-f]{64}$'",'Refusing redirected cleanup',
 'dependencies_installed = $false','PromQLExecuted = $false'])assert.ok(code.includes(required),required);
const testLogName='docs/evidence/a-promql-prepare-mocked-test-20261027.txt',testLog=read(testLogName).toString('utf8');
assert.match(testLog,/PASS: binary preparation \(amd64\/arm64\), checksums, unchanged fixtures, invalid binary\/architecture rejection, mocked image extraction and failure cleanup\./);
assert.match(testLog,/No real promtool, Docker, SSH, or PromQL executed\./);
assert.doesNotMatch(testLog,/Exception:|^FAIL|AssertionError/m);
const files=[...base.files,p,testPin].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
assert.equal(new Set(files.map(p=>p.path)).size,1720);assert.deepEqual(enumerate(root),files);
const ordinary=xs=>xs.filter(p=>/^(backend|contracts)\//.test(p.path));
assert.deepEqual(ordinary(files),ordinary(base.files));
// The existing owner harness does not dispatch the tool-preparation script.
const harnesses=['docs/evidence/a-download-owner-role-retest-20261021.ps1',
 'scripts/system-backup-d-config-writer-validation.ps1','scripts/system-backup-a-evidence-validation.ps1'];
for(const file of harnesses)assert.ok(!read(file).toString('utf8').includes('system-backup-promql-prepare'));
const result={kind:'a_owner_current_full_input_source_composition_review.v1',reviewer:'A1',
 status:'complete_exact_current_input_composition_with_source_only_PromQL_preparer',
 source_sha256:sourceDigest(files),files,source_files:1720,
 native_owner_baseline_source:pin(baseName),native_owner_local_acceptance:pin(acceptedName),
 ordinary_source_sha256:base.source_sha256,owner_roots:703,owner_pass_events:5530,
 original_5190_owner_names_preserved:true,only_added_inputs:[p,testPin],support_script_AST_review:pin(astName),
 actual_mock_test_log:pin(testLogName),mock_tests_executed_by_A1:true,
 backend_and_contracts_byte_sets_unchanged:true,original_owner_harness_does_not_dispatch_new_script:true,
 owner_harnesses:harnesses.map(pin),new_Go_dependencies:false,
 new_script_scope:'Explicit user-run bundle preparation from an existing Linux ELF or existing local image; no pull/start/networked container and no PromQL execution during this source review.',
 source_review_and_mock_tests_only:true,real_promtool_or_Docker_executed:false,actual_PromQL_executed:false,
 full_new_native_run_claimed:false,SSH:false,actual_SQL:false,dependencies_installed:false,
 test_build_artifacts_created:false,production_approved:false,whole_goal_complete:false};
assert.deepEqual(enumerate(root),files,'source changed during support review');
const output='docs/evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json',encoded=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(read(output).toString('utf8'),encoded);
console.log(JSON.stringify({status:result.status,source_sha256:result.source_sha256,files:1720,only_new_inputs:[script,testName],ordinary_baseline:base.source_sha256,Go_repeated:false,PromQL_executed:false}));
