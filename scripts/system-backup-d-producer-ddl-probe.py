#!/usr/bin/env python3
"""Operator-run candidate DDL validation in a disposable, loopback-only MySQL.

No dependency installation, image pulling, production SQL, or provider access.
This checks physical DDL and two InnoDB locks, not the full producer runtime.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import secrets
import selectors
import subprocess
import time
from pathlib import Path

TABLES = ['domains', 'grants', 'runs', 'targets', 'evidence_bindings',
          'result_receipts', 'command_receipts', 'evidence_refs']
PREFIX = 'system_backup_producer_'
IMAGE = '10.130.14.23:5000/mysql@sha256:5ea882b1859d3a61814e527215563d809a9f2bf70ffa24c9280f2ff6798f1977'
SCOPE = "UNHEX(REPEAT('11',32))"
HASH = "UNHEX(REPEAT('22',32))"
LATER = "UTC_TIMESTAMP(6)+INTERVAL 1 HOUR"
SESSION = "SET SESSION time_zone='+00:00'; SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'; SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ; "


def validate_ddl(path, expected):
    data = Path(path).read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('candidate DDL fingerprint mismatch')
    sql = data.decode('utf-8-sig')
    clean = re.sub(r'--[^\n]*', '', sql)
    if re.findall(r'CREATE TABLE\s+(\w+)', clean) != [PREFIX+x for x in TABLES]:
        raise ValueError('unexpected candidate table set or order')
    if re.search(r'\b(USE|DROP|ALTER|INSERT|UPDATE|DELETE|GRANT|REVOKE|CREATE\s+DATABASE)\b', re.sub(r'ON DELETE RESTRICT ON UPDATE RESTRICT', '', clean), re.I):
        raise ValueError('candidate contains non-create-table SQL')
    return sql


def owned_namespace(value, name, owner, uid=None):
    meta = value.get('metadata', {})
    return (meta.get('name') == name and
            meta.get('labels', {}).get('clawmanager-test') == 'producer-ddl' and
            meta.get('annotations', {}).get('clawmanager-test-owner') == owner and
            bool(meta.get('uid')) and (uid is None or meta['uid'] == uid))


def mysql_error(output, code):
    return bool(re.search(r'\bERROR '+str(code)+r'\s+\(', output))


class Probe:
    def __init__(self, args):
        self.args = args
        self.owner = secrets.token_hex(12)
        self.name = 'sbk-prod-ddl-' + self.owner
        self.uid = None
        self.attempted = False
        self.report = dict(kind='d_producer_candidate_ddl_mysql', status='FAIL',
                           namespace=self.name, namespace_uid=None, owner=self.owner, image=IMAGE,
                           ddl_sha256=args.sha256, checks=[], cleanup=False,
                           production_mutated=False, dependency_installation=False,
                           producer_runtime_validated=False, image_pull_policy='Never')

    def kube(self, args, data=None, timeout=60, allow_failure=False):
        out = subprocess.run(['kubectl', '--context='+self.args.context,
                              '--request-timeout=30s']+args,
                             input=data, text=True, capture_output=True, timeout=timeout)
        if out.returncode and not allow_failure:
            raise ValueError('kubectl operation failed: '+' '.join(args[:4]))
        return out

    def mysql_args(self):
        return ['kubectl', '--context='+self.args.context, '-n', self.name,
                'exec', '-i', 'mysql', '--', 'mysql', '--protocol=TCP',
                '--host=127.0.0.1', '--user=root', '--batch', '--raw',
                '--skip-column-names', '--unbuffered', '--database=producer_validation']

    def sql(self, statement, error=None):
        out = subprocess.run(self.mysql_args(), input=SESSION+statement,
                             text=True, capture_output=True, timeout=30)
        if error is None:
            if out.returncode:
                # Never return unbounded driver/server diagnostic text.
                codes = re.findall(r'ERROR (\d+)', out.stderr)
                raise ValueError('mysql query failed; codes='+','.join(codes))
        elif out.returncode == 0 or not mysql_error(out.stderr, error):
            raise ValueError('expected MySQL error '+str(error)+' was not observed')
        return out.stdout.strip()

    def check(self, name, condition=True):
        self.report['checks'].append(dict(name=name, passed=bool(condition)))
        print(json.dumps(dict(check=name, passed=bool(condition))), flush=True)
        if not condition:
            raise ValueError('check failed: '+name)

    def lock_test(self, name, locking_read, contender):
        process = subprocess.Popen(self.mysql_args(), stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   bufsize=0)
        try:
            process.stdin.write((SESSION+'START TRANSACTION; '+locking_read+
                                "; SELECT 'LOCK_HELD';\n").encode())
            process.stdin.flush()
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                end = time.monotonic()+15
                buffered = b''
                while True:
                    ready = selector.select(max(0, end-time.monotonic()))
                    if not ready:
                        raise ValueError('lock holder did not confirm readiness')
                    chunk = os.read(process.stdout.fileno(), 4096)
                    if not chunk:
                        raise ValueError('lock holder ended before readiness')
                    buffered += chunk
                    if len(buffered)>65536:
                        raise ValueError('lock holder output too large')
                    if b'LOCK_HELD\n' in buffered:
                        break
            started = time.monotonic()
            self.sql('SET SESSION innodb_lock_wait_timeout=1; '+contender, error=1205)
            self.report.setdefault('lock_waits', []).append(dict(name=name, seconds=round(time.monotonic()-started, 3)))
            process.stdin.write(b'ROLLBACK;\n')
            process.stdin.close()
            process.stdin = None
            process.communicate(timeout=15)
            self.check(name, process.returncode == 0)
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=10)

    def run(self, ddl):
        node = json.loads(self.kube(['get', 'node', self.args.node, '-o', 'json']).stdout)
        self.check('test_node_ready', any(x.get('type') == 'Ready' and x.get('status') == 'True' for x in node.get('status', {}).get('conditions', [])))
        ns = dict(apiVersion='v1', kind='Namespace', metadata=dict(name=self.name,
                  labels={'clawmanager-test': 'producer-ddl'},
                  annotations={'clawmanager-test-owner': self.owner}))
        self.attempted = True
        created = json.loads(self.kube(['create', '-f', '-', '-o', 'json'], json.dumps(ns)).stdout)
        self.check('namespace_owned', owned_namespace(created, self.name, self.owner))
        self.uid = created['metadata']['uid']
        self.report['namespace_uid'] = self.uid
        print('D_PRODUCER_DDL_STARTED='+json.dumps(dict(namespace=self.name,uid=self.uid,owner=self.owner)),flush=True)
        pod = dict(apiVersion='v1', kind='Pod', metadata=dict(name='mysql'), spec=dict(
            nodeName=self.args.node, restartPolicy='Never', automountServiceAccountToken=False,
            containers=[dict(name='mysql', image=IMAGE, imagePullPolicy='Never',
                args=['--bind-address=127.0.0.1', '--skip-log-bin', '--default-time-zone=+00:00'],
                env=[dict(name='MYSQL_ALLOW_EMPTY_PASSWORD', value='yes'),
                     dict(name='MYSQL_DATABASE', value='producer_validation')],
                resources=dict(requests=dict(cpu='250m', memory='512Mi'), limits=dict(cpu='1', memory='1Gi')),
                volumeMounts=[dict(name='data', mountPath='/var/lib/mysql')],
                readinessProbe=dict(exec={'command':['mysql', '--protocol=TCP', '--host=127.0.0.1', '--user=root', '-e', 'SELECT 1']}, initialDelaySeconds=5, periodSeconds=3))],
            volumes=[dict(name='data', emptyDir={})]))
        self.kube(['-n', self.name, 'create', '-f', '-'], json.dumps(pod))
        try:
            self.kube(['-n', self.name, 'wait', '--for=condition=Ready', 'pod/mysql', '--timeout=180s'], timeout=200)
        except Exception:
            current=json.loads(self.kube(['-n',self.name,'get','pod','mysql','-o','json']).stdout)
            self.report['pod_phase']=current.get('status',{}).get('phase')
            self.report['container_waiting_reasons']=[x.get('state',{}).get('waiting',{}).get('reason') for x in current.get('status',{}).get('containerStatuses',[])]
            raise
        version = self.sql('SELECT VERSION()')
        self.report['mysql_version'] = version
        self.check('mysql_8_4', bool(re.fullmatch(r'8\.4\.\d+(?:[-+].*)?', version)))
        self.check('loopback_only', self.sql('SELECT @@bind_address') == '127.0.0.1')
        self.sql(ddl)
        count = self.sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND engine='InnoDB'")
        self.check('eight_innodb_tables', count == '8')
        fk = self.sql("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_type='FOREIGN KEY'")
        self.check('four_foreign_keys', fk == '4')
        checks = self.sql("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_type='CHECK'")
        self.check('all_candidate_checks', checks == str(len(re.findall(r'CONSTRAINT\s+\w+\s+CHECK', ddl))))
        domain = f"INSERT INTO {PREFIX}domains VALUES ({SCOPE},X'01',1,1,'open',{LATER},X'01',{HASH})"
        self.sql(domain)
        for label, sql, code in [
            ('domain_duplicate', domain, 1062),
            ('domain_zero_epoch', domain.replace("X'01',1,1", "X'01',0,1").replace(SCOPE,"UNHEX(REPEAT('33',32))"),3819),
            ('domain_empty_record', domain.replace(",X'01',"+HASH, ",X'',"+HASH).replace(SCOPE,"UNHEX(REPEAT('33',32))"),3819),
            ('domain_oversize_record', domain.replace(",X'01',"+HASH,",REPEAT('x',16385),"+HASH).replace(SCOPE,"UNHEX(REPEAT('33',32))"),3819),
        ]:
            self.sql(sql,error=code);self.check(label)
        grant = f"INSERT INTO {PREFIX}grants VALUES ({SCOPE},'grant1',1,1,1,'active',{HASH},{LATER},{LATER},X'01',{HASH})"
        self.sql(grant)
        self.sql(grant.replace("'grant1'","'orphan'").replace(SCOPE,"UNHEX(REPEAT('99',32))"),error=1452);self.check('grant_domain_fk')
        self.sql(grant.replace("'grant1'","'bad_lease'").replace(f'{LATER},{LATER}',f'{LATER}+INTERVAL 1 SECOND,{LATER}'),error=3819);self.check('grant_lease_bound')
        run = f"INSERT INTO {PREFIX}runs VALUES ({SCOPE},'run1','grant1',1,{HASH},1,'evidence1',{LATER},NULL,NULL,'acquired',1,X'01',{HASH})"
        self.sql(run)
        self.sql(run.replace("'run1'","'run2'").replace("'evidence1'","'evidence2'"),error=1062);self.check('one_run_per_grant_generation')
        self.sql(f"UPDATE {PREFIX}runs SET state='pending' WHERE scope_key={SCOPE}",error=3819);self.check('pending_requires_observation')
        self.sql(f"UPDATE {PREFIX}runs SET observed_at=UTC_TIMESTAMP(6) WHERE scope_key={SCOPE}",error=3819);self.check('observation_pair_required')
        self.sql(f"UPDATE {PREFIX}runs SET grant_generation=2 WHERE scope_key={SCOPE}",error=1452);self.check('run_generation_fk')
        self.sql(f"UPDATE {PREFIX}runs SET observed_at=UTC_TIMESTAMP(6),observation_expires_at={LATER},state='pending' WHERE scope_key={SCOPE}")
        target = f"INSERT INTO {PREFIX}targets VALUES ({SCOPE},{HASH},1,'run1',0,1,X'01',{HASH})"
        self.sql(target);self.check('target_initial_zero_result_allowed')
        history=f"INSERT INTO {PREFIX}evidence_bindings VALUES ({SCOPE},X'01','run1','evidence1','grant1',1,{LATER},{LATER},{LATER},X'01',{HASH})"
        self.sql(history.replace("'evidence1'","'wrong-evidence'"),error=1452);self.check('history_run_evidence_fk')
        self.sql(history)
        receipt=f"INSERT INTO {PREFIX}result_receipts VALUES ({SCOPE},X'01',{HASH},{HASH},'run1','evidence1',{HASH},1,UTC_TIMESTAMP(6),{LATER},1,X'01',{HASH})"
        self.sql(receipt)
        self.sql(receipt.replace(f"X'01',{HASH},{HASH}",f"X'01',UNHEX(REPEAT('44',32)),{HASH}"),error=1062);self.check('unique_target_result_version')
        command=f"INSERT INTO {PREFIX}command_receipts VALUES ({SCOPE},X'01',{HASH},{HASH},UTC_TIMESTAMP(6),{LATER},1,X'01',{HASH})"
        self.sql(command)
        ref=f"INSERT INTO {PREFIX}evidence_refs VALUES ({SCOPE},'evidence1','hold',{HASH},{LATER},X'01',{HASH})"
        self.sql(ref);self.sql(ref,error=1062);self.check('reference_composite_primary_key')
        self.sql(f"DELETE FROM {PREFIX}domains WHERE scope_key={SCOPE}",error=1451);self.check('domain_delete_restricted')
        result=self.sql(f"START TRANSACTION; UPDATE {PREFIX}domains SET row_version=2 WHERE scope_key={SCOPE}; ROLLBACK; SELECT row_version FROM {PREFIX}domains WHERE scope_key={SCOPE}")
        self.check('rollback_restores_version',result=='1')
        explain=json.loads(self.sql(f"EXPLAIN FORMAT=JSON SELECT * FROM {PREFIX}grants WHERE scope_key={SCOPE} AND grant_id='grant1' FOR UPDATE"))
        self.report['grant_explain']=explain
        self.check('grant_primary_key_plan','"key": "PRIMARY"' in json.dumps(explain))
        self.lock_test('existing_row_lock',f"SELECT scope_key FROM {PREFIX}domains WHERE scope_key={SCOPE} FOR UPDATE",f"UPDATE {PREFIX}domains SET row_version=2 WHERE scope_key={SCOPE}")
        missing="UNHEX(REPEAT('55',32))"
        new_receipt=receipt.replace(f"X'01',{HASH},{HASH}",f"X'01',{missing},{HASH}").replace(f"'evidence1',{HASH},1,",f"'evidence1',{HASH},2,")
        self.lock_test('missing_receipt_gap_lock',f"SELECT receipt_key_hash FROM {PREFIX}result_receipts WHERE scope_key={SCOPE} AND receipt_key_hash={missing} FOR UPDATE",new_receipt)
        self.sql(new_receipt);self.check('insert_succeeds_after_gap_release')
        self.report['status']='PASS'

    def cleanup(self):
        if not self.attempted:
            self.report['cleanup']=True;return
        out=self.kube(['get','namespace',self.name,'--ignore-not-found','-o','json'])
        if not out.stdout.strip():
            self.report['cleanup']=True;return
        current=json.loads(out.stdout)
        if not owned_namespace(current,self.name,self.owner,self.uid):
            raise ValueError('cleanup refused: namespace ownership changed')
        self.kube(['delete','namespace',self.name,'--wait=true','--timeout=120s'],timeout=140)
        remaining=self.kube(['get','namespace',self.name,'--ignore-not-found','-o','name']).stdout.strip()
        self.report['cleanup']=not remaining
        if remaining:raise ValueError('namespace cleanup not confirmed')


def main():
    p=argparse.ArgumentParser();p.add_argument('--ddl',required=True);p.add_argument('--sha256',required=True)
    p.add_argument('--context',default='kubernetes-admin@kubernetes');p.add_argument('--node',default='node1');p.add_argument('--check',action='store_true')
    args=p.parse_args();ddl=validate_ddl(args.ddl,args.sha256)
    if args.check:
        print(json.dumps(dict(local_input_check=True,tables=8,ddl_sha256=args.sha256,remote_contacted=False)));return 0
    probe=Probe(args)
    try:probe.run(ddl)
    except Exception as exc:probe.report['error']=str(exc);probe.report['status']='FAIL'
    finally:
        try:probe.cleanup()
        except Exception as exc:probe.report['cleanup_error']=str(exc);probe.report['status']='FAIL'
    probe.report['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    print('D_PRODUCER_DDL_RESULT='+json.dumps(probe.report,sort_keys=True),flush=True)
    return 0 if probe.report['status']=='PASS' and probe.report['cleanup'] else 1


if __name__=='__main__':raise SystemExit(main())
