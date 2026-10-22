#!/usr/bin/env python3
"""Public Kubernetes references only. No Secret requests, exec or SQL."""
import argparse
import json
import re
import subprocess
import sys

DSN_NAMES = {
    'SYSTEM_BACKUP_REGISTRATION_DSN_FILE': ['registration', 'collector'],
    'SYSTEM_BACKUP_DOWNLOAD_DSN_FILE': ['download'],
    'SYSTEM_BACKUP_GC_DSN_FILE': ['gc'],
}


def require(condition):
    if not condition:
        raise ValueError('public_inventory_rejected')


def identity(obj):
    m = obj['metadata']
    return dict(name=m['name'], uid=m['uid'], resource_version=m['resourceVersion'])


def public_container(spec, status):
    refs = []
    for item in spec.get('env', []):
        if item['name'] not in DSN_NAMES:
            continue
        source = item.get('valueFrom', {})
        ref = dict(name=item['name'], candidate_roles=DSN_NAMES[item['name']],
                   value_withheld=True, reference_kind='literal_or_unavailable')
        for kind in ('secretKeyRef', 'configMapKeyRef'):
            if kind in source:
                ref.update(reference_kind=kind, reference_name=source[kind]['name'],
                           reference_key=source[kind]['key'])
        refs.append(ref)
    status = status or {}
    return dict(name=spec['name'], declared_image=spec['image'],
                observed_image_id=status.get('imageID'),
                container_id=status.get('containerID'), ready=status.get('ready', False),
                restart_count=status.get('restartCount'), dsn_references=refs,
                mounts=[dict(name=m['name'], path=m['mountPath'], sub_path=m.get('subPath', ''),
                             read_only=m.get('readOnly', False),
                             sub_path_expr_present=bool(m.get('subPathExpr')))
                        for m in spec.get('volumeMounts', [])],
                native_inspector_capability_verified=False,
                runtime_identity_or_role_approved=False)


def public_pod(obj):
    spec, status = obj['spec'], obj.get('status', {})
    states = {c['name']: c for c in status.get('containerStatuses', [])}
    refs = []
    for volume in spec.get('volumes', []):
        out = dict(name=volume['name'])
        if 'persistentVolumeClaim' in volume:
            out.update(kind='pvc', claim=volume['persistentVolumeClaim']['claimName'],
                       read_only=volume['persistentVolumeClaim'].get('readOnly', False))
        elif 'configMap' in volume:
            out.update(kind='configmap_reference', reference_name=volume['configMap']['name'])
        elif 'secret' in volume:
            out.update(kind='secret_reference_only', reference_name=volume['secret']['secretName'])
        else:
            out.update(kind='other_volume')
        refs.append(out)
    return dict(**identity(obj), phase=status.get('phase'), node=spec.get('nodeName'),
                owners=[dict(kind=o['kind'], name=o['name'], uid=o['uid'])
                        for o in obj['metadata'].get('ownerReferences', [])],
                containers=[public_container(c, states.get(c['name'])) for c in spec.get('containers', [])],
                volumes=refs)


def public_pvc(obj, pv):
    spec = obj['spec']
    out = dict(**identity(obj), phase=obj.get('status', {}).get('phase'),
               volume_name=spec.get('volumeName'), storage_class=spec.get('storageClassName'),
               access_modes=spec.get('accessModes', []),
               capacity=obj.get('status', {}).get('capacity', {}), pv=None)
    if pv is not None:
        claim = pv['spec'].get('claimRef', {})
        out['pv'] = dict(**identity(pv), claim_namespace=claim.get('namespace'),
                         claim_name=claim.get('name'), claim_uid=claim.get('uid'))
        require(claim.get('uid') == obj['metadata']['uid'])
    return out


class Inventory:
    def __init__(self, context, namespace, namespace_uid):
        require(re.fullmatch(r'[A-Za-z0-9_.@:-]{1,253}', context) is not None)
        require(re.fullmatch(r'[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?', namespace) is not None)
        require(re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', namespace_uid) is not None)
        self.context, self.namespace, self.namespace_uid = context, namespace, namespace_uid

    def get(self, kind, name=None):
        require(kind in ('namespace', 'pods', 'pvc', 'pv'))
        args = ['kubectl', '--context', self.context, '--request-timeout=20s']
        if kind in ('pods', 'pvc'):
            args += ['-n', self.namespace]
        args += ['get', kind]
        if name:
            require(re.fullmatch(r'[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?', name) is not None)
            args.append(name)
        args += ['-o', 'json']
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=40, check=False)
        require(result.returncode == 0 and len(result.stdout) <= 8388608)
        return json.loads(result.stdout.decode('utf-8', errors='strict'))

    def collect(self):
        before = identity(self.get('namespace', self.namespace))
        require(before['uid'] == self.namespace_uid)
        pods = [public_pod(p) for p in self.get('pods')['items']]
        claims, blockers = [], []
        for pvc in self.get('pvc')['items']:
            pv = None
            if pvc['spec'].get('volumeName'):
                try:
                    pv = self.get('pv', pvc['spec']['volumeName'])
                except (ValueError, KeyError, OSError, subprocess.SubprocessError):
                    blockers.append('bound_pv_reference_unavailable:' + pvc['metadata']['name'])
            claims.append(public_pvc(pvc, pv))
        after = identity(self.get('namespace', self.namespace))
        require(after['uid'] == before['uid'])
        roles = sorted({role for p in pods for c in p['containers'] for r in c['dsn_references']
                        for role in r['candidate_roles']})
        return dict(kind='a_field_public_inventory.v1', status='PUBLIC_REFERENCES_OBSERVED_REVIEW_REQUIRED',
                    context=self.context, namespace=self.namespace, namespace_uid=self.namespace_uid,
                    namespace_before=before, namespace_after=after, pods=pods, claims=claims,
                    candidate_roles_with_dsn_variable_names=roles, blockers=blockers,
                    missing_candidate_roles=[r for r in ('registration', 'download', 'collector') if r not in roles],
                    pending=['native inspector bytes/capability in actual image', 'actual SQL users and grants',
                             'original materials and validity', 'capacity input and measured volume budgets',
                             'formal role approval and complete field acceptance'],
                    snapshot_atomic=False, secrets_requested=False, container_files_read=False,
                    sql_executed=False, cluster_mutated=False, dependencies_installed=False,
                    production_approved=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--context', required=True)
    parser.add_argument('--namespace', required=True)
    parser.add_argument('--namespace-uid', required=True)
    args = parser.parse_args()
    result = Inventory(args.context, args.namespace, args.namespace_uid).collect()
    print(json.dumps(result, separators=(',', ':')))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, TypeError, OSError, UnicodeError, subprocess.SubprocessError):
        print(json.dumps(dict(kind='a_field_public_inventory.v1', status='BLOCKED',
                              error='pinned_public_reference_inventory_unavailable', production_approved=False)))
        sys.exit(2)
