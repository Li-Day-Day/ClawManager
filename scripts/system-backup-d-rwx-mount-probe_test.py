import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('mount_probe',Path(__file__).with_name('system-backup-d-rwx-mount-probe.py'))
probe=importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def review():
    return dict(blockers=['dedicated_rwx_mount_permissions_and_freshness_not_tested','longhorn_dependency_Multipathd_requires_review','longhorn_dependency_KernelModulesLoaded_requires_review'],
        settings={'v1-data-engine':'true','v2-data-engine':'false'},
        dependency_details=[dict(type='KernelModulesLoaded',status='False',missing_modules=['dm_crypt'])],
        ssh_host_storage_details=dict(block_topology_read_complete=True,existing_longhorn_multipath_conflict_observed=False,
            effective_multipath_filters=dict(sections=dict(blacklist=dict(devnode=['^sd[a-z0-9]+']),blacklist_exceptions=dict(devnode=[])))),
        storage_class=dict(uid='sc-uid',resource_version='1',reclaim_policy='Delete',binding_mode='Immediate',parameters=dict(numberOfReplicas='2')),
        node=dict(name='master',hostname='master'),longhorn_namespace=dict(name='longhorn-system'),managers=[dict(node='master'),dict(node='peer')])


class MountTests(unittest.TestCase):
    def test_attachment_requires_healthy_volume_same_node_ready_share_and_uid(self):
        nodes={'peer':dict(uid='node-uid')}
        v=dict(metadata=dict(uid='vol-uid'),status=dict(state='attached',robustness='healthy',currentNodeID='peer'))
        sm=dict(metadata=dict(uid='sm-uid'),spec=dict(nodeName='peer'),status=dict(conditions=[dict(type='Ready',status='True')]))
        self.assertEqual(probe.attachment_observation(v,sm,nodes,'vol-uid')['node'],'peer')
        for mutate in [lambda x:x['status'].update(state='detached'),lambda x:x['status'].update(robustness='degraded')]:
            changed=json.loads(json.dumps(v));mutate(changed)
            self.assertIsNone(probe.attachment_observation(changed,sm,nodes,'vol-uid'))
        self.assertIsNone(probe.attachment_observation(v,None,nodes,'vol-uid'))
        sm['status']['conditions'][0]['status']='False'
        self.assertIsNone(probe.attachment_observation(v,sm,nodes,'vol-uid'))
        with self.assertRaisesRegex(ValueError,'volume_identity_drift'):
            probe.attachment_observation(v,sm,nodes,'wrong')
        with self.assertRaisesRegex(ValueError,'attachment_node_outside_tested_nodes'):
            probe.attachment_observation(v,sm,{},'vol-uid')

    def test_shipped_rwx_class_empty_backup_is_accepted(self):
        # Use the repository manifest rather than a reduced parameter fixture.
        text=(Path(__file__).resolve().parent.parent/'deployments/k8s/cluster/clawmanager.yaml').read_text(encoding='utf-8')
        section=text.split('  name: longhorn-rwx\n',1)[1].split('\n---',1)[0]
        params={}
        for line in section.split('parameters:\n',1)[1].splitlines():
            key,value=line.strip().split(':',1)
            params[key]=value.strip().strip('"')
        self.assertIn('fromBackup',params)
        self.assertEqual(params['fromBackup'],'')
        probe.validate_storageclass_parameters(params)

    def test_backup_source_and_unknown_parameters_rejected_without_value_leak(self):
        for params,reason in [({'fromBackup':'s3://PRIVATE/backup'},'restore_source_not_allowed'),({'unknown':'PRIVATE'},'unreviewed_storageclass_parameters')]:
            with self.assertRaisesRegex(ValueError,reason):
                probe.validate_storageclass_parameters(params)
            self.assertNotIn('PRIVATE',json.dumps(probe.storageclass_parameter_review(params)))

    def test_preflight_does_not_clear_unsupported_failures(self):
        probe.preflight(review())
        for mutate in [lambda r:r['blockers'].append('namespace_uid_matches'),
                       lambda r:r['ssh_host_storage_details'].update(block_topology_read_complete=False),
                       lambda r:r['ssh_host_storage_details'].update(existing_longhorn_multipath_conflict_observed=True),
                       lambda r:r['dependency_details'][0].update(missing_modules=['nvme_tcp']),
                       lambda r:r['storage_class']['parameters'].update(encrypted='true'),
                       lambda r:r['ssh_host_storage_details']['effective_multipath_filters']['sections']['blacklist_exceptions'].update(devnode=['sd.*'])]:
            r=review(); mutate(r)
            with self.assertRaises(ValueError): probe.preflight(r)

    def test_pods_have_one_volume_no_host_access_and_readers_cannot_write(self):
        for reader in [False,True]:
            p=probe.pod_manifest('test','owned','run','master',reader)
            self.assertEqual(p['spec']['volumes'],[dict(name='report',persistentVolumeClaim=dict(claimName='report',readOnly=reader))])
            self.assertFalse(p['spec']['automountServiceAccountToken'])
            self.assertNotIn('fsGroup',p['spec']['securityContext'])
            self.assertEqual(p['spec']['containers'][0]['volumeMounts'][0]['readOnly'],reader)

    def test_report_run_future_time_stale_and_malformed_rejected(self):
        self.assertEqual(probe.parse_report('run 3 100','run',103,True),3)
        for raw,now in [('other 3 100',103),('run 3 110',103),('run 3 90',103),('run nope 100',103)]:
            with self.assertRaises(ValueError): probe.parse_report(raw,'run',now,True)
        probe.parse_report('run 3 100','run',108,False)


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.clock=1000.0; self.seq=0; self.last_stamp=1000
        self.objects={}; self.ns=None; self.calls=[]
        self.fail_readonly=False; self.cleanup_drift=False; self.encrypted=False
        self.fail_pvc_create=False
        self.attachment_node='master'
        self.sc=dict(metadata=dict(uid='sc-uid',resourceVersion='1'),parameters=dict(numberOfReplicas='2',fromBackup='',fsType='ext4',staleReplicaTimeout='30'))

    def response(self,output='',code=0,stderr=''):
        return types.SimpleNamespace(returncode=code,stdout=output,stderr=stderr)

    def fake(self,args,**kwargs):
        self.calls.append(args)
        op=args[3]; tail=args[4:]
        ns=tail[tail.index('-n')+1] if '-n' in tail else None
        if op=='create':
            body=json.loads(kwargs['input']); name=body['metadata']['name']; kind=body['kind']
            body['metadata']['uid']=name+'-uid'
            if kind=='Namespace':
                self.ns=name; self.run_id=name.removeprefix('sbk-rwx-')
                self.objects[('namespace',name,None)]=body
            elif kind=='PersistentVolumeClaim':
                if self.fail_pvc_create:
                    return self.response(code=1)
                body['spec']['volumeName']='pv-test'; body['status']=dict(phase='Bound')
                self.objects[('pvc',name,self.ns)]=body
                self.objects[('pv','pv-test',None)]=dict(metadata=dict(uid='pv-uid'),spec=dict(claimRef=dict(uid=body['metadata']['uid']),csi=dict(driver='driver.longhorn.io',volumeHandle='vol-test'),persistentVolumeReclaimPolicy='Delete'))
                self.objects[('volumes.longhorn.io','vol-test','longhorn-system')]=dict(metadata=dict(uid='vol-uid'),spec=dict(dataEngine='v1',encrypted=self.encrypted,numberOfReplicas=2),status=dict(state='attached',robustness='healthy',currentNodeID=self.attachment_node))
            elif kind=='Pod':
                body['spec']['nodeName']=body['spec']['nodeSelector']['kubernetes.io/hostname']
                body['status']=dict(conditions=[dict(type='Ready',status='True')])
                self.objects[('pod',name,self.ns)]=body
            return self.response(json.dumps(body))
        if op=='get':
            kind,name=tail[:2]
            if kind=='storageclass': obj=self.sc
            elif kind=='node': obj=dict(metadata=dict(uid=name+'-uid',labels={'kubernetes.io/hostname':name}),spec={},status=dict(conditions=[dict(type='Ready',status='True')]))
            elif kind=='nodes.longhorn.io': obj=dict(status=dict(conditions=[dict(type=k,status='True') for k in probe.DEPS+['Ready']]))
            elif kind=='namespace' and name=='source': obj=dict(metadata=dict(uid='source-uid'))
            elif kind=='pod' and name=='share-manager-vol-test': obj=dict(metadata=dict(uid='sm-uid'),spec=dict(nodeName=self.attachment_node),status=dict(conditions=[dict(type='Ready',status='True')]))
            else:
                obj=self.objects.get((kind,name,ns))
                if kind=='namespace' and obj and self.cleanup_drift:
                    obj=json.loads(json.dumps(obj)); obj['metadata']['uid']='changed-uid'
            if obj is None:
                return self.response('' if '--ignore-not-found' in args else '',0 if '--ignore-not-found' in args else 1)
            return self.response(json.dumps(obj))
        if op=='delete':
            kind,name=tail[:2]
            if kind=='namespace':
                self.assertEqual(name,self.ns)
                self.objects={}
            else:
                self.assertEqual((kind,name,ns),('pod','writer',self.ns))
                self.objects.pop(('pod','writer',self.ns))
            return self.response()
        if op=='exec':
            if 'cat' in args:
                if ('pod','writer',self.ns) in self.objects:
                    self.seq+=1; self.last_stamp=int(self.clock)
                return self.response(f'{self.run_id} {self.seq} {self.last_stamp}\n')
            if 'stat' in args: return self.response('999:65532:640\n')
            return self.response(code=0 if self.fail_readonly else 1,stderr='Read-only file system')
        self.fail('unexpected command '+str(args))

    def sleep(self,seconds): self.clock+=seconds

    def execute(self,review_value=None):
        with patch.object(probe.lh,'review',return_value=review_value or review()),patch.object(probe.time,'sleep',self.sleep),patch.object(probe.time,'time',lambda:self.clock):
            return probe.execute({},'test','source','source-uid',self.fake)

    def test_success_proves_probe_only_and_cleans_namespace_pv_volume(self):
        result=self.execute()
        self.assertEqual(result['status'],'PASS_ISOLATED_RWX')
        self.assertTrue(result['cleanup_verified'])
        self.assertFalse(result['production_report_volume_accepted'])
        self.assertFalse(result['actual_capacity_admission_tested'])
        self.assertEqual(self.objects,{})

    def test_writer_and_attachment_on_different_nodes_pass_without_host_claim(self):
        self.attachment_node='peer'
        result=self.execute()
        self.assertEqual(result['status'],'PASS_ISOLATED_RWX')
        self.assertEqual(result['attachment']['node'],'peer')
        self.assertEqual(result['attachment']['writer_node'],'master')
        self.assertFalse(result['attachment']['attachment_host_independently_diagnosed'])
        self.assertTrue(result['cleanup_verified'])

    def test_failed_readonly_write_cleans_resources_and_never_passes(self):
        self.fail_readonly=True
        result=self.execute()
        self.assertEqual(result['status'],'BLOCKED')
        self.assertEqual(result['failure'],'readonly_mount_not_enforced')
        self.assertTrue(result['cleanup_verified'])
        self.assertEqual(self.objects,{})

    def test_changed_namespace_uid_refuses_cleanup(self):
        self.cleanup_drift=True
        result=self.execute()
        self.assertEqual(result['status'],'CLEANUP_PENDING')
        self.assertFalse(result['cleanup_verified'])
        self.assertFalse(any(a[3:5]==['delete','namespace'] for a in self.calls))

    def test_encrypted_actual_volume_rejected_before_creating_pods(self):
        self.encrypted=True
        result=self.execute()
        self.assertEqual(result['failure'],'actual_volume_profile_mismatch')
        self.assertTrue(result['cleanup_verified'])
        self.assertFalse(any(a[3]=='exec' for a in self.calls))

    def test_failed_preflight_makes_no_kubectl_mutations(self):
        r=review(); r['blockers'].append('namespace_uid_matches')
        result=self.execute(r)
        self.assertFalse(result['cluster_mutated'])
        self.assertEqual(self.calls,[])

    def test_unknown_class_key_is_reported_before_any_create(self):
        self.sc['parameters']['unexpected']='PRIVATE-VALUE'
        result=self.execute()
        self.assertEqual(result['failure'],'unreviewed_storageclass_parameters')
        self.assertEqual(result['storageclass_parameter_review']['unreviewed_parameter_names'],['unexpected'])
        self.assertFalse(result['cluster_mutated'])
        self.assertFalse(any(a[3]=='create' for a in self.calls))
        self.assertNotIn('PRIVATE',json.dumps(result))

    def test_ambiguous_pvc_create_does_not_claim_backing_volume_cleaned(self):
        self.fail_pvc_create=True
        result=self.execute()
        self.assertEqual(result['status'],'CLEANUP_PENDING')
        self.assertFalse(result['cleanup_verified'])


if __name__=='__main__': unittest.main()
