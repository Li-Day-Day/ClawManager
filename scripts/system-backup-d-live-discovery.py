#!/usr/bin/env python3
"""Read-only D discovery; stdlib only. Output contains selected public fields.

Never dump Pod env, Secret data, SQL grants, schema defaults or driver stderr.
Missing inputs are blockers, not permission to create deployment resources.
"""
import argparse
import datetime
import json
import re
import subprocess
from pathlib import Path


def discover(expected, context, namespace, namespace_uid, run=subprocess.run):
    report = dict(kind='d_live_readonly_discovery', status='BLOCKED',
                  observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  namespace=namespace, expected_namespace_uid=namespace_uid,
                  image=expected['image'], catalog_sha256=expected['catalog_sha256'],
                  checks=[], blockers=[], cluster_mutated=False, database_mutated=False,
                  collector_admitted=False, schema_diff_verified=False,
                  http_deployed_by_probe=False, configuration_activated=False)
    def check(name, passed):
        report['checks'].append(dict(name=name, passed=bool(passed)))
        if not passed and name not in report['blockers']:
            report['blockers'].append(name)
        return bool(passed)

    def command(args, sql=None):
        result = run(['kubectl', '--context='+context, '--request-timeout=20s']+args,
                     input=sql, capture_output=True, text=True, timeout=60, check=False)
        if result.returncode:
            raise ValueError('read failed')
        if len(result.stdout) > 16 * 1024 * 1024:
            raise ValueError('oversize result')
        return result.stdout

    def get(kind, name=None, selector=None, global_resource=False):
        args = ([] if global_resource else ['-n', namespace])+['get', kind]
        if name:
            args.append(name)
        if selector:
            args += ['-l', selector]
        return json.loads(command(args+['-o', 'json']))

    def fingerprint(pod, container):
        statuses = [c for c in pod.get('status', {}).get('containerStatuses', []) if c['name'] == container]
        return [pod['metadata']['uid'], pod['spec'].get('nodeName'),
                [(c.get('containerID'), c.get('restartCount')) for c in statuses]]

    stage = 'namespace'
    namespace_verified = False
    try:
        ns = get('namespace', namespace, global_resource=True)
        if not check('namespace_uid_matches', ns['metadata']['uid'] == namespace_uid):
            return report
        namespace_verified = True
        stage = 'mysql_pod_selection'
        pods = get('pods', selector='app=mysql')['items']
        pods = [p for p in pods if not p['metadata'].get('deletionTimestamp') and p.get('status', {}).get('phase') == 'Running']
        if not check('exactly_one_running_mysql_pod', len(pods) == 1):
            return report
        pod = pods[0]
        containers = [c for c in pod['spec']['containers'] if c['name'] == 'mysql']
        if not check('mysql_container_unambiguous', len(containers) == 1):
            return report
        container = containers[0]
        pod_name = pod['metadata']['name']
        report['mysql'] = dict(pod=pod_name, pod_uid=pod['metadata']['uid'], container='mysql', node=pod['spec'].get('nodeName'))

        def execute(args):
            return command(['-n', namespace, 'exec', pod_name, '-c', 'mysql', '--']+args)

        def query(sql):
            return command(['-n', namespace, 'exec', '-i', pod_name, '-c', 'mysql', '--', 'sh', '-c',
                            'set -eu; MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names --default-character-set=utf8mb4'], sql)

        stage = 'database_identity'
        identity_sql = "SELECT JSON_OBJECT('server_uuid',@@server_uuid,'database',DATABASE(),'data_directory',@@datadir,'version',VERSION(),'utc_now',DATE_FORMAT(UTC_TIMESTAMP(6),'%Y-%m-%dT%H:%i:%s.%fZ'));"
        identity = json.loads(query(identity_sql))
        if not check('database_identity_well_formed', identity['database'] == 'clawmanager' and
                     re.fullmatch(r'[0-9a-f-]{36}', identity['server_uuid']) and
                     re.fullmatch(r'/[A-Za-z0-9_./-]+', identity['data_directory']) and '..' not in identity['data_directory'].split('/')):
            return report
        report['database'] = identity
        report['database_identity_source'] = 'discovered_from_pinned_namespace; pin before deployment'
        datadir = identity['data_directory'].rstrip('/')
        mounts = [m for m in container.get('volumeMounts', []) if m['mountPath'].rstrip('/') == datadir]
        if check('mysql_datadir_exact_volume_mount', len(mounts) == 1 and not mounts[0].get('subPathExpr')):
            mount = mounts[0]
            volume = next((v for v in pod['spec'].get('volumes', []) if v['name'] == mount['name']), {})
            claim = volume.get('persistentVolumeClaim', {}).get('claimName')
            report['mysql']['data_pvc'] = claim
            report['mysql']['data_subpath'] = mount.get('subPath', '')
            check('mysql_datadir_is_pvc', bool(claim))
        stage = 'mysql_auto_cnf_metadata'
        file_stat = execute(['stat', '-c', '%u:%g:%a', datadir+'/auto.cnf']).strip()
        if check('auto_cnf_metadata_readable', bool(re.fullmatch(r'\d+:\d+:[0-7]{3,4}', file_stat))):
            uid, gid, mode = file_stat.split(':')
            report['mysql']['auto_cnf_metadata'] = dict(uid=int(uid), gid=int(gid), mode=mode)
            # This is the owner, not proof that a future collector UID can read it.
        stage = 'migration_ledger'
        names = query('SELECT filename FROM schema_migrations ORDER BY filename;').strip().splitlines()
        missing = sorted(set(expected['migrations'])-set(names))
        extra = sorted(set(names)-set(expected['migrations']))
        report['migrations'] = dict(expected_count=len(expected['migrations']), observed_count=len(names), missing=missing, unexpected=extra)
        check('migration_filenames_match', not missing and not extra and len(names) == len(set(names)))
        stage = 'd_schema_inventory'
        tables = query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;").strip().splitlines()
        report['d_tables'] = dict(expected_count=len(expected['d_tables']), missing=sorted(set(expected['d_tables'])-set(tables)))
        check('d_tables_present', not report['d_tables']['missing'])
        # Digest of structural metadata only. No business rows/default literals
        # are emitted. These hashes have no approved baseline yet.
        quoted = ','.join("'"+name+"'" for name in expected['d_tables'])
        column_sql = "SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,SHA2(CONCAT_WS(CHAR(31),COALESCE(COLUMN_DEFAULT,'<NULL>'),COALESCE(CHARACTER_SET_NAME,''),COALESCE(COLLATION_NAME,''),EXTRA,COALESCE(GENERATION_EXPRESSION,'')),256) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ("+quoted+") ORDER BY TABLE_NAME,ORDINAL_POSITION;"
        import hashlib
        columns = query(column_sql)
        report['d_columns_observation'] = dict(rows=len(columns.strip().splitlines()), sha256=hashlib.sha256(columns.encode()).hexdigest(), baseline_compared=False)
        check('current_catalog_fresh_schema_reference_required', False)
    except Exception:
        check(stage+'_failed_or_invalid', False)
        if not namespace_verified:
            return report

    # Storage/collector discovery is independent of a missing migration ledger.
    # Never run it after an identity mismatch or ambiguous Pod selection above.
    for stage in ['storage', 'collector']:
        try:
            if stage == 'storage':
                claims = get('pvc')['items']
                report['storage'] = []
                for pvc in claims:
                    spec = pvc['spec']
                    item = dict(name=pvc['metadata']['name'], uid=pvc['metadata']['uid'], phase=pvc.get('status', {}).get('phase'),
                                access_modes=spec.get('accessModes', []), volume_mode=spec.get('volumeMode', 'Filesystem'),
                                storage_class=spec.get('storageClassName'), volume_name=spec.get('volumeName'))
                    if item['volume_name']:
                        try:
                            pv = get('pv', item['volume_name'], global_resource=True)['spec']
                            item['backend_type'] = next((k for k in ['csi', 'nfs', 'hostPath', 'local'] if k in pv), 'other')
                            item['claim_reference_matches'] = pv.get('claimRef', {}).get('uid') == item['uid']
                        except Exception:
                            item['backend_type'] = 'unverified'
                    report['storage'].append(item)
                candidates = [p['name'] for p in report['storage'] if p['phase'] == 'Bound' and p['volume_mode'] == 'Filesystem' and 'ReadWriteMany' in p['access_modes'] and p.get('backend_type') in ['csi', 'nfs'] and p.get('claim_reference_matches')]
                report['rwx_report_candidates'] = candidates
                check('rwx_storage_candidate_exists', bool(candidates))
                check('dedicated_report_pvc_selection_and_permissions_required', False)
            else:
                found = get('pods', selector='app.kubernetes.io/name=system-backup-capacity')['items']
                report['collectors'] = []
                for collector in found:
                    c = next((c for c in collector['spec']['containers'] if c['name'] == 'collector'), None)
                    if not c:
                        continue
                    report['collectors'].append(dict(pod=collector['metadata']['name'], uid=collector['metadata']['uid'], node=collector['spec'].get('nodeName'),
                                                     phase=collector.get('status', {}).get('phase'), image=c['image'], image_matches_fix16=c['image'] == expected['image']))
                check('collector_pod_exists', bool(report['collectors']))
                check('pinned_collector_source_grants_and_report_preflight_required', False)
        except Exception:
            check(stage+'_read_failed_or_invalid', False)
    try:
        check('namespace_uid_stable', get('namespace', namespace, global_resource=True)['metadata']['uid'] == namespace_uid)
        if 'mysql' in report:
            check('mysql_process_stable', fingerprint(pod, 'mysql') == fingerprint(get('pod', pod_name), 'mysql'))
            after = json.loads(query(identity_sql))
            check('database_identity_stable', all(after.get(k) == report.get('database', {}).get(k) for k in ['server_uuid', 'database', 'data_directory']))
    except Exception:
        check('final_identity_recheck_failed', False)
    report['status'] = 'BLOCKED' if report['blockers'] else 'DISCOVERED_ONLY'
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--expected', required=True)
    p.add_argument('--context', required=True)
    p.add_argument('--namespace', required=True)
    p.add_argument('--namespace-uid', required=True)
    args = p.parse_args()
    expected = json.loads(Path(args.expected).read_text(encoding='utf-8'))
    if not expected.get('d_tables') or not all(re.fullmatch(r'[A-Za-z0-9_]+', t) for t in expected['d_tables']):
        raise ValueError('invalid local table inventory')
    result = discover(expected, args.context, args.namespace, args.namespace_uid)
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 2 if result['blockers'] else 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError):
        print('Read-only discovery input rejected; no raw error output retained.')
        raise SystemExit(1)
