import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,json,pin,reviewFrozenRun} from './a-resources-frozen-run-review.mjs';
const run=reviewFrozenRun({token:'ad657be64d3d4036b22fd3f20d26ff36',request:'docs/evidence/d-resources-egress-review-request-20261023.json',inputs:169,roots:49,passes:453,sourceInputs:27,priorLog:'docs/evidence/d-resources-rules-local-4aa89a44072a42dfa31a0eb65e777053.jsonl',priorCount:421,requiredLeaves:{TestNormalizeRestoreEgressFailuresDiscardCandidate:29,TestNormalizeRestoreAuditFailuresDiscardBothTables:29,TestRestoreFieldsSQLFailuresDiscardAllRows:16,TestRestoreFieldsEveryColumn:111}});
const result={kind:'a_resources_egress_incremental_acceptance.v1',date:'2026-10-23',status:'private_disabled_candidate_and_frozen_synthetic_tests_accepted',...run,review_sources:['docs/system-backup-a-resources-egress-review-20261023.md','docs/evidence/a-resources-egress-review-20261023.mjs','docs/evidence/a-resources-frozen-run-review.mjs','docs/evidence/d-resources-egress-validation-20261023.json'].map(pin),reviewer_Go_run:false,actual_SQL:false,B_network_policy_accepted:false,current_whole_package_accepted:false,production_approved:false,registry_written:false};
const output='docs/evidence/a-resources-egress-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log('A_EGRESS_REVIEW roots=49 passes=453 prior=421 synthetic_only=yes production=no');
