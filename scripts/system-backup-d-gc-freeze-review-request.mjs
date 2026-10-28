import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.join(root,'docs/evidence');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const candidates=fs.readdirSync(evidence).filter(name=>/^d-gc-freeze-protocol-[a-f0-9]{32}\.json$/.test(name)).sort((a,b)=>fs.statSync(path.join(evidence,b)).mtimeMs-fs.statSync(path.join(evidence,a)).mtimeMs);
assert.ok(candidates.length);
const validationPath=path.join(evidence,candidates[0]);const validation=JSON.parse(fs.readFileSync(validationPath,'utf8'));
assert.equal(validation.error,null);assert.equal(validation.exit_code,0);assert.equal(validation.linux_build_exit,0);assert.equal(validation.inputs_stable,true);assert.equal(validation.owner_removed,true);assert.equal(fs.existsSync(validation.owner),false);
const inputs=['backend/internal/systembackupevidence/download_retention_gc_freeze.go','backend/internal/systembackupevidence/download_retention_gc_freeze_test.go','backend/internal/systembackupevidence/download_retention_gc.go','backend/internal/systembackupevidence/download_retention_gc_early.go','backend/internal/systembackupevidence/download_retention_gc_connection.go','scripts/system-backup-d-gc-freeze-candidate-validation.ps1','scripts/system-backup-d-gc-freeze-review-request.mjs','docs/system-backup-d-independent-work-20261023.md','docs/evidence/d-gc-backup-lock-protocol-requirements-20261021.json',path.relative(root,validationPath).replaceAll('\\','/'),path.relative(root,validation.source).replaceAll('\\','/'),path.relative(root,validation.log).replaceAll('\\','/')];
for(const pin of JSON.parse(fs.readFileSync(validation.source,'utf8')))assert.equal(hash(fs.readFileSync(path.join(root,pin.path))),pin.sha256);
const peerPath='docs/evidence/a-gc-freeze-nil-reviewed-20261023.json';const peer=JSON.parse(fs.readFileSync(path.join(root,peerPath),'utf8'));
assert.equal(peer.status,'four_counterexamples_repaired_private_candidate_only');assert.equal(peer.owner_absent,true);assert.equal(peer.production_approved,false);assert.equal(hash(fs.readFileSync(path.join(root,peer.fixed_candidate.path))),peer.fixed_candidate.sha256);
for(const pin of peer.inputs)assert.equal(hash(fs.readFileSync(path.join(root,pin.path))),pin.sha256);
inputs.push(peerPath,'backend/internal/systembackupevidence/download_retention_gc_freeze_a_test.go',...peer.inputs.map(pin=>pin.path));
const request={kind:'d_gc_freeze_private_protocol_review_request.v1',status:'review_requested_not_approved',owners:['A','D'],scope:'private_connection_lock_transaction_release_protocol_not_full_Collect',validation:inputs[9],actual_mysql:false,collector_wired:false,privileges_changed:false,production_approved:false,review_receipts:[{path:peerPath,scope:'typed_nil_counterexamples_and_repair_only',full_protocol_approved:false}],required_decisions:[
  'Exact BACKUP_ADMIN and metadata observer grants, current revocation and worker admission authority.',
  'Placement of the global freeze relative to existing L0/L1/L2/L3 locking and complete metadata observation.',
  'Fresh connector/private pool trust, temporary-table exclusion and session disposal.',
  'Commit/rollback/acquisition/unlock reply loss and cancellation: truthful outcomes and independent server observation.',
  'Original SQL time/fence/reference/owner/capacity/deadline and final guards in full Collect; this helper supplies none of those authorities.',
  'Actual MySQL protocol and complete Collect with late-failure rollback before production wiring.'
],inputs:inputs.map(name=>({path:name,sha256:hash(fs.readFileSync(path.join(root,name)))}))};
const args=process.argv.slice(2);let output=path.join(evidence,'d-gc-freeze-protocol-review-request-20261023.json');
const outputIndex=args.indexOf('--out');
if(outputIndex>=0){assert.ok(args[outputIndex+1]);output=path.resolve(root,args[outputIndex+1]);assert.equal(path.dirname(output),evidence);assert.match(path.basename(output),/^[A-Za-z0-9._-]+\.json$/);args.splice(outputIndex,2);}
if(args.length===0)args.push('--check');
assert.ok(args.length===1&&['--write','--check'].includes(args[0]),'choose --write or --check, optionally --out <new evidence.json>');
if(args[0]==='--write')fs.writeFileSync(output,JSON.stringify(request,null,2)+'\n',outputIndex>=0?{flag:'wx'}:{});else assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),request);
console.log(`GC_FREEZE_REVIEW_REQUEST_OK inputs=${inputs.length} actual_mysql=no collector_wired=no approved=no`);
