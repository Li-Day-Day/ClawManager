import hashlib
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('producer_ddl_probe',Path(__file__).with_name('system-backup-d-producer-ddl-probe.py'))
MODULE=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LocalSafetyTests(unittest.TestCase):
    def probe(self):
        p=MODULE.Probe(types.SimpleNamespace(context='test',node='node1',sha256='a'*64))
        p.attempted=True;p.uid='owned-uid'
        return p

    def namespace(self,p):
        return dict(metadata=dict(name=p.name,uid=p.uid,
                    labels={'clawmanager-test':'producer-ddl'},
                    annotations={'clawmanager-test-owner':p.owner}))

    def test_candidate_bytes_and_hash(self):
        path=ROOT/'contracts/system-backup/v12/producer-authority-candidate.sql'
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertIn('CREATE TABLE system_backup_producer_domains',MODULE.validate_ddl(path,digest))
        with self.assertRaises(ValueError):MODULE.validate_ddl(path,'0'*64)

    def test_extra_sql_rejected_even_with_matching_hash(self):
        original=(ROOT/'contracts/system-backup/v12/producer-authority-candidate.sql').read_bytes()
        for suffix in [b'\nDROP DATABASE production;',b'\nUSE other;',b'\nCREATE TABLE surprise(id INT);']:
            with self.subTest(suffix=suffix), patch.object(Path,'read_bytes',return_value=original+suffix):
                with self.assertRaises(ValueError):MODULE.validate_ddl('synthetic.sql',hashlib.sha256(original+suffix).hexdigest())

    def test_cleanup_refuses_changed_owner_uid_name_and_label(self):
        for field in ['uid','name','owner','label']:
            with self.subTest(field=field):
                p=self.probe();ns=self.namespace(p);m=ns['metadata'];calls=[]
                if field in ['uid','name']:m[field]='different'
                elif field=='owner':m['annotations']['clawmanager-test-owner']='different'
                else:m['labels']['clawmanager-test']='different'
                def kube(args,**kwargs):
                    calls.append(args);return types.SimpleNamespace(stdout=json.dumps(ns))
                p.kube=kube
                with self.assertRaisesRegex(ValueError,'ownership changed'):p.cleanup()
                self.assertFalse(any(x[0]=='delete' for x in calls));self.assertFalse(p.report['cleanup'])

    def test_cleanup_confirms_absence_after_delete(self):
        p=self.probe();calls=[];ns=self.namespace(p)
        def kube(args,**kwargs):
            calls.append(args)
            return types.SimpleNamespace(stdout=json.dumps(ns) if len(calls)==1 else '')
        p.kube=kube;p.cleanup()
        self.assertTrue(p.report['cleanup']);self.assertEqual([x[0] for x in calls],['get','delete','get'])
        self.assertEqual(calls[1][2],p.name)

    def test_cleanup_cannot_claim_success_while_namespace_remains(self):
        p=self.probe();ns=self.namespace(p);calls=[]
        def kube(args,**kwargs):
            calls.append(args);return types.SimpleNamespace(stdout=json.dumps(ns) if len(calls)==1 else ('namespace/'+p.name if len(calls)==3 else ''))
        p.kube=kube
        with self.assertRaisesRegex(ValueError,'not confirmed'):p.cleanup()
        self.assertFalse(p.report['cleanup'])

    def test_lost_create_response_only_cleans_exact_owner(self):
        p=self.probe();ns=self.namespace(p);p.uid=None;calls=[]
        def kube(args,**kwargs):
            calls.append(args);return types.SimpleNamespace(stdout=json.dumps(ns) if len(calls)==1 else '')
        p.kube=kube;p.cleanup();self.assertTrue(p.report['cleanup'])

    def test_absent_namespace_needs_no_delete(self):
        p=self.probe();calls=[]
        def kube(args,**kwargs):calls.append(args);return types.SimpleNamespace(stdout='')
        p.kube=kube;p.cleanup();self.assertTrue(p.report['cleanup']);self.assertEqual(len(calls),1)

    def test_expected_mysql_error_is_not_any_process_failure(self):
        self.assertTrue(MODULE.mysql_error('ERROR 1452 (23000) at line 1',1452))
        for message in ['connection closed','ERROR 11452 (23000)','ERROR 1045 (28000)','exit status 1']:
            self.assertFalse(MODULE.mysql_error(message,1452))


if __name__=='__main__':unittest.main(verbosity=2)
