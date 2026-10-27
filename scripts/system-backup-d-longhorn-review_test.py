import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('longhorn_review', Path(__file__).with_name('system-backup-d-longhorn-review.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class LonghornReviewTests(unittest.TestCase):
    def setUp(self):
        self.expected = dict(storage_target=dict(node=dict(name='node1', uid='node-uid')), mysql_target=dict(pod='mysql', pod_uid='pod-uid'))
        self.bad_ns = False
        self.csi = True
        self.manager = True
        self.ready = 1
        self.drift = False
        self.sc_reads = 0
        self.failure = None
        self.calls = []
        self.prepopulated = False
        self.dependency_failure = False

    def fake(self, args, **kwargs):
        self.calls.append(args)
        self.assertEqual(args[3], 'get')
        self.assertNotIn('input', kwargs)
        kind = args[4]
        name = args[5] if not args[5].startswith('-') else None
        if kind == self.failure:
            return types.SimpleNamespace(returncode=1, stdout='', stderr='SECRET-ERROR')
        cond = [dict(type='Ready', status='True', message='SECRET-MESSAGE')]
        if kind == 'namespace':
            obj = dict(metadata=dict(uid='wrong' if self.bad_ns else ('namespace-uid' if name == 'app' else 'lh-uid')))
        elif kind == 'node':
            obj = dict(metadata=dict(name='node1', uid='node-uid', labels={'kubernetes.io/hostname': 'node1'}), spec={}, status=dict(conditions=cond))
        elif kind == 'pod':
            obj = dict(metadata=dict(uid='pod-uid'), spec=dict(nodeName='node1'))
        elif kind == 'storageclass':
            self.sc_reads += 1
            obj = dict(metadata=dict(name='longhorn-rwx', uid='sc-uid', resourceVersion=str(2 if self.drift and self.sc_reads > 1 else 1)), provisioner='driver.longhorn.io', parameters=dict(numberOfReplicas='2', secret='SECRET-PARAM'))
            if self.prepopulated:
                obj['parameters'].update(migratable='true', fromBackup='SECRET-BACKUP-SOURCE')
        elif kind == 'csidriver':
            obj = dict(metadata=dict(uid='driver-uid'), spec={})
        elif kind == 'csinode':
            obj = dict(spec=dict(drivers=[dict(name='driver.longhorn.io')] if self.csi else []))
        elif kind == 'pods':
            obj = dict(items=[dict(metadata=dict(name='longhorn-manager-test', namespace='longhorn-system', uid='manager-uid'), spec=dict(nodeName='node1', containers=[dict(name='longhorn-manager', image='test.invalid/manager:v1', env=[dict(value='SECRET-ENV')])]), status=dict(phase='Running', conditions=cond))] if self.manager else [])
        elif kind in ['daemonsets', 'deployments']:
            obj = dict(items=[dict(metadata=dict(name='longhorn-csi-plugin' if kind == 'daemonsets' else 'csi-provisioner', generation=1), spec=dict(replicas=1), status=dict(desiredNumberScheduled=1, numberReady=self.ready, readyReplicas=self.ready, observedGeneration=1))])
        elif kind == 'nodes.longhorn.io':
            cond += [dict(type=t, status='True') for t in ['NFSClientInstalled', 'RequiredPackages', 'MountPropagation']]
            if not self.dependency_failure:
                cond += [dict(type=t, status='True') for t in ['Multipathd', 'KernelModulesLoaded']]
            obj = dict(metadata=dict(uid='lh-node-uid'), spec=dict(allowScheduling=True), status=dict(conditions=cond, diskStatus={}))
            if self.dependency_failure:
                obj['status']['conditions'] += [dict(type='Multipathd',status='False',reason='MultipathdIsRunning'),dict(type='KernelModulesLoaded',status='False',reason='KernelModulesNotLoaded')]
        elif kind == 'settings.longhorn.io':
            obj = dict(value='true' if name == 'v1-data-engine' else 'false' if name == 'v2-data-engine' else '2')
        else:
            self.fail('unexpected resource '+kind)
        return types.SimpleNamespace(returncode=0, stdout=json.dumps(obj), stderr='')

    def call(self):
        return probe.review(self.expected, 'test-context', 'app', 'namespace-uid', self.fake)

    def test_healthy_metadata_never_claims_mount_acceptance_or_leaks_unselected_fields(self):
        r = self.call()
        self.assertTrue(all(c['passed'] for c in r['checks']))
        self.assertEqual(r['status'], 'BLOCKED')
        self.assertFalse(r['storage_authorized'])
        self.assertFalse(r['client_dependencies_verified'])
        self.assertNotIn('SECRET', json.dumps(r))

    def test_wrong_namespace_stops_before_cluster_storage_reads(self):
        self.bad_ns = True
        self.call()
        self.assertEqual(len(self.calls), 1)

    def test_absent_csi_registration_is_not_ready(self):
        self.csi = False
        self.assertIn('target_node_csi_registered', self.call()['blockers'])

    def test_absent_manager_namespace_is_unknown(self):
        self.manager = False
        self.assertIn('longhorn_metadata_read_failed_or_invalid', self.call()['blockers'])

    def test_unready_workload_and_storage_class_drift_reject(self):
        self.ready = 0
        self.drift = True
        r = self.call()
        self.assertIn('storage_class_stable', r['blockers'])
        self.assertIn('daemonsets_longhorn-csi-plugin_ready', r['blockers'])

    def test_denied_read_retains_sanitized_failure_and_final_identity_checks(self):
        self.failure = 'csidriver'
        r = self.call()
        self.assertIn('storage_class_or_csi_read_failed', r['blockers'])
        self.assertIn('namespace_uid_stable', [c['name'] for c in r['checks']])
        self.assertNotIn('SECRET', json.dumps(r))

    def test_migratable_or_prepopulated_class_is_not_a_new_report_volume(self):
        self.prepopulated = True
        r = self.call()
        self.assertIn('rwx_class_not_migratable', r['blockers'])
        self.assertIn('rwx_class_not_prepopulated', r['blockers'])
        self.assertNotIn('SECRET', json.dumps(r))

    def test_ready_node_does_not_clear_dependency_condition_failures(self):
        self.dependency_failure = True
        r = self.call()
        self.assertIn('longhorn_dependency_Multipathd_requires_review', r['blockers'])
        self.assertIn('longhorn_dependency_KernelModulesLoaded_requires_review', r['blockers'])
        self.assertEqual(len(r['dependency_condition_findings']), 2)

    def test_only_known_kernel_message_is_retained(self):
        details = probe.dependency_details([dict(type='KernelModulesLoaded', status='False', message='Kernel modules [nvme_tcp dm_crypt] are not loaded')])
        self.assertEqual(details[0]['missing_modules'], ['dm_crypt', 'nvme_tcp'])
        for message in ['SECRET', 'Kernel modules [secret_module] are not loaded', 'Kernel modules [] are not loaded']:
            details = probe.dependency_details([dict(type='KernelModulesLoaded', message=message)])
            self.assertIsNone(details[0]['missing_modules'])
            self.assertNotIn('SECRET', json.dumps(details))

    def test_wrong_ssh_hostname_does_not_inspect_services(self):
        def fail(*args, **kwargs):
            self.fail('wrong host must not run commands')
        self.assertFalse(probe.host_diagnostics('node1', fail, hostname='node2')['hostname_matches'])

    def test_inactive_daemon_never_contacts_activation_socket(self):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return types.SimpleNamespace(returncode=3, stdout='inactive\n', stderr='SECRET')
        result = probe.host_diagnostics('node1', run, hostname='node1')
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(c[0] == 'systemctl' for c in calls))
        self.assertIsNone(result['multipathd_status_response_nonempty'])
        self.assertNotIn('SECRET', json.dumps(result))

    def test_active_daemon_output_is_reduced_to_boolean(self):
        def run(args, **kwargs):
            return types.SimpleNamespace(returncode=0, stdout='active\n' if args[0] == 'systemctl' else 'SECRET-MAPPING', stderr='SECRET')
        result = probe.host_diagnostics('node1', run, hostname='node1')
        self.assertTrue(result['multipathd_status_response_nonempty'])
        self.assertNotIn('SECRET', json.dumps(result))

    def test_effective_filters_keep_regex_but_redact_wwid(self):
        result = probe.multipath_filters('''defaults { user_friendly_names yes }
blacklist {
  devnode "^sd[a-z0-9]+"
  wwid "PRIVATE-WWID"
  device { vendor "PRIVATE-VENDOR" product "PRIVATE-PRODUCT" }
}
blacklist_exceptions { wwid "PRIVATE-EXCEPTION" }
''')
        self.assertEqual(result['sections']['blacklist']['devnode'], ['^sd[a-z0-9]+'])
        self.assertEqual(result['sections']['blacklist']['other_rule_count'], 2)
        self.assertEqual(result['sections']['blacklist_exceptions']['other_rule_count'], 1)
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertFalse(result['future_longhorn_exclusion_verified'])

    def test_invalid_or_oversized_effective_config_rejected(self):
        for config in ['blacklist { devnode "["', '} blacklist { }', 'x'*(2*1024*1024+1)]:
            with self.assertRaises(ValueError):
                probe.multipath_filters(config)

    def test_storage_details_do_not_contact_inactive_daemon_or_load_module(self):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return types.SimpleNamespace(returncode=0 if args[0] == 'modinfo' else 3, stdout='/PRIVATE/module.ko\n' if args[0] == 'modinfo' else 'inactive\n', stderr='PRIVATE')
        result = probe.host_storage_details(run)
        self.assertTrue(result['dm_crypt_module_file_available'])
        self.assertFalse(result['safe_to_stop_multipathd'])
        self.assertIsNone(result['effective_multipath_filters'])
        self.assertEqual([c[0] for c in calls], ['modinfo', 'systemctl'])
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_mknod_volume_uses_major_minor_instead_of_filename(self):
        info=types.SimpleNamespace(st_mode=probe.stat.S_IFBLK,st_rdev=12345)
        seen=[]
        def resolve(path,strict=False):
            seen.append((str(path).replace('\\','/'),strict))
            return Path('/sys/devices/example/block/sdc')
        with patch.object(probe.os,'major',return_value=8,create=True),patch.object(probe.os,'minor',return_value=32,create=True),patch.object(Path,'resolve',resolve):
            self.assertEqual(probe.kernel_block_path(info).name,'sdc')
        self.assertEqual(seen,[('/sys/dev/block/8:32',True)])

    def test_regular_file_cannot_be_interpreted_as_block_device(self):
        with self.assertRaisesRegex(ValueError,'not a block device'):
            probe.kernel_block_path(types.SimpleNamespace(st_mode=probe.stat.S_IFREG,st_rdev=0))


if __name__ == '__main__':
    unittest.main()
