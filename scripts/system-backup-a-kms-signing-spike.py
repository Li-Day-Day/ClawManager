"""Reuse the Evidence transport/UID cleanup primitives with five isolated token Pods."""
import base64
import datetime
import json
import re
import sys
import types

base = types.ModuleType("a_probe_resources")
exec(BASE_SOURCE, base.__dict__)
base.OWNER = "clawmanager.io/a-kms-signing-run"
require = base.require
ROLES = {"generate": "d-kms-generate", "unwrap": "d-kms-unwrap", "capture": "d-sign-capture-certificate",
         "acceptance": "d-sign-acceptance-record", "catalog": "d-sign-catalog-record"}
PURPOSES = {"capture": "capture_certificate", "acceptance": "acceptance_record", "catalog": "catalog_record"}
stage = "guard"
original_guard, original_pod = base.guard, base.pod_manifest


def guard(h):
    original_guard(h)
    for alias in ROLES.values():
        ref = h["identity_refs"][alias]
        actual = base.kube("-n", h["namespace"], "get", "secret", ref["secret_name"], "-o",
                           'jsonpath={.metadata.uid}{"|"}{.metadata.resourceVersion}{"|"}{.immutable}')
        require(actual == ref["uid"] + "|" + ref["resource_version"] + "|true")


def plan(h, run_id):
    require(re.fullmatch(r"a-ks-[a-f0-9]{24}", run_id))
    return {"run_id": run_id, "namespace_uid": h["namespace_uid"], "roles": ROLES, "purpose": "kms-signing-synthetic-only"}


def pod_manifest(h, run_id, role, owner_uid):
    require(role in ROLES)
    obj = original_pod(h, run_id, "read", owner_uid)
    obj["metadata"]["name"] = run_id + "-" + role
    obj["spec"]["volumes"][1]["secret"] = {"secretName": h["identity_refs"][ROLES[role]]["secret_name"],
        "defaultMode": 288, "items": [{"key": "token", "path": "token"}]}
    return obj


base.guard, base.plan, base.pod_manifest = guard, plan, pod_manifest
original_check = base.check_pod


def check_pod(obj, h, run_id, role, owner_uid):
    original_check(obj, h, run_id, role, owner_uid)
    expected = pod_manifest(h, run_id, role, owner_uid)["spec"]
    actual = obj["spec"]
    for key in ("securityContext", "volumeMounts"):
        require(actual["containers"][0][key] == expected["containers"][0][key])
    require(not actual.get("hostNetwork") and not actual.get("hostPID") and not actual.get("hostIPC"))


base.check_pod = check_pod


def matrix(call, run_id, checks, proofs):
    def ok(role, action, code=200, **kw):
        value = call(role, action, **kw)
        require(value["http_status"] == code)
        return value
    generated = ok("generate", "generate")
    require(re.fullmatch(r"[a-f0-9]{64}", generated["plaintext_sha256"]))
    cipher = generated["ciphertext"]
    require(re.fullmatch(r"vault:v1:[A-Za-z0-9+/=]{16,512}", cipher))
    unwrapped = ok("unwrap", "unwrap", ciphertext=cipher)
    require(unwrapped["plaintext_sha256"] == generated["plaintext_sha256"])
    checks.append("kms-roundtrip-v1")
    for role, action, args in [("generate", "unwrap", {"ciphertext": cipher}), ("unwrap", "generate", {}),
        ("generate", "wrong-context", {}), ("generate", "wrong-bits", {}), ("unwrap", "unwrap-wrong-context", {"ciphertext": cipher})]:
        ok(role, action, 403, **args)
        checks.append(role + "-" + action + "-denied")
    # Positive controls for every signer precede cross-purpose denial assertions.
    for role, purpose in PURPOSES.items():
        require(ok(role, "metadata", purpose=purpose)["metadata_matches"] is True)
        result = ok(role, "sign", purpose=purpose)
        proofs.append({"purpose": purpose, "signature": result["signature"]})
        checks.append(role + "-metadata-and-sign-v1")
    for role, purpose in PURPOSES.items():
        ok(role, "wrong-version", 403, purpose=purpose)
        checks.append(role + "-wrong-version-denied")
        for other in PURPOSES.values():
            if other != purpose:
                ok(role, "sign", 403, purpose=other)
                checks.append(role + "-cross-" + other.replace("_", "-") + "-denied")


def execute(o, h):
    global stage
    run_id, action, ns = o["run_id"], o["action"], h["namespace"]
    plan(h, run_id)
    require(action in ("run", "cleanup"))
    guard(h)
    existing = base.get("configmap", run_id, ns)
    if action == "run":
        require(existing is None)
        existing = base.create(base.journal(h, run_id))
    owner_uid = base.check_journal(existing, h, run_id)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    checks, observations, proofs = [], [], []
    passed, cleaned, failure = False, False, "none"

    def call(role, action, **kwargs):
        global stage
        stage = "probe_" + role + "_" + action
        guard(h)
        check_pod(base.get("pod", run_id + "-" + role, ns), h, run_id, role, owner_uid)
        value = json.loads(base.kube("-n", ns, "exec", "-i", run_id + "-" + role, "-c", "probe", "--", "python", "-B", "-c", CLIENT_SOURCE,
            data=json.dumps({"handoff": h, "run_id": run_id, "action": action, **kwargs}).encode(), client_result=True))
        code = value.get("http_status")
        observations.append({"role": role, "action": action, "http_status": code if type(code) is int and 100 <= code <= 599 else None})
        require(value.get("status") == "ok")
        return value
    try:
        if action == "run":
            stage = "pods_ready"
            for role in ROLES:
                base.ready(h, run_id, role, owner_uid)
            matrix(call, run_id, checks, proofs)
        passed = True
    except Exception:
        failure = stage
    finally:
        try:
            stage = "pod_cleanup"
            guard(h)
            for role in ROLES:
                obj = base.get("pod", run_id + "-" + role, ns)
                if obj is not None:
                    check_pod(obj, h, run_id, role, owner_uid)
                    base.delete_owned("pod", run_id + "-" + role, ns, obj["metadata"]["uid"])
            base.delete_owned("configmap", run_id, ns, owner_uid)
            cleaned = True
        except Exception:
            if failure == "none":
                failure = stage
    return {"kind": "a_kms_signing_spike_v1", "status": "passed" if passed and cleaned else "failed", "run_id": run_id,
        "namespace": ns, "namespace_uid": h["namespace_uid"], "action": action, "started_at": started,
        "finished_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "failed_stage": failure,
        "checks_passed": checks, "observations": observations, "public_proofs": proofs,
        "pods_removed": cleaned, "recovery_intent_retained": not cleaned, "provider_capability_approved": False,
        "evidence_registered": False, "production_scoped_grant_verified": False,
        "token_lifecycle_verified": False, "rotation_history_verified": False}


if __name__ == "__main__":
    try:
        result = execute(OPTIONS, HANDOFF)
        print(json.dumps(result))
        sys.exit(0 if result["status"] == "passed" else 1)
    except Exception:
        print(json.dumps({"kind": "a_kms_signing_failure_v1", "run_id": OPTIONS["run_id"], "stage": stage}))
        sys.exit(1)
