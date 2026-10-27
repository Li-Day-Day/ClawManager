import importlib.util
import json
from pathlib import Path
import types
import unittest

spec = importlib.util.spec_from_file_location('upgrade_review', Path(__file__).with_name('system-backup-d-upgrade-review.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class UpgradeReviewTests(unittest.TestCase):
    def setUp(self):
        self.expected = dict(image='test.invalid/image', catalog_sha256='a'*64,
                             migrations=['001.sql', '080_add_system_backup_registration_runtime.sql'],
                             upgrade_target=dict(mysql=dict(pod='mysql-test', pod_uid='pod-uid', node='node-test', container='mysql', data_pvc='mysql-data'),
                                                 database=dict(server_uuid='test-server', database='clawmanager')))
        self.identity = dict(self.expected['upgrade_target']['database'])
        self.calls = []
        self.unsigned = False
        self.gates = '0'
        self.partial = ''
        self.bad_ns = False
        self.failure = None
        self.pod_reads = 0
        self.restart = False

    def fake(self, args, **kwargs):
        self.calls.append((args, kwargs.get('input')))
        self.assertEqual(args[0], 'kubectl')
        if 'get' in args:
            kind = args[args.index('get')+1]
            if kind == self.failure:
                return types.SimpleNamespace(returncode=1, stdout='', stderr='SECRET-NOT-FOR-OUTPUT')
            if kind == 'namespace':
                value = dict(metadata=dict(uid='wrong' if self.bad_ns else 'namespace-uid'))
            elif kind == 'pod':
                self.pod_reads += 1
                value = dict(metadata=dict(uid='pod-uid'), spec=dict(nodeName='node-test'), status=dict(containerStatuses=[dict(name='mysql',containerID='test://mysql',restartCount=int(self.restart and self.pod_reads > 1))]))
            elif kind == 'node':
                value = dict(metadata=dict(name='node-test', uid='node-uid', labels={'kubernetes.io/hostname': 'verified-hostname'}),spec=dict(taints=[dict(key='node-role.kubernetes.io/control-plane',effect='NoSchedule')]))
            elif kind == 'storageclasses':
                value = dict(items=[dict(metadata=dict(name='local-test'),provisioner='kubernetes.io/no-provisioner',volumeBindingMode='WaitForFirstConsumer')])
            elif kind == 'pvc':
                value = dict(metadata=dict(name='mysql-data',uid='pvc-uid'),spec=dict(volumeName='mysql-pv'))
            elif kind == 'pv':
                value = dict(metadata=dict(name='mysql-pv',uid='pv-uid'),spec=dict(hostPath=dict(path='/actual/mysql'),claimRef=dict(uid='pvc-uid')))
            else:
                self.fail('unexpected get')
            raw = json.dumps(value)
        else:
            self.assertIn('exec', args)
            sql = kwargs.get('input')
            self.assertTrue(sql.startswith('SELECT '))
            if "'server_uuid'" in sql:
                raw = json.dumps(self.identity)
            elif sql.startswith('SELECT filename'):
                raw = '001.sql\n045_old.sql\n'
            elif sql.startswith('SELECT TABLE_NAME'):
                raw = self.partial
            elif "'single_primary_id'" in sql:
                raw = json.dumps(dict(engine='InnoDB',id_type='int unsigned' if self.unsigned else 'int',id_nullable='NO',single_primary_id=1))
            elif sql.startswith('SELECT COUNT(*) FROM system_maintenance_locks'):
                raw = self.gates
            else:
                self.fail('unexpected SQL')
        return types.SimpleNamespace(returncode=0,stdout=raw,stderr='')

    def call(self):
        return probe.review(self.expected,'test-context','namespace','namespace-uid',self.fake)

    def test_reads_prerequisites_but_never_authorizes_upgrade(self):
        r = self.call()
        self.assertEqual(r['users_fk_metadata']['id_type'],'int')
        self.assertEqual(r['node']['hostname_label'],'verified-hostname')
        self.assertEqual(r['mysql_volume']['host_path'],'/actual/mysql')
        self.assertIn('ledger_has_no_unknown_files',r['blockers'])
        self.assertEqual(r['status'],'BLOCKED')
        self.assertFalse(r['migration_authorized'])
        self.assertFalse(r['database_mutated'])
        self.assertFalse(r['capture_lock_acquired'])

    def test_namespace_or_database_mismatch_stops_before_schema_reads(self):
        for where in ['namespace','database']:
            self.calls.clear()
            self.bad_ns = where == 'namespace'
            self.identity['server_uuid'] = 'wrong' if where == 'database' else 'test-server'
            self.assertEqual(self.call()['status'],'BLOCKED')
            self.assertFalse(any(sql and sql.startswith('SELECT filename') for _,sql in self.calls))

    def test_unsigned_fk_partial_ddl_and_active_gate_fail(self):
        self.unsigned=True;self.gates='1';self.partial='system_backup_admin_sessions\n'
        r=self.call()
        for name in ['users_id_matches_080_signed_int_fk','080_clean_first_apply_no_partial_tables','capture_gate_observed_idle']:
            self.assertIn(name,r['blockers'])

    def test_denied_topology_and_process_drift_are_reported_without_secrets(self):
        self.failure='node';self.restart=True
        r=self.call()
        self.assertIn('storage_topology_read_failed_or_invalid',r['blockers'])
        self.assertIn('mysql_process_stable',r['blockers'])
        self.assertNotIn('SECRET-NOT-FOR-OUTPUT',json.dumps(r))


if __name__=='__main__':
    unittest.main()
