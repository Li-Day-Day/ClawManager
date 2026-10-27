"""Remote Linux provisioner; invoked over the existing password SSH transport.

Only this lab's random namespace is mutable. No pip/apt/downloads/builds.
Captured subprocess output may contain Secrets; errors are intentionally terse.
"""
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time

CONTEXT = "kubernetes-admin@kubernetes"
SOURCE = "clawmanager-zhanghui08-system"
SOURCE_UID = "337cfe30-2c17-4b8e-b32a-760778b8098e"
LABEL = "clawmanager.io/provider-lab"
IMAGE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[a-f0-9]{64}$")
DIAG_PHASES = {"start", "bao-init", "bao-unseal", "bao-audit", "bao-transit", "bao-kms-key",
               "bao-kms-identities", "bao-signing-keys", "bao-kms-roundtrip", "bao-signing-roundtrips",
               "bao-kms-generate", "bao-kms-decrypt", "bao-kms-denials",
               "minio-ready", "minio-bucket", "minio-read", "minio-write", "minio-delete", "complete"}
DIAG_CODES = {"progress", "unexpected-response", "provider-http", "provider-transport", "provider-tls-certificate", "minio-command", "contract-check", "timeout"}


class SafeError(Exception):
    pass


def print_bootstrap_diagnostics(raw):
    for line in (raw or b"").splitlines():
        if not line.startswith(b"D_LAB_DIAG ") or len(line) > 1024:
            continue
        try:
            record = json.loads(line[len(b"D_LAB_DIAG "):])
            if not isinstance(record, dict) or set(record) not in ({"phase", "code"}, {"phase", "code", "http_status"}):
                continue
            if record["phase"] not in DIAG_PHASES or record["code"] not in DIAG_CODES:
                continue
            if "http_status" in record and (type(record["http_status"]) is not int or not 100 <= record["http_status"] <= 599):
                continue
            print("BOOTSTRAP_DIAG " + json.dumps(record, sort_keys=True), flush=True)
        except (ValueError, TypeError):
            continue


def run(argv, data=None, timeout=90, diagnostics=False):
    try:
        response = subprocess.run(argv, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        if diagnostics:
            print_bootstrap_diagnostics(error.stderr)
        raise SafeError("local tool timed out; raw output withheld") from None
    except Exception:
        raise SafeError("local tool failed or timed out; raw output withheld") from None
    if diagnostics:
        print_bootstrap_diagnostics(response.stderr)
    if response.returncode:
        raise SafeError("tool returned exit " + str(response.returncode) + "; raw output withheld")
    return response.stdout


def kube(*args, data=None, timeout=90, diagnostics=False):
    request_timeout = "0" if "exec" in args else "30s"
    return run(["kubectl", "--context=" + CONTEXT, "--request-timeout=" + request_timeout, *args], data, timeout, diagnostics)


def get(kind, name=None, ns=None, optional=False):
    args = (["-n", ns] if ns else []) + ["get", kind] + ([name] if name else [])
    if optional:
        args += ["--ignore-not-found"]
    raw = kube(*args, "-o", "json")
    return json.loads(raw) if raw.strip() else None


def create(kind, name, ns=None, **body):
    obj = {"apiVersion": "v1", "kind": kind, "metadata": {"name": name}, **body}
    if ns:
        obj["metadata"]["namespace"] = ns
    return json.loads(kube("create", "-f", "-", "-o", "json", data=json.dumps(obj).encode()))


def guard():
    if sys.version_info < (3, 9):
        raise SafeError("existing Python 3.9+ required; nothing installed")
    for tool in ("kubectl", "openssl"):
        if not shutil.which(tool):
            raise SafeError(tool + " unavailable; nothing installed")
    current = kube("config", "current-context").decode().strip()
    config = json.loads(kube("config", "view", "--minify", "-o", "json"))["clusters"][0]["cluster"]
    if current != CONTEXT or config.get("insecure-skip-tls-verify") or not config["server"].startswith("https://"):
        raise SafeError("context/TLS guard failed")
    if get("namespace", SOURCE)["metadata"]["uid"] != SOURCE_UID:
        raise SafeError("source namespace UID mismatch")


def owned(ns, uid):
    if not re.fullmatch(r"sbk-provider-zh-[a-f0-9]{12}", ns) or not re.fullmatch(r"[a-f0-9-]{36}", uid):
        raise SafeError("invalid lab identity")
    value = get("namespace", ns, optional=True)
    if value is None:
        return False
    if value["metadata"]["uid"] != uid or value["metadata"].get("labels", {}).get(LABEL) != "true":
        raise SafeError("lab namespace identity/ownership mismatch")
    return True


def cleanup(ns, uid):
    exists = owned(ns, uid)
    # Also catch a prior interrupted deletion. Never touch a PV directly.
    volumes = [p["metadata"]["name"] for p in get("pv")["items"]
               if p.get("spec", {}).get("claimRef", {}).get("namespace") == ns]
    if exists:
        body = {"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": {"uid": uid}}
        kube("delete", "--raw", "/api/v1/namespaces/" + ns, "-f", "-", data=json.dumps(body).encode())
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        namespace_left = get("namespace", ns, optional=True)
        if namespace_left and namespace_left["metadata"]["uid"] != uid:
            raise SafeError("namespace replaced during cleanup; no further mutation")
        remaining = [p["metadata"]["name"] for p in get("pv")["items"]
                     if p["metadata"]["name"] in volumes or p.get("spec", {}).get("claimRef", {}).get("namespace") == ns]
        if not namespace_left and not remaining:
            print("CLEANED provider-lab-namespace-and-kubernetes-pvs=yes namespace=" + ns, flush=True)
            return
        time.sleep(5)
    raise SafeError("namespace/PV cleanup pending; repeat cleanup with the same namespace and UID")


def source_minio_image():
    deployment = get("deployment", "minio", SOURCE)
    selector = deployment["spec"]["selector"]
    if selector.get("matchExpressions") or len(deployment["spec"]["template"]["spec"]["containers"]) != 1:
        raise SafeError("unsupported source MinIO layout; supply inventory instead")
    labels = ",".join(k + "=" + v for k, v in selector["matchLabels"].items())
    pods = json.loads(kube("-n", SOURCE, "get", "pods", "-l", labels, "-o", "json"))["items"]
    images = set()
    for pod in pods:
        if pod["status"].get("phase") == "Running":
            for container in pod["status"].get("containerStatuses", []):
                if container.get("ready"):
                    image = container.get("imageID", "").removeprefix("docker-pullable://")
                    if IMAGE.fullmatch(image):
                        images.add(image)
    if len(images) != 1:
        raise SafeError("cannot resolve a unique source MinIO runtime digest; no tag fallback")
    return images.pop()


def certs(directory, ns):
    root = Path(directory)
    def openssl(*args):
        run(["openssl", *args])
    ca, cakey = root / "ca.crt", root / "ca.key"
    openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "7", "-sha256",
            "-subj", "/CN=D-provider-lab-CA", "-addext", "basicConstraints=critical,CA:TRUE",
            "-addext", "keyUsage=critical,keyCertSign,cRLSign", "-addext", "subjectKeyIdentifier=hash",
            "-keyout", str(cakey), "-out", str(ca))
    result = {}
    for service in ("bao", "minio"):
        key, csr, crt, ext = [root / (service + suffix) for suffix in (".key", ".csr", ".crt", ".ext")]
        openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=" + service + "." + ns + ".svc",
                "-keyout", str(key), "-out", str(csr))
        ext.write_text("basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:" + service + "." + ns + ".svc,DNS:" + service + "." + ns + ".svc.cluster.local\n")
        openssl("x509", "-req", "-in", str(csr), "-CA", str(ca), "-CAkey", str(cakey), "-set_serial", str(secrets.randbits(128)),
                "-days", "7", "-sha256", "-extfile", str(ext), "-out", str(crt))
        result[service] = {"public.crt": crt.read_text(), "private.key": key.read_text()}
    return ca.read_text(), result


def pod(ns, name, image, command, mounts, volumes, env=None, port=None):
    container = {"name": name, "image": image, "imagePullPolicy": "IfNotPresent", "command": command,
        "securityContext": {"allowPrivilegeEscalation": False, "readOnlyRootFilesystem": True,
                            "capabilities": {"drop": ["ALL"]}},
        "resources": {"requests": {"cpu": "100m", "memory": "128Mi"}, "limits": {"cpu": "1", "memory": "512Mi"}},
        "env": env or [], "volumeMounts": mounts + [{"name": "tmp", "mountPath": "/tmp"}]}
    if port:
        container["readinessProbe"] = {"tcpSocket": {"port": port}, "periodSeconds": 3}
    return create("Pod", name, ns, metadata={"name": name, "namespace": ns, "labels": {"app": name, LABEL: "true"}},
        spec={"automountServiceAccountToken": False, "restartPolicy": "Never",
              "securityContext": {"runAsNonRoot": True, "runAsUser": 65532, "runAsGroup": 65532, "fsGroup": 65532,
                                  "seccompProfile": {"type": "RuntimeDefault"}},
              "nodeSelector": {"kubernetes.io/hostname": "node1"}, "containers": [container],
              "volumes": volumes + [{"name": "tmp", "emptyDir": {"medium": "Memory", "sizeLimit": "32Mi"}}]})


def wait_pods(ns):
    deadline = time.monotonic() + 300
    last = None
    while time.monotonic() < deadline:
        pods = get("pod", ns=ns)["items"]
        status = []
        ready = 0
        for p in pods:
            name = p["metadata"]["name"]
            good = any(c["type"] == "Ready" and c["status"] == "True" for c in p["status"].get("conditions", []))
            ready += int(good)
            reasons = [c.get("state", {}).get("waiting", {}).get("reason", "") or c.get("state", {}).get("terminated", {}).get("reason", "")
                       for c in p["status"].get("containerStatuses", [])]
            status.append(name + ":" + ("Ready" if good else p["status"].get("phase", "Unknown")) + "/" + ",".join(reasons))
        if len(pods) == 3 and ready == 3:
            return pods
        marker = " ".join(status)
        if marker != last:
            print("WAIT " + marker, flush=True)
            last = marker
        time.sleep(5)
    raise SafeError("lab pods did not become ready; no raw logs printed")


def bao_config(ns):
    return {"ui": False, "disable_mlock": True, "api_addr": "https://bao." + ns + ".svc:8200",
        "unsafe_allow_api_audit_creation": False, "allow_audit_log_prefixing": False,
        "audit": [{"file": {"lab": {"description": "Isolated provider capability lab audit",
            "options": {"file_path": "/data/audit.json", "log_raw": "false", "hmac_accessor": "true", "mode": "0600"}}}}],
        "storage": {"file": {"path": "/data/store"}}, "listener": {"tcp": {"address": "0.0.0.0:8200",
            "tls_cert_file": "/tls/public.crt", "tls_key_file": "/tls/private.key", "tls_min_version": "tls12"}}}


def deploy(image):
    if not IMAGE.fullmatch(image):
        raise SafeError("provider image must be digest pinned")
    if not os.path.isdir("/dev/shm"):
        raise SafeError("memory-backed TLS scratch unavailable")
    storage = get("storageclass", "longhorn")
    if storage.get("reclaimPolicy") != "Delete":
        raise SafeError("longhorn reclaim policy must be Delete for this disposable lab")
    if get("node", "node1")["status"]["nodeInfo"]["architecture"] != "amd64":
        raise SafeError("node1 is not amd64")
    minio_image = source_minio_image()
    ns = "sbk-provider-zh-" + secrets.token_hex(6)
    uid = None
    complete = False
    print("CREATE provider-lab namespace=" + ns, flush=True)
    try:
        obj = create("Namespace", ns, metadata={"name": ns, "labels": {LABEL: "true"}})
        uid = obj["metadata"]["uid"]
        print("RUN namespace=" + ns + " uid=" + uid, flush=True)
        print("IMAGE tools=" + image + " minio=" + minio_image, flush=True)
        # Isolate pod traffic to this namespace plus cluster DNS. No NodePort/Ingress.
        policy = {"podSelector": {}, "policyTypes": ["Ingress", "Egress"],
            "ingress": [{"from": [{"podSelector": {}}]}],
            "egress": [{"to": [{"podSelector": {}}]}, {"to": [{"namespaceSelector": {"matchLabels": {"kubernetes.io/metadata.name": "kube-system"}},
                "podSelector": {"matchLabels": {"k8s-app": "kube-dns"}}}],
                "ports": [{"protocol": "UDP", "port": 53}, {"protocol": "TCP", "port": 53}]}]}
        create("NetworkPolicy", "lab-isolation", ns, apiVersion="networking.k8s.io/v1", spec=policy)
        client_hash = hashlib.sha256(LAB_CLIENT_SOURCE.encode()).hexdigest()
        create("ConfigMap", "lab-client", ns, immutable=True, data={"client.py": LAB_CLIENT_SOURCE})
        print("CLIENT source_sha256=" + client_hash, flush=True)
        with tempfile.TemporaryDirectory(prefix="d-provider-tls-", dir="/dev/shm") as scratch:
            ca, certificates = certs(scratch, ns)
            for name in ("bao", "minio"):
                create("Secret", name + "-tls", ns, immutable=True, stringData=certificates[name])
        create("ConfigMap", "lab-trust", ns, data={"ca.crt": ca})
        for name, size in (("bao", "1Gi"), ("minio", "2Gi")):
            create("PersistentVolumeClaim", name + "-data", ns, spec={"accessModes": ["ReadWriteOnce"],
                "storageClassName": "longhorn", "resources": {"requests": {"storage": size}}})
            create("Service", name, ns, spec={"selector": {"app": name}, "ports": [{"port": 8200 if name == "bao" else 9000}]})
        config = bao_config(ns)
        create("ConfigMap", "bao-config", ns, immutable=True, data={"bao.json": json.dumps(config)})
        user, password = "d-root-" + secrets.token_hex(8), secrets.token_urlsafe(48)
        create("Secret", "minio-admin", ns, immutable=True, stringData={"username": user, "password": password})
        def mounts(name):
            return [{"name": "data", "mountPath": "/data"}, {"name": "tls", "mountPath": "/tls", "readOnly": True}]
        def volumes(name):
            return [{"name": "data", "persistentVolumeClaim": {"claimName": name + "-data"}},
                    {"name": "tls", "projected": {"defaultMode": 288, "sources": [
                        {"secret": {"name": name + "-tls"}},
                        {"configMap": {"name": "lab-trust", "items": [{"key": "ca.crt", "path": "CAs/ca.crt"}]}}]}}]
        pod(ns, "bao", image, ["bao", "server", "-config=/config/bao.json"],
            mounts("bao") + [{"name": "config", "mountPath": "/config", "readOnly": True}],
            volumes("bao") + [{"name": "config", "configMap": {"name": "bao-config"}}], port=8200)
        pod(ns, "minio", minio_image, ["minio", "server", "/data", "--address", ":9000", "--console-address", ":9001", "--certs-dir", "/tls"],
            mounts("minio"), volumes("minio"), env=[{"name": "HOME", "value": "/tmp"},
                {"name": "MINIO_ROOT_USER", "valueFrom": {"secretKeyRef": {"name": "minio-admin", "key": "username"}}},
                {"name": "MINIO_ROOT_PASSWORD", "valueFrom": {"secretKeyRef": {"name": "minio-admin", "key": "password"}}}], port=9000)
        pod(ns, "lab-tools", image, ["python", "-c", "import signal; signal.pause()"],
            [{"name": "trust", "mountPath": "/trust", "readOnly": True}, {"name": "client", "mountPath": "/lab-client", "readOnly": True}],
            [{"name": "trust", "configMap": {"name": "lab-trust"}}, {"name": "client", "configMap": {"name": "lab-client"}}])
        pods = wait_pods(ns)
        for p in pods:
            expected = minio_image if p["metadata"]["name"] == "minio" else image
            actual = p["status"]["containerStatuses"][0]["imageID"]
            if actual.split("@")[-1] != expected.split("@")[-1]:
                raise SafeError("runtime image digest mismatch")
        print("BOOTSTRAP provider keys and purpose-scoped identities; raw responses captured privately", flush=True)
        runner = "import hashlib,pathlib,runpy,sys; p='/lab-client/client.py'; actual=hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest(); actual == sys.argv[1] or sys.exit('client checksum mismatch'); sys.argv=[p,'bootstrap']; runpy.run_path(p,run_name='__main__')"
        raw = kube("-n", ns, "exec", "-i", "lab-tools", "--", "python", "-c", runner, client_hash,
            data=json.dumps({"namespace": ns, "minio_user": user, "minio_password": password}).encode(), timeout=240, diagnostics=True)
        result = json.loads(raw)
        create("Secret", "lab-recovery", ns, immutable=True, stringData=result["recovery"])
        identities = {}
        for alias, value in result["tokens"].items():
            metadata = create("Secret", alias, ns, immutable=True, stringData={"token": value})["metadata"]
            identities[alias] = {"secret_name": alias, "uid": metadata["uid"], "resource_version": metadata["resourceVersion"]}
        for alias, values in result["evidence_credentials"].items():
            metadata = create("Secret", alias, ns, immutable=True, stringData=values)["metadata"]
            identities[alias] = {"secret_name": alias, "uid": metadata["uid"], "resource_version": metadata["resourceVersion"]}
        report = result["handoff"]
        report.update({"namespace": ns, "namespace_uid": uid, "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "tools_image": image, "minio_image": minio_image, "ca_configmap": "lab-trust", "ca_sha256": hashlib.sha256(ca.encode()).hexdigest(),
            "identity_refs": identities,
            "bootstrap_client_configmap": "lab-client", "bootstrap_client_sha256": client_hash,
            "credential_delivery": "operator mounts only the required named Secret into each test pod; never paste Secret values",
            "cleanup_required_after_A_tests": True, "same_cluster_only": True, "tls_certificate_validity_days": 7})
        create("ConfigMap", "lab-handoff", ns, data={"handoff.json": json.dumps(report, indent=2)})
        if not owned(ns, uid):
            raise SafeError("lab disappeared before handoff")
        complete = True
        print(json.dumps(report, indent=2), flush=True)
        print("PASS: isolated provider lab provisioned; A capability acceptance pending", flush=True)
        print("CLEANUP_REQUIRED namespace=" + ns + " uid=" + uid, flush=True)
    finally:
        if uid and not complete:
            print("FAILED deployment; cleaning owned lab namespace=" + ns + " uid=" + uid, flush=True)
            cleanup(ns, uid)


def main(options):
    os.umask(0o077)
    guard()
    if options["action"] == "deploy":
        deploy(options["image"])
    elif options["action"] == "cleanup":
        cleanup(options["namespace"], options["uid"])
    else:
        raise SafeError("unknown action")


if __name__ == "__main__":
    try:
        main(LAB_OPTIONS)
    except Exception as error:
        print("FAIL: " + (str(error) if isinstance(error, SafeError) else type(error).__name__ + "; raw details withheld"), file=sys.stderr)
        sys.exit(1)
