#!/usr/bin/env python3
"""Prepare a NEW permanent report PVC. Never delete the claim or business data."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import time
import uuid

path = Path(__file__).with_name('system-backup-d-rwx-mount-probe.py')
spec = importlib.util.spec_from_file_location('rwx', path)
rwx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rwx)
require = rwx.require
CLAIM = 'system-backup-capacity-report'
LABEL = 'clawmanager.io/report-preparation'
PUBLIC_FAILURES = frozenset({
    'kubectl_failed', 'wait_timeout', 'namespace_drift', 'mysql_identity_drift',
    'storageclass_drift', 'mysql_mount_unsupported', 'mysql_data_target_drift',
    'nonroot_uid_required', 'image_probe_drift', 'image_help_failed',
    'data_pvc_unsupported', 'existing_claim_requires_identity_review_no_reuse',
    'business_pv_reused', 'prepare_pod_drift', 'permissions_failed',
    'prepare_node_mismatch', 'longhorn_uid_drift', 'pv_uid_drift',
    'claim_uid_drift', 'claim_profile', 'pv_claim_identity', 'pv_name_mismatch',
    'longhorn_binding', 'volume_profile', 'volume_not_new',
    'metadata_preflight_blocked', 'host_topology_incomplete',
    'existing_multipath_conflict', 'effective_filters_unknown',
    'sd_device_exclusion_not_verified', 'unreviewed_kernel_failure',
    'v1_only_required', 'disposable_class_policy_mismatch',
    'encrypted_volume_not_supported', 'v1_two_replicas_required',
    'unreviewed_storageclass_parameters', 'restore_source_not_allowed',
    'filesystem_profile_mismatch',
})


def public_failure(error):
    if type(error) is ValueError and str(error) in PUBLIC_FAILURES:
        return str(error)
    if isinstance(error, subprocess.TimeoutExpired):
        return 'command_timeout'
    return 'unexpected_error_details_withheld'


def verify_binding(claim, pv, volume, namespace, claim_uid):
    require(claim['metadata']['uid'] == claim_uid, 'claim_uid_drift')
    require(claim['spec']['accessModes'] == ['ReadWriteMany'] and claim['spec'].get('volumeMode', 'Filesystem') == 'Filesystem', 'claim_profile')
    ref = pv['spec']['claimRef']
    require(ref['uid'] == claim_uid and ref['namespace'] == namespace and ref['name'] == CLAIM, 'pv_claim_identity')
    require(pv['metadata']['name'] == claim['spec']['volumeName'], 'pv_name_mismatch')
    require(pv['spec']['csi']['driver'] == 'driver.longhorn.io' and pv['spec']['csi']['volumeHandle'] == volume['metadata']['name'], 'longhorn_binding')
    v = volume['spec']
    require(v.get('dataEngine') == 'v1' and v.get('encrypted', False) is False and v.get('numberOfReplicas') == 2, 'volume_profile')
    require(not any(v.get(k) for k in ['fromBackup', 'backingImage', 'dataSource']), 'volume_not_new')


def permission_pod(namespace, name, run_id, node, uid, mysql_pvc, subpath):
    # The root init container mounts ONLY the newly created report volume.
    body = rwx.pod_manifest(name, namespace, run_id, node)
    body['metadata']['labels'] = {LABEL: run_id}
    s = body['spec']
    s['securityContext']['runAsUser'] = uid
    s['volumes'][0]['persistentVolumeClaim']['claimName'] = CLAIM
    s['volumes'].append(dict(name='mysql-data', persistentVolumeClaim=dict(claimName=mysql_pvc, readOnly=True)))
    init = s['initContainers'][0]
    init['command'] = ['sh', '-c', 'set -eu; contents="$(find /report -mindepth 1 -maxdepth 1 ! -name lost+found)"; test -z "$contents"; chown 0:65532 /report; chmod 2770 /report']
    c = s['containers'][0]
    c['command'] = ['sh', '-c', '''set -eu
test -r /mysql-data/auto.cnf
awk '$2 == "/mysql-data" && $4 ~ /(^|,)ro(,|$)/ { found=1 } END { exit !found }' /proc/mounts
test "$(id -u)" -eq "$1"
test "$(id -g)" -eq 65532
test "$(stat -c '%g:%a' /report)" = 65532:2770
umask 027
trap 'rm -f /report/.permission-check /report/.permission-check-renamed' EXIT
printf '%s' "$2" > /report/.permission-check
test "$(stat -c '%a' /report/.permission-check)" = 640
mv /report/.permission-check /report/.permission-check-renamed
test "$(cat /report/.permission-check-renamed)" = "$2"
rm /report/.permission-check-renamed
''', 'report-permissions', str(uid), run_id]
    c['volumeMounts'].append(dict(name='mysql-data', mountPath='/mysql-data', readOnly=True, **({'subPath': subpath} if subpath else {})))
    return body


def execute(expected, context, namespace, namespace_uid, run=subprocess.run):
    result = dict(kind='d_permanent_report_preparation', status='BLOCKED', namespace=namespace,
                  namespace_uid=namespace_uid, report_pvc=CLAIM, claim_retained=False,
                  actual_capacity_admission_tested=False, collector_started=False, database_mutated=False,
                  cleanup_verified=False, probe_markers_cleanup_verified=False)
    prefix = ['kubectl', '--context='+context, '--request-timeout=30s']
    owned = {}
    run_id = uuid.uuid4().hex
    phase = 'storage-preflight'
    def command(args, body=None):
        p = run(prefix+args, input=json.dumps(body) if body else None, capture_output=True, text=True, timeout=90, check=False)
        require(p.returncode == 0, 'kubectl_failed')
        return p.stdout
    def get(kind, name, ns=None, absent=False):
        raw = command(['get', kind, name]+(['-n', ns] if ns else [])+(['--ignore-not-found'] if absent else [])+['-o', 'json'])
        return json.loads(raw) if raw.strip() else None
    def create(body):
        return json.loads(command(['create', '-f', '-', '-o', 'json'], body))
    def wait(fn):
        until = time.monotonic()+180
        while time.monotonic() < until:
            value = fn()
            if value:
                return value
            time.sleep(2)
        raise ValueError('wait_timeout')
    def identity():
        require(get('namespace', namespace)['metadata']['uid'] == namespace_uid, 'namespace_drift')
        p = get('pod', expected['mysql_target']['pod'], namespace)
        require(p['metadata']['uid'] == expected['mysql_target']['pod_uid'] and p['spec']['nodeName'] == expected['storage_target']['node']['name'], 'mysql_identity_drift')
        return p
    try:
        review = rwx.lh.review(expected, context, namespace, namespace_uid, run, inspect_host=True, inspect_storage=True)
        rwx.preflight(review)
        sc = get('storageclass', 'longhorn-rwx')
        rwx.validate_storageclass_parameters(sc.get('parameters', {}))
        require(sc['metadata']['uid'] == review['storage_class']['uid'] and sc['metadata']['resourceVersion'] == review['storage_class']['resource_version'], 'storageclass_drift')
        result['storage_conditions'] = review['dependency_details']
        result['storage_class_uid'] = sc['metadata']['uid']
        phase = 'collector-uid-discovery'
        mysql = identity()
        target = expected['mysql_target']
        container = next(c for c in mysql['spec']['containers'] if c['name'] == target['container'])
        mounts = [m for m in container['volumeMounts'] if m['mountPath'].rstrip('/') == '/var/lib/mysql']
        require(len(mounts) == 1 and not mounts[0].get('subPathExpr'), 'mysql_mount_unsupported')
        mount = mounts[0]
        data = next(v['persistentVolumeClaim']['claimName'] for v in mysql['spec']['volumes'] if v['name'] == mount['name'])
        require(data == target['data_pvc'] and mount.get('subPath', '') == target.get('data_subpath', ''), 'mysql_data_target_drift')
        uid_raw = command(['exec', '-n', namespace, target['pod'], '-c', target['container'], '--', 'stat', '-c', '%u', '/var/lib/mysql/auto.cnf']).strip()
        require(bool(re.fullmatch(r'[0-9]+', uid_raw)) and 0 < int(uid_raw) <= 2147483647, 'nonroot_uid_required')
        uid = int(uid_raw)
        result.update(collector_uid=uid, report_gid=65532, mysql_data_pvc=data)
        phase = 'image-capacity-flags'
        help_name = 'sbk-capacity-help-'+run_id[:12]
        owned[help_name] = None
        help_pod = dict(apiVersion='v1', kind='Pod', metadata=dict(name=help_name, namespace=namespace, labels={LABEL: run_id}), spec=dict(
            restartPolicy='Never', activeDeadlineSeconds=120, automountServiceAccountToken=False,
            securityContext=dict(runAsUser=uid, runAsGroup=65532, runAsNonRoot=True, seccompProfile=dict(type='RuntimeDefault')),
            containers=[dict(name='help', image=expected['image'], command=['/usr/local/bin/clawreef-system-backup-registration', '-help'],
                securityContext=dict(allowPrivilegeEscalation=False, readOnlyRootFilesystem=True, capabilities=dict(drop=['ALL'])))]))
        hp = create(help_pod)
        owned[help_name] = hp['metadata']['uid']
        def help_done():
            p = get('pod', help_name, namespace)
            require(p['metadata']['uid'] == owned[help_name], 'image_probe_drift')
            require(p.get('status', {}).get('phase') != 'Failed', 'image_help_failed')
            return p if p.get('status', {}).get('phase') == 'Succeeded' else None
        hp = wait(help_done)
        help_text = command(['logs', '-n', namespace, help_name, '-c', 'help'])
        required_flags = ['capacity-config', 'collect-capacity', 'check-capacity-source']
        flags_ok = all(re.search(r'(?m)^\s+-'+flag+r'(?:\s|$)', help_text) for flag in required_flags)
        result['image_capacity_flags_supported'] = flags_ok
        result['image_id'] = hp['status']['containerStatuses'][0]['imageID']
        # A missing collector mode does not prevent independent report provisioning.
        phase = 'data-claim-check'
        data_claim = get('pvc', data, namespace)
        require(data_claim['status']['phase'] == 'Bound' and 'ReadWriteOncePod' not in data_claim['spec']['accessModes'], 'data_pvc_unsupported')
        require(get('pvc', CLAIM, namespace, True) is None, 'existing_claim_requires_identity_review_no_reuse')
        identity()
        phase = 'create-permanent-claim'
        # An ambiguous create is deliberately retained and identified, never deleted.
        result['claim_create_attempted'] = True
        claim = create(dict(apiVersion='v1', kind='PersistentVolumeClaim', metadata=dict(name=CLAIM, namespace=namespace, labels={LABEL: run_id}), spec=dict(storageClassName='longhorn-rwx', accessModes=['ReadWriteMany'], volumeMode='Filesystem', resources=dict(requests=dict(storage='16Mi')))))
        claim_uid = claim['metadata']['uid']
        result.update(claim_retained=True, pvc_uid=claim_uid, run_id=run_id)
        phase = 'bind-permanent-claim'
        claim = wait(lambda: (lambda c: c if c.get('status', {}).get('phase') == 'Bound' else None)(get('pvc', CLAIM, namespace)))
        pv = get('pv', claim['spec']['volumeName'])
        require(pv['metadata']['name'] != data_claim['spec']['volumeName'], 'business_pv_reused')
        lhns = review['longhorn_namespace']['name']
        volume = get('volumes.longhorn.io', pv['spec']['csi']['volumeHandle'], lhns)
        verify_binding(claim, pv, volume, namespace, claim_uid)
        result.update(pv=pv['metadata']['name'], pv_uid=pv['metadata']['uid'], longhorn_namespace=lhns, longhorn_volume=volume['metadata']['name'], longhorn_uid=volume['metadata']['uid'], reclaim_policy=pv['spec']['persistentVolumeReclaimPolicy'])
        phase = 'prepare-report-permissions'
        name = 'sbk-report-prepare-'+run_id[:12]
        owned[name] = None
        pod = create(permission_pod(namespace, name, run_id, review['node']['hostname'], uid, data, mount.get('subPath', '')))
        owned[name] = pod['metadata']['uid']
        def complete():
            p = get('pod', name, namespace)
            require(p['metadata']['uid'] == owned[name], 'prepare_pod_drift')
            require(p.get('status', {}).get('phase') != 'Failed', 'permissions_failed')
            return p if p.get('status', {}).get('phase') == 'Succeeded' else None
        finished = wait(complete)
        result['probe_markers_cleanup_verified'] = True
        require(finished['spec']['nodeName'] == mysql['spec']['nodeName'], 'prepare_node_mismatch')
        require(get('volumes.longhorn.io', volume['metadata']['name'], lhns)['metadata']['uid'] == result['longhorn_uid'], 'longhorn_uid_drift')
        final_claim = get('pvc', CLAIM, namespace)
        final_pv = get('pv', result['pv'])
        final_volume = get('volumes.longhorn.io', result['longhorn_volume'], lhns)
        verify_binding(final_claim, final_pv, final_volume, namespace, claim_uid)
        require(final_pv['metadata']['uid'] == result['pv_uid'], 'pv_uid_drift')
        result['longhorn_state_after_probe'] = {k: final_volume.get('status', {}).get(k) for k in ['state', 'robustness', 'currentNodeID']}
        identity()
        result.update(status='PREPARED_NOT_ACCEPTED', auto_cnf_readable_as_collector=True, mysql_mount_readonly_verified=True, report_write_rename_verified=True,
                      remaining=([] if flags_ok else ['image_flags'])+['dedicated_account_secret', 'real_report_updates_and_expiry', 'cross_node_real_consumers'])
    except Exception as error:
        result['blocked_phase'] = phase
        result['failure'] = public_failure(error)
    finally:
        pending = []
        for name, uid in owned.items():
            try:
                require(get('namespace', namespace)['metadata']['uid'] == namespace_uid, 'cleanup_namespace_drift')
                p = get('pod', name, namespace, True)
                if p:
                    require(p['metadata'].get('labels', {}).get(LABEL) == run_id and (uid is None or p['metadata']['uid'] == uid), 'cleanup_identity_drift')
                    command(['delete', 'pod', name, '-n', namespace, '--wait=true', '--timeout=60s'])
                    require(get('pod', name, namespace, True) is None, 'cleanup_pending')
            except Exception:
                pending.append(dict(pod=name, uid=uid))
        result['cleanup_verified'] = not pending
        result['cleanup_pending'] = pending
        if pending:
            result['status'] = 'BLOCKED'
        if result.get('claim_create_attempted'):
            try:
                c = get('pvc', CLAIM, namespace, True)
                if c and c['metadata'].get('labels', {}).get(LABEL) == run_id:
                    if result.get('pvc_uid') and result['pvc_uid'] != c['metadata']['uid']:
                        result['claim_reconciliation_required'] = True
                        result['status'] = 'BLOCKED'
                    else:
                        result.update(claim_retained=True, pvc_uid=c['metadata']['uid'], run_id=run_id)
                else:
                    result['claim_reconciliation_required'] = True
                    result['status'] = 'BLOCKED'
            except Exception:
                result['claim_reconciliation_required'] = True
                result['status'] = 'BLOCKED'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for key in ['expected', 'context', 'namespace', 'namespace-uid']:
        parser.add_argument('--'+key, required=True)
    args = parser.parse_args()
    result = execute(json.loads(Path(args.expected).read_text(encoding='utf-8')), args.context, args.namespace, args.namespace_uid)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['status'] == 'PREPARED_NOT_ACCEPTED' else 2)
