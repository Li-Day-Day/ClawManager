"""Operator-run site JWT trust setup; existing recovery credential stays in Pod.

Default is local review. --apply creates a temporary control Pod, installs only
the reviewed public JWT trust, and deletes that Pod with a UID precondition.
Never reads Secret.data, creates workload roles, or grants task execution.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("trust_setup", ROOT / "scripts/system-backup-a-apply-jwt-trust.py")
trust = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trust)
require = trust.require
CONTEXT = "kubernetes-admin@kubernetes"
NS = "sbk-provider-zh-7474d6e0b052"
NS_UID = "a285351a-b52a-4b91-af78-1e5fa8e78387"
CA_NAME = "bao-trust-recovery2-20261028"
CA_UID = "dfa905e3-e00d-4c45-a955-b8547e806757"
CA_SHA = "e7ff215f4fb96613cba2c0c89e9b28afe19b412b5d63be0593843a45fe99f518"
ENDPOINT = "https://bao.sbk-provider-zh-7474d6e0b052.svc:8200"
IMAGE = "10.130.14.23:5000/clawmanager@sha256:8829a85386402301f06f00a766a8b3627001bb4d7f327e16af228d3b337d9cb3"
PLAN_SHA = "6e9de9b8d822810fa7f32ef7fa31f137cd8eb873c03c987662eb049794f8aed5"
LABEL = "clawmanager.io/a-jwt-trust"


class CommandFailed(trust.support.Rejected):
    def __init__(self, returncode):
        super().__init__("kubectl_failed")
        self.returncode = returncode


def stage(progress, name):
    if progress is not None:
        progress["failure_stage"] = name


def pod_diagnostics(pod):
    """Keep only closed status codes before cleanup; never container logs/messages."""
    status = pod.get("status", {})
    if not isinstance(status, dict):
        return {"phase": "unknown"}
    phase = status.get("phase")
    result = {"phase": phase if phase in ("Pending", "Running", "Succeeded", "Failed", "Unknown") else "unknown"}
    allowed = {"ContainerCreating", "PodInitializing", "CrashLoopBackOff", "ErrImagePull", "ImagePullBackOff",
               "CreateContainerConfigError", "CreateContainerError", "RunContainerError", "InvalidImageName",
               "Completed", "Error", "OOMKilled", "ContainerCannotRun", "DeadlineExceeded"}
    states = status.get("containerStatuses", [])
    if isinstance(states, list) and states and isinstance(states[0], dict):
        state = states[0].get("state", {})
        if not isinstance(state, dict):
            return result
        for kind in ("waiting", "running", "terminated"):
            if not isinstance(state.get(kind), dict):
                continue
            result["container_state"] = kind
            reason = state[kind].get("reason")
            if reason is not None:
                result["reason"] = reason if reason in allowed else "other"
            code = state[kind].get("exitCode")
            if type(code) is int and 0 <= code <= 255:
                result["exit_code"] = code
    return result


def kube(*args, data=None, timeout=45):
    result = subprocess.run(["kubectl", "--context=" + CONTEXT, "--request-timeout=30s", *args],
                            input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        raise CommandFailed(result.returncode)
    return result.stdout


def get(kind, name, namespace=None):
    args = ["-n", namespace] if namespace else []
    raw = kube(*args, "get", kind, name, "--ignore-not-found", "-o", "json")
    return json.loads(raw) if raw.strip() else None


def guard(progress=None):
    # Explicit context, verified API TLS; kubeconfig credentials are never read.
    stage(progress, "preflight_api_tls")
    tls = kube("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.insecure-skip-tls-verify}")
    require(tls.strip() in (b"", b"false"))
    require(kube("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.server}").startswith(b"https://"))
    stage(progress, "preflight_namespace")
    require(get("namespace", NS)["metadata"]["uid"] == NS_UID)
    stage(progress, "preflight_ca")
    ca = get("configmap", CA_NAME, NS)
    require(ca["metadata"]["uid"] == CA_UID and hashlib.sha256(ca["data"]["ca.crt"].encode()).hexdigest() == CA_SHA)
    stage(progress, "preflight_bao_pod")
    bao = get("pod", "bao-recovery-tls2-20261028", NS)
    require(bao["metadata"]["uid"] == "a9e53b50-905a-446e-8edc-7361c45b269d" and not bao["metadata"].get("deletionTimestamp"))
    # Only metadata projection: the root value never crosses kubectl stdout.
    stage(progress, "preflight_recovery_reference")
    raw = kube("-n", NS, "get", "secret", "lab-recovery", "-o",
               'jsonpath={.metadata.uid}{"|"}{.metadata.resourceVersion}{"|"}{.immutable}')
    uid, version, immutable = raw.decode().split("|")
    require(uid and version and immutable == "true")
    return {"uid": uid, "resource_version": version}


def manifest(name):
    return {"apiVersion": "v1", "kind": "Pod", "metadata": {"name": name, "namespace": NS, "labels": {LABEL: name}},
            "spec": {"automountServiceAccountToken": False, "restartPolicy": "Never", "activeDeadlineSeconds": 240,
                     "securityContext": {"runAsUser": 0, "seccompProfile": {"type": "RuntimeDefault"}},
                     "containers": [{"name": "control", "image": IMAGE, "imagePullPolicy": "IfNotPresent",
                                     "command": ["python", "-B", "-c", "import time; time.sleep(230)"],
                                     "securityContext": {"allowPrivilegeEscalation": False, "readOnlyRootFilesystem": True, "capabilities": {"drop": ["ALL"]}},
                                     "resources": {"requests": {"cpu": "10m", "memory": "32Mi"}, "limits": {"cpu": "250m", "memory": "128Mi"}},
                                     "volumeMounts": [{"name": "trust", "mountPath": "/trust", "readOnly": True},
                                                      {"name": "operator", "mountPath": "/identity", "readOnly": True},
                                                      {"name": "work", "mountPath": "/work"}]}],
                     "volumes": [{"name": "trust", "configMap": {"name": CA_NAME, "items": [{"key": "ca.crt", "path": "ca.crt"}]}},
                                 {"name": "operator", "secret": {"secretName": "lab-recovery", "defaultMode": 256, "items": [{"key": "root_token", "path": "root_token"}]}},
                                 {"name": "work", "emptyDir": {"medium": "Memory", "sizeLimit": "4Mi"}}]}}


def same_pod(actual, expected, uid):
    require(actual and actual["metadata"]["uid"] == uid and actual["metadata"].get("labels", {}).get(LABEL) == expected["metadata"]["name"])
    a, e = actual["spec"], expected["spec"]
    require(not any(a.get(k) for k in ("hostNetwork", "hostPID", "hostIPC", "initContainers", "ephemeralContainers")))
    for field in ("automountServiceAccountToken", "restartPolicy", "activeDeadlineSeconds", "securityContext"):
        require(a[field] == e[field])
    require(len(a["containers"]) == 1 and len(a["volumes"]) == 3)
    for field in ("name", "image", "command", "securityContext", "volumeMounts"):
        require(a["containers"][0][field] == e["containers"][0][field])
    require(not a["containers"][0].get("env") and not a["containers"][0].get("envFrom"))
    # API defaultMode and emptyDir defaults may be added; every requested value
    # must be retained and no substitute identity or host volume may be added.
    for av, ev in zip(a["volumes"], e["volumes"]):
        require(set(av) == set(ev) and av["name"] == ev["name"])
        key = next(k for k in ev if k != "name")
        require(all(av[key].get(k) == v for k, v in ev[key].items()))


CLIENT = r'''
import json,pathlib,runpy,sys
sys.dont_write_bytecode=True
p=json.load(sys.stdin)
for name,source in p["sources"].items():
    pathlib.Path("/work",name).write_text(source,encoding="utf-8")
pathlib.Path("/work/plan.json").write_bytes(bytes.fromhex(p["plan_hex"]))
assert p["mode"] in ("apply", "inspect")
sys.argv=["setup","--plan","/work/plan.json","--plan-sha256",p["plan_sha256"],"--endpoint",p["endpoint"],"--ca-file","/trust/ca.crt","--ca-sha256",p["ca_sha256"],"--operator-token-file","/identity/root_token","--"+p["mode"]]
try:
    runpy.run_path("/work/system-backup-a-apply-jwt-trust.py",run_name="__main__")
except SystemExit as error:
    # Transport the child's closed receipt even on a provider rejection.
    # The parent validates status and never treats exec exit=0 as success.
    if error.code not in (0, 1):
        raise
'''


def validate_receipt(receipt, plan_raw, inspect, progress):
    require(isinstance(receipt, dict))
    if receipt.get("status") == "failed_or_outcome_unknown":
        require(set(receipt) == {"status", "failure_stage", "provider_write_attempted"})
        require(receipt["failure_stage"] in trust.STAGES and type(receipt["provider_write_attempted"]) is bool)
        progress["provider_failure_stage"] = receipt["failure_stage"]
        progress["provider_write_attempted"] = receipt["provider_write_attempted"]
        require(not inspect or receipt["provider_write_attempted"] is False)
        raise trust.support.Rejected("provider_operation_failed")
    expected = {"status", "mount", "config_request_sha256", "config_readback_sha256",
                "roles_created", "credentials_created", "task_authorized"}
    expected |= {"mount_exists", "config_exists", "provider_mutated"} if inspect else {"created"}
    require(set(receipt) == expected)
    plan = trust.support.decode(plan_raw)
    mount, _ = trust.reviewed_plan(plan)
    require(receipt["mount"] == mount and receipt["config_request_sha256"] == plan["config_request_sha256"])
    require(all(receipt[k] is False for k in ("roles_created", "credentials_created", "task_authorized")))
    if inspect:
        require(receipt["provider_mutated"] is False)
        states = {"jwt_trust_mount_absent": (False, False), "jwt_trust_config_absent": (True, False),
                  "jwt_trust_readback_verified": (True, True)}
        require(receipt["status"] in states)
        require(all(type(receipt[k]) is bool for k in ("mount_exists", "config_exists")))
        require((receipt["mount_exists"], receipt["config_exists"]) == states[receipt["status"]])
    else:
        require(receipt["status"] == "jwt_trust_readback_verified" and type(receipt["created"]) is bool)
    if receipt["status"] == "jwt_trust_readback_verified":
        require(isinstance(receipt["config_readback_sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", receipt["config_readback_sha256"]))
    else:
        require(receipt["config_readback_sha256"] is None)


def execute(plan_raw, name, inspect=False, progress=None):
    if progress is None:
        progress = {}
    progress.update({"failure_stage": "preflight", "cleanup_stage": "not_started",
                     "temporary_control_pod_removed": None, "provider_write_attempted": False})
    original = guard(progress)
    pod = manifest(name)
    stage(progress, "temporary_pod_absence")
    require(get("pod", name, NS) is None)
    uid = None
    try:
        stage(progress, "temporary_pod_create")
        created = json.loads(kube("create", "-f", "-", "-o", "json", data=json.dumps(pod).encode()))
        uid = created["metadata"]["uid"]
        stage(progress, "temporary_pod_admission")
        same_pod(created, pod, uid)
        stage(progress, "temporary_pod_ready")
        kube("-n", NS, "wait", "--for=condition=Ready", "pod/" + name, "--timeout=60s", timeout=65)
        stage(progress, "temporary_pod_readback")
        current = get("pod", name, NS)
        same_pod(current, pod, uid)
        stage(progress, "temporary_pod_image")
        require(current["status"]["containerStatuses"][0]["imageID"].split("@")[-1] == IMAGE.split("@")[-1])
        require(guard(progress) == original)
        stage(progress, "provider_sources")
        sources = {n: (ROOT / "scripts" / n).read_text(encoding="utf-8") for n in ("system-backup-a-apply-jwt-trust.py", "system-backup-a-apply-kek-policy.py")}
        stage(progress, "provider_exec")
        # A transport failure after this point does not prove no provider write.
        progress["provider_write_attempted"] = not inspect
        raw = kube("-n", NS, "exec", "-i", name, "-c", "control", "--", "python", "-B", "-c", CLIENT,
                   data=json.dumps({"sources": sources, "plan_hex": plan_raw.hex(), "plan_sha256": PLAN_SHA,
                                    "endpoint": ENDPOINT, "ca_sha256": CA_SHA, "mode": "inspect" if inspect else "apply"}).encode(), timeout=60)
        stage(progress, "provider_receipt")
        require(len(raw) <= 65536)
        receipt = trust.support.decode(raw)
        validate_receipt(receipt, plan_raw, inspect, progress)
        require(guard(progress) == original)
        stage(progress, "complete")
    finally:
        # On unknown create, recover only our random labelled Pod, then delete
        # its exact observed UID. Never delete an unrelated replacement.
        progress["cleanup_stage"] = "namespace_check"
        require(get("namespace", NS)["metadata"]["uid"] == NS_UID)
        progress["cleanup_stage"] = "pod_read"
        current = get("pod", name, NS)
        if current is not None:
            progress["temporary_control_pod_removed"] = False
            progress["cleanup_stage"] = "pod_ownership"
            if uid is None:
                same_pod(current, pod, current["metadata"]["uid"])
            else:
                # A rejected admission mutation must not strand our root-
                # mounted Pod. UID ownership, not accepted spec, gates cleanup.
                require(current["metadata"]["uid"] == uid and current["metadata"].get("labels", {}).get(LABEL) == name)
            uid = current["metadata"]["uid"]
            progress["temporary_pod_status"] = pod_diagnostics(current)
            progress["cleanup_stage"] = "pod_delete"
            kube("delete", "--raw", "/api/v1/namespaces/" + NS + "/pods/" + name, "-f", "-",
                 data=json.dumps({"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": {"uid": uid}}).encode())
            progress["cleanup_stage"] = "pod_absence_readback"
            for _ in range(30):
                current = get("pod", name, NS)
                if current is None:
                    break
                require(current["metadata"]["uid"] == uid)
                time.sleep(1)
            require(current is None)
        progress["temporary_control_pod_removed"] = True
        progress["cleanup_stage"] = "verified_absent"
    return {**receipt, "temporary_control_pod_removed": True, "operator_secret_reference": "lab-recovery/root_token"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--inspect", action="store_true", help="Use a temporary Pod for GET-only provider readback; no trust writes")
    args = parser.parse_args()
    name = "a-jwt-trust-" + secrets.token_hex(8)
    progress = {"failure_stage": "plan", "cleanup_stage": "not_started",
                "temporary_control_pod_removed": None, "provider_write_attempted": False}
    try:
        raw = (ROOT / "docs/evidence/a-site-kek-jwt-trust-prepared-20261029.json").read_bytes()
        require(hashlib.sha256(raw).hexdigest() == PLAN_SHA)
        mount, _ = trust.reviewed_plan(trust.support.decode(raw))
        if not args.apply and not args.inspect:
            print(json.dumps({"status": "review_only_not_applied", "mount": mount, "plan_sha256": PLAN_SHA,
                              "namespace": NS, "operator_secret_reference": "lab-recovery/root_token"}))
            return 0
        print(json.dumps(execute(raw, name, inspect=args.inspect, progress=progress)))
        return 0
    except Exception as error:
        error_kind = "kubectl_timeout" if isinstance(error, subprocess.TimeoutExpired) else "rejected_or_invalid_response"
        if isinstance(error, CommandFailed):
            error_kind = "kubectl_failed"
            progress["kubectl_exit_code"] = error.returncode
        print(json.dumps({"status": "failed_or_outcome_unknown", "temporary_pod_name": name,
                          **progress, "error_kind": error_kind, "mode": "inspect" if args.inspect else "apply",
                          "next": "Check public mount receipt and temporary Pod cleanup; no implicit retry, raw errors withheld."}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
