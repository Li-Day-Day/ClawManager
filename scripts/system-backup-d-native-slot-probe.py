#!/usr/bin/env python3
"""Ephemeral live pool/slot TLS capability probe; never stops an instance."""

import argparse
import base64
import hashlib
import json
import os
import re
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


def decode_chunked(data):
    output = bytearray()
    offset = 0
    while True:
        end = data.find(b"\r\n", offset)
        if end < 0:
            raise RuntimeError("truncated Agent chunk header")
        try:
            size = int(data[offset:end].split(b";", 1)[0], 16)
        except ValueError as exc:
            raise RuntimeError("invalid Agent chunk header") from exc
        offset = end + 2
        if size < 0 or size > 65536 - len(output) or data[offset + size:offset + size + 2] != b"\r\n":
            raise RuntimeError("invalid Agent chunk size or trailer")
        if size == 0:
            return bytes(output)
        output.extend(data[offset:offset + size])
        offset += size + 2


def agent_request(ip, cert, token, method, path, value=None):
    context = ssl.create_default_context(cafile=cert)
    context.minimum_version = ssl.TLSVersion.TLSv1_3
    body = b"" if value is None else json.dumps(value, separators=(",", ":")).encode()
    with socket.create_connection((ip, 19090), timeout=5) as raw:
        with context.wrap_socket(raw, server_hostname="lite-agent.clawmanager.internal") as conn:
            conn.settimeout(45)
            request = (f"{method} {path} HTTP/1.1\r\n"
                       "Host: lite-agent.clawmanager.internal\r\n"
                       f"X-ClawManager-Control-Token: {token}\r\n"
                       f"Content-Length: {len(body)}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n")
            conn.sendall(request.encode() + body)
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
    if b"transfer-encoding: chunked" in head.lower():
        body = decode_chunked(body)
    return code, body


def probe(ip, cert, token):
    code, body = agent_request(ip, cert, token, "GET", "/v1/backup/capabilities?gateway_port=20000")
    if code != 200:
        raise RuntimeError(f"Agent capability HTTP {code}")
    return json.loads(body)


def synthetic_lifecycle(ip, cert, token, namespace, pod_uid, epoch):
    """Exercise a disposable HTTP process, never a database-backed instance."""
    instance, user = 987654321, 987654321
    gateway_id = f"gw-{instance}-1"
    create = {"pod_uid": pod_uid, "instance_id": instance, "user_id": user, "agent_type": "openclaw",
              "workspace_path": f"/workspaces/openclaw/user-{user}/instance-{instance}",
              "gateway_port": 20000, "port_range": {"start": 20000, "end": 20002},
              "uid": 20000, "gid": 20000, "cpu_cores": 1, "memory_mb": 512, "disk_quota_mb": 512, "generation": 1}
    code, raw = agent_request(ip, cert, token, "POST", "/v1/gateways", create)
    if code != 200 or json.loads(raw).get("gateway_id") != gateway_id:
        raise RuntimeError(f"synthetic gateway create HTTP {code}")
    deadline = time.monotonic() + 90
    while True:
        code, raw = agent_request(ip, cert, token, "GET", "/v1/gateways/" + gateway_id)
        state = json.loads(raw) if code == 200 else {}
        if code == 200 and state.get("state") == "running" and type(state.get("gateway_pid")) is int and state["gateway_pid"] > 0:
            break
        if time.monotonic() >= deadline:
            raise RuntimeError(f"synthetic gateway not running (HTTP {code}, state {state.get('state')})")
        time.sleep(2)
    restart = dict(create)
    restart["generation"] = 2
    restart_bytes = json.dumps(restart, separators=(",", ":")).encode()
    request = {"protocol": "isolated-backup.v1", "namespace": namespace, "pod_uid": pod_uid,
               "agent_epoch": epoch, "operation_id": secrets.token_hex(16), "runtime_type": "openclaw",
               "instance_id": instance, "user_id": user, "generation": 1, "gateway_id": gateway_id,
               "gateway_port": 20000, "expected_pid": state["gateway_pid"], "resume_generation": 2,
               "restart_sha256": hashlib.sha256(restart_bytes).hexdigest()}
    code, stop_raw = agent_request(ip, cert, token, "POST", "/v1/backup/stop", request)
    stop = json.loads(stop_raw) if code == 200 else {}
    if code != 200 or stop.get("request") != request or stop.get("state") != "stopped" or stop.get("confirmation_scope") != "instance_pid_namespaces_and_mounts" or not stop.get("confirmed_at"):
        raise RuntimeError(f"synthetic positive stop receipt missing (HTTP {code})")
    code, raw = agent_request(ip, cert, token, "POST", "/v1/backup/resume", {"request": request, "restart": restart})
    if code not in (200, 202):
        raise RuntimeError(f"synthetic resume dispatch HTTP {code}")
    deadline = time.monotonic() + 90
    while True:
        code, resume_raw = agent_request(ip, cert, token, "POST", "/v1/backup/state", request)
        receipt = json.loads(resume_raw) if code == 200 else {}
        if (code == 200 and receipt.get("request") == request and receipt.get("state") == "resumed"
                and type(receipt.get("pid")) is int and receipt["pid"] > 0 and receipt.get("confirmed_at")):
            break
        if time.monotonic() >= deadline:
            raise RuntimeError(f"synthetic resume receipt missing (HTTP {code})")
        time.sleep(2)
    code, complete_raw = agent_request(ip, cert, token, "POST", "/v1/backup/complete", request)
    complete = json.loads(complete_raw) if code == 200 else {}
    if code != 200 or complete.get("state") != "resumed" or complete.get("pid") != receipt["pid"]:
        raise RuntimeError(f"synthetic completion receipt missing (HTTP {code})")
    return {"source_pid": state["gateway_pid"], "resumed_pid": receipt["pid"],
            "restart_sha256": request["restart_sha256"],
            "stop_raw_base64": base64.b64encode(stop_raw).decode(),
            "resume_raw_base64": base64.b64encode(resume_raw).decode(),
            "stop_raw_sha256": hashlib.sha256(stop_raw).hexdigest(),
            "resume_raw_sha256": hashlib.sha256(resume_raw).hexdigest(),
            "complete_raw_sha256": hashlib.sha256(complete_raw).hexdigest()}


def main():
    global OPT
    parser = argparse.ArgumentParser()
    parser.add_argument("--context", required=True)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--synthetic-lifecycle", action="store_true")
    OPT = parser.parse_args()
    if re.fullmatch(r"[^@\s]+@sha256:[0-9a-f]{64}", OPT.image) is None:
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
                      env("RUNTIME_WORKSPACE_ROOT", "/workspaces"), env("RUNTIME_AGENT_DATA_DIR", "/var/lib/clawmanager-agent"),
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
                                     env("RUNTIME_SLOT_SOCKET", "/run/clawmanager-slots/slot-0.sock")]
                           + ([env("RUNTIME_GATEWAY_COMMAND", "python3 -m http.server 20000 --bind 0.0.0.0"),
                               env("RUNTIME_GATEWAY_STARTUP_HEALTH_TIMEOUT", "45s")] if OPT.synthetic_lifecycle else []),
                    "volumeMounts": common_mounts + [{"name": "slot-data", "mountPath": "/var/lib/clawmanager-agent"}]}
            apply({"apiVersion": "v1", "kind": "Pod", "metadata": {"name": name, "labels": {"app": "d-native-backup-probe"}},
                   "spec": {"restartPolicy": "Never", "nodeName": "k8s-master", "volumes": volumes, "containers": [pool, slot]}})
            created.append(("pod", name))
            k(["wait", "pod/" + name, "--for=condition=Ready", "--timeout=120s"])
            pod = json.loads(k(["get", "pod", name, "-o", "json"]).stdout)
            result.update(pod_uid=pod["metadata"]["uid"], pod_ip=pod["status"]["podIP"])
            running = {item.get("name"): item for item in pod.get("status", {}).get("containerStatuses", [])}
            expected_digest = OPT.image.split("@sha256:", 1)[1]
            result["runtime_image_ids"] = {container: running.get(container, {}).get("imageID", "") for container in ("pool", "slot")}
            if any(not running.get(container, {}).get("ready") or not result["runtime_image_ids"][container].endswith("sha256:" + expected_digest)
                   for container in ("pool", "slot")):
                raise RuntimeError("pool/slot actual image digest or readiness differs from requested image")
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
                    or not isinstance(capability.get("slot"), str) or not capability["slot"]
                    or not isinstance(capability.get("agent_epoch"), str)
                    or re.fullmatch(r"[0-9a-f]{32}", capability["agent_epoch"]) is None
                    or capability.get("confirmation_scope") != "instance_pid_namespaces_and_mounts"
                    or capability.get("supported") is not True or capability.get("durable_reservation") is not True
                    or capability.get("agent_restart_reconciliation") is not False):
                raise RuntimeError("native Agent capability fields did not bind to the test Pod")
            result["status"] = "capability_passed"
            if OPT.synthetic_lifecycle:
                result["mutation_sent"] = True
                result["synthetic_lifecycle"] = synthetic_lifecycle(result["pod_ip"], cert, token, OPT.namespace,
                                                                     result["pod_uid"], capability["agent_epoch"])
                result["status"] = "synthetic_lifecycle_passed"
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
    return 0 if result["status"] in ("capability_passed", "synthetic_lifecycle_passed") else 2


if __name__ == "__main__":
    sys.exit(main())
