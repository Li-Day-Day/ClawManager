// Exact repaired candidate request. The old request and D decision stay intact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {review} from './a-nonce-ca-r2-local-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const pin=p=>{const b=fs.readFileSync(path.join(root,p));return {path:p,size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};};
const receipt='docs/evidence/a-nonce-ca-r2-candidate-20261023-164639-61dbbaab.json';
const transcript='docs/evidence/a-nonce-ca-r2-local-20261023-164638.txt';
const report=review(receipt,transcript);
const prior=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-a-nonce-ca-reviewed-20261023.json'),'utf8'));
assert.equal(prior.status,'changes_requested');assert.equal(prior.findings[0].id,'D-A-CA-01');
const result={kind:'a_nonce_ca_non_implementer_review_request.v2',status:'pending_independent_owner_rereview',finding_to_close:'D-A-CA-01',source_sha256:report.source_sha256,source_files:report.source_files,roots:report.tests.length,pass_events:report.pass_events,old_checks_preserved:report.original_tests_preserved,old_failed_boundaries:report.old_failed_boundaries,local_preparation_accepted:true,repair:'CA Binding value/pointer constant String/GoString and JSON rejection with eight sentinel boundaries',cache_source_available:false,cache_entries_used:0,receiver_regression_scope:{synthetic_positive:2,synthetic_rejection:19,actual_SQL:false},actual_SQL:false,production_approved:false,reviewer_decision:null,evidence:[receipt,transcript,'docs/evidence/a-nonce-ca-r2-local-accepted-20261023.json','docs/evidence/a-nonce-ca-r2-candidate-20261023-164639-61dbbaab.old.jsonl','docs/evidence/a-nonce-ca-r2-candidate-20261023-164639-61dbbaab.cache-seed.json','docs/evidence/a-ca-binding-original-source-20261023.json','docs/evidence/a-nonce-ca-r2-local-review-20261023.mjs','docs/evidence/a-nonce-ca-r2-local-review-20261023.test.mjs','docs/evidence/d-a-nonce-ca-reviewed-20261023.json','docs/evidence/a-nonce-ca-peer-review-request-20261023.json','backend/internal/systembackupnoncebootstrap/nonce.go','backend/internal/systembackupnoncebootstrap/nonce_test.go','backend/internal/systembackupcatrust/ca.go','backend/internal/systembackupcatrust/ca_test.go','scripts/system-backup-a-nonce-ca-r2-validation.ps1','scripts/system-backup-a-compilation-cache-seed.mjs','docs/system-backup-a-ca-binding-repair-20261023.md','docs/evidence/a-nonce-ca-peer-review-request-20261023-r2.mjs'].map(pin)};
const out=path.join(root,'docs/evidence/a-nonce-ca-peer-review-request-20261023-r2.json');
if(process.argv.includes('--write'))fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});else{assert.ok(process.argv.includes('--check'));assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')),result);}
console.log('NONCE_CA_R2_REVIEW_READY roots=9 checks=63 old_preserved=54 old_failed=8 peer_approval=pending');
