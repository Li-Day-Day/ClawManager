#!/usr/bin/env python3
"""Read-only Kubernetes NFS mount inventory, not a quiescence certificate.

Only selected metadata is printed. No exec, Secret reads, environment values,
commands, logs, file contents or cluster mutations. Python standard library only.
"""
import argparse
import datetime
import json
import posixpath
import subprocess
import sys


def identity(obj):
    m = obj.get('metadata', {})
    return dict(kind=obj.get('kind'), namespace=m.get('namespace'),
                name=m.get('name'), uid=m.get('uid'))


def pod_spec(obj):
    spec = obj.get('spec', {})
    if obj.get('kind') == 'Pod':
        return spec
    if obj.get('kind') == 'CronJob':
        return spec.get('jobTemplate', {}).get('spec', {}).get('template', {}).get('spec', {})
    return spec.get('template', {}).get('spec', {})


def clean_path(value):
    if not isinstance(value, str) or not value.startswith('/') or '\x00' in value:
        raise ValueError('invalid export path')
    return posixpath.normpath('/' + value.lstrip('/'))


def overlaps(a, b):
    a, b = clean_path(a), clean_path(b)
    return a == b or a.startswith(b.rstrip('/') + '/') or b.startswith(a.rstrip('/') + '/')


def build_report(data, namespace, server, export, cluster_domain='cluster.local'):
    services = data['services']
    pods = data['pods']
    claims = {(p['metadata']['namespace'], p['metadata']['name']): p for p in data['claims']}
    volumes = {p['metadata']['name']: p for p in data['volumes']}
    aliases = {server.rstrip('.').lower()}
    matched_services = []
    # Only exact Service DNS names and observed IPs are aliases. Short DNS names
    # depend on a caller's resolver and are intentionally not inferred.
    for service in services:
        m, s = service['metadata'], service.get('spec', {})
        dns = m['name'] + '.' + m['namespace'] + '.svc'
        names = {dns, dns + '.' + cluster_domain}
        names.update(s.get('clusterIPs', []))
        names.add(s.get('clusterIP', ''))
        names.discard('None')
        names.discard('')
        if aliases.intersection(names):
            matched_services.append(service)
            aliases.update(names)
    service_keys = {(s['metadata']['namespace'], s['metadata']['name']) for s in matched_services}
    endpoints = []
    exporter_refs = set()
    for es in data['endpoints']:
        m = es['metadata']
        if (m['namespace'], m.get('labels', {}).get('kubernetes.io/service-name')) not in service_keys:
            continue
        for ep in es.get('endpoints', []):
            ref = ep.get('targetRef', {})
            aliases.update(ep.get('addresses', []))
            endpoints.append(dict(slice=identity(es), addresses=ep.get('addresses', []),
                                  ready=ep.get('conditions', {}).get('ready'),
                                  target={k: ref.get(k) for k in ('kind', 'namespace', 'name', 'uid')}))
            if ref.get('kind') == 'Pod' and ref.get('uid'):
                exporter_refs.add((ref.get('namespace', m['namespace']), ref.get('name'), ref['uid']))

    def storage(volume, ns):
        if 'nfs' in volume:
            nfs = volume['nfs']
            return dict(kind='nfs', server=nfs.get('server'), export=nfs.get('path'),
                        read_only=bool(nfs.get('readOnly')))
        if 'hostPath' in volume:
            return dict(kind='hostPath', path=volume['hostPath'].get('path'))
        if 'persistentVolumeClaim' not in volume:
            return None
        ref = volume['persistentVolumeClaim']
        claim = claims.get((ns, ref.get('claimName')))
        pv = volumes.get((claim or {}).get('spec', {}).get('volumeName'))
        result = dict(kind='unresolved-pvc', claim=ref.get('claimName'))
        if not claim or not pv:
            return result
        result.update(claim_uid=claim['metadata'].get('uid'), pv=identity(pv))
        binding = pv.get('spec', {}).get('claimRef', {})
        if (binding.get('namespace'), binding.get('name'), binding.get('uid')) != (ns, ref['claimName'], claim['metadata'].get('uid')) or not binding.get('uid'):
            return result
        # PV volume sources live under spec, unlike Pod volume sources.
        backing = storage(pv.get('spec', {}), ns)
        if backing:
            result.update(backing)
        else:
            result['kind'] = 'csi-or-other-pv'
            result['driver'] = pv.get('spec', {}).get('csi', {}).get('driver')
        result['read_only'] = bool(result.get('read_only') or ref.get('readOnly'))
        return result

    def mounts(obj):
        spec, ns = pod_spec(obj), obj['metadata']['namespace']
        volume_map = {v['name']: v for v in spec.get('volumes', [])}
        out = []
        for section in ('containers', 'initContainers', 'ephemeralContainers'):
            for container in spec.get(section, []):
                for mount in container.get('volumeMounts', []):
                    backing = storage(volume_map.get(mount['name'], {}), ns)
                    if backing is None:
                        continue
                    out.append(dict(container=container['name'], container_kind=section,
                                    volume=mount['name'], mount_path=mount.get('mountPath'),
                                    sub_path=mount.get('subPath', ''), sub_path_expr=mount.get('subPathExpr'),
                                    read_only=bool(mount.get('readOnly') or backing.get('read_only')),
                                    storage=backing))
        return out

    candidates, unresolved, exporters = [], [], []
    for obj in pods + data['workloads']:
        observed_mounts = mounts(obj)
        matched = []
        for mount in observed_mounts:
            backing = mount['storage']
            if backing['kind'] == 'nfs':
                if (backing.get('server') or '').rstrip('.').lower() in aliases and overlaps(backing.get('export'), export):
                    matched.append(mount)
            elif backing['kind'] in ('unresolved-pvc', 'csi-or-other-pv'):
                unresolved.append(dict(workload=identity(obj), mount=mount))
        if matched:
            candidates.append(dict(workload=identity(obj), node=pod_spec(obj).get('nodeName'),
                                   phase=obj.get('status', {}).get('phase'),
                                   mounts=matched,
                                   outside_requested_namespace=obj['metadata']['namespace'] != namespace))
        m = obj['metadata']
        if obj.get('kind') == 'Pod' and (m['namespace'], m['name'], m.get('uid')) in exporter_refs:
            exporters.append(dict(pod=identity(obj), node=pod_spec(obj).get('nodeName'), mounts=observed_mounts))
    return dict(kind='d_nfs_inventory_v1', status='observed', namespace=namespace,
                target=dict(server=server, export=clean_path(export)), aliases=sorted(aliases),
                services=[identity(s) for s in matched_services], endpoints=endpoints,
                exporter_pods=exporters, mount_candidates=candidates, unresolved_mounts=unresolved,
                writer_coverage_proven=False, ready_for_backup=False, cluster_mutated=False,
                limitations=['Sequential Kubernetes reads are not an atomic snapshot or stop proof.',
                             'Mounts are potential writers; controller templates include future writers.',
                             'External NFS clients, unobserved DNS aliases, CSI and non-Pod writers require separate inventory.',
                             'Export server paths, filesystem aliases, ACLs and dataset ownership are not verified.',
                             'Endpoint and Service matches are observations, not permission to stop another installation.'])


def collect(args, run=subprocess.run):
    stage = 'namespace'
    def get(resource, all_namespaces=True, name=None):
        cmd = ['kubectl', '--context=' + args.context, '--request-timeout=30s', 'get', resource]
        if name:
            cmd.append(name)
        if all_namespaces:
            cmd.append('--all-namespaces')
        result = run(cmd + ['-o', 'json'], capture_output=True, text=True, timeout=60, check=False)
        if result.returncode or len(result.stdout) > 64 * 1024 * 1024:
            raise ValueError('metadata read failed')
        return json.loads(result.stdout)
    try:
        ns = get('namespace', False, args.namespace)
        data = {}
        for stage, resource, namespaced in (
            ('services', 'services', True), ('endpoints', 'endpointslices.discovery.k8s.io', True),
            ('pods', 'pods', True), ('claims', 'persistentvolumeclaims', True),
            ('volumes', 'persistentvolumes', False),
            ('workloads', 'deployments,statefulsets,daemonsets,replicasets,replicationcontrollers,jobs,cronjobs', True),
        ):
            data[stage] = get(resource, namespaced)['items']
        stage = 'projection'
        report = build_report(data, args.namespace, args.server, args.export, args.cluster_domain)
        report['namespace_identity'] = identity(ns)
        report['context'] = args.context
        report['observed_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return report
    except Exception:
        # kubectl stderr and failed JSON may contain arbitrary cluster data.
        return dict(kind='d_nfs_inventory_v1', status='incomplete', failed_stage=stage,
                    writer_coverage_proven=False, ready_for_backup=False, cluster_mutated=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--context', required=True)
    parser.add_argument('--namespace', required=True)
    parser.add_argument('--server', required=True)
    parser.add_argument('--export', required=True)
    parser.add_argument('--cluster-domain', default='cluster.local')
    args = parser.parse_args()
    report = collect(args)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['status'] == 'observed' else 2


if __name__ == '__main__':
    sys.exit(main())
