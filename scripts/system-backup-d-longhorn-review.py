#!/usr/bin/env python3
"""Read public Longhorn/Kubernetes metadata. No exec, installs or mutations."""
import argparse
import json
import re
import socket
import hashlib
import shlex
import stat
import os
from datetime import datetime, timezone
import subprocess
from pathlib import Path


def kernel_block_path(info, sys_dev_block=Path('/sys/dev/block')):
    # /dev/longhorn/<volume> can be a directly mknod-created block device,
    # not a symlink named sdX. Its rdev is the authoritative sysfs identity.
    if not stat.S_ISBLK(info.st_mode):
        raise ValueError('not a block device')
    return (sys_dev_block / f'{os.major(info.st_rdev)}:{os.minor(info.st_rdev)}').resolve(strict=True)


def multipath_filters(config):
    """Summarize active config without exposing WWIDs or arbitrary config text.

    This is evidence for review, not an automatic blacklist approval engine.
    """
    if len(config) > 2*1024*1024:
        raise ValueError('oversized multipath config')
    lexer = shlex.shlex(config, posix=True, punctuation_chars='{}')
    lexer.whitespace_split = True
    tokens = list(lexer)
    sections = {key: dict(devnode=[], other_rule_count=0) for key in ['blacklist', 'blacklist_exceptions']}
    stack = []
    for index, token in enumerate(tokens):
        if token == '{':
            if index == 0:
                raise ValueError('invalid stanza')
            stack.append(tokens[index-1])
        elif token == '}':
            if not stack:
                raise ValueError('unbalanced stanza')
            stack.pop()
        elif len(stack) == 1 and stack[0] in sections:
            if token == 'devnode':
                value = tokens[index+1] if index+1 < len(tokens) else ''
                if not value or len(value) > 256 or value in ['{', '}']:
                    raise ValueError('invalid devnode rule')
                sections[stack[0]]['devnode'].append(value)
            elif token in ['wwid', 'device', 'property', 'protocol']:
                sections[stack[0]]['other_rule_count'] += 1
    if stack:
        raise ValueError('unbalanced config')
    return dict(config_sha256=hashlib.sha256(config.encode()).hexdigest(), sections=sections,
                future_longhorn_exclusion_verified=False)


def host_storage_details(run=subprocess.run):
    result = dict(mutated=False, module_loaded_by_probe=False, service_changed=False)
    try:
        response = run(['modinfo', '-F', 'filename', 'dm_crypt'], capture_output=True, text=True, timeout=15, check=False)
        result['dm_crypt_module_file_available'] = response.returncode == 0 and bool(response.stdout.strip())
    except (OSError, subprocess.TimeoutExpired):
        result['dm_crypt_module_file_available'] = None
    # Never run modprobe, multipath -f/-F or reconfigure in a read-only probe.
    try:
        root = Path('/sys/class/block')
        if not root.is_dir():
            raise ValueError('no sysfs')
        maps = set()
        for block in root.glob('dm-*'):
            uuid = block / 'dm/uuid'
            if uuid.is_file() and uuid.read_text().strip().startswith('mpath-'):
                maps.add(block.name)
        result['active_multipath_map_count'] = len(maps)
        result['longhorn_block_devices'] = []
        for path in Path('/dev/longhorn').glob('*'):
            info = path.stat()
            if not stat.S_ISBLK(info.st_mode):
                continue
            sys_block = kernel_block_path(info)
            block = sys_block.name
            holders = [p.name for p in (sys_block / 'holders').iterdir()]
            result['longhorn_block_devices'].append(dict(
                volume_name_sha256=hashlib.sha256(path.name.encode()).hexdigest(),
                block_device=block, multipath_holders=sorted(set(holders) & maps)))
        result['existing_longhorn_multipath_conflict_observed'] = any(v['multipath_holders'] for v in result['longhorn_block_devices'])
    except (OSError, ValueError):
        result['block_topology_read_complete'] = False
    else:
        result['block_topology_read_complete'] = True
    try:
        active = run(['systemctl', 'is-active', 'multipathd.service'], capture_output=True, text=True, timeout=15, check=False)
        if active.returncode != 0 or active.stdout.strip() != 'active':
            raise ValueError('daemon not active; avoid socket activation')
        response = run(['multipathd', 'show', 'config'], capture_output=True, text=True, timeout=15, check=False)
        if response.returncode != 0 or not response.stdout.strip():
            raise ValueError('effective config unavailable')
        result['effective_multipath_filters'] = multipath_filters(response.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        result['effective_multipath_filters'] = None
    result['safe_to_stop_multipathd'] = False
    return result


def dependency_details(conditions):
    """Extract only the v1.12 module vocabulary; never echo arbitrary messages."""
    output = []
    for condition in conditions:
        if condition.get('type') not in ['Multipathd', 'KernelModulesLoaded', 'NFSClientInstalled', 'RequiredPackages', 'MountPropagation']:
            continue
        item = {k: condition.get(k) for k in ['type', 'status', 'reason', 'lastTransitionTime']}
        if item['type'] == 'KernelModulesLoaded':
            match = re.fullmatch(r'Kernel modules \[([a-z0-9_ ]+)\] are not loaded', condition.get('message', ''))
            modules = match.group(1).split() if match else []
            known = {'dm_crypt', 'vfio_pci', 'uio_pci_generic', 'nvme_tcp'}
            item['missing_modules'] = sorted(set(modules)) if modules and set(modules) <= known else None
            item['module_message_recognized'] = item['missing_modules'] is not None
        output.append(item)
    return output


def host_diagnostics(expected_hostname, run=subprocess.run, hostname=None, sys_module=Path('/sys/module')):
    """Read only on the SSH host after matching the pinned Kubernetes hostname."""
    result = dict(hostname_matches=False, mutated=False, device_claim_verified=False)
    if (hostname or socket.gethostname()) != expected_hostname:
        return result
    result['hostname_matches'] = True
    result['kernel_modules_present'] = {name: (sys_module / name).is_dir() for name in
        ['dm_crypt', 'vfio_pci', 'uio_pci_generic', 'nvme_tcp', 'iscsi_tcp', 'nfs']}
    result['module_scope'] = 'sysfs_present_loaded_or_builtin_not_a_complete_kernel_config_check'
    result['services'] = {}
    for unit in ['multipathd.service', 'multipathd.socket', 'iscsid.service']:
        try:
            response = run(['systemctl', 'is-active', unit], capture_output=True, text=True, timeout=15, check=False)
            state = response.stdout.strip()
            result['services'][unit] = state if state in ['active', 'inactive', 'failed', 'activating', 'deactivating', 'unknown'] else 'unavailable'
        except (OSError, subprocess.TimeoutExpired):
            result['services'][unit] = 'unavailable'
    # Do not connect to a dormant activation socket and inadvertently start it.
    if result['services']['multipathd.service'] != 'active':
        result['multipathd_status_response_nonempty'] = None
        result['multipathd_status_command_succeeded'] = False
        return result
    try:
        response = run(['multipathd', 'show', 'status'], capture_output=True, text=True, timeout=15, check=False)
        result['multipathd_status_response_nonempty'] = bool(response.stdout.strip())
        result['multipathd_status_command_succeeded'] = response.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        result['multipathd_status_response_nonempty'] = None
        result['multipathd_status_command_succeeded'] = False
    return result


def review(expected, context, namespace, namespace_uid, run=subprocess.run, inspect_host=False, inspect_storage=False):
    target = expected['storage_target']
    result = dict(kind='d_longhorn_readonly_review', status='BLOCKED', checks=[],
                  blockers=['dedicated_rwx_mount_permissions_and_freshness_not_tested'],
                  cluster_mutated=False, database_mutated=False, storage_authorized=False)
    result['captured_at'] = datetime.now(timezone.utc).isoformat()

    def check(name, ok):
        result['checks'].append(dict(name=name, passed=bool(ok)))
        if not ok:
            result['blockers'].append(name)
        return bool(ok)

    def get(kind, name=None, ns=None, all_ns=False, selector=None):
        args = ['kubectl', '--context='+context, '--request-timeout=20s', 'get', kind]
        if name:
            args.append(name)
        if ns:
            args += ['-n', ns]
        if all_ns:
            args += ['-A']
        if selector:
            args += ['-l', selector]
        r = run(args+['-o', 'json'], capture_output=True, text=True, timeout=45, check=False)
        if r.returncode or len(r.stdout) > 16*1024*1024:
            raise ValueError('metadata read failed')
        return json.loads(r.stdout)

    def conditions(obj):
        return [dict(type=c.get('type'), status=c.get('status'), reason=c.get('reason'))
                for c in obj.get('status', {}).get('conditions', [])]

    try:
        if not check('namespace_uid_matches', get('namespace', namespace)['metadata']['uid'] == namespace_uid):
            return result
        node = get('node', target['node']['name'])
        if not check('node_uid_matches', node['metadata']['uid'] == target['node']['uid']):
            return result
        pod = get('pod', expected['mysql_target']['pod'], namespace)
        if not check('mysql_pod_node_matches', pod['metadata']['uid'] == expected['mysql_target']['pod_uid'] and pod['spec'].get('nodeName') == target['node']['name']):
            return result
        result['node'] = dict(name=node['metadata']['name'], uid=node['metadata']['uid'],
                              hostname=node['metadata'].get('labels', {}).get('kubernetes.io/hostname'),
                              unschedulable=node['spec'].get('unschedulable', False), taints=node['spec'].get('taints', []),
                              conditions=conditions(node))
        check('target_node_ready', any(c['type'] == 'Ready' and c['status'] == 'True' for c in result['node']['conditions']))
        check('target_node_schedulable', not result['node']['unschedulable'])
    except Exception:
        check('target_identity_read_failed', False)
        return result

    sc = None
    try:
        sc = get('storageclass', 'longhorn-rwx')
        allowed = ['numberOfReplicas', 'dataLocality', 'staleReplicaTimeout', 'fsType', 'dataEngine', 'encrypted',
                   'diskSelector', 'nodeSelector', 'migratable', 'shareManagerNodeSelector', 'nfsOptions']
        result['storage_class'] = dict(name=sc['metadata']['name'], uid=sc['metadata']['uid'], resource_version=sc['metadata']['resourceVersion'],
                                      provisioner=sc.get('provisioner'), binding_mode=sc.get('volumeBindingMode', 'Immediate'),
                                      reclaim_policy=sc.get('reclaimPolicy', 'Delete'), allow_expansion=sc.get('allowVolumeExpansion', False),
                                      parameters={k: v for k, v in sc.get('parameters', {}).items() if k in allowed})
        check('rwx_class_driver_matches', sc.get('provisioner') == 'driver.longhorn.io')
        check('rwx_class_not_migratable', str(sc.get('parameters', {}).get('migratable', 'false')).lower() == 'false')
        check('rwx_class_not_prepopulated', not any(sc.get('parameters', {}).get(k) for k in ['fromBackup', 'backingImage']))
        result['storage_class']['allowed_topologies'] = sc.get('allowedTopologies', [])
        driver = get('csidriver', 'driver.longhorn.io')
        result['csi_driver'] = dict(uid=driver['metadata']['uid'], fs_group_policy=driver.get('spec', {}).get('fsGroupPolicy'),
                                   attach_required=driver.get('spec', {}).get('attachRequired'))
        csi_node = get('csinode', target['node']['name'])
        check('target_node_csi_registered', any(d.get('name') == 'driver.longhorn.io' for d in csi_node.get('spec', {}).get('drivers', [])))
    except Exception:
        check('storage_class_or_csi_read_failed', False)

    lh_ns = None
    lh_uid = None
    try:
        managers = get('pods', all_ns=True, selector='app=longhorn-manager')['items']
        namespaces = {p['metadata']['namespace'] for p in managers}
        if len(namespaces) != 1:
            raise ValueError('manager namespace ambiguous or absent')
        lh_ns = next(iter(namespaces))
        lh_uid = get('namespace', lh_ns)['metadata']['uid']
        result['longhorn_namespace'] = dict(name=lh_ns, uid=lh_uid)
        result['managers'] = [dict(name=p['metadata']['name'], uid=p['metadata']['uid'], node=p['spec'].get('nodeName'),
                                   phase=p.get('status', {}).get('phase'), conditions=conditions(p),
                                   images=[c.get('image') for c in p['spec'].get('containers', []) if c.get('name') == 'longhorn-manager']) for p in managers]
        check('target_node_manager_ready', any(p['node'] == target['node']['name'] and p['phase'] == 'Running' and any(c['type'] == 'Ready' and c['status'] == 'True' for c in p['conditions']) for p in result['managers']))
        result['workloads'] = []
        for kind in ['daemonsets', 'deployments']:
            for w in get(kind, ns=lh_ns)['items']:
                if not w['metadata']['name'].startswith(('longhorn-', 'csi-')):
                    continue
                status = w.get('status', {})
                desired = status.get('desiredNumberScheduled', 0) if kind == 'daemonsets' else w['spec'].get('replicas', 1)
                ready = status.get('numberReady', 0) if kind == 'daemonsets' else status.get('readyReplicas', 0)
                observed = status.get('observedGeneration', 0) >= w['metadata'].get('generation', 1)
                result['workloads'].append(dict(kind=kind, name=w['metadata']['name'], desired=desired, ready=ready, generation_observed=observed))
                check(kind+'_'+w['metadata']['name']+'_ready', desired > 0 and ready == desired and observed)
        check('csi_plugin_daemonset_observed', any(w['name'] == 'longhorn-csi-plugin' and w['kind'] == 'daemonsets' for w in result['workloads']))
        lh_node = get('nodes.longhorn.io', target['node']['name'], lh_ns)
        result['longhorn_node'] = dict(uid=lh_node['metadata']['uid'], allow_scheduling=lh_node.get('spec', {}).get('allowScheduling'),
                                       conditions=conditions(lh_node), disks=[])
        result['dependency_details'] = dependency_details(lh_node.get('status', {}).get('conditions', []))
        for disk, state in lh_node.get('status', {}).get('diskStatus', {}).items():
            result['longhorn_node']['disks'].append(dict(name=disk, storage_available=state.get('storageAvailable'), storage_maximum=state.get('storageMaximum'), storage_scheduled=state.get('storageScheduled'), conditions=conditions(dict(status=state))))
        # Conditions vary by installed version. Absence is unknown, not success.
        check('longhorn_node_ready', any(c['type'] == 'Ready' and c['status'] == 'True' for c in result['longhorn_node']['conditions']))
        # Node Ready alone does not clear package/kernel/multipath conditions.
        # Keep engine-specific findings for review; never modify the host here.
        dependency_conditions = ['RequiredPackages', 'NFSClientInstalled', 'KernelModulesLoaded', 'MountPropagation', 'Multipathd']
        result['dependency_condition_findings'] = [c for c in result['longhorn_node']['conditions'] if c['type'] in dependency_conditions and c['status'] != 'True']
        for condition in result['dependency_condition_findings']:
            check('longhorn_dependency_'+condition['type']+'_requires_review', False)
        for name in ['Multipathd', 'KernelModulesLoaded', 'NFSClientInstalled', 'RequiredPackages', 'MountPropagation']:
            check('longhorn_dependency_'+name+'_observed', any(c['type'] == name for c in result['dependency_details']))
        result['client_dependencies_verified'] = False
        result['settings'] = {}
        for name in ['default-replica-count', 'storage-minimal-available-percentage', 'storage-over-provisioning-percentage', 'v1-data-engine', 'v2-data-engine']:
            setting = get('settings.longhorn.io', name, lh_ns)
            result['settings'][name] = setting.get('value')
        # Resolve class intent only. Created volume.spec.dataEngine still needs
        # verification during the separate mount test.
        result['requested_data_engine'] = sc.get('parameters', {}).get('dataEngine') if sc else None
        result['engine_default_requires_volume_verification'] = result['requested_data_engine'] is None
        check('engine_settings_boolean', all(result['settings'][k] in ['true', 'false'] for k in ['v1-data-engine', 'v2-data-engine']))
        result['diagnostic_interpretation'] = dict(
            multipath='daemon_response_observed_not_proof_of_device_claim',
            kernel='v1.12_checks_dm_crypt_plus_v2_modules_when_v2_enabled',
            host_independently_verified=False, volume_engine_verified=False)
        if inspect_host:
            result['ssh_host_diagnostics'] = host_diagnostics(result['node']['hostname'], run)
            check('ssh_host_hostname_matches_target', result['ssh_host_diagnostics']['hostname_matches'])
            if inspect_storage and result['ssh_host_diagnostics']['hostname_matches']:
                result['ssh_host_storage_details'] = host_storage_details(run)
    except Exception:
        check('longhorn_metadata_read_failed_or_invalid', False)
    try:
        check('namespace_uid_stable', get('namespace', namespace)['metadata']['uid'] == namespace_uid)
        check('node_uid_stable', get('node', target['node']['name'])['metadata']['uid'] == node['metadata']['uid'])
        current_pod = get('pod', expected['mysql_target']['pod'], namespace)
        check('mysql_pod_node_stable', current_pod['metadata']['uid'] == pod['metadata']['uid'] and current_pod['spec'].get('nodeName') == pod['spec'].get('nodeName'))
        if sc:
            current = get('storageclass', 'longhorn-rwx')
            check('storage_class_stable', all(current['metadata'][k] == sc['metadata'][k] for k in ['uid', 'resourceVersion']))
        if lh_uid:
            check('longhorn_namespace_uid_stable', get('namespace', lh_ns)['metadata']['uid'] == lh_uid)
    except Exception:
        check('final_identity_read_failed', False)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ['expected', 'context', 'namespace', 'namespace-uid']:
        parser.add_argument('--'+name, required=True)
    parser.add_argument('--host-diagnostics', action='store_true')
    parser.add_argument('--host-storage-details', action='store_true')
    args = parser.parse_args()
    try:
        expected = json.loads(Path(args.expected).read_text(encoding='utf-8'))
        if args.host_storage_details and not args.host_diagnostics:
            raise ValueError('storage details require host identity diagnostics')
        print(json.dumps(review(expected, args.context, args.namespace, args.namespace_uid, inspect_host=args.host_diagnostics, inspect_storage=args.host_storage_details), ensure_ascii=True, indent=2))
        raise SystemExit(2)
    except (ValueError, KeyError, OSError):
        print('Longhorn review input rejected; no raw driver output retained.')
        raise SystemExit(1)
