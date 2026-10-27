import copy
import importlib.util
import json
from pathlib import Path
import types
import unittest

spec = importlib.util.spec_from_file_location('d_live_probe', Path(__file__).with_name('system-backup-d-live-discovery.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.expected = dict(image='test.invalid/image@sha256:'+'a'*64, catalog_sha256='b'*64,
                             migrations=['001_test.sql'], d_tables=['system_backup_configs'])
        self.pod = dict(metadata=dict(name='mysql-test', uid='pod-uid'),
                        spec=dict(nodeName='node1', containers=[dict(name='mysql', env=[dict(name='PASSWORD', value='DO-NOT-LEAK')], volumeMounts=[dict(name='data', mountPath='/var/lib/mysql')])], volumes=[dict(name='data', persistentVolumeClaim=dict(claimName='mysql-data'))]),
                        status=dict(phase='Running', containerStatuses=[dict(name='mysql', containerID='containerd://test', restartCount=0)]))
        self.namespace_uid = 'namespace-uid'
        self.identity = dict(server_uuid='11111111-2222-3333-4444-555555555555', database='clawmanager', data_directory='/var/lib/mysql/', version='8.4.8', utc_now='2026-09-29T00:00:00Z')
        self.calls = []
        self.fail_stage = None
        self.restarted = False
        self.claims = []

    def run_fake(self, command, **kwargs):
        self.assertEqual(command[0], 'kubectl')
        self.assertTrue('get' in command or 'exec' in command)
        self.calls.append((command, kwargs.get('input')))
        if 'get' in command:
            i = command.index('get')
            kind = command[i+1]
            if kind == self.fail_stage:
                return types.SimpleNamespace(returncode=1, stdout='', stderr='DO-NOT-LEAK')
            if kind == 'namespace':
                output = dict(metadata=dict(uid=self.namespace_uid))
            elif kind == 'pods':
                output = dict(items=[self.pod] if 'app=mysql' in command else [])
            elif kind == 'pod':
                output = copy.deepcopy(self.pod)
                if self.restarted:
                    output['status']['containerStatuses'][0]['restartCount'] += 1
            elif kind == 'pvc':
                output = dict(items=self.claims)
            elif kind == 'pv':
                output = dict(spec=dict(nfs=dict(server='example.invalid'), claimRef=dict(uid='rwx-uid')))
            else:
                self.fail('unexpected resource')
            text = json.dumps(output)
        else:
            sql = kwargs.get('input') or ''
            if sql.startswith('SELECT JSON_OBJECT'):
                text = json.dumps(self.identity)
            elif sql.startswith('SELECT filename'):
                if self.fail_stage == 'ledger':
                    return types.SimpleNamespace(returncode=1, stdout='', stderr='DO-NOT-LEAK')
                text = '001_test.sql\n'
            elif sql.startswith('SELECT TABLE_NAME FROM'):
                text = 'system_backup_configs\n'
            elif sql.startswith('SELECT TABLE_NAME,COLUMN_NAME'):
                text = 'system_backup_configs\tid\t1\tint\tNO\thash\n'
            elif 'stat' in command:
                text = '999:999:600\n'
            else:
                self.fail('unexpected exec')
        return types.SimpleNamespace(returncode=0, stdout=text, stderr='')

    def check_probe(self):
        return probe.discover(self.expected, 'context', 'namespace', 'namespace-uid', self.run_fake)

    def test_missing_real_inputs_remain_blocked_with_observed_identity(self):
        report = self.check_probe()
        self.assertEqual(report['database']['server_uuid'], self.identity['server_uuid'])
        self.assertEqual(report['mysql']['auto_cnf_metadata']['uid'], 999)
        self.assertEqual(report['status'], 'BLOCKED')
        for blocker in ['current_catalog_fresh_schema_reference_required', 'rwx_storage_candidate_exists', 'collector_pod_exists']:
            self.assertIn(blocker, report['blockers'])
        self.assertNotIn('DO-NOT-LEAK', json.dumps(report))
        self.assertFalse(report['database_mutated'])
        self.assertFalse(report['collector_admitted'])

    def test_wrong_or_unreadable_namespace_stops_all_dependent_calls(self):
        for failure in ['changed', 'unreadable']:
            self.calls.clear()
            self.namespace_uid = 'wrong' if failure == 'changed' else 'namespace-uid'
            self.fail_stage = 'namespace' if failure == 'unreadable' else None
            self.assertEqual(self.check_probe()['status'], 'BLOCKED')
            self.assertEqual(len(self.calls), 1)

    def test_wrong_database_stops_schema_and_storage(self):
        self.identity['database'] = 'other'
        self.assertIn('database_identity_well_formed', self.check_probe()['blockers'])
        self.assertFalse(any('pvc' in args or (sql or '').startswith('SELECT filename') for args, sql in self.calls))

    def test_ledger_failure_keeps_independent_storage_discovery(self):
        self.fail_stage = 'ledger'
        report = self.check_probe()
        self.assertIn('migration_ledger_failed_or_invalid', report['blockers'])
        self.assertIn('storage', report)
        self.assertNotIn('DO-NOT-LEAK', json.dumps(report))

    def test_extra_migration_or_restarted_mysql_is_blocked(self):
        self.expected['migrations'] = []
        self.restarted = True
        report = self.check_probe()
        self.assertIn('migration_filenames_match', report['blockers'])
        self.assertIn('mysql_process_stable', report['blockers'])

    def test_rwx_candidate_is_not_automatically_selected_or_approved(self):
        self.claims = [dict(metadata=dict(name='shared-rwx', uid='rwx-uid'), spec=dict(accessModes=['ReadWriteMany'], volumeName='rwx-pv'), status=dict(phase='Bound'))]
        report = self.check_probe()
        self.assertEqual(report['rwx_report_candidates'], ['shared-rwx'])
        self.assertIn('dedicated_report_pvc_selection_and_permissions_required', report['blockers'])
        self.assertFalse(report['collector_admitted'])


if __name__ == '__main__':
    unittest.main()
