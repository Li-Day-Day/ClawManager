"""Operator-run lab TLS check; temporary ingress only, no credentials or files."""
import hashlib
import json
import signal
import subprocess
import uuid

CTX = "kubernetes-admin@kubernetes"
APP_NS = "clawmanager-zhanghui08-system"
LAB_NS = "sbk-provider-zh-7474d6e0b052"
APP = "clawmanager-app-788b97b78f-l8k5f"
TARGETS = [
    ("bao", "bao-recovery-tls2-20261028",
     "a9e53b50-905a-446e-8edc-7361c45b269d", 8200, "/v1/sys/health",
     "bao-trust-recovery2-20261028", "dfa905e3-e00d-4c45-a955-b8547e806757",
     "119752785", "e7ff215f4fb96613cba2c0c89e9b28afe19b412b5d63be0593843a45fe99f518"),
    ("minio", "minio-recovery-20261028",
     "6b4c3daa-d1a9-4bc7-8b63-ee46914798d9", 9000, "/minio/health/live",
     "minio-trust-recovery-20261028", "d8059048-e355-4549-81de-753c81c74f41",
     "119778274", "a8f7a9e77cb410a669fef288b1fc8584ed2dbc49938f22c4923c821043792510"),
]


def command(args, body=None, checked=True):
    result = subprocess.run(
        ["kubectl", "--context=" + CTX, "--request-timeout=20s"] + args,
        input=body, text=True, capture_output=True, timeout=40)
    if checked and result.returncode:
        raise RuntimeError(result.stderr.strip() or "kubectl failed")
    return result


def get(kind, name, namespace=None):
    args = [] if namespace is None else ["-n", namespace]
    return json.loads(command(args + ["get", kind, name, "-o", "json"]).stdout)


def pinned(kind, name, uid, namespace=None):
    obj = get(kind, name, namespace)
    if obj["metadata"]["uid"] != uid:
        raise RuntimeError("UID changed: " + name)
    return obj


def inputs():
    for name, uid in [(APP_NS, "337cfe30-2c17-4b8e-b32a-760778b8098e"),
                      (LAB_NS, "a285351a-b52a-4b91-af78-1e5fa8e78387")]:
        ns = pinned("namespace", name, uid)
        if ns["metadata"].get("labels", {}).get("kubernetes.io/metadata.name") != name:
            raise RuntimeError("Namespace selector changed")
    base = pinned("networkpolicy", "lab-isolation",
                  "96f1c808-bc3c-4c92-a8c9-43c024522b12", LAB_NS)
    if base["metadata"]["resourceVersion"] != "88289703":
        raise RuntimeError("Original network policy changed")
    app = pinned("pod", APP, "aabba383-5db9-48a7-a3b7-2b92624c2f3a", APP_NS)
    if app["spec"].get("serviceAccountName") != "clawmanager-app":
        raise RuntimeError("Application ServiceAccount changed")
    containers = app["spec"]["containers"]
    labels = app["metadata"].get("labels", {})
    if len(containers) != 1 or not labels:
        raise RuntimeError("Ambiguous container or absent application labels")
    materials = []
    for service, pod, uid, port, path, cm_name, cm_uid, rv, digest in TARGETS:
        provider = pinned("pod", pod, uid, LAB_NS)
        provider_labels = provider["metadata"].get("labels", {})
        if not provider_labels:
            raise RuntimeError("Provider labels missing: " + pod)
        cm = pinned("configmap", cm_name, cm_uid, LAB_NS)
        pem = cm.get("data", {}).get("ca.crt", "")
        if (cm["metadata"]["resourceVersion"] != rv or
                hashlib.sha256(pem.encode("utf-8")).hexdigest() != digest):
            raise RuntimeError("CA version or SHA mismatch: " + cm_name)
        materials.append((service, port, path, provider_labels, pem))
    return containers[0]["name"], labels, materials


def main():
    run = uuid.uuid4().hex[:12]
    owned = []
    results = []
    cleanup_ok = True
    def stop(signum, frame):
        raise SystemExit("Interrupted; cleaning temporary policies")
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, stop)
    try:
        snapshot = inputs()  # All pins and public CAs checked before mutation.
        container, app_labels, materials = snapshot
        for service, port, path, labels, pem in materials:
            name = "a-tlscheck-" + run + "-" + service
            print("Emergency cleanup: kubectl --context=" + CTX + " -n " +
                  LAB_NS + " delete networkpolicy " + name, flush=True)
            policy = {
                "apiVersion": "networking.k8s.io/v1", "kind": "NetworkPolicy",
                "metadata": {"name": name, "namespace": LAB_NS,
                             "labels": {"a-tlscheck-run": run}},
                "spec": {"podSelector": {"matchLabels": labels},
                         "policyTypes": ["Ingress"], "ingress": [{
                             "from": [{"namespaceSelector": {"matchLabels": {
                                 "kubernetes.io/metadata.name": APP_NS}},
                                 "podSelector": {"matchLabels": app_labels}}],
                             "ports": [{"protocol": "TCP", "port": port}]}]}}
            owned.append(name)  # Also clean up a create with unknown outcome.
            command(["create", "-f", "-", "-o", "name"], json.dumps(policy))
            print("TEMP_POLICY_CREATED=" + name, flush=True)
        for service, port, path, labels, pem in materials:
            url = "https://" + service + "." + LAB_NS + ".svc:" + str(port) + path
            print("TARGET=" + url, flush=True)
            result = command([
                "-n", APP_NS, "exec", "-i", APP, "-c", container, "--",
                "timeout", "12s", "curl", "-q", "--noproxy", "*",
                "--proto", "=https", "--cacert", "/dev/stdin",
                "--connect-timeout", "5", "--max-time", "8",
                "--silent", "--show-error", "--output", "/dev/null",
                "--write-out", "http=%{http_code} verify=%{ssl_verify_result}\n",
                url], pem, checked=False)
            print(result.stdout.strip(), flush=True)
            if result.stderr:
                print(result.stderr.strip(), flush=True)
            print("KUBECTL_EXEC_EXIT=" + str(result.returncode), flush=True)
            results.append(result.returncode == 0 and
                           result.stdout.strip() == "http=200 verify=0")
        if inputs() != snapshot:
            raise RuntimeError("Inputs changed during TLS check")
    finally:
        for name in reversed(owned):
            try:
                raw = command(["-n", LAB_NS, "get", "networkpolicy", name,
                               "--ignore-not-found", "-o", "json"]).stdout
                if not raw.strip():
                    continue
                obj = json.loads(raw)
                if obj["metadata"].get("labels", {}).get("a-tlscheck-run") != run:
                    raise RuntimeError("Cleanup ownership mismatch")
                command(["-n", LAB_NS, "delete", "networkpolicy", name,
                         "--wait=true", "--timeout=20s"])
                remaining = command(["-n", LAB_NS, "get", "networkpolicy", name,
                                     "--ignore-not-found", "-o", "name"]).stdout
                if remaining.strip():
                    raise RuntimeError("Policy still present")
                print("TEMP_POLICY_REMOVED=" + name, flush=True)
            except Exception as exc:
                cleanup_ok = False
                print("CLEANUP_FAILED=" + name + ": " + str(exc), flush=True)
        print("CLEANUP_OK=" + str(cleanup_ok).lower(), flush=True)
    success = cleanup_ok and len(results) == len(TARGETS) and all(results)
    print("TLS_HEALTH_CHECK_OK=" + str(success).lower(), flush=True)
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
