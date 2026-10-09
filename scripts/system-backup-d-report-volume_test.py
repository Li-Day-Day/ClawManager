import importlib.util,json,types,unittest
from pathlib import Path
from unittest.mock import patch

def load(name,file):
 s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
p=load('permanent','system-backup-d-report-volume.py')
r=load('fixtures','system-backup-d-rwx-mount-probe_test.py')

class PreparationTests(unittest.TestCase):
 def setUp(self):
  self.objects={};self.calls=[];self.fail=False;self.existing=False;self.drift=False
  self.expected={'mysql_target':{'pod':'mysql','pod_uid':'mysql-uid','container':'mysql','data_pvc':'mysql-data'},'storage_target':{'node':{'name':'master'}},'image':'test.invalid/image@sha256:'+'a'*64}
 def fake(self,args,**kw):
  self.calls.append(args);op=args[3];tail=args[4:];ns=tail[tail.index('-n')+1] if '-n' in tail else None
  obj=None
  if op=='get':
   kind,name=tail[:2]
   if kind=='storageclass':obj={'metadata':{'uid':'sc-uid','resourceVersion':'1'},'parameters':{'numberOfReplicas':'2'}}
   elif kind=='namespace':obj={'metadata':{'uid':'source-uid'}}
   elif kind=='pod' and name=='mysql':obj={'metadata':{'uid':'mysql-uid'},'spec':{'nodeName':'master','containers':[{'name':'mysql','volumeMounts':[{'name':'data','mountPath':'/var/lib/mysql'}]}],'volumes':[{'name':'data','persistentVolumeClaim':{'claimName':'mysql-data'}}]}}
   elif kind=='pvc' and name=='mysql-data':obj={'spec':{'volumeName':'business-pv','accessModes':['ReadWriteOnce']},'status':{'phase':'Bound'}}
   elif kind=='pvc' and self.existing:obj={'metadata':{'uid':'old'}}
   else:obj=self.objects.get((kind,name))
   if obj and self.drift and kind=='pod' and name.startswith('sbk-report'):obj=json.loads(json.dumps(obj));obj['metadata']['uid']='drift'
  elif op=='create':
   obj=json.loads(kw['input']);name=obj['metadata']['name'];obj['metadata']['uid']=name+'-uid'
   if obj['kind']=='Pod':
    obj['spec']['nodeName']='master';obj['status']={'phase':'Failed' if self.fail and name.startswith('sbk-report') else 'Succeeded','containerStatuses':[{'imageID':'test-image'}]};self.objects[('pod',name)]=obj
   else:
    obj['spec']['volumeName']='report-pv';obj['status']={'phase':'Bound'};self.objects[('pvc',name)]=obj
    self.objects[('pv','report-pv')]={'metadata':{'name':'report-pv','uid':'pv-uid'},'spec':{'claimRef':{'uid':obj['metadata']['uid'],'namespace':'source','name':p.CLAIM},'csi':{'driver':'driver.longhorn.io','volumeHandle':'report-vol'},'persistentVolumeReclaimPolicy':'Delete'}}
    self.objects[('volumes.longhorn.io','report-vol')]={'metadata':{'name':'report-vol','uid':'vol-uid'},'spec':{'dataEngine':'v1','numberOfReplicas':2},'status':{'state':'attached','robustness':'healthy'}}
  elif op=='delete':
   self.assertEqual(tail[0],'pod');self.objects.pop(('pod',tail[1]),None)
  elif op=='exec':return types.SimpleNamespace(returncode=0,stdout='999\n')
  elif op=='logs':return types.SimpleNamespace(returncode=0,stdout='  -capacity-config string\n  -collect-capacity string\n  -check-capacity-source\n')
  else:self.fail('unexpected')
  return types.SimpleNamespace(returncode=0,stdout=json.dumps(obj) if obj else '')
 def execute(self):
  with patch.object(p.rwx.lh,'review',return_value=r.review()):return p.execute(self.expected,'test','source','source-uid',self.fake)
 def test_new_claim_retained_pods_cleaned(self):
  result=self.execute();self.assertEqual(result['status'],'PREPARED_NOT_ACCEPTED');self.assertTrue(result['claim_retained']);self.assertTrue(result['cleanup_verified']);self.assertEqual(result['collector_uid'],999)
  self.assertFalse(any(k[0]=='pod' for k in self.objects));self.assertIn(('pvc',p.CLAIM),self.objects)
 def test_existing_claim_never_adopted(self):
  self.existing=True;result=self.execute();self.assertEqual(result['status'],'BLOCKED');self.assertFalse(result.get('claim_create_attempted',False))
 def test_failure_retains_claim_cleans_probe(self):
  self.fail=True;result=self.execute();self.assertEqual(result['status'],'BLOCKED');self.assertTrue(result['claim_retained']);self.assertTrue(result['cleanup_verified']);self.assertEqual(result['failure'],'permissions_failed');self.assertFalse(result['probe_markers_cleanup_verified'])
 def test_uid_drift_refuses_pod_cleanup(self):
  self.drift=True;result=self.execute();self.assertFalse(result['cleanup_verified']);self.assertTrue(result['cleanup_pending'])
 def test_permission_init_never_mounts_mysql(self):
  pod=p.permission_pod('source','probe','run','master',123,'mysql-data','subdir');s=pod['spec'];self.assertNotIn('fsGroup',s['securityContext']);self.assertEqual(s['securityContext']['runAsUser'],123)
  self.assertEqual([m['name'] for m in s['initContainers'][0]['volumeMounts']],['report'])
  self.assertTrue(s['volumes'][1]['persistentVolumeClaim']['readOnly']);self.assertTrue(s['containers'][0]['volumeMounts'][1]['readOnly'])
  self.assertNotIn('-R',s['initContainers'][0]['command'][-1])
  self.assertNotIn('| wc',s['initContainers'][0]['command'][-1])
 def test_failure_allowlist_does_not_emit_exception_text(self):
  self.assertEqual(p.public_failure(ValueError('mysql_identity_drift')),'mysql_identity_drift')
  for error in [ValueError('PRIVATE_DRIVER_ERROR'),KeyError('PRIVATE_SCHEMA'),RuntimeError('PRIVATE_CREDENTIAL')]:
   self.assertEqual(p.public_failure(error),'unexpected_error_details_withheld')

if __name__=='__main__':unittest.main()
