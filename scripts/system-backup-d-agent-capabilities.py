#!/usr/bin/env python3
"""Observe Runtime stop capabilities in one namespace. Never stop a gateway.

Run on the Kubernetes administration host. The existing app control token is
read into this remote process's memory for the GET request only. It is never
printed, written to a file, forwarded locally, or placed in command arguments.
"""
import argparse
import ipaddress
import json
import subprocess
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def parent_uid(obj, kind):
    refs = [r for r in obj.get('metadata', {}).get('ownerReferences', [])
            if r.get('controller') is True and r.get('kind') == kind]
    return refs[0].get('uid') if len(refs) == 1 else None


def owned_pods(deployment, pods, replicasets):
    uid = deployment['metadata']['uid']
    rs_uids = {r['metadata']['uid'] for r in replicasets if parent_uid(r, 'Deployment') == uid}
    return [p for p in pods if parent_uid(p, 'ReplicaSet') in rs_uids and
            not p['metadata'].get('deletionTimestamp') and p.get('status', {}).get('phase') == 'Running']


def endpoint(pod):
    ip = ipaddress.ip_address(pod['status']['podIP'])
    containers = [c for c in pod['spec']['containers'] if c['name'] == 'runtime']
    if len(containers) != 1 or pod['spec'].get('hostNetwork'):
        raise ValueError('unreviewed runtime container')
    values = [e.get('value') for e in containers[0].get('env', []) if e.get('name') == 'RUNTIME_AGENT_PUBLIC_PORT']
    if len(values) != 1 or not values[0] or not values[0].isdigit() or not 1 <= int(values[0]) <= 65535:
        raise ValueError('explicit public port required')
    host = '[' + str(ip) + ']' if ip.version == 6 else str(ip)
    return 'http://' + host + ':' + values[0] + '/v1/stop-capabilities'


def http_get(url, token):
    request = urllib.request.Request(url, headers={'X-ClawManager-Control-Token': token}, method='GET')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=8) as response:
            body = response.read(65537)
            if len(body) > 65536:
                return response.status, None
            return response.status, json.loads(body)
    except urllib.error.HTTPError as error:
        return error.code, None


def collect(args, run=subprocess.run, request=http_get):
    def command(parts):
        result = run(['kubectl', '--context=' + args.context, '--request-timeout=20s'] + parts,
                     capture_output=True, text=True, timeout=30, check=False)
        if result.returncode or len(result.stdout) > 16 * 1024 * 1024:
            raise ValueError('remote read failed')
        return result.stdout
    def get(resource, name=None):
        return json.loads(command(['-n', args.namespace, 'get', resource] + ([name] if name else []) + ['-o', 'json']))
    report = dict(namespace=args.namespace, status='incomplete', runtimes=[], mutation_sent=False,
                  backup_ready=False, note='Capability metadata is not a stop or restore proof.')
    stage = 'namespace_metadata'
    try:
        deployments = get('deployments')['items']
        pods, replicasets = get('pods')['items'], get('replicasets')['items']
        apps = [d for d in deployments if d['metadata']['name'] == 'clawmanager-app']
        if len(apps) != 1:
            raise ValueError('app deployment missing')
        app_pods = owned_pods(apps[0], pods, replicasets)
        if not app_pods:
            raise ValueError('app pod missing')
        app = sorted(app_pods, key=lambda p: p['metadata']['name'])[0]
        stage = 'remote_auth_material'
        token = command(['-n', args.namespace, 'exec', app['metadata']['name'], '-c', 'clawmanager-app', '--',
                         'sh', '-c', 'set +x; test -n "$RUNTIME_AGENT_CONTROL_TOKEN" || exit 41; printf %s "$RUNTIME_AGENT_CONTROL_TOKEN"'])
        if not 1 <= len(token) <= 16384 or any(ord(c) < 33 or ord(c) > 126 for c in token):
            raise ValueError('invalid control token')
        stage = 'runtime_capabilities'
        targets = [d for d in deployments if d['metadata']['name'] in ('openclaw-runtime', 'hermes-runtime')]
        if not targets:
            raise ValueError('runtime deployment missing')
        for deployment in targets:
            targets_pods = owned_pods(deployment, pods, replicasets)
            if not targets_pods or len(targets_pods) > 10:
                raise ValueError('runtime pod set unavailable')
            for pod in targets_pods:
                item = dict(deployment=deployment['metadata']['name'], pod=pod['metadata']['name'],
                            pod_uid=pod['metadata']['uid'], observation='unavailable')
                report['runtimes'].append(item)
                try:
                    code, caps = request(endpoint(pod), token)
                    item['http_status'] = code
                    if code != 200 or not isinstance(caps, dict):
                        continue
                    # Project booleans/integers and a fixed scope vocabulary only;
                    # never print arbitrary response bodies or exception messages.
                    item['protocol'] = caps.get('protocol') if type(caps.get('protocol')) is int else None
                    item['pod_uid_matches'] = caps.get('pod_uid') == pod['metadata']['uid']
                    epoch = caps.get('agent_epoch')
                    item['agent_epoch_valid'] = isinstance(epoch, str) and len(epoch) == 32 and all(c in '0123456789abcdef' for c in epoch)
                    for key in ('graceful_stop', 'expected_pid_guard'):
                        item[key] = caps.get(key) is True
                    scope = caps.get('confirmation_scope')
                    item['confirmation_scope'] = scope if scope in ('process_group', 'cgroup') else 'unknown'
                    current = get('pod', pod['metadata']['name'])
                    item['pod_identity_stable'] = current['metadata']['uid'] == pod['metadata']['uid'] and current.get('status', {}).get('podIP') == pod['status']['podIP']
                    item['observation'] = 'observed'
                except Exception:
                    pass
        token = None
        report['status'] = 'observed' if all(r['observation'] == 'observed' for r in report['runtimes']) else 'incomplete'
    except Exception:
        report['failed_stage'] = stage
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--context', required=True)
    parser.add_argument('--namespace', required=True)
    args = parser.parse_args()
    result = collect(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['status'] == 'observed' else 2


if __name__ == '__main__':
    raise SystemExit(main())
