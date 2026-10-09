#!/usr/bin/env python3
"""Dedicated capacity account + Secret, guarded by target identity and full tables.
No passwords or raw SQL responses are emitted. No migration is executed.
"""
import argparse
import base64
import json
from pathlib import Path
import re
import secrets
import subprocess

USER = 'cm_capacity_collector'
SECRET = 'system-backup-capacity-dsn'

def execute(plan, tables, run=subprocess.run):
    result = dict(kind='d_capacity_account_preparation', status='BLOCKED', user=USER, secret=SECRET,
                  account_create_attempted=False, secret_create_attempted=False, credentials_emitted=False,
                  upgrade_executed=False)
    prefix = ['kubectl', '--context='+plan['context'], '--request-timeout=30s', '-n', plan['namespace']]
    phase = 'target'
    def require(value):
        if not value: raise ValueError('capacity account preparation rejected')
    def command(args, stdin=None):
        r = run(prefix+args, input=stdin, capture_output=True, text=True, timeout=90, check=False)
        require(r.returncode == 0)
        return r.stdout
    def get(kind,name): return json.loads(command(['get',kind,name,'-o','json']))
    def identity():
        require(get('namespace',plan['namespace'])['metadata']['uid']==plan['namespace_uid'])
        pod=get('pod',plan['mysql_pod'])
        require(pod['metadata']['uid']==plan['mysql_pod_uid'] and pod['spec']['nodeName']==plan['mysql_node'])
        c=next(c for c in pod['status']['containerStatuses'] if c['name']==plan['mysql_container'])
        require(c.get('state',{}).get('running') is not None)
        return (c['containerID'],c['restartCount'])
    def sql(query):
        # Administrative credentials stay in the already pinned MySQL container.
        identity()
        return command(['exec','-i',plan['mysql_pod'],'-c',plan['mysql_container'],'--','sh','-c',
          'test -n "$MYSQL_ROOT_PASSWORD"; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --batch --raw --skip-column-names --default-character-set=utf8mb4'],query)
    try:
        require(re.fullmatch(r'[A-Za-z0-9_]{1,64}',plan['database']))
        require(tables and len(tables)==len(set(tables)) and all(re.fullmatch(r'(system_backup_|system_restore_)[A-Za-z0-9_]+|audit_logs',t) for t in tables))
        before=identity()
        require(sql('SELECT @@server_uuid;').strip()==plan['server_uuid'])
        phase='required-tables'
        observed=sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='"+plan['database']+"' AND TABLE_TYPE='BASE TABLE';").splitlines()
        missing=sorted(set(tables)-set(observed));result['missing_tables']=missing
        require(not missing)
        phase='existing-account-secret'
        require(sql("SELECT COUNT(*) FROM mysql.user WHERE User='"+USER+"';").strip()=='0')
        require(not command(['get','secret',SECRET,'--ignore-not-found','-o','name']).strip())
        service=get('service','mysql');require(any(p.get('port')==3306 for p in service['spec']['ports']))
        require(identity()==before)
        password=secrets.token_hex(32)
        phase='create-account'
        result['account_create_attempted']=True
        # Do not use IF NOT EXISTS / ALTER USER: existing identities need review.
        sql("CREATE USER '"+USER+"'@'%' IDENTIFIED BY '"+password+"';")
        phase='exact-table-grants'
        for table in sorted(tables):
            sql("GRANT SELECT ON `"+plan['database']+"`.`"+table+"` TO '"+USER+"'@'%';")
        grants=sql("SHOW GRANTS FOR '"+USER+"'@'%';").splitlines()
        expected={"GRANT SELECT ON `"+plan['database']+"`.`"+t+"` TO `"+USER+"`@`%`" for t in tables}
        require(set(grants)==expected|{"GRANT USAGE ON *.* TO `"+USER+"`@`%`"})
        require(identity()==before and sql('SELECT @@server_uuid;').strip()==plan['server_uuid'])
        phase='create-secret'
        result['secret_create_attempted']=True
        dsn=USER+':'+password+'@tcp(mysql.'+plan['namespace']+'.svc:3306)/'+plan['database']+'?parseTime=true&timeout=5s&readTimeout=5s&writeTimeout=5s'
        secret={'apiVersion':'v1','kind':'Secret','metadata':{'name':SECRET,'namespace':plan['namespace'],'labels':{'app.kubernetes.io/name':'system-backup-capacity'}},'type':'Opaque','immutable':True,'data':{'dsn':base64.b64encode(dsn.encode()).decode()}}
        # -o name ensures secret bytes never appear in a receipt or error.
        command(['create','-f','-','-o','name'],json.dumps(secret))
        require(identity()==before)
        result.update(status='ACCOUNT_SECRET_PREPARED',table_count=len(tables),secret_reference=SECRET+'/dsn',collector_started=False)
    except Exception:
        result['blocked_phase']=phase
        result['reconciliation_required']=result['account_create_attempted']
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for key in ['expected','context','namespace','namespace-uid']:parser.add_argument('--'+key,required=True)
    args=parser.parse_args()
    expected=json.loads(Path(args.expected).read_text(encoding='utf-8'))
    plan=expected['capacity_plan']
    if (plan['context'],plan['namespace'],plan['namespace_uid']) != (args.context,args.namespace,args.namespace_uid):raise SystemExit('Target mismatch')
    result=execute(plan,expected['capacity_tables'])
    print(json.dumps(result,indent=2))
    raise SystemExit(0 if result['status']=='ACCOUNT_SECRET_PREPARED' else 2)
