import importlib.util
import json
import pathlib
import subprocess
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('field_inventory', pathlib.Path(__file__).with_name('system-backup-a-field-inventory.py'))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
NS_UID = '337cfe30-2c17-4b8e-b32a-760778b8098e'
SECRET = 'private-value-must-never-be-exported'


def meta(name, uid):
    return dict(name=name, uid=uid, resourceVersion='42', annotations={'private': SECRET}, labels={'private': SECRET})


def objects():
    return {
        'namespace': {'metadata': meta('ns', NS_UID)},
        'pods': {'items': [{'metadata': meta('pod', 'pod-uid'), 'spec': {
            'nodeName': 'node', 'containers': [{'name': 'runtime', 'image': 'image@sha256:' + 'a'*64,
                'args': ['--private=' + SECRET], 'env': [
                    {'name': 'SYSTEM_BACKUP_DOWNLOAD_DSN_FILE', 'value': SECRET},
                    {'name': 'SYSTEM_BACKUP_REGISTRATION_DSN_FILE', 'valueFrom': {'secretKeyRef': {'name': 'existing', 'key': 'dsn'}}},
                    {'name': 'PASSWORD', 'value': SECRET}],
                'volumeMounts': [{'name': 'journal', 'mountPath': '/run/system-backup/download-journal'}]}],
            'volumes': [{'name': 'journal', 'persistentVolumeClaim': {'claimName': 'journal'}},
                        {'name': 'credentials', 'secret': {'secretName': 'existing'}}]},
            'status': {'phase': 'Running', 'containerStatuses': [{'name': 'runtime', 'ready': True,
                'imageID': 'runtime-specific-image-id', 'containerID': 'container-id', 'restartCount': 0}]}}]},
        'pvc': {'items': [{'metadata': meta('journal', 'pvc-uid'), 'spec': {'volumeName': 'pv', 'accessModes': ['ReadWriteOncePod']},
                          'status': {'phase': 'Bound', 'capacity': {'storage': '1Gi'}}}]},
        'pv': {'metadata': meta('pv', 'pv-uid'), 'spec': {'claimRef': {'uid': 'pvc-uid', 'name': 'journal', 'namespace': 'ns'},
                    'csi': {'volumeHandle': SECRET}}},
    }


class Fake(M.Inventory):
    def __init__(self):
        super().__init__('ctx', 'ns', NS_UID)
        self.data, self.calls = objects(), []

    def get(self, kind, name=None):
        self.calls.append((kind, name))
        return self.data[kind]


class Tests(unittest.TestCase):
    def test_public_allowlist_withholds_values_args_annotations_and_backends(self):
        probe = Fake()
        out = probe.collect()
        self.assertNotIn(SECRET, json.dumps(out))
        self.assertEqual(out['candidate_roles_with_dsn_variable_names'], ['collector', 'download', 'registration'])
        self.assertEqual(out['claims'][0]['pv']['uid'], 'pv-uid')
        self.assertEqual(out['pods'][0]['containers'][0]['observed_image_id'], 'runtime-specific-image-id')
        self.assertFalse(out['production_approved'])
        self.assertFalse(out['snapshot_atomic'])
        self.assertEqual([k for k, n in probe.calls], ['namespace', 'pods', 'pvc', 'pv', 'namespace'])

    def test_missing_runtime_is_reported_without_inventing_references(self):
        probe = Fake()
        probe.data['pods']['items'] = []
        out = probe.collect()
        self.assertEqual(out['missing_candidate_roles'], ['registration', 'download', 'collector'])
        self.assertEqual(out['pods'], [])

    def test_namespace_replacement_stops_before_pod_read(self):
        probe = Fake()
        probe.data['namespace']['metadata']['uid'] = 'replaced'
        with self.assertRaises(ValueError):
            probe.collect()
        self.assertEqual(probe.calls, [('namespace', 'ns')])

    def test_pv_claim_identity_mismatch_is_rejected(self):
        probe = Fake()
        probe.data['pv']['spec']['claimRef']['uid'] = 'other'
        with self.assertRaises(ValueError):
            probe.collect()

    def test_denied_pv_metadata_is_preserved_as_a_blocker(self):
        probe = Fake()
        original = probe.get
        def denied(kind, name=None):
            if kind == 'pv':
                raise OSError(SECRET)
            return original(kind, name)
        probe.get = denied
        out = probe.collect()
        self.assertEqual(out['blockers'], ['bound_pv_reference_unavailable:journal'])
        self.assertIsNone(out['claims'][0]['pv'])
        self.assertNotIn(SECRET, json.dumps(out))

    def test_get_command_pins_context_and_only_allows_get_metadata(self):
        probe = M.Inventory('ctx', 'ns', NS_UID)
        with patch.object(M.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'{"items":[]}', b'')) as run:
            probe.get('pods')
            args, kwargs = run.call_args
            self.assertEqual(args[0], ['kubectl', '--context', 'ctx', '--request-timeout=20s', '-n', 'ns', 'get', 'pods', '-o', 'json'])
            self.assertEqual(kwargs['stderr'], subprocess.DEVNULL)
            self.assertEqual(kwargs['timeout'], 40)
            with self.assertRaises(ValueError):
                probe.get('secret')
            with self.assertRaises(ValueError):
                probe.get('pods', 'bad;command')
            self.assertEqual(run.call_count, 1)

    def test_invalid_context_and_namespace_cannot_enter_command(self):
        for args in [('ctx;bad', 'ns', NS_UID), ('ctx', '../ns', NS_UID), ('ctx', 'ns', 'wrong')]:
            with self.assertRaises(ValueError):
                M.Inventory(*args)

    def test_native_failure_is_not_returned_as_public_metadata(self):
        probe = M.Inventory('ctx', 'ns', NS_UID)
        with patch.object(M.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, SECRET.encode(), b'')):
            with self.assertRaisesRegex(ValueError, '^public_inventory_rejected$'):
                probe.get('pods')


if __name__ == '__main__':
    unittest.main()
