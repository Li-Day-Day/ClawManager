import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {join, resolve, sep} from 'node:path';
import {auditActivationInputs, defaultBundle, root} from './system-backup-d-activation-inputs.mjs';

test('current public inputs fail closed with precise missing registries and refs', () => {
  const r = auditActivationInputs();
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.integrity_checked_registry_kinds.length, 3);
  assert.equal(r.missing_registry_kinds.length, 6);
  assert.equal(r.missing_config_reference_purposes.length, 20);
  assert.equal(r.unresolved_live_reference_purposes.length, 20);
  assert.equal(r.full_config_file_present, false);
  assert.ok(r.missing_contracts.includes('status_relay'));
  assert.ok(Object.values(r.state).every(v => v === false));
});

for (const fault of ['hash', 'duplicate_registry', 'volume', 'mutable', 'schema_drift', 'self_approval']) {
  test(`public input ${fault} cannot bypass admission`, () => {
    const dir = mkdtempSync(join(root, '.tmp-d-activation-inputs-'));
    try {
      cpSync(defaultBundle, dir, {recursive:true});
      const name = fault === 'hash' || fault === 'mutable' ? 'public-registries.configmap.json' : fault === 'volume' ? 'registry-volume.json' : 'bootstrap-admission.json';
      const path = join(dir,name), value = JSON.parse(readFileSync(path));
      if (fault === 'hash') value.data[Object.keys(value.data)[0]] += '\n';
      if (fault === 'duplicate_registry') value.registries.push(value.registries[0]);
      if (fault === 'volume') value.configMap.items[0].path = '../../escape';
      if (fault === 'mutable') value.immutable = false;
      if (fault === 'schema_drift') value.config_schema_sha256 = '0'.repeat(64);
      if (fault === 'self_approval') value.admission.ready_for_activation = true;
      writeFileSync(path, JSON.stringify(value));
      if (fault === 'self_approval') assert.equal(auditActivationInputs(dir).status, 'BLOCKED');
      else assert.throws(() => auditActivationInputs(dir));
    } finally {
      assert.ok(resolve(dir).startsWith(resolve(root)+sep) && dir.includes('.tmp-d-activation-inputs-'));
      rmSync(dir, {recursive:true, force:true});
    }
  });
}
