import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const bytes=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(bytes(p).toString().replace(/^\uFEFF/,''));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:bytes(p).length,sha256:hash(bytes(p))});
const requestPath='docs/evidence/a-nonce-ca-peer-review-request-20261023-r2.json';
const request=json(requestPath);
assert.equal(request.source_sha256,'3f10b7cb687f2ecb666b428600b44850436afb051b72673d7d0a30aa604710bb');
assert.equal(request.source_files,385);
assert.equal(request.finding_to_close,'D-A-CA-01');
for(const p of request.evidence)assert.deepEqual(pin(p.path),p);
const acceptedPath='docs/evidence/a-nonce-ca-r2-local-accepted-20261023.json';
const independentPath='docs/evidence/d-nonce-ca-r2-local-evidence-recheck-20261023.json';
const accepted=json(acceptedPath);
assert.deepEqual(json(independentPath),accepted);
assert.equal(accepted.pass_events,63);
assert.equal(accepted.original_tests_preserved,54);
assert.equal(accepted.old_failed_boundaries,8);
assert.equal(accepted.exact_owner_absent,true);
assert.equal(accepted.current_source_set_and_bytes_match,true);
assert.equal(accepted.production_approved,false);
const oldPath='docs/evidence/d-a-nonce-ca-reviewed-20261023.json';
assert.equal(json(oldPath).status,'changes_requested');
assert.deepEqual(pin(oldPath),accepted.original_peer_review);
const source=bytes('backend/internal/systembackupcatrust/ca.go').toString();
assert.match(source,/func \(Binding\) String\(\) string\s*\{ return "BootstrapCATrustBinding" \}/);
assert.match(source,/func \(Binding\) GoString\(\) string\s*\{ return "BootstrapCATrustBinding" \}/);
assert.match(source,/func \(Binding\) MarshalJSON\(\) \(\[\]byte, error\)\s*\{ return nil, sec.ErrRegistrationUnavailable \}/);
const tests=bytes('backend/internal/systembackupcatrust/ca_test.go').toString();
assert.ok(tests.includes('func TestCATrustBindingNeverFormatsOrSerializesDeploymentPins'));
assert.ok(tests.includes('PRIVATE_ENDPOINT_SENTINEL'));
const raw=json(accepted.receipt.path);
assert.equal(fs.existsSync(raw.owner),false);
const report={kind:'d_a_nonce_ca_non_implementer_review.v2',reviewer:'D',status:'accepted_exact_local_candidate_boundaries_only',finding:'D-A-CA-01',finding_closed_for_exact_r2:true,
  source_sha256:request.source_sha256,source_files:385,roots:9,pass_events:63,original_checks_preserved:54,old_failed_boundaries:8,
  original_D_review_preserved:true,Go_repeated_by_D:false,actual_SQL:false,dependencies_installed:false,production_approved:false,original_mapping_authority_approved:false,actual_permissions_approved:false,cross_resources_approved:false,
  remaining:['original controlled mappings, mount identities and actual permissions','historical material retention/lifecycle and complete CrossResources','actual MySQL/provider and explicit production composition'],
  inputs:[...new Set([requestPath,...request.evidence.map(p=>p.path),acceptedPath,independentPath,oldPath,'docs/system-backup-d-a-nonce-ca-review-20261023-r2.md','docs/evidence/d-a-nonce-ca-review-20261023-r2.mjs'])].sort().map(pin)};
const output=path.join(root,'docs/evidence/d-a-nonce-ca-reviewed-20261023-r2.json');
const mode=process.argv[2];assert.ok(['--write','--check'].includes(mode));
if(mode==='--write')fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),report);
console.log('D_A_NONCE_CA_R2_REVIEW_OK finding=D-A-CA-01 closed_for_exact_r2=yes production=no');
