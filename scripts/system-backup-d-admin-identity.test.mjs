import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAdminResult, candidateRBAC} from './system-backup-d-admin-identity.mjs';

function fixture() {
  const run = 'd-admin-' + 'a'.repeat(24), uuid = '12345678-1234-1234-1234-123456789abc';
  const now = Date.parse('2026-09-28T03:00:00Z');
  const context = {run, username:'admin', h:{namespace_uid:uuid}, runnerHash:'b'.repeat(64), now};
  const value = {kind:'d_admin_identity_readonly_v1', run_id:run, runner_sha256:context.runnerHash,
    namespace:'clawmanager-zhanghui08-system', namespace_uid:'337cfe30-2c17-4b8e-b32a-760778b8098e',
    target_installation_id:'installation_sbk_provider_zh_7474d6e0b052', provider_namespace_uid:uuid,
    mysql_pod:{name:'mysql-abc-123', uid:uuid, container:'mysql', deployment_uid:uuid},
    snapshot:{database:'clawmanager', server_uuid:uuid, observed_at:'2026-09-28T03:00:00.000000Z',
      users:[{id:42, username:'admin', role:'admin', is_active:1, auth_provider:'local'}],
      config_rows:0, active_installations:0, target_installations:0, target_active_config_version:null, runtime_table_count:0},
    remote_mutations:false, credentials_exported:false, active_config_updated:false};
  return {value, context};
}

test('candidate binds actual ID 42, not assumed ID 1', () => {
  const f = fixture();
  validateAdminResult(f.value, f.context);
  assert.deepEqual(candidateRBAC(f.value).bindings, [{actor_id:'42', subject:'user:42', role:'security_admin'}]);
});
for (const name of ['disabled', 'non-admin', 'ldap', 'ambiguous', 'wrong-name', 'stale', 'other-database',
  'changed-source', 'secret-column', 'wrong-namespace', 'unsafe-user-id', 'invalid-config-state']) {
  test('reject ' + name, () => {
    const f = fixture(), v = f.value, u = v.snapshot.users[0];
    switch (name) {
      case 'disabled': u.is_active = 0; break;
      case 'non-admin': u.role = 'user'; break;
      case 'ldap': u.auth_provider = 'ldap'; break;
      case 'ambiguous': v.snapshot.users.push({...u}); break;
      case 'wrong-name': u.username = 'zhanghui08'; break;
      case 'stale': v.snapshot.observed_at = '2026-09-27T03:00:00.000000Z'; break;
      case 'other-database': v.snapshot.database = 'other'; break;
      case 'changed-source': v.runner_sha256 = 'c'.repeat(64); break;
      case 'secret-column': u.password_hash = 'must-not-be-exported'; break;
      case 'wrong-namespace': v.namespace_uid = f.context.h.namespace_uid; break;
      case 'unsafe-user-id': u.id = 2147483648; break;
      case 'invalid-config-state': v.snapshot.target_active_config_version = 1; break;
    }
    assert.throws(() => validateAdminResult(v, f.context));
  });
}
