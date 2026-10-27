import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha,decode} from '../../scripts/system-backup-d-gc-full-collect-receiver.mjs';
import {lifecycleCases} from './d-gc-full-lifecycle-receiver-20261026.mjs';
const repo=path.resolve(import.meta.dirname,'../..'),evidence=import.meta.dirname;
const paths=[
  'backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go',
  'backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go',
  ...['requirements-20261026.json','phase-20261026.sh','source-20261026.mjs','source-20261026.test.mjs','operator-20261026.ps1','dispatch-20261026.test.ps1','receiver-20261026.mjs','receiver-20261026.test.mjs'].map(n=>'docs/evidence/d-gc-full-lifecycle-'+n)
];
const pin=p=>{const b=fs.readFileSync(path.join(repo,p));return {path:p,sha256:sha(b),size:b.length};};
const output=path.join(evidence,'d-gc-full-lifecycle-review-request-20261026.json');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert.ok(['--source','--check','--write'].includes(args[i]));assert.ok(args[i+1]);assert.equal(options[args[i]],undefined);options[args[i]]=path.resolve(args[i+1]);assert.equal(path.dirname(options[args[i]]),evidence);}
assert.ok(!(options['--check']&&options['--write']));
function candidate(){
  const result={kind:'d_gc_full_lifecycle_local_preparation_review_request.v1',status:'exact_tagged_delta_and_independent_harness_ready_for_A_review_native_compile_pending',files:paths.map(pin),cases:lifecycleCases,
    old_cold_pin:{path:paths[0],sha256:'d1b0c295339e9e6e61fec08dddf7336cb499a82b9645ff250bab8ca7c9d6818f',size:23008},
    ordinary_source_modified_by_this_delta:false,central_scripts_modified_by_this_delta:false,
    local_checks:[['docs/evidence/d-gc-full-lifecycle-receiver-tests-20261026.txt',23],['docs/evidence/d-gc-full-lifecycle-source-tests-20261026-r2.txt',11]].map(([p,count])=>{const s=decode(fs.readFileSync(path.join(repo,p)));assert.match(s,new RegExp('pass '+count+'\\r?\\n'));assert.match(s,/fail 0\r?\n/);assert.match(s,/skipped 0\r?\n/);return {...pin(p),tests:count,failed:0,skipped:0,scope:'pure_parser_and_source_selector_no_SQL'};}),
    dispatch_check:pin('docs/evidence/d-gc-full-lifecycle-dispatch-tests-20261026.txt'),
    source_candidate:pin(options['--source']?path.relative(repo,options['--source']).replaceAll('\\','/'):'docs/evidence/d-gc-full-lifecycle-source-candidate-20261026.json'),
    preceding_A_receipt:pin('docs/evidence/a-gc-prepared-full-reviewed-20261026.json'),
    original_requirements:'docs/evidence/d-download-gc-source-freeze-requirements-20261021.json',
    production_materials_gap:'docs/evidence/d-gc-catalog-authority-materials-request-20261026.json',
    normalizer_scope:'synthetic cold fixture only; strip exactly one unquoted outer positive uint64 allocator counter; retain all column/index/constraint/quoted COMMENT bytes; malformed/duplicate/unquoted comments/nested tail reject',
    seed_and_linux_execution:'pending exact A tag scope and single Go owner handoff; Root proposed to execute narrow three GC seeds and Linux evidence before its thirteen owner stages',
    actual_new_profile_cases:0,actual_new_cold_cases:0,actual_new_lifecycle_cases:0,production_scale_approved:false,complete_real_domain_authority:false,twelve_groups_actually_accepted:false,production_approved:false,dependencies_installed:false,
    historical_source_test_failure:'initial parser test incorrectly expected removal by $evidenceScratch rather than validated $resolved; source unchanged, corrected assertion in r2 passed; initial failure log retained',
    actual_SQL:false};
  const dispatch=decode(fs.readFileSync(path.join(repo,result.dispatch_check.path)));assert.match(dispatch,/^PASS lifecycle-dispatch .*Go=no SSH=no files_created=no\r?$/m);
  return result;
}
const c=candidate();
if(options['--write'])fs.writeFileSync(options['--write'],JSON.stringify(c,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(JSON.parse(fs.readFileSync(options['--check']||output,'utf8')),c,'review request input drift');
process.stdout.write(JSON.stringify({kind:c.kind,status:c.status,files:c.files.length,local_tests:34,native_Go_executed:false,actual_SQL:false,production_approved:false})+'\n');
