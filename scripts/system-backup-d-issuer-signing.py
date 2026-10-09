"""Disposable acceptance against the two existing real issuer keys.

No issuer/key/config mutation. Exact intent/UID ownership controls recovery.
Token issue->Secret crash windows are recovered using provider token metadata.
"""
import base64
import datetime
import hashlib
import json
import re
import sys
import types

support = types.ModuleType("signing_support")
support.BASE_SOURCE, support.CLIENT_SOURCE = BASE_SOURCE, CLIENT_SOURCE
exec(LIFECYCLE_SOURCE, support.__dict__)
support.base.OWNER = "clawmanager.io/d-issuer-signing"
require = support.require
stage = "guard"
diagnostic = {"code": "orchestration_failure", "http_status": None}
cleanup_completed = False


def safe_client_diagnostic(value):
    require(isinstance(value, dict) and set(value) == {"code", "http_status"})
    require(value["code"] in ("unexpected_http_status", "invalid_signature_format", "client_assertion_or_transport"))
    require(value["http_status"] is None or type(value["http_status"]) is int and 100 <= value["http_status"] <= 599)
    return value


class Acceptance:
    def __init__(self, o, h, bindings):
        self.o, self.h, self.bindings = o, h, bindings
        self.run, self.ns = o["run_id"], h["namespace"]
        self.owner, self.record = None, None
        self.pods = {}
        self.secret_refs = {}

    def candidate_guard(self):
        support.guard(self.h)
        for role, candidate in self.o["candidates"].items():
            require(role in ("provider", "strong") and candidate["namespace_uid"] == self.h["namespace_uid"])
            run = candidate["run_id"]
            prefix = "d-issuer-" if role == "provider" else "d-mfa-"
            require(re.fullmatch(prefix + r"[a-f0-9]{24}", run))
            cm = support.base.get("configmap", run + "-registry", self.ns)
            require(cm and cm.get("immutable") is True and cm["metadata"]["uid"] == candidate["registry_configmap_uid"])
            label = "clawmanager.io/d-provider-issuer" if role == "provider" else "clawmanager.io/d-strong-auth-issuer"
            require(cm["metadata"].get("labels", {}).get(label) == run)
            require(any(x.get("uid") == candidate["intent_uid"] and x.get("name") == run and x.get("kind") == "ConfigMap"
                        for x in cm["metadata"].get("ownerReferences", [])))
            require(cm["data"]["registry.json"] == candidate["registry_json"])
            require(json.loads(cm["data"]["key.json"]) == candidate["key"])
            raw = cm["data"]["registry.json"].encode()
            require(hashlib.sha256(raw).hexdigest() == candidate["registry_sha256"])
            if self.o["action"] == "run":
                key = json.loads(raw)["keys"][0]
                now = datetime.datetime.now(datetime.timezone.utc)
                require(datetime.datetime.fromisoformat(key["not_before"]) <= now
                        < datetime.datetime.fromisoformat(key["not_after"]) and key["revoked"] is False)

    def open(self):
        require(re.fullmatch(r"d-sig-[a-f0-9]{24}", self.run))
        require(self.o["action"] in ("run", "cleanup"))
        self.candidate_guard()
        intent = support.base.get("configmap", self.run, self.ns)
        if self.o["action"] == "run":
            require(intent is None)
            root = support.secret_ref(self.h, "lab-recovery")
            require(root is not None)
            record = {"namespace_uid": self.h["namespace_uid"], "bindings": self.bindings,
                      "root_ref": root, "candidates": self.o["candidates"], "challenges": self.o["challenges"]}
            intent = support.base.create({"apiVersion": "v1", "kind": "ConfigMap", "immutable": True,
                "metadata": support.metadata(self.run, self.ns), "data": {"intent.json": json.dumps(record, sort_keys=True)}})
        require(intent and intent.get("immutable") is True and intent["metadata"].get("labels", {}).get(support.base.OWNER) == self.run)
        self.owner = intent["metadata"]["uid"]
        self.record = json.loads(intent["data"]["intent.json"])
        require(self.record["namespace_uid"] == self.h["namespace_uid"] and self.record["bindings"] == self.bindings
                and self.record["candidates"] == self.o["candidates"])
        require(support.secret_ref(self.h, "lab-recovery") == self.record["root_ref"])
        self.o["challenges"] = self.record["challenges"]
        return True

    def ready(self, role):
        global stage
        stage = role + ".ready"
        support.guard(self.h)
        name = self.run + "-" + role
        pod = support.base.get("pod", name, self.ns)
        if pod is not None and pod.get("status", {}).get("phase") in ("Succeeded", "Failed"):
            support.check_pod(pod, self.h, self.run, role, self.owner)
            support.remove("pod", name, self.h, pod["metadata"]["uid"])
            pod = None
        if pod is None:
            pod = support.base.create(support.manifest(self.h, self.run, role, self.owner))
        support.check_pod(pod, self.h, self.run, role, self.owner)
        uid = pod["metadata"]["uid"]
        support.base.kube("-n", self.ns, "wait", "--for=condition=Ready", "pod/" + name, "--timeout=120s", timeout=135)
        current = support.base.get("pod", name, self.ns)
        support.check_pod(current, self.h, self.run, role, self.owner)
        require(current["metadata"]["uid"] == uid and current["status"]["containerStatuses"][0]["imageID"].split("@")[-1] == self.h["tools_image"].split("@")[-1])
        self.pods[role] = uid

    def invoke(self, role, action, **kw):
        global stage, diagnostic
        stage = role + "." + action + "." + kw.get("variant", "normal")
        support.guard(self.h)
        require(support.secret_ref(self.h, "lab-recovery") == self.record["root_ref"])
        pod = support.base.get("pod", self.run + "-" + role, self.ns)
        support.check_pod(pod, self.h, self.run, role, self.owner)
        require(pod["metadata"]["uid"] == self.pods[role])
        if role != "admin":
            require(self.secret_metadata(role) == self.secret_refs[role])
        source = "CLIENT_SOURCE=" + repr(CLIENT_SOURCE) + "\n" + SIGNING_CLIENT_SOURCE
        result = support.base.subprocess.run(["kubectl", "--context=" + support.base.CONTEXT, "--request-timeout=30s",
            "-n", self.ns, "exec", "-i", self.run + "-" + role, "-c", "probe", "--", "python", "-B", "-c", source],
            input=json.dumps({**self.o, "handoff": self.h, "owner_uid": self.owner, "role": role, "action": action, **kw}).encode(),
            capture_output=True, timeout=60, check=False)
        require(len(result.stdout) <= 65536)
        value = json.loads(result.stdout)
        if result.returncode == 1 and isinstance(value, dict) and set(value) == {"error", "diagnostic"} and value["error"] == "signing_acceptance_client_failed":
            diagnostic = safe_client_diagnostic(value["diagnostic"])
        require(result.returncode == 0 and "error" not in value)
        return value

    def secret_metadata(self, role):
        name = self.run + "-" + role
        ref = support.secret_ref(self.h, name)
        if ref is not None:
            raw = support.base.kube("-n", self.ns, "get", "secret", name, "-o", "jsonpath={.metadata}")
            meta = json.loads(raw)
            require(meta["uid"] == ref["uid"])
            support.check_owned({"metadata": meta}, self.run, self.owner)
        return ref

    def cleanup(self):
        self.ready("admin")
        self.invoke("admin", "cleanup")
        for role in ("provider", "strong", "admin"):
            name = self.run + "-" + role
            pod = support.base.get("pod", name, self.ns)
            if pod:
                support.check_pod(pod, self.h, self.run, role, self.owner)
                support.remove("pod", name, self.h, pod["metadata"]["uid"])
            if role != "admin":
                ref = self.secret_metadata(role)
                if ref:
                    support.remove("secret", name, self.h, ref["uid"])
        support.remove("configmap", self.run, self.h, self.owner)

    def run_checks(self):
        self.ready("admin")
        self.invoke("admin", "check")
        proofs, checks = {}, {}
        for role in ("provider", "strong"):
            issued = self.invoke("admin", "issue", target=role)
            require(set(issued) == {"token"} and isinstance(issued["token"], str))
            obj = {"apiVersion": "v1", "kind": "Secret", "immutable": True,
                "metadata": support.metadata(self.run, self.ns, self.owner, "-" + role), "stringData": issued}
            support.base.create(obj)
            del obj, issued
            self.secret_refs[role] = self.secret_metadata(role)
            require(self.secret_refs[role] is not None)
            self.ready(role)
            proofs[role] = self.invoke(role, "sign")["signature_base64"]
            denied = {}
            denied["cross_key"] = self.invoke(role, "sign", target="strong" if role == "provider" else "provider")["http_status"]
            for variant in ("omitted", "zero", "wrong", "wrong-string", "extra"):
                denied[variant] = self.invoke(role, "sign", variant=variant)["http_status"]
            denied["key_read"] = self.invoke(role, "key-read")["http_status"]
            # A denial cannot hide a dead token/provider: same identity still signs.
            self.invoke(role, "sign")
            checks[role] = denied
        self.invoke("admin", "revoke")
        for role in ("provider", "strong"):
            checks[role]["revoked"] = self.invoke(role, "revoked")["http_status"]
        self.invoke("admin", "check")
        return {"signatures": proofs, "checks": checks}


def execute(o, h, bindings):
    global stage, diagnostic, cleanup_completed
    cleanup_completed = False
    run = Acceptance(o, h, bindings)
    opened = run.open()
    if o["action"] == "cleanup":
        if opened:
            run.cleanup()
            cleanup_completed = True
        return {"kind": "d_issuer_signing_cleanup_v1", "run_id": o["run_id"], "cleaned": True}
    failed_stage = None
    failed_diagnostic = None
    try:
        result = run.run_checks()
    except Exception:
        failed_stage = stage
        failed_diagnostic = diagnostic
        raise
    finally:
        diagnostic = {"code": "orchestration_failure", "http_status": None}
        run.cleanup()
        cleanup_completed = True
        if failed_stage:
            stage = failed_stage
            diagnostic = failed_diagnostic
    return {"kind": "d_issuer_signing_acceptance_v1", "run_id": o["run_id"], "namespace_uid": h["namespace_uid"],
            "bindings": bindings, "registry_sha256": {r: c["registry_sha256"] for r, c in o["candidates"].items()},
            "challenges": o["challenges"], **result, "cleaned": True, "keys_retained": True,
            "active_config_updated": False, "http_service_ready": False, "human_mfa_verified": False}


if __name__ == "__main__":
    try:
        print(json.dumps(execute(OPTIONS, HANDOFF, BINDINGS), sort_keys=True))
    except Exception:
        print(json.dumps({"error": "issuer_signing_failed_or_cleanup_pending", "run_id": OPTIONS["run_id"],
                          "stage": stage, "diagnostic": diagnostic, "cleaned": cleanup_completed}))
        sys.exit(1)
