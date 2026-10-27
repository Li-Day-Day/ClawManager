"""Fake transport tests only; never production SQL evidence."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('field_probe', Path(__file__).with_name('system-backup-a-field-evidence.py'))
field = importlib.util.module_from_spec(spec)
spec.loader.exec_module(field)


def uid(n):
    return '11111111-2222-4333-8444-%012x' % n


def fixture():
    def target(role, n):
        return dict(pod=role+'-pod', pod_uid=uid(n), container='runtime',
                    credential_env=dict(user='MYSQL_USER', password='MYSQL_PASSWORD', host='MYSQL_HOST', port='MYSQL_PORT'),
                    ssl_ca_file='/run/system-backup/ca/mysql.crt', expected_user='root' if role=='observer' else 'cm_'+role, tables=['users'])
    materials = [dict(name='provider-ca', configmap='ca-public', configmap_uid=uid(20), key='doc',
                      sha256=hashlib.sha256(b'-----BEGIN CERTIFICATE-----\nVEVTVF9PTkxZ\n-----END CERTIFICATE-----\n').hexdigest(), kind='ca_pem'),
                 dict(name='original-authority', configmap='authority-public', configmap_uid=uid(21), key='doc',
                      sha256=hashlib.sha256(b'{"fixture":"not-production-authority"}').hexdigest(), kind='public_json')]
    volumes = {}
    for n, role in enumerate(field.VOLUMES, 30):
        mount = '/var/lib/mysql' if role=='data' else '/run/system-backup/'+role
        volumes[role] = dict(pod=role+'-pod', pod_uid=uid(n), container='runtime', mount_path=mount,
                             file_path=mount+('/auto.cnf' if role=='data' else '/report.json' if role=='report' else '/failure.jsonl'),
                             pvc=role+'-pvc', pvc_uid=uid(n+10), pv_uid=uid(n+20), sub_path='', minimum_available_bytes=4096)
    for role in ('data','report'):
        volumes[role].update(pod='collector-pod',pod_uid=uid(6))
    return dict(version=field.VERSION, context='test-context', namespace='test-namespace', namespace_uid=uid(1),
                server_uuid=uid(2), database='fixture_db', observer=target('observer',3),
                profiles={r:target(r,n) for n,r in enumerate(field.ROLES,4)}, materials=materials, volumes=volumes,
                capacity_input=dict(image='fixture@sha256:'+'a'*64,mysql_node='node-test'))


class Fake:
    def __init__(self, plan):
        self.plan, self.calls, self.mode = plan, [], ''
        self.pod_gets = 0
        self.native_hash_calls = {}
        self.ca_expiry_checks=0

    def __call__(self, command, **options):
        self.calls.append((command, options.get('input')))
        def out(value):
            return SimpleNamespace(returncode=0, stdout=value if isinstance(value,str) else json.dumps(value), stderr='')
        if command[0]=='openssl':
            if '-checkend' in command:
                self.ca_expiry_checks+=1
                return SimpleNamespace(returncode=1 if self.mode=='expired_ca' or self.mode=='expired_second_ca' and self.ca_expiry_checks==2 else 0,stdout='',stderr='secret-never-exported')
            return out('subject=CN = Fixture CA\nissuer=CN = Fixture CA\nnotBefore=Oct 21 00:00:00 2026 GMT\nnotAfter=Oct 28 00:00:00 2026 GMT\nsha256 Fingerprint='+':'.join(['AA']*32)+'\n')
        assert command[0]=='kubectl'
        assert not any(v in command for v in ['apply','create','delete','patch','scale','cp','logs'])
        if 'get' in command:
            i=command.index('get');kind,name=command[i+1:i+3]
            if kind=='namespace':
                return out({'metadata':{'uid':uid(99) if self.mode=='namespace_drift' else self.plan['namespace_uid']}})
            if kind=='pod':
                self.pod_gets += 1
                targets=[self.plan['observer'],*self.plan['profiles'].values(),*self.plan['volumes'].values()]
                t=next(v for v in targets if v['pod']==name)
                ms=[(role,v) for role,v in self.plan['volumes'].items() if v['pod']==name]
                mounts=[dict(name=role,mountPath=m['mount_path'],readOnly=role=='data',subPath=m['sub_path']) for role,m in ms]
                pod=dict(metadata=dict(uid=t['pod_uid']),spec=dict(nodeName='node-test',containers=[dict(name='runtime',image=self.plan['capacity_input']['image'],volumeMounts=mounts)],volumes=[dict(name=role,persistentVolumeClaim=dict(claimName=m['pvc'])) for role,m in ms]),status=dict(phase='Running',containerStatuses=[dict(name='runtime',containerID='test-container',imageID=self.plan['capacity_input']['image'],restartCount=0,state=dict(running={'startedAt':'2026-10-21T00:00:00Z'}))]))
                if self.mode=='pod_restarted' and self.pod_gets>1:
                    pod['status']['containerStatuses'][0]['restartCount']=1
                return out(pod)
            if kind=='configmap':
                m=next(m for m in self.plan['materials'] if m['configmap']==name)
                content='-----BEGIN CERTIFICATE-----\nVEVTVF9PTkxZ\n-----END CERTIFICATE-----\n' if m['kind']=='ca_pem' else '{"fixture":"not-production-authority"}'
                if self.mode in ('bundle','expired_second_ca') and m['kind']=='ca_pem':content+=content
                if self.mode=='material_changed':
                    content+=' '
                return out(dict(metadata=dict(uid=m['configmap_uid'],resourceVersion='1'),data={'doc':content}))
            if kind in ('pvc','pv'):
                role=name.split('-')[0];v=self.plan['volumes'][role]
                if kind=='pvc':
                    return out(dict(metadata=dict(uid=uid(99) if self.mode=='pvc_replaced' else v['pvc_uid'],resourceVersion='1'),spec=dict(volumeName=role+'-pv',accessModes=['ReadWriteOncePod'] if role=='journal' else ['ReadWriteMany']),status=dict(phase='Bound')))
                handle='same-storage' if self.mode=='aliased_storage' else role
                return out(dict(metadata=dict(name=name,uid=v['pv_uid'],resourceVersion='1'),spec=dict(claimRef=dict(namespace=self.plan['namespace'],name=v['pvc'],uid=v['pvc_uid']),csi=dict(driver='test.csi',volumeHandle=handle))))
            raise AssertionError('unexpected kind')
        assert 'exec' in command
        pod_name=command[command.index('exec')+2]
        target=next((t for t in [self.plan['observer'],*self.plan['profiles'].values()] if t['pod']==pod_name),None)
        if command[command.index('--')+1]=='sha256sum':
            self.native_hash_calls[pod_name]=self.native_hash_calls.get(pod_name,0)+1
            digest=target['inspector_sha256']
            if self.mode=='native_wrong_binary' or self.mode=='native_binary_changed' and self.native_hash_calls[pod_name]>=2:
                digest='0'*64
            return out(digest+'  /usr/local/bin/clawreef-system-backup-registration\n')
        if '--inspect-sql-evidence' in command:
            if self.mode=='native_unavailable':
                return SimpleNamespace(returncode=1,stdout='',stderr='PRIVATE DSN=password')
            body=options['input'];request=json.loads(body)
            assert set(request)=={'schema_version','mode','dsn_env','server_uuid','database','expected_user','tables'}
            assert request['dsn_env']==target['dsn_env'] and 'password' not in request
            identity=dict(server_uuid=self.plan['server_uuid'],database=self.plan['database'],current_user=target['expected_user']+'@%',current_role='NONE',sql_time='2026-10-21T00:00:01Z')
            records=[dict(kind='table',table=t,engine='InnoDB',collation='utf8mb4_0900_ai_ci') for t in target['tables']]
            records.append(dict(kind='index',table='users',name='PRIMARY',unique=0))
            grants=["GRANT SELECT ON `fixture_db`.`users` TO '%s'@'%%'" % target['expected_user']]
            value=dict(schema_version='system-backup-sql-field-result.v1',mode=request['mode'],request_sha256=hashlib.sha256(body.encode()).hexdigest(),identity=identity,after_identity=dict(identity),grants=grants if request['mode']=='metadata' else [],metadata=records if request['mode']=='metadata' else [],capacity_identity=None if request['mode']=='metadata' else dict(server_uuid=self.plan['server_uuid'],database=self.plan['database'],data_directory='/var/lib/mysql/',now='2026-10-21T00:00:01Z'),readonly=True,rolled_back=True)
            if self.mode=='native_wrong_request':value['request_sha256']='0'*64
            if self.mode=='native_not_readonly':value['readonly']=False
            if self.mode=='native_not_rolled_back':value['rolled_back']=False
            if self.mode=='native_wrong_user':value['identity']['current_user']='different@%'
            return out(value)
        if '--check-capacity-source' in command:
            return out(dict(server_uuid=self.plan['server_uuid'],database=self.plan['database'],observed_at='2026-10-21T00:00:00Z',allocated_bytes=1000,available_bytes=3276800))
        assert command[command.index('--')+1]=='sh'
        script=command[command.index('--')+3]
        assert not any(v in script for v in ['chmod','chown','touch','rm ','mv ','tee ','set -x'])
        if 'a-field-sql' in command or 'a-field-socket' in command:
            assert '--no-defaults --no-login-paths' in script
            if 'a-field-sql' in command:
                assert '--ssl-mode=VERIFY_IDENTITY' in script
            else:
                assert '--protocol=SOCKET' in script and 'test -S "$1"' in script
            assert 'MYSQL_PWD="$p"' in script and '--password=' not in script
            sql=options['input'];assert 'START TRANSACTION READ ONLY;' in sql and sql.endswith('ROLLBACK;\n')
            assert not any(word in sql for word in ['INSERT ','UPDATE ','DELETE ','CREATE ','ALTER ','DROP ','GRANT SELECT','REVOKE '])
            if "'data_directory'" in sql and 'A_FIELD_GRANTS' not in sql:
                return out(dict(server_uuid=self.plan['server_uuid'],database=self.plan['database'],data_directory='/var/lib/mysql/',now='2026-10-21T00:00:01Z'))
            pod=command[command.index('exec')+2]
            t=next(t for t in [self.plan['observer'],*self.plan['profiles'].values()] if t['pod']==pod)
            identity=dict(server_uuid=uid(99) if self.mode=='wrong_database' else self.plan['server_uuid'],database=self.plan['database'],current_user=t['expected_user']+'@%',current_role='ACTIVE' if self.mode=='active_role' and pod!='observer-pod' else 'NONE',sql_time='2026-10-21T00:00:00.000000Z')
            records=[dict(kind='table',table='users',engine='InnoDB',collation='utf8mb4_0900_ai_ci')]
            if self.mode=='incomplete_metadata' and pod!='observer-pod':
                records=[]
            if self.mode=='runtime_metadata_drift' and pod!='observer-pod':
                records[0]['engine']='unexpected'
            records.append(dict(kind='index',table='users',name='PRIMARY',unique=0))
            after=dict(identity)
            if self.mode=='session_identity_changed':
                after['current_user']='other@%'
            grant='secret-never-exported' if self.mode=='invalid_grants' else "GRANT SELECT ON `fixture_db`.`users` TO '%s'@'%%'" % t['expected_user']
            return out('\n'.join([json.dumps(identity),'A_FIELD_GRANTS',grant,'A_FIELD_METADATA',*[json.dumps(r) for r in records],'A_FIELD_AFTER',json.dumps(after)])+'\n')
        if 'a-field-capacity' in command:
            source=dict(server_uuid=self.plan['server_uuid'],database=self.plan['database'],user='cm_collector',data_directory='/var/lib/mysql',tables=['users'])
            report=dict(server_uuid=self.plan['server_uuid'],database=self.plan['database'],observed_at='2026-10-21T00:00:00Z',allocated_bytes=1000,available_bytes=3276800)
            return out(json.dumps(source)+'\n\nA_FIELD_CAPACITY_REPORT\n'+json.dumps(report)+'\n')
        assert 'a-field-volume' in command
        mount=command[-2];role=next(k for k,v in self.plan['volumes'].items() if v['mount_path']==mount)
        mode='666' if self.mode=='unsafe_journal_mode' and role=='journal' else '640'
        statfs='4096:1000:0:900:abc:def' if self.mode=='space_low' else '4096:1000:800:900:abc:def'
        mount_flags='ro,relatime' if role=='data' and self.mode!='actual_mount_writable' else 'rw,relatime'
        return out('65532\n65532\n0:65532:2770:directory\n65532:65532:'+mode+':regular file\n'+statfs+'\n'+mount_flags+'\n')


class Tests(unittest.TestCase):
    def setUp(self):
        self.plan=fixture();self.fake=Fake(self.plan)

    def collect(self, mode=''):
        self.fake.mode=mode
        return field.Probe(self.plan,self.fake).collect()

    def test_complete_read_only_observations_are_not_production_approval(self):
        result=self.collect()
        self.assertEqual(result['blockers'],[])
        self.assertEqual(result['status'],'READ_ONLY_FACTS_COLLECTED_REVIEW_REQUIRED')
        self.assertEqual(len(result['profiles']),4)
        self.assertTrue(result['capacity']['collector_check_ran'])
        self.assertTrue(result['capacity']['source_raw'].endswith('\n'))
        self.assertFalse(result['complete_field_acceptance'])
        self.assertFalse(result['production_approved'])
        self.assertTrue(all(not v['single_writer_fencing_verified'] for v in result['volumes']))

    def test_namespace_drift_stops_before_sql(self):
        result=self.collect('namespace_drift');self.assertEqual(len(self.fake.calls),1);self.assertEqual(result['status'],'BLOCKED')

    def test_actual_connection_metadata_and_storage_fail_closed(self):
        for mode in ['wrong_database','incomplete_metadata','runtime_metadata_drift','active_role','session_identity_changed','pvc_replaced','unsafe_journal_mode','space_low','aliased_storage','expired_ca','material_changed','invalid_grants','pod_restarted','actual_mount_writable']:
            with self.subTest(mode=mode):
                self.fake=Fake(self.plan);result=self.collect(mode)
                self.assertEqual(result['status'],'BLOCKED');self.assertTrue(result['blockers'])
                self.assertNotIn('secret-never-exported',json.dumps(result))

    def test_cross_schema_and_routine_metadata_are_included(self):
        sql=field.metadata_sql(['users'])
        self.assertIn("OR (REFERENCED_TABLE_SCHEMA=DATABASE()",sql)
        self.assertIn('information_schema.ROUTINES',sql)
        self.assertIn('SHA2(ACTION_STATEMENT,256)',sql)
        self.assertNotIn('SELECT *',sql)

    def test_templates_are_incomplete_and_never_silently_filled(self):
        p=copy.deepcopy(self.plan);p['observer']=None;p['profiles']={};p['materials']=[];p['volumes']={};p['capacity_input']=None
        self.assertEqual(len(field.validate_plan(p,False)),10)
        with self.assertRaisesRegex(ValueError,'plan_incomplete'):field.validate_plan(p)

    def test_closed_plan_rejects_credentials_commands_and_injection(self):
        for transform in [lambda p:p.update(password='secret'),lambda p:p.update(namespace='ns;delete'),lambda p:p['profiles']['download'].update(expected_user='root'),lambda p:p['profiles']['download'].update(tables=['users;DROP']),lambda p:p['profiles']['download']['credential_env'].update(password='$(bad)'),lambda p:p['profiles']['download'].update(ssl_ca_file='/run/../secret'),lambda p:p['volumes']['journal'].update(file_path='/run/system-backup/journal/../secret'),lambda p:p['volumes']['report'].update(minimum_available_bytes=0)]:
            p=copy.deepcopy(self.plan);transform(p)
            with self.assertRaises(ValueError):field.validate_plan(p)

    def test_duplicate_keys_including_escaped_spelling_rejected(self):
        with self.assertRaises(ValueError):field.strict_json('{"user":1,"u\\u0073er":2}')

    def test_existing_command_failure_does_not_leak_driver_error(self):
        def fail(*a,**k):return SimpleNamespace(returncode=1,stdout='',stderr='password=secret')
        result=field.Probe(self.plan,fail).collect()
        self.assertEqual(result['status'],'BLOCKED');self.assertNotIn('secret',json.dumps(result))

    def native_targets(self, observer=True):
        for role,t in [('observer',self.plan['observer']),*self.plan['profiles'].items()]:
            if role=='observer' and not observer:continue
            del t['credential_env'];del t['ssl_ca_file']
            t['dsn_env']='SYSTEM_BACKUP_DOWNLOAD_DSN_FILE' if role=='download' else 'SYSTEM_BACKUP_GC_DSN_FILE' if role=='gc' else 'SYSTEM_BACKUP_REGISTRATION_DSN_FILE'
            t['inspector_sha256']='a'*64
        self.fake=Fake(self.plan)

    def test_original_dsn_mode_never_uses_or_installs_mysql_client(self):
        self.native_targets();result=self.collect()
        self.assertEqual(result['status'],'READ_ONLY_FACTS_COLLECTED_REVIEW_REQUIRED')
        self.assertTrue(all(p['sql_connection_kind']=='mounted_dsn_native' for p in result['profiles']))
        self.assertTrue(all(next(r for r in p['metadata'] if r['kind']=='index')['non_unique']==0 for p in result['profiles']))
        self.assertTrue(all('a-field-sql' not in command and 'a-field-socket' not in command for command,_ in self.fake.calls))
        self.assertFalse(result['dependencies_installed'])

    def test_native_digest_request_readonly_rollback_and_missing_cli_fail_closed(self):
        self.native_targets()
        for mode in ['native_wrong_binary','native_binary_changed','native_wrong_request','native_not_readonly','native_not_rolled_back','native_wrong_user','native_unavailable']:
            with self.subTest(mode=mode):
                self.fake=Fake(self.plan);result=self.collect(mode)
                self.assertEqual(result['status'],'BLOCKED');self.assertNotIn('PRIVATE',json.dumps(result))

    def test_observer_can_reuse_original_mysql_root_environment_and_local_socket(self):
        self.native_targets(observer=False)
        target=self.plan['observer'];del target['credential_env'];del target['ssl_ca_file']
        target['socket_path']='/var/run/mysqld/mysqld.sock';target['password_env']='MYSQL_ROOT_PASSWORD'
        self.fake=Fake(self.plan);result=self.collect()
        self.assertEqual(result['status'],'READ_ONLY_FACTS_COLLECTED_REVIEW_REQUIRED')
        self.assertEqual(result['profiles'][0]['sql_connection_kind'],'local_socket_observer')

    def test_dsn_environment_cannot_be_swapped_between_runtime_roles(self):
        self.native_targets();self.plan['profiles']['download']['dsn_env']='SYSTEM_BACKUP_REGISTRATION_DSN_FILE'
        with self.assertRaisesRegex(ValueError,'runtime_dsn_reference_mismatch'):field.validate_plan(self.plan)

    def test_ca_bundle_preserves_original_bytes_and_checks_every_certificate(self):
        raw='-----BEGIN CERTIFICATE-----\nVEVTVF9PTkxZ\n-----END CERTIFICATE-----\n'
        self.plan['materials'][0]['sha256']=hashlib.sha256((raw+raw).encode()).hexdigest()
        good=self.collect('bundle');self.assertEqual(good['status'],'READ_ONLY_FACTS_COLLECTED_REVIEW_REQUIRED')
        cert=good['materials'][0];self.assertEqual(cert['certificate_count'],2);self.assertEqual(len(cert['certificates']),2)
        self.assertEqual(cert['sha256'],hashlib.sha256((raw+raw).encode()).hexdigest());self.assertEqual(self.fake.ca_expiry_checks,2)
        self.fake=Fake(self.plan);bad=self.collect('expired_second_ca');self.assertEqual(bad['status'],'BLOCKED')
        self.assertFalse(bad['materials'][0]['not_expired_at_probe']);self.assertFalse(bad['materials'][0]['certificates'][1]['not_expired_at_probe'])


if __name__=='__main__':
    unittest.main()
