#!/usr/bin/env python3
"""D 080/storage review observations only. Does not authorize migration."""
import argparse
import json
import re
import subprocess
from pathlib import Path


def review(expected, context, namespace, namespace_uid, run=subprocess.run):
    target = expected['upgrade_target']
    result = dict(kind='d_080_storage_readonly_review', status='BLOCKED',
                  catalog_sha256=expected['catalog_sha256'], image=expected['image'],
                  checks=[], blockers=['historical_migration_sources_unresolved', 'fresh_schema_reference_missing',
                                       'report_storage_and_credentials_not_provisioned'],
                  database_mutated=False, cluster_mutated=False, migration_authorized=False)
    def check(name, passed):
        result['checks'].append(dict(name=name, passed=bool(passed)))
        if not passed:
            result['blockers'].append(name)
        return bool(passed)

    def command(args, sql=None):
        r = run(['kubectl', '--context='+context, '--request-timeout=20s']+args,
                input=sql, capture_output=True, text=True, timeout=60, check=False)
        if r.returncode or len(r.stdout) > 16*1024*1024:
            raise ValueError('read failed')
        return r.stdout

    def get(kind, name, global_resource=False):
        args = ([] if global_resource else ['-n', namespace])+['get', kind]
        return json.loads(command(args+([name] if name else [])+['-o', 'json']))

    mysql = target['mysql']
    def query(sql):
        return command(['-n', namespace, 'exec', '-i', mysql['pod'], '-c', mysql['container'], '--',
                        'sh', '-c', 'set -eu; MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names'], sql)

    def fingerprint(p):
        return [p['metadata']['uid'], p['spec'].get('nodeName'),
                [(c.get('containerID'), c.get('restartCount')) for c in p.get('status', {}).get('containerStatuses', []) if c['name'] == mysql['container']]]

    stage = 'identity'
    try:
        if not check('namespace_uid_matches', get('namespace', namespace, True)['metadata']['uid'] == namespace_uid):
            return result
        pod = get('pod', mysql['pod'])
        if not check('mysql_pod_node_matches', pod['metadata']['uid'] == mysql['pod_uid'] and pod['spec'].get('nodeName') == mysql['node']):
            return result
        identity_sql = "SELECT JSON_OBJECT('server_uuid',@@server_uuid,'database',DATABASE());"
        identity = json.loads(query(identity_sql))
        if not check('database_identity_matches', identity == {k: target['database'][k] for k in ['server_uuid', 'database']}):
            return result
    except Exception:
        check('identity_read_failed', False)
        return result

    for stage in ['migration', 'foreign_key', 'capture_gate', 'storage_topology']:
        try:
            if stage == 'migration':
                names = query('SELECT filename FROM schema_migrations ORDER BY filename;').strip().splitlines()
                result['ledger'] = dict(count=len(names), missing=sorted(set(expected['migrations'])-set(names)), unexpected=sorted(set(names)-set(expected['migrations'])))
                check('only_080_is_pending', result['ledger']['missing'] == ['080_add_system_backup_registration_runtime.sql'])
                check('ledger_has_no_unknown_files', not result['ledger']['unexpected'])
                runtime_tables = ['system_backup_admin_revocations', 'system_backup_admin_sessions', 'system_backup_metadata_reservations', 'system_backup_totp_credentials']
                quoted = ','.join("'"+t+"'" for t in runtime_tables)
                present = query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ("+quoted+") ORDER BY TABLE_NAME;").strip().splitlines()
                result['runtime_tables_already_present'] = present
                check('080_clean_first_apply_no_partial_tables', not present)
            elif stage == 'foreign_key':
                # Only information_schema: no users rows, passwords or MFA material.
                result['users_fk_metadata'] = json.loads(query("SELECT JSON_OBJECT('engine',(SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'),'id_type',(SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='id'),'id_nullable',(SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='id'),'single_primary_id',(SELECT COUNT(*)=1 AND COALESCE(SUM(COLUMN_NAME='id'),0)=1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='PRIMARY'));"))
                m = result['users_fk_metadata']
                check('users_id_matches_080_signed_int_fk', m['engine'] == 'InnoDB' and bool(re.fullmatch(r'int(?:\(\d+\))?', str(m['id_type']))) and m['id_nullable'] == 'NO' and m['single_primary_id'] == 1)
            elif stage == 'capture_gate':
                count = query("SELECT COUNT(*) FROM system_maintenance_locks WHERE gate_state <> 'idle' OR lock_owner IS NOT NULL OR heartbeat_at IS NOT NULL OR lease_expires_at IS NOT NULL;").strip()
                if not re.fullmatch(r'\d+', count):
                    raise ValueError('invalid gate count')
                result['active_capture_gates'] = int(count)
                check('capture_gate_observed_idle', int(count) == 0)
                result['capture_lock_acquired'] = False  # Observation is not the runner's exclusion.
            else:
                node = get('node', mysql['node'], True)
                result['node'] = dict(name=node['metadata']['name'], uid=node['metadata']['uid'], hostname_label=node['metadata'].get('labels', {}).get('kubernetes.io/hostname'),
                                      unschedulable=node['spec'].get('unschedulable', False), taints=node['spec'].get('taints', []))
                result['storage_classes'] = [dict(name=sc['metadata']['name'], provisioner=sc.get('provisioner'), binding_mode=sc.get('volumeBindingMode', 'Immediate')) for sc in get('storageclasses', None, True)['items']]
                pvc = get('pvc', mysql['data_pvc'])
                pv = get('pv', pvc['spec']['volumeName'], True)
                # Selected path metadata only, to review report-directory separation.
                result['mysql_volume'] = dict(pvc=pvc['metadata']['name'], pvc_uid=pvc['metadata']['uid'], pv=pv['metadata']['name'], pv_uid=pv['metadata']['uid'],
                                              host_path=pv['spec'].get('hostPath', {}).get('path'), local_path=pv['spec'].get('local', {}).get('path'), node_affinity=pv['spec'].get('nodeAffinity'))
                check('mysql_pv_claim_uid_matches', pv['spec'].get('claimRef', {}).get('uid') == pvc['metadata']['uid'])
        except Exception:
            check(stage+'_read_failed_or_invalid', False)
    try:
        check('namespace_uid_stable', get('namespace', namespace, True)['metadata']['uid'] == namespace_uid)
        check('mysql_process_stable', fingerprint(pod) == fingerprint(get('pod', mysql['pod'])))
        check('database_identity_stable', json.loads(query(identity_sql)) == identity)
    except Exception:
        check('final_identity_read_failed', False)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for key in ['expected', 'context', 'namespace', 'namespace-uid']:
        parser.add_argument('--'+key, required=True)
    args = parser.parse_args()
    try:
        expected = json.loads(Path(args.expected).read_text(encoding='utf-8'))
        report = review(expected, args.context, args.namespace, args.namespace_uid)
        print(json.dumps(report, ensure_ascii=True, indent=2))
        raise SystemExit(2)
    except (ValueError, KeyError, OSError):
        print('Upgrade review input rejected; no raw driver output retained.')
        raise SystemExit(1)
