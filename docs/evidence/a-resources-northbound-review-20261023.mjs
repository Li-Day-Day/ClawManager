import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,read,json,pin,reviewFrozenRun} from './a-resources-frozen-run-review.mjs';
const run=reviewFrozenRun({token:'a4e855a078d14aabbe760cbd93bb6ac0',request:'docs/evidence/d-resources-northbound-review-request-20261023.json',inputs:181,roots:57,passes:602,sourceInputs:31,priorLog:'docs/evidence/d-resources-rules-local-ad657be64d3d4036b22fd3f20d26ff36.jsonl',priorCount:453,requiredLeaves:{TestNormalizeRestoreNorthboundEveryNumericBound:69,TestNormalizeRestoreNorthboundFailuresDiscardCandidate:40,TestNormalizeRestoreEgressFailuresDiscardCandidate:29,TestNormalizeRestoreAuditFailuresDiscardBothTables:29,TestRestoreFieldsSQLFailuresDiscardAllRows:16,TestRestoreFieldsEveryColumn:111}});
const log='docs/evidence/d-resources-rules-local-a4e855a078d14aabbe760cbd93bb6ac0.jsonl';
const prior='docs/evidence/d-resources-rules-local-2aaabb1db67f4ba0854384c780cfd4f9.jsonl';
const parse=f=>read(f).toString('utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(e=>e.Action==='pass'&&e.Test).map(e=>e.Test);
const names=new Set(parse(log)),old=parse(prior);assert.equal(old.length,489);assert.ok(old.every(n=>names.has(n)));
const result={kind:'a_resources_northbound_incremental_acceptance.v1',date:'2026-10-23',status:'private_closed_row_candidate_and_frozen_synthetic_tests_accepted',...run,all_previous_package_checks_preserved:489,review_sources:['docs/system-backup-a-resources-northbound-review-20261023.md','docs/evidence/a-resources-northbound-review-20261023.mjs','docs/evidence/a-resources-frozen-run-review.mjs','docs/evidence/d-resources-northbound-validation-20261023.json',prior].map(pin),reviewer_Go_run:false,actual_SQL:false,B_target_facts_accepted:false,images_domain_reviewed_by_A:false,current_whole_package_accepted:false,persistent_startup_gate_proven:false,production_approved:false,registry_written:false};
const output='docs/evidence/a-resources-northbound-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log('A_NORTHBOUND_REVIEW roots=57 passes=602 prior=489 startup_gate=pending production=no');
