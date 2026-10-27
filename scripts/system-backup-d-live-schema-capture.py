#!/usr/bin/env python3
"""Bound read-only metadata capture; stdout must go to private scratch."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def capture(plan, query, run=subprocess.run):
    def require(value):
        if not value:
            raise ValueError('live schema identity/capture rejected')
    prefix = ['kubectl', '--context='+plan['context'], '--request-timeout=30s', '-n', plan['namespace']]
    def command(args, stdin=None):
        p = run(prefix+args, input=stdin, text=True, capture_output=True, timeout=120, check=False)
        require(p.returncode == 0 and len(p.stdout.encode()) <= 64*1024*1024)
        return p.stdout
    def identity():
        ns = json.loads(command(['get', 'namespace', plan['namespace'], '-o', 'json']))
        require(ns['metadata']['uid'] == plan['namespace_uid'])
        p = json.loads(command(['get', 'pod', plan['mysql_pod'], '-o', 'json']))
        require(p['metadata']['uid'] == plan['mysql_pod_uid'] and p['spec']['nodeName'] == plan['mysql_node'])
        c = next(c for c in p['status']['containerStatuses'] if c['name'] == plan['mysql_container'])
        require(c.get('state', {}).get('running') is not None and c.get('containerID'))
        return (c['containerID'], c['restartCount'])
    def sql(q):
        return command(['exec', '-i', plan['mysql_pod'], '-c', plan['mysql_container'], '--', 'sh', '-c',
                        'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database="$1" --batch --raw --skip-column-names --default-character-set=utf8mb4',
                        'd-schema-readonly', plan['database']], q)
    before = identity()
    db_sql = 'SELECT @@server_uuid,DATABASE();'
    expected = [plan['server_uuid'], plan['database']]
    require(sql(db_sql).strip().split('\t') == expected)
    ledger = sql('SELECT filename FROM schema_migrations ORDER BY filename;')
    records = sql(query)
    require(sorted(records.splitlines()) == sorted(sql(query).splitlines()))
    require(ledger == sql('SELECT filename FROM schema_migrations ORDER BY filename;'))
    require(sql(db_sql).strip().split('\t') == expected and identity() == before)
    sha = lambda v: hashlib.sha256(v.encode()).hexdigest()
    return dict(kind='d_live_schema_capture', target={k: plan[k] for k in ['namespace', 'namespace_uid', 'mysql_pod', 'mysql_pod_uid', 'database']},
                server_uuid=plan['server_uuid'], identity_stable=True, records=records,
                records_sha256=sha(records), capture_sql_sha256=sha(query))


if __name__ == '__main__':
    try:
        root = Path(__file__).resolve().parent.parent
        plan = json.loads((root/'deployments/k8s/system-backup-capacity.zh-fix16.candidate.json').read_text(encoding='utf-8'))
        query = (root/'contracts/system-backup/v12/schema-hash-capture.mysql.sql').read_text(encoding='utf-8')
        print(json.dumps(capture(plan, query)))
    except Exception:
        print('Live schema capture rejected; raw metadata/errors withheld.', file=sys.stderr)
        raise SystemExit(1)
