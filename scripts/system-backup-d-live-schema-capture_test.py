import importlib.util,json,types,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('live',Path(__file__).with_name('system-backup-d-live-schema-capture.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class CaptureTests(unittest.TestCase):
 def setUp(self):
  self.drift=False;self.capture_count=0;self.calls=[]
  self.plan=dict(context='test',namespace='source',namespace_uid='n',mysql_pod='mysql',mysql_pod_uid='p',mysql_node='master',mysql_container='mysql',database='db',server_uuid='uuid')
 def fake(self,args,**kw):
  self.calls.append(args);q=kw.get('input')
  if 'get' in args:
   obj={'metadata':{'uid':'n'}} if 'namespace' in args else {'metadata':{'uid':'p'},'spec':{'nodeName':'master'},'status':{'containerStatuses':[{'name':'mysql','state':{'running':{}},'containerID':'c','restartCount':1 if self.drift and self.capture_count else 0}]}}
   out=json.dumps(obj)
  elif q=='SELECT @@server_uuid,DATABASE();':out='uuid\tdb\n'
  elif q.startswith('SELECT filename'):out='migration.sql\n'
  else:self.capture_count+=1;out='metadata\t{}\n'
  return types.SimpleNamespace(returncode=0,stdout=out)
 def test_two_captures_and_identity_no_writes(self):
  r=m.capture(self.plan,'SELECT metadata;',self.fake);self.assertTrue(r['identity_stable']);self.assertEqual(self.capture_count,2);self.assertFalse(any('create' in a or 'delete' in a for a in self.calls))
 def test_restart_rejected(self):
  self.drift=True
  with self.assertRaises(ValueError):m.capture(self.plan,'SELECT metadata;',self.fake)
if __name__=='__main__':unittest.main()
