#!/usr/bin/env python3
"""Read the patched Runtime Agent's native backup capability in one namespace.

This sends GET only. The app's existing control token stays in this process's
memory and is never included in the report, command arguments, or error text.
"""

import argparse
import ipaddress
import json
import re
import subprocess
import urllib.error
import urllib.request


DEPLOYMENTS = ("openclaw-runtime", "hermes-runtime")
EPOCH = re.compile(r"[0-9a-f]{32}\Z")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def parent_uid(obj, kind):
    owners = [owner for owner in obj.get("metadata", {}).get("ownerReferences", [])
              if owner.get("controller") is True and owner.get("kind") == kind]
    return owners[0].get("uid") if len(owners) == 1 else None


def owned_pods(deployment, pods, replicasets):
    replicas = {item["metadata"]["uid"] for item in replicasets
                if parent_uid(item, "Deployment") == deployment["metadata"]["uid"]}
    return [pod for pod in pods if parent_uid(pod, "ReplicaSet") in replicas
            and not pod["metadata"].get("deletionTimestamp")
            and pod.get("status", {}).get("phase") == "Running"]


def literal_env(container, name):
    values = [item.get("value") for item in container.get("env", [])
              if item.get("name") == name and "valueFrom" not in item]
    if len(values) != 1 or not isinstance(values[0], str) or not values[0].isdigit():
        raise ValueError("required literal port unavailable")
    port = int(values[0])
    if not 1 <= port <= 65535:
        raise ValueError("port outside range")
    return port


def endpoint(pod):
    containers = [item for item in pod["spec"]["containers"] if item["name"] == "runtime"]
    if len(containers) != 1 or pod["spec"].get("hostNetwork"):
        raise ValueError("unreviewed Runtime container")
    public = literal_env(containers[0], "RUNTIME_AGENT_PUBLIC_PORT")
    gateway = literal_env(containers[0], "RUNTIME_GATEWAY_PORT_START")
    address = ipaddress.ip_address(pod["status"]["podIP"])
    host = "[" + str(address) + "]" if address.version == 6 else str(address)
    return f"http://{host}:{public}/v1/backup/capabilities?gateway_port={gateway}", gateway


def http_get(url, token):
    request = urllib.request.Request(url, headers={"X-ClawManager-Control-Token": token}, method="GET")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=8) as response:
            body = response.read(65537)
            if len(body) > 65536:
                return response.status, None
            return response.status, json.loads(body)
    except urllib.error.HTTPError as error:
        return error.code, None


def collect(args):
    def command(parts):
        result = subprocess.run(
            ["kubectl", "--context=" + args.context, "--request-timeout=20s"] + parts,
            capture_output=True, text=True, timeout=30, check=False,
        )
        if result.returncode or len(result.stdout) > 16 * 1024 * 1024:
            raise ValueError("Kubernetes read unavailable")
        return result.stdout

    def get(resource, name=None):
        parts = ["-n", args.namespace, "get", resource]
        if name:
            parts.append(name)
        return json.loads(command(parts + ["-o", "json"]))

    report = {"namespace": args.namespace, "status": "incomplete", "mutation_sent": False,
              "backup_ready": False, "runtimes": []}
    stage = "namespace_metadata"
    try:
        deployments = get("deployments")["items"]
        pods = get("pods")["items"]
        replicasets = get("replicasets")["items"]
        app = [item for item in deployments if item["metadata"]["name"] == "clawmanager-app"]
        if len(app) != 1:
            raise ValueError("app Deployment unavailable")
        app_pods = owned_pods(app[0], pods, replicasets)
        if len(app_pods) != 1:
            raise ValueError("app Pod unavailable")
        stage = "remote_auth_material"
        token = command(["-n", args.namespace, "exec", app_pods[0]["metadata"]["name"],
                         "-c", "clawmanager-app", "--", "sh", "-c",
                         'set +x; test -n "$RUNTIME_AGENT_CONTROL_TOKEN" || exit 41; printf %s "$RUNTIME_AGENT_CONTROL_TOKEN"'])
        if not 1 <= len(token) <= 16384 or any(ord(char) < 33 or ord(char) > 126 for char in token):
            raise ValueError("control token unavailable")
        stage = "native_capabilities"
        expected = {"openclaw-runtime": args.openclaw_digest, "hermes-runtime": args.hermes_digest}
        for name in DEPLOYMENTS:
            matches = [item for item in deployments if item["metadata"]["name"] == name]
            if len(matches) != 1:
                raise ValueError("Runtime Deployment unavailable")
            targets = owned_pods(matches[0], pods, replicasets)
            if len(targets) != 1:
                raise ValueError("Runtime Pod set incomplete")
            pod = targets[0]
            item = {"deployment": name, "pod": pod["metadata"]["name"],
                    "pod_uid": pod["metadata"]["uid"], "observation": "unavailable"}
            report["runtimes"].append(item)
            try:
                image_ids = [status.get("imageID", "") for status in pod["status"].get("containerStatuses", [])
                             if status.get("name") == "runtime"]
                url, gateway_port = endpoint(pod)
                code, body = http_get(url, token)
                item["http_status"] = code
                if code != 200 or not isinstance(body, dict) or len(image_ids) != 1:
                    continue
                current = get("pod", pod["metadata"]["name"])
                stable = (current["metadata"]["uid"] == pod["metadata"]["uid"]
                          and current["status"].get("podIP") == pod["status"].get("podIP"))
                item["image_digest_matches"] = image_ids[0].endswith("@sha256:" + expected[name])
                item["pod_identity_stable"] = stable
                item["agent_epoch_valid"] = isinstance(body.get("agent_epoch"), str) and bool(EPOCH.fullmatch(body["agent_epoch"]))
                item["agent_restart_reconciliation_disabled"] = body.get("agent_restart_reconciliation") is False
                item["protocol_matches"] = body.get("protocol") == "isolated-backup.v1"
                item["scope_matches"] = body.get("confirmation_scope") == "instance_pid_namespaces_and_mounts"
                item["namespace_matches"] = body.get("namespace") == args.namespace
                item["pod_uid_matches"] = body.get("pod_uid") == pod["metadata"]["uid"]
                item["gateway_port_matches"] = body.get("gateway_port") == gateway_port
                item["supported"] = body.get("supported") is True
                item["durable_reservation"] = body.get("durable_reservation") is True
                item["observation"] = "observed" if (
                    stable and item["image_digest_matches"] and item["agent_epoch_valid"]
                    and item["protocol_matches"] and item["scope_matches"]
                    and item["namespace_matches"] and item["pod_uid_matches"]
                    and item["gateway_port_matches"] and item["supported"]
                    and item["durable_reservation"] and item["agent_restart_reconciliation_disabled"]
                ) else "mismatch"
            except Exception:
                pass
        token = None
        if len(report["runtimes"]) == len(DEPLOYMENTS) and all(
                item["observation"] == "observed" for item in report["runtimes"]):
            report["status"] = "observed"
    except Exception:
        report["failed_stage"] = stage
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", required=True)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--openclaw-digest", required=True)
    parser.add_argument("--hermes-digest", required=True)
    args = parser.parse_args()
    if any(not re.fullmatch(r"[0-9a-f]{64}", value)
           for value in (args.openclaw_digest, args.hermes_digest)):
        parser.error("expected image digests must be lower-case SHA-256")
    report = collect(args)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "observed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
