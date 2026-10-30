#!/usr/bin/env python3
"""Ephemeral live pool/slot TLS capability probe; never stops an instance."""

import argparse
import base64
import json
import os
import secrets
import socket
import ssl
import subprocess
import sys
import tempfile
import time


def run(args, *, data=None, check=True):
    result = subprocess.run(args, input=data, capture_output=True, check=False)
    if check and result.returncode:
        raise RuntimeError(f"{args[0]} {args[1]} exited {result.returncode}: {result.stderr.decode(errors='replace')[-500:]}")
    return result


def k(args, *, data=None, check=True):
    return run(["kubectl", "--context", OPT.context, "-n", OPT.namespace, *args], data=data, check=check)


def apply(value):
    k(["apply", "-f", "-"], data=json.dumps(value).encode())


def env(name, value):
    return {"name": name, "value": value}


def field(name, path):
    return {"name": name, "valueFrom": {"fieldRef": {"fieldPath": path}}}


def secret_env(name, secret, key):
    return {"name": name, "valueFrom": {"secretKeyRef": {"name": secret, "key": key}}}


def probe(ip, cert, token):
    context = ssl.create_default_context(cafile=cert)
    context.minimum_version = ssl.TLSVersion.TLSv1_3
    with socket.create_connection((ip, 19090), timeout=5) as raw:
        with context.wrap_socket(raw, server_hostname="lite-agent.clawmanager.internal") as conn:
            conn.settimeout(5)
            request = ("GET /v1/backup/capabilities?gateway_port=20000 HTTP/1.1\r\n"
                       "Host: lite-agent.clawmanager.internal\r\n"
                       f"X-ClawManager-Control-Token: {token}\r\nConnection: close\r\n\r\n")
            conn.sendall(request.encode())
            chunks = []
            while True:
                chunk = conn.recv(8192)
                if not chunk:
                    break
                chunks.append(chunk)
                if sum(map(len, chunks)) > 65536:
                    raise RuntimeError("Agent capability response too large")
    raw_response = b"".join(chunks)
    head, body = raw_response.split(b"\r\n\r\n", 1)
    code = int(head.split(b"\r\n", 1)[0].split()[1])
    if code != 200:
        raise RuntimeError(f"Agent capability HTTP {code}")
    if b"transfer-encoding: chunked" in head.lower():
        size, rest = body.split(b"\r\n", 1)
        body = rest[: int(size, 16)]
    return json.loads(body)


def main():
    global OPT
    parser = argparse.ArgumentParser()
    parser.add_argument("--context", required=True)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--image", required=True)
    OPT = parser.parse_args()
    if "@sha256:" not in OPT.image:
        raise RuntimeError("image must be pinned by digest")
    name = "d-native-probe-" + secrets.token_hex(4)
    token_name, tls_name = name + "-token", name + "-tls"
    token = secrets.token_hex(32)
    created = []
    result = {"status": "incomplete", "mutation_sent": False, "pod": name, "image": OPT.image}
    try:
        with tempfile.TemporaryDirectory(prefix="d-native-probe-") as temp:
            key, cert = os.path.join(temp, "tls.key"), os.path.join(temp, "tls.crt")
            run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                 "-keyout", key, "-out", cert, "-subj", "/CN=lite-agent.clawmanager.internal",
                 "-addext", "subjectAltName=DNS:lite-agent.clawmanager.internal",
                 "-addext", "extendedKeyUsage=serverAuth"])
            certificate = open(cert, "rb").read()
            private_key = open(key, "rb").read()
            apply({"apiVersion": "v1", "kind": "Secret", "metadata": {"name": token_name}, "type": "Opaque",
                   "data": {"control": base64.b64encode(token.encode()).decode(), "report": base64.b64encode(secrets.token_hex(32).encode()).decode()}})
            created.append(("secret", token_name))
            apply({"apiVersion": "v1", "kind": "Secret", "metadata": {"name": tls_name}, "type": "kubernetes.io/tls",
                   "data": {"tls.crt": base64.b64encode(certificate).decode(), "tls.key": base64.b64encode(private_key).decode()}})
            created.append(("secret", tls_name))
            common = [env("CLAWMANAGER_RUNTIME_TYPE", "openclaw"), env("CLAWMANAGER_RUNTIME_IMAGE_REF", OPT.image),
                      env("CLAWMANAGER_BACKEND_URL", "http://clawmanager-gateway." + OPT.namespace + ".svc.cluster.local:9001"),
                      env("RUNTIME_WORKSPACE_ROOT", "/workspaces"),
                      env("RUNTIME_GATEWAY_PORT_START", "20000"), env("RUNTIME_GATEWAY_PORT_END", "20002"),
                      env("RUNTIME_GATEWAY_PORT_BLOCK_SIZE", "3"),
                      env("RUNTIME_GATEWAY_CAPACITY", "1"), field("POD_UID", "metadata.uid"), field("POD_NAME", "metadata.name"),
                      field("POD_NAMESPACE", "metadata.namespace"), field("POD_IP", "status.podIP"), field("NODE_NAME", "spec.nodeName"),
                      secret_env("RUNTIME_AGENT_CONTROL_TOKEN", token_name, "control")]
            volumes = [{"name": "sockets", "emptyDir": {}}, {"name": "workspaces", "emptyDir": {}},
                       {"name": "pool-data", "emptyDir": {}}, {"name": "slot-data", "emptyDir": {}},
                       {"name": "tls", "secret": {"secretName": tls_name}}]
            common_mounts = [{"name": "sockets", "mountPath": "/run/clawmanager-slots"},
                             {"name": "workspaces", "mountPath": "/workspaces"}]
            pool = {"name": "pool", "image": OPT.image, "imagePullPolicy": "IfNotPresent",
                    "command": ["/usr/local/bin/clawmanager-agent"], "ports": [{"containerPort": 19090}],
                    "env": common + [env("RUNTIME_AGENT_ROLE", "pool"), env("RUNTIME_SLOT_COUNT", "1"),
                                     env("RUNTIME_AGENT_TLS_CERT_FILE", "/tls/tls.crt"), env("RUNTIME_AGENT_TLS_KEY_FILE", "/tls/tls.key"),
                                     secret_env("RUNTIME_AGENT_REPORT_TOKEN", token_name, "report")],
                    "volumeMounts": common_mounts + [{"name": "pool-data", "mountPath": "/var/lib/clawmanager-agent"},
                                                      {"name": "tls", "mountPath": "/tls", "readOnly": True}]}
            slot = {"name": "slot", "image": OPT.image, "imagePullPolicy": "IfNotPresent",
                    "command": ["/usr/local/bin/clawmanager-agent"],
                    "env": common + [env("RUNTIME_AGENT_ROLE", "slot"), env("RUNTIME_SLOT_INDEX", "0"),
                                     env("RUNTIME_SLOT_SOCKET", "/run/clawmanager-slots/slot-0.sock")],
                    "volumeMounts": common_mounts + [{"name": "slot-data", "mountPath": "/var/lib/clawmanager-agent"}]}
            apply({"apiVersion": "v1", "kind": "Pod", "metadata": {"name": name, "labels": {"app": "d-native-backup-probe"}},
                   "spec": {"restartPolicy": "Never", "nodeName": "k8s-master", "volumes": volumes, "containers": [pool, slot]}})
            created.append(("pod", name))
            k(["wait", "pod/" + name, "--for=condition=Ready", "--timeout=120s"])
            pod = json.loads(k(["get", "pod", name, "-o", "json"]).stdout)
            result.update(pod_uid=pod["metadata"]["uid"], pod_ip=pod["status"]["podIP"])
            deadline = time.monotonic() + 60
            while True:
                try:
                    capability = probe(result["pod_ip"], cert, token)
                    break
                except (OSError, ssl.SSLError, RuntimeError):
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(2)
            result.update(http_status=200, capability=capability)
            if (capability.get("protocol") != "isolated-backup.v1" or capability.get("namespace") != OPT.namespace
                    or capability.get("pod_uid") != result["pod_uid"] or capability.get("gateway_port") != 20000
                    or not capability.get("supported") or not capability.get("durable_reservation")):
                raise RuntimeError("native Agent capability fields did not bind to the test Pod")
            result["status"] = "capability_passed"
    except Exception as exc:
        result["error"] = str(exc)
        if ("pod", name) in created:
            observed = k(["get", "pod", name, "-o", "json"], check=False)
            if observed.returncode == 0:
                pod = json.loads(observed.stdout)
                result["pod_phase"] = pod.get("status", {}).get("phase")
                result["containers"] = [{"name": item.get("name"), "ready": item.get("ready"),
                                         "state": item.get("state"), "restart_count": item.get("restartCount")}
                                        for item in pod.get("status", {}).get("containerStatuses", [])]
            for container in ("pool", "slot"):
                logs = k(["logs", name, "-c", container, "--tail=25"], check=False)
                if logs.returncode == 0:
                    result[container + "_log_tail"] = logs.stdout.decode(errors="replace").replace(token, "[redacted]")[-4000:]
    finally:
        cleanup = []
        for kind, resource in reversed(created):
            finished = k(["delete", kind, resource, "--ignore-not-found=true", "--wait=true", "--timeout=180s"], check=False)
            cleanup.append({"kind": kind, "name": resource, "exit": finished.returncode})
        result["cleanup"] = cleanup
        if any(item["exit"] for item in cleanup):
            result["status"] = "cleanup_failed"
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "capability_passed" else 2


if __name__ == "__main__":
    sys.exit(main())
