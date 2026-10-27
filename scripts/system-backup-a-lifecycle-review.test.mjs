import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {review,reviewFile,evidenceFile} from './system-backup-a-lifecycle-review.mjs';
const original=JSON.parse(readFileSync(new URL('../'+evidenceFile,import.meta.url)));
test('fixed real evidence, six signatures and full trace accepted',()=>assert.equal(reviewFile().events_checked,194));
for(const [name,mutate] of [
  ['missing negative call',v=>v.events.splice(49,1)],
  ['control denial',v=>v.events[48].http_status=403],
  ['premature expiry observation',v=>v.events[49].observed_unix=Date.parse(v.identity_refs['expire-generate'].expire_time)/1000+1],
  ['duplicate audit row',v=>v.audit_rows.push({...v.audit_rows[0]})],
  ['wrong audit path',v=>v.audit_rows[0].path=v.audit_rows[6].path],
  ['wrong positive identity',v=>{v.audit_rows.find(r=>r.request_id===v.events[41].request_id).identity='control-generate';}],
  ['tampered signature',v=>{v.public_proofs[0].signature_base64=Buffer.alloc(64).toString('base64');}],
  ['missing final key absence',v=>v.events.at(-1).http_status=200],
  ['fake cleanup approval',v=>v.cleanup_verified=false],
]) test(name+' rejected',()=>{const v=structuredClone(original);mutate(v);assert.throws(()=>review(v));});
