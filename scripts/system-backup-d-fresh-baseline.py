#!/usr/bin/env python3
"""Metadata from this run's disposable MySQL; never targets the installed DB."""
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOTSTRAP = 'deployments/mysql/000_database.sql'
CAPTURE = 'contracts/system-backup/v12/schema-hash-capture.mysql.sql'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def require(ok, message='baseline identity or metadata mismatch'):
    if not ok:
        raise ValueError(message)


def inputs(root=ROOT):
    files = sorted((root / 'backend/internal/db/migrations').glob('*.sql'))
    catalog = hashlib.sha256(b'system-backup-migration-catalog.v1\0')
    for path in files:
        for value in [path.name, path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')]:
            raw = value.encode('utf-8')
            catalog.update(len(raw).to_bytes(8, 'big') + raw)
    registry = json.loads((root / 'contracts/system-backup/v12/schema-registry.json').read_text(encoding='utf-8'))
    require(catalog.hexdigest() == registry['migration_catalog']['hash'], 'catalog mismatch')
    require(len(files) == registry['migration_catalog']['file_count'], 'catalog count mismatch')
    bootstrap = (root / BOOTSTRAP).read_text(encoding='utf-8')
    statements = '\n'.join(line for line in bootstrap.splitlines() if not line.lstrip().startswith('--')).strip()
    require(statements == 'CREATE DATABASE IF NOT EXISTS clawmanager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;', 'bootstrap is not database-only')
    return dict(catalog_sha256=catalog.hexdigest(), filenames=[p.name for p in files],
                bootstrap_sha256=digest((root / BOOTSTRAP).read_bytes()),
                capture_sql_sha256=digest((root / CAPTURE).read_bytes()))


def verify_source(context, namespace, uid):
    result = subprocess.run(['kubectl', '--context='+context, '--request-timeout=20s', 'get', 'namespace', namespace, '-o', 'json'], capture_output=True, text=True, timeout=40, check=False)
    require(result.returncode == 0)
    require(json.loads(result.stdout)['metadata']['uid'] == uid)
    print('PASS source-namespace-identity')


def capture(context, namespace, uid, app_image, mysql_image, run=subprocess.run):
    require(re.fullmatch(r'sbk-mig-[0-9]{12}-[0-9a-f]{4}', namespace), 'not an isolated run')
    expected = inputs()
    prefix = ['kubectl', '--context='+context, '--request-timeout=30s', '-n', namespace]

    def command(args, stdin=None):
        r = run(prefix + args, input=stdin, capture_output=True, text=True, timeout=120, check=False)
        if r.returncode or len(r.stdout) > 64*1024*1024:
            raise ValueError('baseline command failed; raw output withheld')
        return r.stdout

    def obj(kind, name):
        return json.loads(command(['get', kind, name, '-o', 'json']))

    def identity():
        ns = obj('namespace', namespace)
        require(ns['metadata']['uid'] == uid)
        require(ns['metadata'].get('labels', {}).get('clawmanager.io/test-run') == namespace.removeprefix('sbk-mig-'))
        mysql = obj('pod', 'mysql')
        require(mysql['metadata'].get('labels', {}).get('clawmanager.io/test-run') == namespace.removeprefix('sbk-mig-'))
        require(mysql['spec']['containers'][0]['image'] == mysql_image)
        require(any(v['name'] == 'mysql-data' and 'emptyDir' in v for v in mysql['spec']['volumes']))
        require(not any('persistentVolumeClaim' in v or 'hostPath' in v for v in mysql['spec']['volumes']))
        return mysql['metadata']['uid']

    print('D_BASELINE_STAGE=verify-isolation', flush=True)
    mysql_uid = identity()
    app = obj('pod', 'migration-app')
    require(app['spec']['containers'][0]['image'] == app_image)
    require(app['metadata'].get('labels', {}).get('clawmanager.io/test-run') == namespace.removeprefix('sbk-mig-'))
    print('D_BASELINE_STAGE=embedded-catalog', flush=True)
    embedded = json.loads(command(['exec', 'pod/migration-app', '--', '/usr/local/bin/clawreef-system-backup-migrate', '--catalog-only']))
    require(embedded['sha256'] == expected['catalog_sha256'] and embedded['filenames'] == expected['filenames'] and embedded['file_count'] == len(expected['filenames']))
    # Quiesce the only application writer in this owned namespace before two
    # observations. Never stop a source installation workload.
    command(['delete', 'pod', 'migration-app', '--wait=true', '--timeout=90s'])
    print('D_BASELINE_STAGE=writer-stopped-capture', flush=True)

    def sql(value):
        return command(['exec', '-i', 'pod/mysql', '--', 'sh', '-c',
                        'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names --default-character-set=utf8mb4'], value)

    started = datetime.now(timezone.utc).isoformat()
    server = sql('SELECT @@server_uuid, VERSION(), DATABASE(), @@sql_mode;').rstrip('\r\n').split('\t')
    require(len(server) == 4 and server[2] == 'clawmanager')
    ledger = sql('SELECT filename FROM schema_migrations ORDER BY filename;').splitlines()
    require(ledger == expected['filenames'])
    query = (ROOT / CAPTURE).read_text(encoding='utf-8')
    records = sql(query)
    repeat = sql(query)
    require(sorted(records.splitlines()) == sorted(repeat.splitlines()), 'schema changed during capture')
    require(sql('SELECT @@server_uuid;').strip() == server[0])
    require(identity() == mysql_uid)
    require(sql('SELECT filename FROM schema_migrations ORDER BY filename;').splitlines() == ledger)
    return dict(kind='d_fresh_baseline_capture', status='candidate_not_approved',
                namespace=namespace, namespace_uid=uid, mysql_pod_uid=mysql_uid,
                app_image=app_image, mysql_image=mysql_image, server_uuid=server[0], server_version=server[1], sql_mode=server[3],
                started_at=started, finished_at=datetime.now(timezone.utc).isoformat(),
                inputs=expected, zero_tables_before_replay=True, writer_stopped=True,
                repeated_capture_matched=True, records_sha256=digest(records.encode('utf-8')), records=records)


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['inputs']:
            print('PASS baseline-inputs ' + json.dumps(inputs(), separators=(',', ':')))
        elif len(sys.argv) == 5 and sys.argv[1] == 'source':
            verify_source(*sys.argv[2:])
        elif len(sys.argv) == 7 and sys.argv[1] == 'capture':
            print('D_FRESH_BASELINE_JSON=' + json.dumps(capture(*sys.argv[2:]), separators=(',', ':')))
        else:
            raise ValueError('invalid mode')
    except Exception:
        print('Baseline rejected; no success evidence or raw driver errors emitted.', file=sys.stderr)
        sys.exit(1)
