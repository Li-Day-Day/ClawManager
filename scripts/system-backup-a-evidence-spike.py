"""Remote bounded evidence spike; no provider admin or credential extraction."""
import datetime
import hashlib
import json
import re
import subprocess
import sys
import time

CONTEXT = "kubernetes-admin@kubernetes"
OWNER = "clawmanager.io/a-evidence-run"
stage = "guard"
DIAGNOSTIC_CODES = {"none", "other", "AccessDenied", "NoSuchKey", "BadDigest", "PreconditionFailed", "SignatureDoesNotMatch", "InvalidAccessKeyId", "NotImplemented",
                    "XAmzContentChecksumMismatch", "XAmzContentSHA256Mismatch", "InvalidRequest", "InvalidArgument", "InvalidDigest", "InternalError", "SlowDown",
                    "tls_verification_failed", "provider_timeout", "provider_transport_failed", "client_failed"}


def require(value):
    if not value:
        raise ValueError("probe assertion failed")


def kube(*args, data=None, timeout=60, client_result=False):
    result = subprocess.run(["kubectl", "--context=" + CONTEXT, "--request-timeout=30s", *args],
                            input=data, capture_output=True, timeout=timeout, check=False)
    require((result.returncode == 0 or client_result and result.returncode == 1) and len(result.stdout) <= 1024 * 1024)
    if client_result and result.returncode != 0:
        # Preserve bounded diagnostics, but never turn stdout into exit success.
        try:
            value = json.loads(result.stdout)
            code = value.get("error_code") if value.get("status") == "failed" else "client_failed"
        except (ValueError, AttributeError):
            code = "client_failed"
        allowed = {"tls_verification_failed", "provider_timeout", "provider_transport_failed", "client_failed"}
        return json.dumps({"status": "failed", "error_code": code if isinstance(code, str) and code in allowed else "client_failed"})
    return result.stdout.decode()


def get(kind, name, ns):
    raw = kube("-n", ns, "get", kind, name, "--ignore-not-found", "-o", "json")
    return json.loads(raw) if raw.strip() else None


def guard(h):
    require(kube("config", "current-context").strip() == CONTEXT)
    require(kube("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.insecure-skip-tls-verify}") in ("", "false"))
    require(kube("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.server}").startswith("https://"))
    for name, uid in [(h["namespace"], h["namespace_uid"]), ("clawmanager-zhanghui08-system", "337cfe30-2c17-4b8e-b32a-760778b8098e")]:
        require(kube("get", "namespace", name, "-o", "jsonpath={.metadata.uid}") == uid)
    ca = get("configmap", "lab-trust", h["namespace"])
    require(hashlib.sha256(ca["data"]["ca.crt"].encode()).hexdigest() == h["ca_sha256"])
    for role in ("read", "write", "delete"):
        ref = h["identity_refs"]["d-evidence-" + role]
        actual = kube("-n", h["namespace"], "get", "secret", ref["secret_name"], "-o",
                      'jsonpath={.metadata.uid}{"|"}{.metadata.resourceVersion}{"|"}{.immutable}')
        require(actual == ref["uid"] + "|" + ref["resource_version"] + "|true")


def create(obj):
    return json.loads(kube("create", "-f", "-", "-o", "json", data=json.dumps(obj).encode()))


def plan(h, run_id):
    require(bool(re.fullmatch(r"a-ev-[a-f0-9]{24}", run_id)))
    return {"run_id": run_id, "namespace_uid": h["namespace_uid"], "bucket": "d-provider-evidence",
            "keys": ["a-spike/" + run_id + "/payload", "a-spike/" + run_id + "/bad-checksum"]}


def journal(h, run_id):
    return {"apiVersion": "v1", "kind": "ConfigMap", "immutable": True,
            "metadata": {"name": run_id, "namespace": h["namespace"], "labels": {OWNER: run_id}},
            "data": {"intent.json": json.dumps(plan(h, run_id), sort_keys=True)}}


def check_journal(obj, h, run_id):
    require(obj and obj.get("immutable") is True and obj["metadata"]["labels"].get(OWNER) == run_id)
    require(json.loads(obj["data"]["intent.json"]) == plan(h, run_id))
    return obj["metadata"]["uid"]


def pod_manifest(h, run_id, role, owner_uid):
    require(role in ("read", "write", "delete"))
    ref = h["identity_refs"]["d-evidence-" + role]
    return {"apiVersion": "v1", "kind": "Pod", "metadata": {
        "name": run_id + "-" + role, "namespace": h["namespace"], "labels": {OWNER: run_id},
        "ownerReferences": [{"apiVersion": "v1", "kind": "ConfigMap", "name": run_id, "uid": owner_uid}]},
        "spec": {"automountServiceAccountToken": False, "restartPolicy": "Never", "activeDeadlineSeconds": 1800,
            "nodeSelector": {"kubernetes.io/hostname": "node1"},
            "securityContext": {"runAsNonRoot": True, "runAsUser": 65532, "runAsGroup": 65532, "fsGroup": 65532, "seccompProfile": {"type": "RuntimeDefault"}},
            "containers": [{"name": "probe", "image": h["tools_image"], "imagePullPolicy": "IfNotPresent",
                "command": ["python", "-B", "-c", "import signal; signal.pause()"],
                "securityContext": {"allowPrivilegeEscalation": False, "readOnlyRootFilesystem": True, "capabilities": {"drop": ["ALL"]}},
                "resources": {"requests": {"cpu": "25m", "memory": "32Mi"}, "limits": {"cpu": "250m", "memory": "128Mi"}},
                "volumeMounts": [{"name": "trust", "mountPath": "/trust", "readOnly": True}, {"name": "identity", "mountPath": "/identity", "readOnly": True}]}],
            "volumes": [{"name": "trust", "configMap": {"name": "lab-trust"}},
                        {"name": "identity", "secret": {"secretName": ref["secret_name"], "defaultMode": 288,
                         "items": [{"key": "access_key", "path": "access_key"}, {"key": "secret_key", "path": "secret_key"}]}}]}}


def check_pod(obj, h, run_id, role, owner_uid):
    require(obj["metadata"].get("labels", {}).get(OWNER) == run_id)
    require(any(r.get("uid") == owner_uid and r.get("name") == run_id and r.get("kind") == "ConfigMap" for r in obj["metadata"].get("ownerReferences", [])))
    expected = pod_manifest(h, run_id, role, owner_uid)["spec"]
    actual = obj["spec"]
    require(actual.get("automountServiceAccountToken") is False and len(actual["containers"]) == 1)
    require(not actual.get("initContainers") and not actual.get("ephemeralContainers"))
    container = actual["containers"][0]
    require(container["image"] == h["tools_image"] and container["command"] == expected["containers"][0]["command"])
    require(not container.get("env") and not container.get("envFrom"))
    require(len(actual["volumes"]) == 2)
    volumes = {v["name"]: v for v in actual["volumes"]}
    require(volumes["identity"]["secret"] == expected["volumes"][1]["secret"])
    require(volumes["trust"]["configMap"]["name"] == "lab-trust")


def ready(h, run_id, role, owner_uid, create_missing=True):
    name = run_id + "-" + role
    obj = get("pod", name, h["namespace"])
    if obj is not None and obj.get("status", {}).get("phase") in ("Failed", "Succeeded"):
        check_pod(obj, h, run_id, role, owner_uid)
        delete_owned("pod", name, h["namespace"], obj["metadata"]["uid"])
        obj = None
    if obj is None:
        require(create_missing)
        obj = create(pod_manifest(h, run_id, role, owner_uid))
    check_pod(obj, h, run_id, role, owner_uid)
    uid = obj["metadata"]["uid"]
    kube("-n", h["namespace"], "wait", "--for=condition=Ready", "pod/" + name, "--timeout=120s", timeout=135)
    obj = get("pod", name, h["namespace"])
    check_pod(obj, h, run_id, role, owner_uid)
    require(obj["metadata"]["uid"] == uid)
    require(obj["status"]["containerStatuses"][0]["imageID"].split("@")[-1] == h["tools_image"].split("@")[-1])


def invoke(h, run_id, role, owner_uid, action, which="payload", observations=None):
    global stage
    stage = "probe_" + role + "_" + action
    guard(h)
    obj = get("pod", run_id + "-" + role, h["namespace"])
    check_pod(obj, h, run_id, role, owner_uid)
    value = json.loads(kube("-n", h["namespace"], "exec", "-i", run_id + "-" + role, "-c", "probe", "--", "python", "-B", "-c", CLIENT_SOURCE,
                           data=json.dumps({"handoff": h, "run_id": run_id, "action": action, "object": which}).encode(), client_result=True))
    if observations is not None:
        observations.append(safe_observation(value, role, action, which))
    require(value.get("status") == "ok")
    return value


def safe_observation(value, role, action, which):
    http_status = value.get("http_status")
    require(http_status is None or type(http_status) is int and 100 <= http_status <= 599)
    code = value.get("error_code", "none")
    return {"role": role, "action": action, "object": "bad-checksum" if action == "put-bad-checksum" else which, "http_status": http_status,
            "error_code": code if isinstance(code, str) and code in DIAGNOSTIC_CODES else "other"}


def status(value, http_status, code=None):
    require(value["http_status"] == http_status and (code is None or value["error_code"] == code))


def matrix(call, run_id, checks=None):
    checks = [] if checks is None else checks
    raw = ("A synthetic evidence probe " + run_id + "\n").encode() * 4
    result = call("write", "put")
    status(result, 200)
    require(result["checksum_matches"] and not result["versioned"])
    checks.append("write-sha256")
    status(call("write", "put-conflict"), 412, "PreconditionFailed")
    checks.append("conditional-create-conflict")
    result = call("read", "get")
    status(result, 200)
    require(result["body_sha256"] == hashlib.sha256(raw).hexdigest() and result["body_length"] == len(raw) and result["owner_matches"] and not result["versioned"])
    checks.append("read-content-sha256")
    result = call("read", "range")
    status(result, 206)
    require(result["range_matches"] and result["body_length"] == 16 and result["body_sha256"] == hashlib.sha256(raw[:16]).hexdigest())
    checks.append("range-content")
    # MinIO maps hash.ChecksumMismatch to XAmzContentChecksumMismatch/400.
    # Generic 400, payload-signing mismatch and authentication errors do not pass.
    result = call("write", "put-bad-checksum")
    status(result, 400)
    require(result["error_code"] in ("BadDigest", "XAmzContentChecksumMismatch"))
    checks.append("bad-checksum-rejected")
    # Every mutating negative request addresses the already owned synthetic key.
    for role, action in [("read", "put-conflict"), ("read", "delete"), ("write", "get"), ("write", "delete"), ("delete", "get"), ("delete", "put-conflict")]:
        status(call(role, action), 403, "AccessDenied")
        checks.append(role + "-" + action + "-denied")
    for role in ("read", "write", "delete"):
        for action in ("outside-get", "list"):
            status(call(role, action), 403, "AccessDenied")
            checks.append(role + "-" + action + "-denied")
    result = call("read", "tls-negative")
    require(result["untrusted_ca_rejected"] and result["wrong_hostname_rejected"])
    checks.append("tls-ca-and-hostname-denials")
    return checks


def cleanup_objects(call):
    for which in ("payload", "bad-checksum"):
        current = call("read", "get", which)
        if current["http_status"] == 404 and current["error_code"] == "NoSuchKey":
            continue
        status(current, 200)
        require(current["owner_matches"] and not current["versioned"])
        status(call("delete", "delete", which), 204)
        # 403, transport failure, delete response alone never proves absence.
        status(call("read", "get", which), 404, "NoSuchKey")


def delete_owned(kind, name, ns, uid):
    current = get(kind, name, ns)
    if current is None:
        return
    require(current["metadata"]["uid"] == uid)
    body = {"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": {"uid": uid}}
    kube("delete", "--raw", "/api/v1/namespaces/" + ns + "/" + {"pod": "pods", "configmap": "configmaps"}[kind] + "/" + name,
         "-f", "-", data=json.dumps(body).encode())
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        if get(kind, name, ns) is None:
            return
        time.sleep(2)
    raise ValueError("cleanup timeout")


def execute(options, h):
    global stage
    run_id, action, ns = options["run_id"], options["action"], h["namespace"]
    require(action in ("run", "cleanup"))
    plan(h, run_id)
    guard(h)
    existing = get("configmap", run_id, ns)
    if action == "run":
        require(existing is None)  # Never resume an ambiguous old run implicitly.
        create(journal(h, run_id))
        existing = get("configmap", run_id, ns)
    owner_uid = check_journal(existing, h, run_id)
    checks, passed, objects_clean, pods_clean = [], False, False, False
    observations = []
    attempted_write = action == "cleanup"
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    failed_stage = "none"
    call = lambda role, op, which="payload": invoke(h, run_id, role, owner_uid, op, which, observations)
    try:
        stage = "pods_ready"
        for role in (("read", "write", "delete") if action == "run" else ("read", "delete")):
            ready(h, run_id, role, owner_uid)
        if action == "run":
            stage = "data_plane_matrix"
            attempted_write = True
            matrix(call, run_id, checks)
        passed = True
    except Exception:
        failed_stage = stage
    finally:
        try:
            stage = "object_cleanup"
            if attempted_write:
                cleanup_objects(call)
            objects_clean = True
        except Exception:
            if failed_stage == "none":
                failed_stage = stage
        try:
            stage = "pod_cleanup"
            guard(h)
            for role in ("read", "write", "delete"):
                name = run_id + "-" + role
                obj = get("pod", name, ns)
                if obj is not None:
                    check_pod(obj, h, run_id, role, owner_uid)
                    delete_owned("pod", name, ns, obj["metadata"]["uid"])
            pods_clean = True
            if objects_clean:
                delete_owned("configmap", run_id, ns, owner_uid)
        except Exception:
            pods_clean = False
            if failed_stage == "none":
                failed_stage = stage
    return {"kind": "a_evidence_spike_v2", "status": "passed" if passed and objects_clean and pods_clean else "failed",
            "run_id": run_id, "namespace": ns, "namespace_uid": h["namespace_uid"], "action": action,
            "started_at": started, "finished_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "failed_stage": failed_stage,
            "checks_passed": checks, "observations": observations, "objects_removed": objects_clean, "pods_removed": pods_clean,
            "recovery_intent_retained": not (objects_clean and pods_clean),
            "provider_capability_approved": False, "evidence_registered": False, "production_scoped_grant_verified": False}


if __name__ == "__main__":
    try:
        result = execute(OPTIONS, HANDOFF)
        print(json.dumps(result))
        sys.exit(0 if result["status"] == "passed" else 1)
    except Exception:
        print(json.dumps({"kind": "a_evidence_spike_failure_v1", "run_id": OPTIONS["run_id"], "stage": stage}))
        sys.exit(1)
