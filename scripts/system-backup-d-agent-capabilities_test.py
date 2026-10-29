import copy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('agent_probe', Path(__file__).with_name('system-backup-d-agent-capabilities.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def resource(kind, name, owner_kind=None, owner_uid=None):
    obj = dict(kind=kind, metadata=dict(name=name, namespace='test', uid=name + '-uid'), spec={})
    if owner_kind:
        obj['metadata']['ownerReferences'] = [dict(kind=owner_kind, uid=owner_uid, controller=True)]
    return obj


class AgentProbeTests(unittest.TestCase):
    def setUp(self):
        self.args = SimpleNamespace(context='test-context', namespace='test')
        self.deployments, self.rs, self.pods = [], [], []
        for name in ('clawmanager-app', 'openclaw-runtime'):
            dep = resource('Deployment', name)
            rs = resource('ReplicaSet', name + '-rs', 'Deployment', dep['metadata']['uid'])
            pod = resource('Pod', name + '-pod', 'ReplicaSet', rs['metadata']['uid'])
            pod['status'] = dict(phase='Running', podIP='10.1.2.3')
            pod['spec']['containers'] = [dict(name='runtime', env=[dict(name='RUNTIME_AGENT_PUBLIC_PORT', value='8080')])]
            self.deployments.append(dep)
            self.rs.append(rs)
            self.pods.append(pod)
        self.token = 'REMOTE-ONLY-SECRET'
        self.fault = ''
        self.requests = []
        self.calls = []

    def command(self, command, **kwargs):
        self.calls.append(command)
        self.assertIn('-n', command)
        self.assertEqual(command[command.index('-n') + 1], 'test')
        self.assertNotIn('--all-namespaces', command)
        self.assertNotIn(self.token, ' '.join(command))
        if 'exec' in command:
            self.assertIn('printf %s', command[-1])
            return SimpleNamespace(returncode=0, stdout=self.token)
        self.assertIn('get', command)
        kind = command[command.index('get') + 1]
        data = dict(deployments=self.deployments, replicasets=self.rs, pods=self.pods)
        if kind == 'pod':
            result = copy.deepcopy(self.pods[-1])
            if self.fault == 'replacement':
                result['metadata']['uid'] = 'replacement'
        else:
            result = dict(items=data[kind])
        return SimpleNamespace(returncode=0, stdout=json.dumps(result))

    def request(self, url, token):
        self.requests.append(url)
        self.assertEqual(token, self.token)
        if self.fault == '404':
            return 404, None
        if self.fault == 'exception':
            raise RuntimeError(self.token)
        return 200, dict(protocol=1, pod_uid='openclaw-runtime-pod-uid', agent_epoch='a' * 32,
                         graceful_stop=True, expected_pid_guard=True,
                         confirmation_scope=self.token if self.fault == 'body' else 'process_group',
                         unexpected_secret=self.token)

    def collect(self):
        return probe.collect(self.args, self.command, self.request)

    def test_auth_stays_remote_and_only_capability_metadata_leaves(self):
        result = self.collect()
        self.assertEqual(result['status'], 'observed')
        self.assertFalse(result['mutation_sent'])
        self.assertFalse(result['backup_ready'])
        self.assertTrue(result['runtimes'][0]['pod_uid_matches'])
        self.assertEqual(self.requests, ['http://10.1.2.3:8080/v1/stop-capabilities'])
        self.assertNotIn(self.token, json.dumps(result))

    def test_missing_protocol_never_falls_back_to_stop_or_delete(self):
        for fault in ('404', 'exception'):
            self.fault = fault
            result = self.collect()
            self.assertEqual(result['status'], 'incomplete')
            self.assertNotIn(self.token, json.dumps(result))
            self.assertFalse(result['backup_ready'])

    def test_unknown_response_scope_is_redacted(self):
        self.fault = 'body'
        result = self.collect()
        self.assertEqual(result['runtimes'][0]['confirmation_scope'], 'unknown')
        self.assertNotIn(self.token, json.dumps(result))

    def test_changed_pod_identity_is_visible(self):
        self.fault = 'replacement'
        self.assertFalse(self.collect()['runtimes'][0]['pod_identity_stable'])

    def test_no_name_only_owner_adoption(self):
        self.rs[-1]['metadata']['ownerReferences'][0]['uid'] = 'old-deployment'
        result = self.collect()
        self.assertEqual(result['status'], 'incomplete')
        self.assertEqual(self.requests, [])

    def test_endpoint_rejects_non_ip_and_missing_explicit_port(self):
        pod = self.pods[-1]
        for ip, port in [('attacker.invalid', '8080'), ('10.1.2.3', '0'), ('10.1.2.3', '8080/path')]:
            pod['status']['podIP'] = ip
            pod['spec']['containers'][0]['env'][0]['value'] = port
            with self.assertRaises(ValueError):
                probe.endpoint(pod)

    def test_no_auth_redirect(self):
        self.assertIsNone(probe.NoRedirect().redirect_request(None, None, 302, '', {}, 'http://outside.invalid'))


if __name__ == '__main__':
    unittest.main()
