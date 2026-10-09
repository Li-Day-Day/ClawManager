import importlib.util,unittest,types,json
from pathlib import Path
s=importlib.util.spec_from_file_location('account',Path(__file__).with_name('system-backup-d-capacity-account.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class AccountTests(unittest.TestCase):
 def setUp(self):
  self.tables=['audit_logs','system_backup_configs'];self.queries=[];self.secret=None;self.missing=False;self.fail_secret=False
  self.plan=dict(context='test',namespace='source',namespace_uid='ns-uid',mysql_pod='mysql',mysql_pod_uid='pod-uid',mysql_node='master',mysql_container='mysql',database='db',server_uuid='uuid')
 def fake(self,args,**kw):
  query=kw.get('input');out=''
  if 'exec' in args:
   self.queries.append(query)
   if query=='SELECT @@server_uuid;':out='uuid'
   elif 'information_schema' in query:out='audit_logs' if self.missing else '\n'.join(self.tables)
   elif 'COUNT(*)' in query:out='0'
   elif query.startswith('SHOW GRANTS'):
    out='\n'.join(['GRANT USAGE ON *.* TO `cm_capacity_collector`@`%`']+['GRANT SELECT ON `db`.`'+t+'` TO `cm_capacity_collector`@`%`' for t in self.tables])
  elif 'get' in args:
   kind=args[args.index('get')+1]
   if kind=='namespace':out=json.dumps({'metadata':{'uid':'ns-uid'}})
   elif kind=='pod':out=json.dumps({'metadata':{'uid':'pod-uid'},'spec':{'nodeName':'master'},'status':{'containerStatuses':[{'name':'mysql','state':{'running':{}},'containerID':'c','restartCount':0}]}})
   elif kind=='service':out=json.dumps({'spec':{'ports':[{'port':3306}]}})
  elif 'create' in args:
   self.secret=json.loads(query)
   if self.fail_secret:return types.SimpleNamespace(returncode=1,stdout='PRIVATE')
  else:raise AssertionError(args)
  return types.SimpleNamespace(returncode=0,stdout=out)
 def test_missing_tables_prevents_any_mutation(self):
  self.missing=True;r=m.execute(self.plan,self.tables,self.fake);self.assertEqual(r['blocked_phase'],'required-tables');self.assertFalse(r['account_create_attempted']);self.assertIsNone(self.secret)
 def test_exact_grants_secret_no_credentials_in_receipt(self):
  r=m.execute(self.plan,self.tables,self.fake);self.assertEqual(r['status'],'ACCOUNT_SECRET_PREPARED');self.assertTrue(self.secret['immutable']);self.assertEqual(set(self.secret['data']),{'dsn'})
  self.assertNotIn(self.secret['data']['dsn'],json.dumps(r));self.assertEqual(len([q for q in self.queries if q.startswith('GRANT')]),len(self.tables))
 def test_partial_creation_requires_reconciliation_no_drop(self):
  self.fail_secret=True;r=m.execute(self.plan,self.tables,self.fake);self.assertTrue(r['reconciliation_required']);self.assertEqual(r['blocked_phase'],'create-secret');self.assertFalse(any(q.startswith('DROP') for q in self.queries));self.assertNotIn('PRIVATE',json.dumps(r))
if __name__=='__main__':unittest.main()
