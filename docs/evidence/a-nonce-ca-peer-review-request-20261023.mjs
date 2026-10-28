// A concrete review request, never an approval or deployment grant.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {review} from './a-nonce-ca-local-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const pin=p=>{const b=fs.readFileSync(path.join(root,p));return {path:p,size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};};
const receipt='docs/evidence/a-nonce-bootstrap-candidate-20261023-153724-cd693e2c.json';
const transcript='docs/evidence/a-nonce-ca-final-local-20261023-153722.txt';
const checked=review(receipt,transcript);
const report={kind:'a_nonce_ca_non_implementer_review_request.v1',status:'pending_independent_owner_review',source_sha256:checked.source_sha256,source_files:checked.source_files,tests:checked.tests,local_preparation_accepted:true,actual_SQL:false,production_approved:false,reviewer_decision:null,scope:['nonce original installation/database/config/purpose/version binding','nonce exact 32-byte local material and owned-copy erasure','complete persisted global nonce/config historical identities and maximum retention per version','same-transaction read-only Recheck and original observation deadline','CA exact controlled target IP/hostname, TLS certificate validation and immutable local pins','CA transaction-local identity/file/time recheck without provider network or transaction completion','redacted errors/formatting and no bootstrap authority from constructor success','explicit future composition only after original material authority, cross-resource policy and peer review'],remaining_actual_evidence:['original controlled mappings/material authority and permissions','historical key lifecycle and retained material policy','actual MySQL snapshot/identity/retention failures','production composition and cross-resource constraints'],evidence:[receipt,transcript,'docs/evidence/a-nonce-ca-local-accepted-20261023.json','docs/evidence/a-nonce-ca-local-review-20261023.mjs','docs/evidence/a-nonce-ca-local-review-20261023.test.mjs','backend/internal/systembackupnoncebootstrap/nonce.go','backend/internal/systembackupnoncebootstrap/nonce_test.go','backend/internal/systembackupcatrust/ca.go','backend/internal/systembackupcatrust/ca_test.go','docs/system-backup-a-nonce-bootstrap-20261023.md','docs/system-backup-a-ca-trust-adapter-20261022.md','docs/evidence/a-nonce-ca-peer-review-request-20261023.mjs'].map(pin)};
const out=path.join(root,'docs/evidence/a-nonce-ca-peer-review-request-20261023.json');
if(process.argv.includes('--write'))fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});else{assert.ok(process.argv.includes('--check'));assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')),report);}
console.log('NONCE_CA_PEER_REVIEW_REQUEST_READY approved=no actual_SQL=no');
