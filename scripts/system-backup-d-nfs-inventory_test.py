import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest


spec = importlib.util.spec_from_file_location('nfs_inventory', Path(__file__).with_name('system-backup-d-nfs-inventory.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def obj(kind, ns, name, spec):
    return dict(kind=kind, metadata=dict(namespace=ns, name=name, uid=name + '-uid'), spec=spec)


def mounted(kind, ns, name, source, container_kind='containers'):
    pod = dict(volumes=[dict(name='data', **source)], **{container_kind: [
        dict(name='app', env=[dict(name='PASSWORD', value='DO-NOT-LEAK')],
             command=['DO-NOT-LEAK'], volumeMounts=[dict(name='data', mountPath='/workspaces')])
    ]})
    body = pod if kind == 'Pod' else dict(template=dict(spec=pod))
    if kind == 'CronJob':
        body = dict(jobTemplate=dict(spec=body))
    return obj(kind, ns, name, body)


class NFSInventoryTests(unittest.TestCase):
    def setUp(self):
        service = obj('Service', 'other', 'workspace-store', dict(clusterIP='10.0.0.1', clusterIPs=['10.0.0.1']))
        endpoint = obj('EndpointSlice', 'other', 'slice', {})
        endpoint['metadata']['labels'] = {'kubernetes.io/service-name': 'workspace-store'}
        endpoint['endpoints'] = [dict(addresses=['10.2.0.1'], conditions=dict(ready=True),
                                     targetRef=dict(kind='Pod', namespace='other', name='exporter', uid='exporter-uid'))]
        self.data = dict(services=[service], endpoints=[endpoint], claims=[], volumes=[], workloads=[], pods=[
            mounted('Pod', 'test', 'runtime', dict(nfs=dict(server='10.0.0.1', path='/'))),
            mounted('Pod', 'other', 'other-runtime', dict(nfs=dict(server='workspace-store.other.svc.cluster.local', path='/teams'))),
            mounted('Pod', 'other', 'exporter', dict(hostPath=dict(path='/real-nfs-data'))),
            mounted('Pod', 'test', 'unrelated', dict(nfs=dict(server='10.0.0.2', path='/'))),
        ])

    def report(self):
        return probe.build_report(self.data, 'test', '10.0.0.1', '/')

    def test_cross_namespace_and_service_dns_are_included_without_secrets(self):
        report = self.report()
        self.assertEqual([c['workload']['name'] for c in report['mount_candidates']], ['runtime', 'other-runtime'])
        self.assertTrue(report['mount_candidates'][1]['outside_requested_namespace'])
        self.assertEqual(report['exporter_pods'][0]['mounts'][0]['storage']['path'], '/real-nfs-data')
        self.assertNotIn('DO-NOT-LEAK', json.dumps(report))
        self.assertFalse(report['ready_for_backup'])
        self.assertFalse(report['writer_coverage_proven'])

    def test_endpoint_ip_controller_init_and_ephemeral_mounts(self):
        for kind, container_kind in [('CronJob', 'initContainers'), ('Deployment', 'containers'), ('Pod', 'ephemeralContainers')]:
            item = mounted(kind, 'another', kind, dict(nfs=dict(server='10.2.0.1', path='/sub')), container_kind)
            self.data['pods' if kind == 'Pod' else 'workloads'].append(item)
        report = self.report()
        self.assertEqual(len(report['mount_candidates']), 5)
        self.assertEqual(report['mount_candidates'][-2]['mounts'][0]['container_kind'], 'initContainers')

    def add_pvc(self, backing):
        claim = obj('PersistentVolumeClaim', 'test', 'data', dict(volumeName='actual'))
        pv = obj('PersistentVolume', None, 'actual', dict(claimRef=dict(namespace='test', name='data', uid='data-uid'), **backing))
        self.data['claims'].append(claim)
        self.data['volumes'].append(pv)
        self.data['pods'].append(mounted('Pod', 'test', 'via-pvc', dict(persistentVolumeClaim=dict(claimName='data'))))

    def test_pvc_resolves_exact_bound_identity(self):
        self.add_pvc(dict(nfs=dict(server='10.0.0.1', path='/')))
        report = self.report()
        mount = report['mount_candidates'][-1]['mounts'][0]
        self.assertEqual(mount['storage']['pv']['uid'], 'actual-uid')
        self.data['volumes'][0]['spec']['claimRef']['uid'] = 'replaced-claim'
        report = self.report()
        self.assertEqual(len(report['mount_candidates']), 2)
        self.assertEqual(report['unresolved_mounts'][0]['mount']['storage']['kind'], 'unresolved-pvc')

    def test_hostpath_pvc_is_not_mistaken_for_direct_nfs(self):
        self.add_pvc(dict(hostPath=dict(path='/other-workspace')))
        self.assertEqual(len(self.report()['mount_candidates']), 2)

    def test_csi_is_explicitly_unresolved(self):
        self.add_pvc(dict(csi=dict(driver='nfs.csi.k8s.io', volumeAttributes={'secret-value': 'DO-NOT-LEAK'})))
        report = self.report()
        self.assertEqual(report['unresolved_mounts'][0]['mount']['storage']['driver'], 'nfs.csi.k8s.io')
        self.assertNotIn('DO-NOT-LEAK', json.dumps(report))

    def test_export_overlap_is_segment_aware(self):
        self.assertTrue(probe.overlaps('/data/user', '/data'))
        self.assertTrue(probe.overlaps('/data', '/data/user'))
        self.assertFalse(probe.overlaps('/data/user', '/data/user-2'))
        self.assertTrue(probe.overlaps('//data/./user', '/data/user/'))
        with self.assertRaises(ValueError):
            probe.overlaps('relative', '/')

    def test_readonly_and_dynamic_subpath_preserved(self):
        pod = self.data['pods'][0]
        pod['spec']['volumes'][0]['nfs']['readOnly'] = True
        pod['spec']['containers'][0]['volumeMounts'][0]['subPathExpr'] = '$(POD_NAME)'
        mount = self.report()['mount_candidates'][0]['mounts'][0]
        self.assertTrue(mount['read_only'])
        self.assertEqual(mount['sub_path_expr'], '$(POD_NAME)')

    def test_collect_only_gets_metadata_and_failure_is_not_empty_success(self):
        calls = []
        names = dict(services='services', pods='pods', persistentvolumeclaims='claims',
                     persistentvolumes='volumes', **{'endpointslices.discovery.k8s.io': 'endpoints',
                     'deployments,statefulsets,daemonsets,replicasets,replicationcontrollers,jobs,cronjobs': 'workloads'})
        args = SimpleNamespace(context='test-context', namespace='test', server='10.0.0.1', export='/', cluster_domain='cluster.local')
        def run(command, **kwargs):
            calls.append(command)
            self.assertEqual(command[3], 'get')
            resource = command[4]
            result = obj('Namespace', None, 'test', {}) if resource == 'namespace' else dict(items=self.data[names[resource]])
            return SimpleNamespace(returncode=0, stdout=json.dumps(result))
        self.assertEqual(probe.collect(args, run)['status'], 'observed')
        self.assertEqual(len(calls), 7)
        def denied(*unused, **kwargs):
            return SimpleNamespace(returncode=1, stdout='DO-NOT-LEAK', stderr='DO-NOT-LEAK')
        result = probe.collect(args, denied)
        self.assertEqual(result['status'], 'incomplete')
        self.assertNotIn('DO-NOT-LEAK', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
