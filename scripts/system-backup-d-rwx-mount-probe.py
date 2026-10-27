#!/usr/bin/env python3
"""Disposable two-node RWX test. No business PVCs, host changes or packages."""
import argparse
import importlib.util
import json
import re
import subprocess
import time
import uuid
from pathlib import Path

module_path = Path(__file__).with_name('longhorn_review.py')
if not module_path.exists():
    module_path = Path(__file__).with_name('system-backup-d-longhorn-review.py')
spec = importlib.util.spec_from_file_location('longhorn_review', module_path)
lh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lh)

IMAGE = '10.130.14.23:5000/mysql@sha256:5ea882b1859d3a61814e527215563d809a9f2bf70ffa24c9280f2ff6798f1977'
DEPS = ['RequiredPackages', 'NFSClientInstalled', 'MountPropagation']
SC_PARAMETERS = {'fsType','numberOfReplicas','staleReplicaTimeout','dataEngine','encrypted','fromBackup'}


def require(value, reason):
    if not value:
        raise ValueError(reason)


def storageclass_parameter_review(parameters):
    # Empty fromBackup is part of our shipped Longhorn RWX manifest and does
    # not request a restore. Never expose a nonempty backup URL or unknown value.
    unknown = sorted(set(parameters)-SC_PARAMETERS)
    return dict(parameter_names=sorted(parameters), unreviewed_parameter_names=unknown,
                from_backup_state='absent' if 'fromBackup' not in parameters else 'empty' if parameters['fromBackup']=='' else 'nonempty_rejected')


def validate_storageclass_parameters(parameters):
    require(not(set(parameters)-SC_PARAMETERS), 'unreviewed_storageclass_parameters')
    require(parameters.get('fromBackup','') == '', 'restore_source_not_allowed')
    require(parameters.get('fsType','ext4') == 'ext4', 'filesystem_profile_mismatch')


def preflight(review):
    # These are narrowly scoped exceptions for an unencrypted V1 test only.
    # The original Node condition is retained, never rewritten to healthy.
    allowed = {'dedicated_rwx_mount_permissions_and_freshness_not_tested',
               'longhorn_dependency_Multipathd_requires_review',
               'longhorn_dependency_KernelModulesLoaded_requires_review'}
    require(set(review['blockers']) <= allowed, 'metadata_preflight_blocked')
    require(review['settings']['v1-data-engine'] == 'true' and review['settings']['v2-data-engine'] == 'false', 'v1_only_required')
    kernel = next(c for c in review['dependency_details'] if c['type'] == 'KernelModulesLoaded')
    require(kernel['status'] == 'True' or kernel.get('missing_modules') == ['dm_crypt'], 'unreviewed_kernel_failure')
    host = review['ssh_host_storage_details']
    require(host['block_topology_read_complete'], 'host_topology_incomplete')
    require(not host['existing_longhorn_multipath_conflict_observed'], 'existing_multipath_conflict')
    filters = host.get('effective_multipath_filters')
    require(filters is not None, 'effective_filters_unknown')
    require('^sd[a-z0-9]+' in filters['sections']['blacklist']['devnode'] and not filters['sections']['blacklist_exceptions']['devnode'], 'sd_device_exclusion_not_verified')
    sc = review['storage_class']
    require(sc['reclaim_policy'] == 'Delete' and sc['binding_mode'] == 'Immediate', 'disposable_class_policy_mismatch')
    require(sc['parameters'].get('encrypted', 'false') == 'false', 'encrypted_volume_not_supported')
    require(sc['parameters'].get('dataEngine', 'v1') == 'v1' and sc['parameters'].get('numberOfReplicas') == '2', 'v1_two_replicas_required')


def pod_manifest(name, namespace, run_id, node, reader=False):
    writer = f'''set -eu
umask 027
i=0
while true; do
 i=$((i+1))
 printf '%s %s %s\\n' '{run_id}' "$i" "$(date +%s)" > /report/probe/.next
 chmod 0640 /report/probe/.next
 mv /report/probe/.next /report/probe/report
 sleep 1
done'''
    security = dict(runAsUser=65532 if reader else 999, runAsGroup=65532,
                    runAsNonRoot=True, seccompProfile=dict(type='RuntimeDefault'))
    container = dict(name='probe', image=IMAGE, imagePullPolicy='IfNotPresent',
                     command=['sh', '-c', 'sleep 900' if reader else writer],
                     securityContext=dict(allowPrivilegeEscalation=False, readOnlyRootFilesystem=True, capabilities=dict(drop=['ALL'])),
                     resources=dict(requests=dict(cpu='10m', memory='16Mi'), limits=dict(cpu='100m', memory='64Mi')),
                     volumeMounts=[dict(name='report', mountPath='/report', readOnly=reader)])
    body = dict(restartPolicy='Never', activeDeadlineSeconds=900, automountServiceAccountToken=False,
                nodeSelector={'kubernetes.io/hostname': node}, securityContext=security,
                containers=[container], volumes=[dict(name='report', persistentVolumeClaim=dict(claimName='report', readOnly=reader))])
    if not reader:
        body['initContainers'] = [dict(name='permissions', image=IMAGE, command=['sh', '-c',
            'set -eu; mkdir /report/probe; chown 999:65532 /report/probe; chmod 2770 /report/probe'],
            securityContext=dict(runAsUser=0, runAsGroup=0, runAsNonRoot=False, allowPrivilegeEscalation=False,
                                 readOnlyRootFilesystem=True, capabilities=dict(drop=['ALL'], add=['CHOWN','FOWNER','DAC_OVERRIDE'])),
            volumeMounts=[dict(name='report', mountPath='/report')])]
    return dict(apiVersion='v1', kind='Pod', metadata=dict(name=name, namespace=namespace, labels={'clawmanager.io/test-run': run_id}), spec=body)


def parse_report(raw, run_id, now, fresh):
    fields = raw.strip().split()
    require(len(fields) == 3 and fields[0] == run_id, 'report_run_mismatch')
    require(fields[1].isdigit() and fields[2].isdigit(), 'report_format_invalid')
    age = now-int(fields[2])
    require(0 <= age <= 5 if fresh else age > 5, 'report_freshness_failed')
    return int(fields[1])


def attachment_observation(volume, share_manager, nodes, volume_uid):
    require(volume['metadata']['uid'] == volume_uid, 'volume_identity_drift')
    status=volume.get('status',{})
    if status.get('state') != 'attached' or status.get('robustness') != 'healthy':
        return None
    attached=status.get('currentNodeID')
    require(attached in nodes, 'attachment_node_outside_tested_nodes')
    if not share_manager or share_manager.get('spec',{}).get('nodeName') != attached:
        return None
    if not any(c['type']=='Ready' and c['status']=='True' for c in share_manager.get('status',{}).get('conditions',[])):
        return None
    return dict(node=attached,node_uid=nodes[attached]['uid'],share_manager_uid=share_manager['metadata']['uid'])


def execute(expected, context, source_namespace, source_uid, run=subprocess.run):
    result = dict(kind='d_isolated_rwx_mount_probe', status='BLOCKED', production_report_volume_accepted=False,
                  actual_capacity_admission_tested=False, host_changed=False, database_mutated=False,
                  cluster_mutated=False, cleanup_verified=False, checks=[])
    ns = 'sbk-rwx-'+uuid.uuid4().hex[:20]
    run_id = ns.removeprefix('sbk-rwx-')
    ns_uid = None
    created = False
    claim_attempted = False
    pv_name = None
    volume_name = None
    lh_namespace = None
    failure = None
    phase = 'preflight'
    prefix = ['kubectl', '--context='+context, '--request-timeout=30s']

    def command(args, body=None, ok=True, timeout=60):
        response = run(prefix+args, input=json.dumps(body) if body is not None else None,
                       capture_output=True, text=True, timeout=timeout, check=False)
        if ok:
            require(response.returncode == 0, 'kubectl_action_failed')
        return response

    def get(kind, name, namespace=None, absent=False):
        args = ['get', kind, name] + (['-n', namespace] if namespace else [])
        if absent:
            args += ['--ignore-not-found']
        raw = command(args+['-o', 'json']).stdout
        return json.loads(raw) if raw.strip() else None

    def create(body):
        return json.loads(command(['create', '-f', '-', '-o', 'json'], body).stdout)

    def wait(predicate, seconds=180):
        deadline = time.monotonic()+seconds
        while time.monotonic() < deadline:
            value = predicate()
            if value:
                return value
            time.sleep(2)
        raise ValueError('wait_timeout')

    def read(name):
        return command(['exec', '-n', ns, name, '-c', 'probe', '--', 'cat', '/report/probe/report']).stdout

    try:
        review = lh.review(expected, context, source_namespace, source_uid, run, inspect_host=True, inspect_storage=True)
        result['preflight_observation'] = {key:review.get(key) for key in ['blockers','settings','dependency_details','ssh_host_storage_details']}
        preflight(review)
        raw_class = get('storageclass','longhorn-rwx')
        result['storageclass_parameter_review'] = storageclass_parameter_review(raw_class.get('parameters',{}))
        validate_storageclass_parameters(raw_class.get('parameters',{}))
        require(raw_class['metadata']['uid']==review['storage_class']['uid'] and raw_class['metadata']['resourceVersion']==review['storage_class']['resource_version'], 'storageclass_drift')
        primary = review['node']['name']
        primary_hostname = review['node']['hostname']
        lh_namespace = review['longhorn_namespace']['name']
        peers = sorted({m['node'] for m in review['managers']} - {primary})
        require(bool(peers), 'second_client_node_missing')
        peer = peers[0]
        nodes = {}
        for name in [primary, peer]:
            node = get('node', name)
            require(not node['spec'].get('unschedulable') and not node['spec'].get('taints'), 'client_node_not_schedulable')
            require(any(c['type']=='Ready' and c['status']=='True' for c in node['status']['conditions']), 'client_node_not_ready')
            ln = get('nodes.longhorn.io', name, lh_namespace)
            cond = {c['type']: c['status'] for c in ln['status']['conditions']}
            require(all(cond.get(k) == 'True' for k in DEPS+['Ready']), 'client_dependencies_unknown')
            nodes[name] = dict(uid=node['metadata']['uid'], hostname=node['metadata']['labels']['kubernetes.io/hostname'])
        result['reviewed_exceptions'] = dict(kernel='dm_crypt_only_unencrypted_v1_probe', multipath='effective_sd_devnode_blacklist_no_devnode_exceptions')
        result['source_conditions_cleared'] = False
        phase = 'create-owned-namespace'
        created = True  # Also reconcile an ambiguous create in finally.
        result['cluster_mutated'] = True  # Conservative even if create response is lost.
        namespace = create(dict(apiVersion='v1', kind='Namespace', metadata=dict(name=ns, labels={'clawmanager.io/test-run': run_id, 'clawmanager.io/test-purpose':'rwx-mount'})))
        ns_uid = namespace['metadata']['uid']
        result.update(namespace=ns, namespace_uid=ns_uid, cluster_mutated=True)
        print(f'RWX_RUN namespace={ns} uid={ns_uid}', flush=True)
        claim_attempted = True
        claim = create(dict(apiVersion='v1', kind='PersistentVolumeClaim', metadata=dict(name='report', namespace=ns),
            spec=dict(storageClassName='longhorn-rwx', accessModes=['ReadWriteMany'], volumeMode='Filesystem', resources=dict(requests=dict(storage='16Mi')))))
        phase = 'bind-volume'
        claim = wait(lambda: (lambda c: c if c.get('status',{}).get('phase') == 'Bound' else None)(get('pvc','report',ns)))
        pv_name = claim['spec']['volumeName']
        pv = get('pv', pv_name)
        require(pv['spec']['claimRef']['uid'] == claim['metadata']['uid'] and pv['spec']['csi']['driver'] == 'driver.longhorn.io', 'pv_identity_mismatch')
        require(pv['spec']['persistentVolumeReclaimPolicy'] == 'Delete', 'pv_reclaim_policy_mismatch')
        volume_name = pv['spec']['csi']['volumeHandle']
        volume = get('volumes.longhorn.io',volume_name,lh_namespace)
        require(volume['spec'].get('dataEngine') == 'v1' and volume['spec'].get('encrypted',False) is False and volume['spec'].get('numberOfReplicas') == 2, 'actual_volume_profile_mismatch')
        require(not volume['spec'].get('fromBackup') and not volume['spec'].get('backingImage') and not volume['spec'].get('dataSource'), 'actual_volume_source_not_empty')
        result['volume'] = dict(pvc_uid=claim['metadata']['uid'], pv=pv_name, pv_uid=pv['metadata']['uid'], longhorn_volume=volume_name, volume_uid=volume['metadata']['uid'])
        phase = 'wait-writer-ready'
        create(pod_manifest('writer', ns, run_id, primary_hostname))
        def ready(name, node):
            pod = get('pod',name,ns)
            return pod['spec'].get('nodeName') == node and any(c['type']=='Ready' and c['status']=='True' for c in pod.get('status',{}).get('conditions',[]))
        wait(lambda: ready('writer', primary))
        result['checks'].append('writer_ready_on_selected_client_node')
        phase = 'wait-share-manager'
        def healthy():
            current = get('volumes.longhorn.io',volume_name,lh_namespace)
            sm = get('pod','share-manager-'+volume_name,lh_namespace,absent=True)
            return attachment_observation(current,sm,nodes,volume['metadata']['uid'])
        attachment = wait(healthy)
        result['attachment'] = {**attachment,'writer_node':primary,
            'host_diagnostics_scope_node':primary,'attachment_host_independently_diagnosed':attachment['node']==primary}
        result['checks'].append('healthy_attachment_and_ready_share_manager')
        phase = 'two-node-readonly-consumers'
        for name, node in [('http-reader',primary),('bootstrap-reader',peer)]:
            create(pod_manifest(name,ns,run_id,nodes[node]['hostname'],reader=True))
            wait(lambda name=name,node=node: ready(name,node))
        first = {}
        for name in ['http-reader','bootstrap-reader']:
            first[name] = parse_report(read(name),run_id,time.time(),True)
            mode = command(['exec','-n',ns,name,'--','stat','-c','%u:%g:%a','/report/probe/report']).stdout.strip()
            require(mode == '999:65532:640', 'report_permissions_mismatch')
            write = command(['exec','-n',ns,name,'--','sh','-c','printf x > /report/probe/forbidden'],ok=False)
            require(write.returncode != 0 and 'read-only file system' in write.stderr.lower(), 'readonly_mount_not_enforced')
        time.sleep(2)
        for name in first:
            require(parse_report(read(name),run_id,time.time(),True)>first[name], 'report_not_advancing')
        result['checks'] += ['two_nodes_read_fresh_advancing_same_run','uid999_gid65532_mode0640','both_readonly_mounts_reject_write']
        phase = 'stale-report-check'
        command(['delete','pod','writer','-n',ns,'--wait=true','--timeout=90s'],timeout=110)
        time.sleep(7)
        for name in first:
            parse_report(read(name),run_id,time.time(),False)
        require(healthy() == attachment, 'attachment_changed_or_no_longer_healthy')
        require(get('namespace',source_namespace)['metadata']['uid']==source_uid, 'source_namespace_drift')
        require(get('storageclass','longhorn-rwx')['metadata']['resourceVersion']==review['storage_class']['resource_version'], 'storageclass_drift')
        for name, node in nodes.items():
            require(get('node',name)['metadata']['uid']==node['uid'], 'client_node_drift')
        result['checks'] += ['stale_after_writer_stop','healthy_attachment_identity_stable','identity_stable']
        result['status'] = 'PASS_ISOLATED_RWX'
    except Exception as error:
        failure = phase
        result['failed_phase'] = phase
        result['failure'] = str(error) if isinstance(error,ValueError) and re.fullmatch('[a-z0-9_]+',str(error)) else 'probe_failed_raw_output_withheld'
        if ns_uid:
            try:
                observations=[]
                for name in ['writer','http-reader','bootstrap-reader']:
                    pod=get('pod',name,ns,absent=True)
                    if pod:
                        observations.append(dict(name=name,node=pod['spec'].get('nodeName'),phase=pod.get('status',{}).get('phase'),
                            waiting_reasons=[c.get('state',{}).get('waiting',{}).get('reason') for c in pod.get('status',{}).get('containerStatuses',[])]))
                result['failure_pods']=observations
                if volume_name:
                    current=get('volumes.longhorn.io',volume_name,lh_namespace,absent=True)
                    if current:
                        result['failure_volume']={key:current.get('status',{}).get(key) for key in ['state','robustness','currentNodeID','shareState']}
            except Exception:
                result['failure_metadata_unavailable']=True
    finally:
        if created:
            try:
                current = get('namespace',ns,absent=True)
                if current:
                    require(current['metadata'].get('labels',{}).get('clawmanager.io/test-run')==run_id and current['metadata'].get('labels',{}).get('clawmanager.io/test-purpose')=='rwx-mount', 'cleanup_owner_mismatch')
                    require(ns_uid is None or current['metadata']['uid']==ns_uid, 'cleanup_uid_mismatch')
                    ns_uid=current['metadata']['uid']
                    # Discover a bound volume even if provisioning failed before
                    # the main path could record its identity.
                    claim=get('pvc','report',ns,absent=True)
                    if claim and claim['spec'].get('volumeName'):
                        pv_name=claim['spec']['volumeName']
                        pv=get('pv',pv_name,absent=True)
                        if pv and pv['spec']['claimRef']['uid']==claim['metadata']['uid']:
                            volume_name=pv['spec'].get('csi',{}).get('volumeHandle')
                    command(['delete','namespace',ns,'--wait=true','--timeout=180s'],timeout=210)
                if pv_name:
                    wait(lambda: get('pv',pv_name,absent=True) is None)
                if volume_name:
                    wait(lambda: get('volumes.longhorn.io',volume_name,lh_namespace,absent=True) is None)
                # A lost create response or provisioning race must not turn
                # namespace disappearance into proof of backing-volume cleanup.
                require(not claim_attempted or (pv_name and volume_name), 'provisioning_cleanup_unverified')
                result['cleanup_verified']=True
                print(f'CLEANED rwx-namespace={ns} uid={ns_uid} pv-and-volume=absent',flush=True)
            except Exception:
                result['cleanup_verified']=False
                result['status']='CLEANUP_PENDING'
                print(f'CLEANUP_PENDING rwx-namespace={ns} uid={ns_uid} pv={pv_name} volume={volume_name}',flush=True)
        else:
            result['cleanup_verified']=True
    if failure and result['status'] != 'CLEANUP_PENDING':
        result['status']='BLOCKED'
    return result


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    for name in ['expected','context','namespace','namespace-uid']:
        parser.add_argument('--'+name,required=True)
    parser.add_argument('--host-diagnostics',action='store_true')
    parser.add_argument('--host-storage-details',action='store_true')
    args=parser.parse_args()
    result=execute(json.loads(Path(args.expected).read_text()),args.context,args.namespace,args.namespace_uid)
    print(json.dumps(result,indent=2))
    raise SystemExit(0 if result['status']=='PASS_ISOLATED_RWX' else 2)
