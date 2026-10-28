import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,json,pin,reviewFrozenRun} from './a-resources-frozen-run-review.mjs';
const run=reviewFrozenRun({token:'a7788a3e6b8a474db6fb5bb667aa36cd',request:'docs/evidence/d-resources-readback-review-request-20261023.json',inputs:190,roots:63,passes:678,sourceInputs:33,priorLog:'docs/evidence/d-resources-rules-local-a4e855a078d14aabbe760cbd93bb6ac0.jsonl',priorCount:602,requiredLeaves:{TestRestoreReadbackPreflightDoesNotBegin:11,TestRestoreReadbackRejectsAllControlTables:35,TestRestoreReadbackFailures:17,TestRestoreReadbackProofMutationIsolation:3,TestRestoreReadbackLateCancellation:4,TestNormalizeRestoreNorthboundEveryNumericBound:69,TestNormalizeRestoreNorthboundFailuresDiscardCandidate:40,TestRestoreFieldsEveryColumn:111}});
const result={kind:'a_resources_readback_incremental_acceptance.v1',date:'2026-10-23',status:'private_read_only_composition_and_frozen_synthetic_tests_accepted',...run,review_sources:['docs/system-backup-a-resources-readback-review-20261023.md','docs/evidence/a-resources-readback-review-20261023.mjs','docs/evidence/a-resources-frozen-run-review.mjs','docs/evidence/d-resources-readback-validation-20261023.json'].map(pin),reviewer_Go_run:false,actual_SQL:false,B_production_proofs_implemented:false,live_registry_frozen:false,current_whole_package_accepted:false,restore_qualification_granted:false,production_approved:false,registry_written:false};
const output='docs/evidence/a-resources-readback-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log('A_READBACK_REVIEW roots=63 passes=678 prior=602 actual_SQL=no production=no');
