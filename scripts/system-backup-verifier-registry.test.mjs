import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { validateVerifierCheckRegistries } from './system-backup-contract-check.mjs';
const current = JSON.parse(readFileSync(resolve(import.meta.dirname, '../contracts/system-backup/v12/verifier-contract.schema.json'), 'utf8'));
// Negative cases start from the known 35-ID fixture so a deliberate old-count
// counterfactual cannot hide which individual validation rule is exercised.
// The real current document is checked unchanged in the acceptance test below.
const clone = () => {
  const schema = structuredClone(current);
  schema['x-owner-check-registries'].D.control_plane_restore_validate.required_check_count = 35;
  return schema;
};
const control = schema => schema['x-owner-check-registries'].D.control_plane_restore_validate;
const ids = schema => schema.$defs.ControlExclusionCheck.allOf[1].properties.id;

test('finite verifier declarations cover all submitted A and D check registries', () => {
  const before = JSON.stringify(current);
  const result = validateVerifierCheckRegistries(current);
  assert.deepEqual(result.map(x => [x.owner, x.registry, x.required_check_count]), [
    ['A','users_backup_validate',8], ['A','ai_gateway_backup_validate',12],
    ['A','users_restore_validate',11], ['A','ai_gateway_restore_validate',14],
    ['D','resources_backup_validate',12], ['D','control_plane_restore_validate',35],
  ]);
  assert.equal(JSON.stringify(current), before);
  assert.equal(current['x-owner-check-registries'].B.status, 'pending_owner_submission');
  assert.equal(current['x-owner-check-registries'].C.status, 'pending_owner_submission');
});
for (const count of [31,34,36,0,-1,1.5,'35',null,Number.MAX_SAFE_INTEGER+1]) {
  test('verifier cardinality rejects invalid or stale count ' + JSON.stringify(count), () => {
    const s=clone(); control(s).required_check_count=count;
    assert.throws(()=>validateVerifierCheckRegistries(s), /verifier registry D.control_plane_restore_validate/);
  });
}
for (const [name, change, expected] of [
  ['missing owner registries', s=>delete s['x-owner-check-registries'], /registries are missing/],
  ['invalid owner', s=>s['x-owner-check-registries'].D=null, /invalid verifier owner/],
  ['missing declaration count', s=>delete control(s).required_check_count, /positive check count/],
  ['missing schema', s=>delete s.$defs.ControlExclusionCheck, /finite owner ID schema/],
  ['external schema reference', s=>control(s).check_schema='other.json#/$defs/Check', /local check schema/],
  ['missing schema reference', s=>delete control(s).check_schema, /local check schema/],
  ['open base schema', s=>s.$defs.ControlExclusionCheck.allOf[0].$ref='#/$defs/Other', /finite owner ID schema/],
  ['duplicate ID', s=>ids(s).enum[1]=ids(s).enum[0], /duplicate check IDs/],
  ['empty ID list', s=>ids(s).enum=[], /invalid finite check IDs/],
  ['missing ID constraint', s=>delete s.$defs.ControlExclusionCheck.allOf[1].properties.id, /closed const\/enum/],
  ['open ID pattern', s=>s.$defs.ControlExclusionCheck.allOf[1].properties.id={pattern:'.*'}, /closed const\/enum/],
  ['mixed ID constraint', s=>ids(s).pattern='.*', /closed const\/enum/],
  ['invalid ID type', s=>ids(s).enum[0]=null, /invalid finite check IDs/],
  ['empty ID', s=>ids(s).enum[0]='', /invalid finite check IDs/],
  ['invalid ID syntax', s=>ids(s).enum[0]='not a check', /invalid finite check IDs/],
  ['mixed branch', s=>s.$defs.ControlExclusionCheck.allOf[1].not={}, /unmixed finite ID branch/],
  ['mixed union', s=>s.$defs.ResourcesBackupCheck.allOf[1].not={}, /unmixed finite ID union/],
  ['empty branches', s=>s.$defs.ResourcesBackupCheck.allOf[1].oneOf=[], /nonempty finite ID branches/],
  ['duplicate across branches', s=>s.$defs.ResourcesBackupCheck.allOf[1].oneOf[0].properties.id.enum[0]='resources.audit_cutoff', /duplicate check IDs/],
  ['other owner count drift', s=>s['x-owner-check-registries'].A.users_restore_validate.required_check_count=10, /verifier registry A.users_restore_validate/],
  ['new uncounted declaration', s=>s['x-owner-check-registries'].D.other_validate={}, /positive check count/],
]) {
  test('verifier declaration rejects ' + name, () => {
    const s=clone(); change(s); assert.throws(()=>validateVerifierCheckRegistries(s),expected);
  });
}
test('finite verifier declarations accept const-only schemas and pending owners', () => {
  const s=clone(); s.$defs.ControlExclusionCheck.allOf[1].properties.id={const:'control_plane.empty.synthetic'};
  control(s).required_check_count=1;
  assert.equal(validateVerifierCheckRegistries(s).find(x=>x.registry==='control_plane_restore_validate').required_check_count,1);
});
