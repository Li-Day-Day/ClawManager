import importlib.util
import json
from pathlib import Path
import types
import unittest

spec = importlib.util.spec_from_file_location('baseline', Path(__file__).with_name('system-backup-d-fresh-baseline.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class BaselineTests(unittest.TestCase):
    def setUp(self):
        self.ns = 'sbk-mig-260929120000-abcd'
        self.uid = 'a'*8+'-aaaa-aaaa-aaaa-'+'a'*12
        self.app_image = 'test.invalid/app@sha256:'+'a'*64
        self.mysql_image = 'test.invalid/mysql@sha256:'+'b'*64
        self.expected = probe.inputs()
        self.calls = []
        self.bad_uid = False
        self.business_volume = False
        self.bad_catalog = False
        self.drift = False
        self.captures = 0

    def fake(self, args, **kwargs):
        self.calls.append(args)
        self.assertEqual(args[4], self.ns)
        op = args[5]
        if op == 'get':
            kind, name = args[6:8]
            metadata = dict(uid=self.uid, labels={'clawmanager.io/test-run': self.ns.removeprefix('sbk-mig-')})
            if kind == 'namespace':
                if self.bad_uid:
                    metadata['uid'] = 'wrong'
                out = dict(metadata=metadata)
            else:
                out = dict(metadata=metadata, spec=dict(containers=[dict(image=self.app_image if name == 'migration-app' else self.mysql_image)],
                    volumes=[dict(name='mysql-data', **({'persistentVolumeClaim': {}} if self.business_volume else {'emptyDir': {}}))]))
            output = json.dumps(out)
        elif op == 'delete':
            self.assertEqual(args[6:8], ['pod', 'migration-app'])
            output = ''
        elif '--catalog-only' in args:
            output = json.dumps(dict(sha256='wrong' if self.bad_catalog else self.expected['catalog_sha256'], filenames=self.expected['filenames'], file_count=len(self.expected['filenames'])))
        else:
            query = kwargs['input']
            if query == 'SELECT @@server_uuid, VERSION(), DATABASE(), @@sql_mode;':
                output = self.uid+'\t8.4.8\tclawmanager\tSTRICT_TRANS_TABLES\n'
            elif query == 'SELECT @@server_uuid;':
                output = self.uid+'\n'
            elif query.startswith('SELECT filename'):
                output = '\n'.join(self.expected['filenames'])+'\n'
            else:
                self.captures += 1
                output = 'fixture-metadata\n' + ('drift\n' if self.drift and self.captures > 1 else '')
        return types.SimpleNamespace(returncode=0, stdout=output, stderr='PRIVATE')

    def call(self):
        return probe.capture('test', self.ns, self.uid, self.app_image, self.mysql_image, self.fake)

    def test_success_stops_only_owned_writer_and_preserves_candidate_status(self):
        result = self.call()
        self.assertEqual(result['status'], 'candidate_not_approved')
        self.assertTrue(result['repeated_capture_matched'])
        self.assertEqual(result['records_sha256'], probe.digest(result['records'].encode()))
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_wrong_namespace_rejected_before_any_pod_action(self):
        self.bad_uid = True
        with self.assertRaises(ValueError):
            self.call()
        self.assertEqual(len(self.calls), 1)

    def test_business_volume_rejected_before_delete(self):
        self.business_volume = True
        with self.assertRaises(ValueError):
            self.call()
        self.assertFalse(any('delete' in call for call in self.calls))

    def test_embedded_catalog_mismatch_rejected_before_delete(self):
        self.bad_catalog = True
        with self.assertRaises(ValueError):
            self.call()
        self.assertFalse(any('delete' in call for call in self.calls))

    def test_schema_drift_rejected(self):
        self.drift = True
        with self.assertRaisesRegex(ValueError, 'schema changed'):
            self.call()

    def test_installed_namespace_rejected_without_commands(self):
        self.ns = 'clawmanager-zhanghui08-system'
        with self.assertRaisesRegex(ValueError, 'not an isolated run'):
            self.call()
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
