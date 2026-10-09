import assert from 'node:assert/strict';
import test from 'node:test';
import { readHandoff, runPreflight, validateResult } from './system-backup-a-provider-handoff-preflight.mjs';
const h = readHandoff();
const good = () => ({ kind:'a_provider_handoff_preflight_v1', status:'passed', started_at:'2026-09-24T01:30:00+00:00', finished_at:'2026-09-24T01:30:01+00:00',
  namespace:h.namespace, namespace_uid:h.namespace_uid, identity_refs_checked:8, tls_verified:true, temporary_artifacts_created:false,
  secret_values_extracted:false, token_validity_verified:false, provider_capability_approved:false, evidence_registered:false });

test('pinned handoff and byte transport use interactive SSH and no shell interpolation', () => {
  const result = runPreflight('root@10.130.14.23', true, (cmd, args, opts) => {
    assert.equal(cmd, 'ssh'); assert.equal(args.at(-1), 'python3 -B -');
    assert.ok(args.includes('StrictHostKeyChecking=yes')); assert.ok(args.includes('BatchMode=no'));
    assert.equal(opts.shell, false); assert.equal(opts.stdio[2], 'inherit');
    assert.ok(Buffer.isBuffer(opts.input)); assert.equal(opts.input.includes(13), false);
    return {status:0,stdout:Buffer.from(JSON.stringify(good()))};
  });
  assert.equal(result.status,'passed');
});

test('failure or timeout cannot pass; diagnostics are bounded', () => {
  for (const extra of [{status:1},{status:0,error:Error('secret')},{status:0,signal:'SIGTERM'}]) {
    assert.throws(()=>runPreflight('root@10.130.14.23',true,()=>({...extra,stdout:Buffer.from(JSON.stringify(good()))})),/preflight failed/);
  }
  assert.throws(()=>runPreflight('root@10.130.14.23',true,()=>({status:1,stdout:Buffer.from('{"status":"failed","stage":"identity_metadata","secret":"do not print"}')})),/^Error: preflight failed: stage=identity_metadata; exit=1$/);
});

test('result schema rejects drift, extra fields and overstated scope', () => {
  for (const patch of [{namespace_uid:'wrong'},{tls_verified:false},{identity_refs_checked:7},{token_validity_verified:true},{provider_capability_approved:true},{secret:'hidden'},{finished_at:'2026-09-23T01:00:00Z'}]) {
    assert.throws(()=>validateResult({...good(),...patch},h));
  }
});
