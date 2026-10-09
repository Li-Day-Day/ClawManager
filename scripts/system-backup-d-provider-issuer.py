"""D issuer key preparation, not an attestation service or registry approval.

Only the existing lab's dedicated control Pod mounts recovery root_token.
No signing tokens/policies, strong-auth claims or provider proofs are minted.
The key and immutable intent/registry are retained as requested configuration;
the temporary root-mounted Pod is removed even on failure.
"""
import base64
import datetime
import hashlib
import json
import re
import sys
import types

support = types.ModuleType("issuer_support")
support.BASE_SOURCE = BASE_SOURCE
support.CLIENT_SOURCE = CLIENT_SOURCE
exec(LIFECYCLE_SOURCE, support.__dict__)
support.base.OWNER = "clawmanager.io/d-provider-issuer"
require = support.require

# This client is executed ONLY inside the dedicated control Pod. Its output
# is a closed public-key projection, never provider errors or Secret contents.
KEY_CLIENT = r'''
import base64,hashlib,json,re,sys,types
c=types.ModuleType("issuer_client")
exec(CLIENT_SOURCE,c.__dict__)
o=json.load(sys.stdin)
c.require(re.fullmatch(r"d-issuer-[a-f0-9]{24}",o["run_id"]))
b=c.Bao(o,True)
try:
    _,audit=b.call("GET","sys/audit")
    d=audit["data"]["lab/"]
    c.require(d["type"]=="file" and d["options"]["file_path"]=="/data/audit.json" and d["options"].get("log_raw","false")=="false")
    path="transit/keys/"+o["run_id"]+"-provider-proof-v1"
    code,v=b.call("GET",path,expected=(200,404))
    if o["action"]=="create":
        c.require(code==404)
        b.call("POST",path,{"type":"ed25519","derived":False,"exportable":False,"allow_plaintext_backup":False})
        _,v=b.call("GET",path)
    else:
        c.require(o["action"]=="inspect" and code==200)
    info=v["data"]
    c.require(info["type"]=="ed25519" and info["derived"] is False)
    fingerprint=c.snapshot(info)
    public=info["keys"]["1"]["public_key"]
    c.require(len(base64.b64decode(public,validate=True))==32)
    if o["action"]=="inspect":
        c.require(fingerprint==o["expected"]["fingerprint"] and public==o["expected"]["public_key_base64"])
    print(json.dumps({"fingerprint":fingerprint,"public_key_base64":public,"key_path":path,"key_version":"1"},sort_keys=True))
except Exception:
    print('{"error":"issuer_key_preparation_failed"}')
    sys.exit(1)
'''


def execute(o, h, bindings):
    run, ns = o["run_id"], h["namespace"]
    require(re.fullmatch(r"d-issuer-[a-f0-9]{24}", run))
    require(re.fullmatch(r"installation_[A-Za-z0-9._:-]{1,115}", o["installation_id"]))
    require(o["action"] in ("create", "inspect", "cleanup-control"))
    support.guard(h)
    intent = support.base.get("configmap", run, ns)
    if o["action"] == "create":
        require(intent is None)
        root = support.secret_ref(h, "lab-recovery")
        require(root is not None)
        record = {"namespace_uid": h["namespace_uid"], "bindings": bindings,
                  "installation_id": o["installation_id"], "root_ref": root,
                  "not_before": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()}
        intent = support.base.create({"apiVersion": "v1", "kind": "ConfigMap", "immutable": True,
            "metadata": support.metadata(run, ns), "data": {"intent.json": json.dumps(record, sort_keys=True)}})
    require(intent and intent.get("immutable") is True and intent["metadata"].get("labels", {}).get(support.base.OWNER) == run)
    record = json.loads(intent["data"]["intent.json"])
    require(record["namespace_uid"] == h["namespace_uid"] and record["bindings"] == bindings and record["installation_id"] == o["installation_id"])
    require(support.secret_ref(h, "lab-recovery") == record["root_ref"])
    owner = intent["metadata"]["uid"]
    if o["action"] == "cleanup-control":
        pod = support.base.get("pod", run + "-admin", ns)
        if pod is not None:
            support.check_pod(pod, h, run, "admin", owner)
            support.remove("pod", run + "-admin", h, pod["metadata"]["uid"])
        return {"kind": "d_provider_issuer_control_cleanup_v1", "run_id": run,
                "namespace_uid": h["namespace_uid"], "temporary_control_pod_removed": True}
    checkpoint = support.base.get("configmap", run + "-registry", ns)
    expected = None
    if o["action"] == "inspect":
        # A crash between key creation and checkpoint cannot be auto-adopted.
        require(checkpoint and checkpoint.get("immutable") is True)
        support.check_owned(checkpoint, run, owner)
        expected = json.loads(checkpoint["data"]["key.json"])
    pod = None
    cleaned = False
    try:
        pod = support.base.get("pod", run + "-admin", ns)
        if pod is None:
            pod = support.base.create(support.manifest(h, run, "admin", owner))
        support.check_pod(pod, h, run, "admin", owner)
        pod_uid = pod["metadata"]["uid"]
        support.base.kube("-n", ns, "wait", "--for=condition=Ready", "pod/" + run + "-admin", "--timeout=120s", timeout=135)
        current = support.base.get("pod", run + "-admin", ns)
        support.check_pod(current, h, run, "admin", owner)
        require(current["metadata"]["uid"] == pod_uid and current["status"]["containerStatuses"][0]["imageID"].split("@")[-1] == h["tools_image"].split("@")[-1])
        support.guard(h)
        require(support.secret_ref(h, "lab-recovery") == record["root_ref"])
        client_source = "CLIENT_SOURCE=" + repr(CLIENT_SOURCE) + "\n" + KEY_CLIENT
        raw = support.base.kube("-n", ns, "exec", "-i", run + "-admin", "-c", "probe", "--", "python", "-B", "-c", client_source,
            data=json.dumps({**o, "handoff": h, "expected": expected}).encode())
        key = json.loads(raw)
        require(set(key) == {"fingerprint", "public_key_base64", "key_path", "key_version"})
        require(re.fullmatch(r"[a-f0-9]{64}", key["fingerprint"]) and len(base64.b64decode(key["public_key_base64"], validate=True)) == 32)
        require(key["key_path"] == "transit/keys/" + run + "-provider-proof-v1" and key["key_version"] == "1")
        start = datetime.datetime.fromisoformat(record["not_before"])
        issuer = h["kms"]["endpoint"] + "/provider-proof/" + run
        registry = {"schema_version": "system-backup-provider-issuers.draft.v1", "version": run,
            "scope": {"installation_id": o["installation_id"], "audience": "system-backup-provider-proof"},
            "keys": [{"issuer": issuer, "key_id": h["kms"]["endpoint"] + "/" + key["key_path"], "key_version": "1",
                "purpose": "provider_proof_issuer", "public_key_base64": key["public_key_base64"], "not_before": start.isoformat(),
                "not_after": (start + datetime.timedelta(days=90)).isoformat(), "revoked": False,
                "target_types": ["external_action", "backup_staging", "restore_resource"], "proof_types": ["provider_presence", "provider_absence", "ownership"]}]}
        registry_raw = json.dumps(registry, sort_keys=True, separators=(",", ":")) + "\n"
        if o["action"] == "create":
            checkpoint = support.base.create({"apiVersion": "v1", "kind": "ConfigMap", "immutable": True,
                "metadata": support.metadata(run, ns, owner, "-registry"), "data": {"registry.json": registry_raw, "key.json": json.dumps(key, sort_keys=True)}})
        else:
            require(checkpoint["data"]["registry.json"] == registry_raw)
        result = {"kind": "d_provider_issuer_key_candidate_v1", "run_id": run, "namespace": ns, "namespace_uid": h["namespace_uid"],
            "intent_uid": owner, "registry_configmap_uid": checkpoint["metadata"]["uid"], "bindings": bindings,
            "registry_json": registry_raw, "registry_sha256": hashlib.sha256(registry_raw.encode()).hexdigest(), "key": key,
            "key_retained": True, "active_config_updated": False, "attestation_service_ready": False, "provider_capability_approved": False}
    finally:
        if pod is not None:
            current = support.base.get("pod", run + "-admin", ns)
            if current is not None:
                support.check_pod(current, h, run, "admin", owner)
                require(current["metadata"]["uid"] == pod["metadata"]["uid"])
                support.remove("pod", run + "-admin", h, current["metadata"]["uid"])
            cleaned = True
    result["temporary_control_pod_removed"] = cleaned
    return result


if __name__ == "__main__":
    try:
        print(json.dumps(execute(OPTIONS, HANDOFF, BINDINGS), sort_keys=True))
    except Exception:
        print('{"error":"issuer_preparation_failed_or_cleanup_pending"}')
        sys.exit(1)
