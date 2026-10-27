"""Remote D lifecycle orchestration. Sources arrive over SSH stdin, not files."""
import base64
import datetime
import hashlib
import json
import re
import sys
import time
import types

base = types.ModuleType("resources")
exec(BASE_SOURCE, base.__dict__)
client = types.ModuleType("client")
exec(CLIENT_SOURCE, client.__dict__)
base.OWNER = "clawmanager.io/d-lifecycle-run"
require = base.require
ROLES, PURPOSES = client.ROLES, client.PURPOSES
stage = "guard"


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def secret_ref(h, name):
    # Never fetch Secret.data during a guard or cleanup.
    raw = base.kube("-n", h["namespace"], "get", "secret", name, "--ignore-not-found", "-o",
                    'jsonpath={.metadata.uid}{"|"}{.metadata.resourceVersion}{"|"}{.immutable}')
    if not raw:
        return None
    uid, version, immutable = raw.split("|")
    require(immutable == "true")
    return {"secret_name": name, "uid": uid, "resource_version": version}


def guard(h):
    require(base.kube("config", "current-context").strip() == base.CONTEXT)
    require(base.kube("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.insecure-skip-tls-verify}") in ("", "false"))
    require(base.kube("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.server}").startswith("https://"))
    for ns, uid in [(h["namespace"], h["namespace_uid"]), ("clawmanager-zhanghui08-system", "337cfe30-2c17-4b8e-b32a-760778b8098e")]:
        require(base.kube("get", "namespace", ns, "-o", "jsonpath={.metadata.uid}") == uid)
    ca = base.get("configmap", "lab-trust", h["namespace"])
    require(hashlib.sha256(ca["data"]["ca.crt"].encode()).hexdigest() == h["ca_sha256"])


def metadata(run, ns, owner=None, suffix=""):
    out = {"name": run + suffix, "namespace": ns, "labels": {base.OWNER: run}}
    if owner:
        out["ownerReferences"] = [{"apiVersion": "v1", "kind": "ConfigMap", "name": run, "uid": owner}]
    return out


def check_owned(obj, run, owner):
    require(obj["metadata"].get("labels", {}).get(base.OWNER) == run)
    require(any(r.get("uid") == owner and r.get("name") == run and r.get("kind") == "ConfigMap" for r in obj["metadata"].get("ownerReferences", [])))


def remove(kind, name, h, uid):
    guard(h)
    current = (secret_ref(h, name) if kind == "secret" else base.get(kind, name, h["namespace"]))
    if current is None:
        return
    require((current["uid"] if kind == "secret" else current["metadata"]["uid"]) == uid)
    plural = {"pod": "pods", "configmap": "configmaps", "secret": "secrets"}[kind]
    base.kube("delete", "--raw", "/api/v1/namespaces/" + h["namespace"] + "/" + plural + "/" + name,
              "-f", "-", data=json.dumps({"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": {"uid": uid}}).encode())
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        current = secret_ref(h, name) if kind == "secret" else base.get(kind, name, h["namespace"])
        if current is None:
            return
        require((current["uid"] if kind == "secret" else current["metadata"]["uid"]) == uid)
        time.sleep(2)
    raise ValueError("cleanup pending")


def manifest(h, run, role, owner):
    adjusted = dict(h, identity_refs={"d-evidence-read": {"secret_name": "lab-recovery" if role == "admin" else run + "-" + role}})
    obj = base.pod_manifest(adjusted, run, "read", owner)
    obj["metadata"] = metadata(run, h["namespace"], owner, "-" + role)
    obj["spec"]["activeDeadlineSeconds"] = 3600
    obj["spec"]["volumes"][0]["configMap"]["defaultMode"] = 420
    obj["spec"]["volumes"][1]["secret"]["items"] = [{"key": "root_token" if role == "admin" else "token", "path": "root_token" if role == "admin" else "token"}]
    return obj


def check_pod(obj, h, run, role, owner):
    check_owned(obj, run, owner)
    actual, expected = obj["spec"], manifest(h, run, role, owner)["spec"]
    for k in ("automountServiceAccountToken", "volumes", "securityContext", "nodeSelector", "restartPolicy", "activeDeadlineSeconds"):
        require(actual[k] == expected[k])
    require(not any(actual.get(k) for k in ("hostNetwork", "hostPID", "hostIPC", "initContainers", "ephemeralContainers")))
    require(len(actual["containers"]) == 1)
    container = actual["containers"][0]
    require(not container.get("env") and not container.get("envFrom"))
    for k in ("name", "image", "command", "securityContext", "volumeMounts"):
        require(container[k] == expected["containers"][0][k])


class Run:
    def __init__(self, h, run, bindings):
        client.key_name(run, "kms", "old")
        self.h, self.run, self.bindings = h, run, bindings
        self.ns = h["namespace"]
        self.refs, self.keys, self.events, self.proofs, self.checks, self.lifecycle = {}, {}, [], [], [], []
        self.pod_refs = {}
        self.owner = None
        self.root_ref = None
        self.bao_uid = None

    def checkpoint(self, suffix, value):
        return base.create({"apiVersion": "v1", "kind": "ConfigMap", "immutable": True,
            "metadata": metadata(self.run, self.ns, self.owner, suffix), "data": {"record.json": json.dumps(value, sort_keys=True)}})

    def record(self, suffix):
        obj = base.get("configmap", self.run + suffix, self.ns)
        if obj is None:
            return None
        check_owned(obj, self.run, self.owner)
        require(obj.get("immutable") is True)
        return json.loads(obj["data"]["record.json"])

    def open(self, action):
        guard(self.h)
        obj = base.get("configmap", self.run, self.ns)
        if action == "run":
            require(obj is None)
            root = secret_ref(self.h, "lab-recovery")
            require(root is not None)
            bao = base.get("pod", "bao", self.ns)
            require(bao["spec"]["containers"][0]["image"] == self.h["tools_image"])
            # Written before any provider mutation; immutable root identity and source binding.
            obj = base.create({"apiVersion": "v1", "kind": "ConfigMap", "immutable": True,
                "metadata": metadata(self.run, self.ns), "data": {"intent.json": json.dumps({"run_id": self.run,
                    "namespace_uid": self.h["namespace_uid"], "bindings": self.bindings, "root_ref": root,
                    "bao_uid": bao["metadata"]["uid"]}, sort_keys=True)}})
        require(obj and obj.get("immutable") is True and obj["metadata"].get("labels", {}).get(base.OWNER) == self.run)
        intent = json.loads(obj["data"]["intent.json"])
        require(intent["run_id"] == self.run and intent["namespace_uid"] == self.h["namespace_uid"] and intent["bindings"] == self.bindings)
        self.owner, self.root_ref = obj["metadata"]["uid"], intent["root_ref"]
        self.bao_uid = intent["bao_uid"]
        require(secret_ref(self.h, "lab-recovery") == self.root_ref)

    def ready(self, role):
        guard(self.h)
        name = self.run + "-" + role
        obj = base.get("pod", name, self.ns)
        if obj is not None and obj.get("status", {}).get("phase") in ("Failed", "Succeeded"):
            check_pod(obj, self.h, self.run, role, self.owner)
            remove("pod", name, self.h, obj["metadata"]["uid"])
            obj = None
        if obj is None:
            obj = base.create(manifest(self.h, self.run, role, self.owner))
        check_pod(obj, self.h, self.run, role, self.owner)
        uid = obj["metadata"]["uid"]
        base.kube("-n", self.ns, "wait", "--for=condition=Ready", "pod/" + name, "--timeout=120s", timeout=135)
        obj = base.get("pod", name, self.ns)
        check_pod(obj, self.h, self.run, role, self.owner)
        require(obj["metadata"]["uid"] == uid and obj["status"]["containerStatuses"][0]["imageID"].split("@")[-1] == self.h["tools_image"].split("@")[-1])
        self.pod_refs[role] = {"name": name, "uid": uid}

    def invoke(self, pod, mode, action, **kw):
        global stage
        stage = action
        guard(self.h)
        require(secret_ref(self.h, "lab-recovery") == self.root_ref)
        if pod != "admin":
            require(secret_ref(self.h, self.run + "-" + pod) == self.refs[pod]["secret_ref"])
        obj = base.get("pod", self.run + "-" + pod, self.ns)
        check_pod(obj, self.h, self.run, pod, self.owner)
        require(obj["metadata"]["uid"] == self.pod_refs[pod]["uid"])
        v = json.loads(base.kube("-n", self.ns, "exec", "-i", self.run + "-" + pod, "-c", "probe", "--", "python", "-B", "-c", CLIENT_SOURCE,
            data=json.dumps({"handoff": self.h, "run_id": self.run, "owner_uid": self.owner, "mode": mode, "action": action, **kw}).encode(), client_result=True))
        require(v.get("status") == "ok")
        # Record only events for run paths and successful create/revoke; not root accessor enumeration.
        for e in v["events"]:
            if self.run in e["path"] or e["path"] in ("auth/token/create", "auth/token/revoke-accessor"):
                self.events.append(dict(e, pod=pod, action=action))
        return v["result"]

    def admin(self, action, **kw):
        return self.invoke("admin", "control", action, **kw)

    def probe(self, role, generation="old", group="control", expected=200, **kw):
        v = self.invoke(group + "-" + role, "data", "probe", role=role, generation=generation, **kw)
        require(v["http_status"] == expected)
        return v

    def issue(self, role, group):
        alias = group + "-" + role
        issued_mono, issued_wall = time.monotonic(), time.time()
        v = self.admin("issue", role=role, group=group)
        require(issued_wall - 5 <= v["issued"]["creation_time"] <= time.time() + 5)
        obj = {"apiVersion": "v1", "kind": "Secret", "immutable": True,
               "metadata": metadata(self.run, self.ns, self.owner, "-" + alias), "stringData": {"token": v.pop("token")}}
        created = base.create(obj)
        del obj
        m = created["metadata"]
        del created
        ref = {"secret_name": m["name"], "uid": m["uid"], "resource_version": m["resourceVersion"]}
        self.refs[alias] = {"secret_ref": ref, **v["issued"]}
        self.checkpoint("-id-" + alias, self.refs[alias])
        self.ready(alias)
        return issued_mono

    def create_inputs(self):
        self.admin("audit-config")
        for role in ("kms", *PURPOSES):
            for generation in ("old", "new"):
                ref = self.admin("key-create", role=role, generation=generation)
                self.keys[role + "-" + generation] = ref
                self.checkpoint("-key-" + role + "-" + generation, ref)
        require(len({v["public_key_base64"] for v in self.keys.values() if "public_key_base64" in v}) == 6)
        for role in ROLES:
            self.admin("policy-old", role=role)
            self.issue(role, "control")

    def lifecycle_matrix(self):
        seed = self.probe("generate")
        for role in ROLES:
            args = {"ciphertext": seed["ciphertext"]} if role == "unwrap" else {}
            self.issue(role, "revoke")
            self.probe(role, group="revoke", **args)
            revoked_at = now()
            self.admin("revoke", role=role)
            self.probe(role, **args)
            self.probe(role, group="revoke", expected=403, **args)
            self.probe(role, **args)
            self.checks.append(role + "-revoked-with-control")
            mono = self.issue(role, "expire")
            issued = self.refs["expire-" + role]
            expiry = datetime.datetime.fromisoformat(issued["expire_time"].replace("Z", "+00:00")).timestamp()
            require(time.time() + 5 < expiry)
            self.probe(role, group="expire", **args)
            before = now()
            require(time.time() < expiry)
            # Both provider wall-clock deadline and a full monotonic TTL must pass.
            # No revoke/renew occurs in this interval. Failed startup is not expiry evidence.
            while time.time() < expiry + 10 or time.monotonic() < mono + issued["ttl_seconds"] + 10:
                require(time.monotonic() - mono < issued["ttl_seconds"] + 60)
                time.sleep(2)
            self.probe(role, **args)
            self.probe(role, group="expire", expected=403, **args)
            self.probe(role, **args)
            self.lifecycle.append({"role": role, "revoked_at": revoked_at, "expiry_positive_at": before,
                "expiry_denied_at": now(), "elapsed_seconds": time.monotonic() - mono, "propagation_tolerance_seconds": 10})
            self.checks.append(role + "-expired-with-control")

    def rotation_matrix(self):
        def proof(role, generation):
            v = self.probe(role, generation)
            self.proofs.append({"role": role, "generation": generation, "payload_base64": base64.b64encode(client.payload(self.h, self.run, role, generation)).decode(),
                "public_key_base64": self.keys[role + "-" + generation]["public_key_base64"], "signature_base64": v["signature_base64"]})
        old = self.probe("generate")
        require(self.probe("unwrap", ciphertext=old["ciphertext"])["plaintext_sha256"] == old["plaintext_sha256"])
        for role in PURPOSES:
            proof(role, "old")
        for role in ("generate", *PURPOSES):
            self.admin("policy-new", role=role)
        new = self.probe("generate", "new")
        require(self.probe("unwrap", "new", ciphertext=new["ciphertext"])["plaintext_sha256"] == new["plaintext_sha256"])
        self.probe("generate", expected=403)
        require(self.probe("unwrap", ciphertext=old["ciphertext"])["plaintext_sha256"] == old["plaintext_sha256"])
        self.probe("unwrap", "new", ciphertext=old["ciphertext"], expected=400)
        self.probe("unwrap", ciphertext=new["ciphertext"], expected=400)
        self.probe("unwrap", ciphertext=old["ciphertext"], wrong_context=True, expected=403)
        self.probe("generate", "new", wrong_context=True, expected=403)
        self.checks.append("kms-named-ref-cutover-and-history")
        for role in PURPOSES:
            proof(role, "new")
            self.probe(role, expected=403)
            self.probe(role, "new", omit_version=True, expected=403)
            self.probe(role, "new", wrong_version=True, expected=403)
            for other in PURPOSES:
                if other != role:
                    v = self.invoke("control-" + role, "data", "probe", role=other, generation="new")
                    require(v["http_status"] == 403)
            self.checks.append(role + "-named-ref-cutover")
        for name, v in self.keys.items():
            role, generation = name.split("-")
            self.admin("key-check", role=role, generation=generation, fingerprint=v["fingerprint"])

    def cleanup(self):
        # Recover tokens by exact provider metadata, including issue -> Secret crash windows.
        self.ready("admin")
        self.admin("tokens-remove")
        for role in ROLES:
            self.admin("policy-remove", role=role)
        for role in ("kms", *PURPOSES):
            for generation in ("old", "new"):
                record = self.record("-key-" + role + "-" + generation)
                # Missing fingerprint only permits GET=404, never a blind deletion.
                self.admin("key-remove", role=role, generation=generation, fingerprint=record["fingerprint"] if record else None)
        for group in client.GROUPS:
            for role in ROLES:
                alias = group + "-" + role
                obj = base.get("pod", self.run + "-" + alias, self.ns)
                if obj:
                    check_pod(obj, self.h, self.run, alias, self.owner)
                    remove("pod", self.run + "-" + alias, self.h, obj["metadata"]["uid"])
                ref = secret_ref(self.h, self.run + "-" + alias)
                if ref:
                    record = self.record("-id-" + alias)
                    require(record and ref == record["secret_ref"])
                    remove("secret", ref["secret_name"], self.h, ref["uid"])

    def finish(self):
        obj = base.get("pod", self.run + "-admin", self.ns)
        if obj:
            check_pod(obj, self.h, self.run, "admin", self.owner)
            remove("pod", self.run + "-admin", self.h, obj["metadata"]["uid"])
        suffixes = ["-key-" + r + "-" + g for r in ("kms", *PURPOSES) for g in ("old", "new")]
        suffixes += ["-id-" + g + "-" + r for g in client.GROUPS for r in ROLES]
        for suffix in suffixes:
            obj = base.get("configmap", self.run + suffix, self.ns)
            if obj:
                check_owned(obj, self.run, self.owner)
                remove("configmap", self.run + suffix, self.h, obj["metadata"]["uid"])
        remove("configmap", self.run, self.h, self.owner)

    def audit(self, started):
        guard(self.h)
        obj = base.get("pod", "bao", self.ns)
        require(obj["metadata"]["uid"] == self.bao_uid and obj["spec"]["containers"][0]["image"] == self.h["tools_image"])
        require(obj["status"]["containerStatuses"][0]["imageID"].split("@")[-1] == self.h["tools_image"].split("@")[-1])
        refs = dict(self.refs)
        for group in client.GROUPS:
            for role in ROLES:
                alias = group + "-" + role
                v = self.record("-id-" + alias)
                if v:
                    refs[alias] = v
        ids = [e["request_id"] for e in self.events if e["request_id"]]
        paths = sorted({e["path"] for e in self.events if self.run in e["path"]})
        # Revoke has no JSON request_id response. Correlate accessor HMAC, never publish accessor.
        paths.append("auth/token/revoke-accessor")
        v = json.loads(base.kube("-n", self.ns, "exec", "-i", "bao", "--", "python", "-B", "-c", AUDIT_SOURCE,
            data=json.dumps({"started_at": started, "paths": paths, "request_ids": ids,
                "identities": {v["accessor_hmac"]: k for k, v in refs.items()}}).encode(), client_result=True))
        require(v.get("status") == "ok")
        rows = [row for row in v["rows"] if row["path"] != "auth/token/revoke-accessor" or row["identity"] != "control-or-unresolved"]
        for rid in ids:
            require({row["type"] for row in rows if row["request_id"] == rid} == {"request", "response"})
        for event in self.events:
            if self.run in event["path"]:
                require(any(row["path"] == event["path"] and row["type"] == "response" for row in rows))
        for life in self.lifecycle:
            revokes = [row for row in rows if row["path"] == "auth/token/revoke-accessor" and row["identity"] == "revoke-" + life["role"]]
            require({row["type"] for row in revokes} == {"request", "response"})
            denied = datetime.datetime.fromisoformat(life["expiry_denied_at"]).timestamp()
            require(not any(row["path"] == "auth/token/revoke-accessor" and row["identity"] == "expire-" + life["role"]
                and datetime.datetime.fromisoformat(row["time"].replace("Z", "+00:00")).timestamp() <= denied for row in rows))
        return rows


def execute(options, h, bindings):
    global stage
    r = Run(h, options["run_id"], bindings)
    started = now()
    r.open(options["action"])
    passed, clean, failure, audit_rows = False, False, "none", []
    try:
        r.ready("admin")
        if options["action"] == "run":
            r.create_inputs()
            r.lifecycle_matrix()
            r.rotation_matrix()
        passed = True
    except Exception:
        failure = stage
    finally:
        try:
            stage = "cleanup"
            r.cleanup()
            stage = "audit"
            audit_rows = r.audit(started)
            r.finish()
            clean = True
        except Exception:
            if failure == "none":
                failure = stage
            # Never leave a root-mounted Pod running after a recoverable cleanup/audit failure.
            try:
                obj = base.get("pod", r.run + "-admin", r.ns)
                if obj:
                    check_pod(obj, h, r.run, "admin", r.owner)
                    remove("pod", r.run + "-admin", h, obj["metadata"]["uid"])
            except Exception:
                pass
    return {"kind": "d_lifecycle_v1", "run_id": r.run, "action": options["action"], "status": "passed" if passed and clean else "failed",
        "started_at": started, "finished_at": now(), "failed_stage": failure, "namespace": h["namespace"], "namespace_uid": h["namespace_uid"],
        "bindings": bindings, "owner_uid": r.owner, "endpoint": h["kms"]["endpoint"], "ca_sha256": h["ca_sha256"], "tools_image": h["tools_image"],
        "context_base64": client.context(h, r.run), "identity_refs": r.refs, "key_refs": r.keys, "pod_refs": r.pod_refs, "lifecycle": r.lifecycle,
        "checks_passed": r.checks, "public_proofs": r.proofs, "events": r.events, "cleanup_verified": clean,
        "recovery_intent_retained": not clean, "provider_capability_approved": False, "evidence_registered": False,
        "production_scoped_grant_verified": False, "disaster_recovery_eligible": False,
        "audit_rows": audit_rows, "audit_scope": "provider-file-audit-closed-projection; unsigned-operator-evidence"}


if __name__ == "__main__":
    try:
        v = execute(OPTIONS, HANDOFF, BINDINGS)
        print(json.dumps(v))
        sys.exit(0 if v["status"] == "passed" else 1)
    except Exception:
        print(json.dumps({"kind": "d_lifecycle_failure_v1", "run_id": OPTIONS["run_id"], "stage": stage}))
        sys.exit(1)
