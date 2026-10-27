"""Read-only handoff binding and TLS checks; never extract Secret data."""
import datetime
import hashlib
import json
import subprocess
import sys

CONTEXT = "kubernetes-admin@kubernetes"
SOURCE = "clawmanager-zhanghui08-system"
SOURCE_UID = "337cfe30-2c17-4b8e-b32a-760778b8098e"
stage = "initialization"


def require(condition):
    if not condition:
        raise ValueError("preflight check failed")


def kube(*args):
    result = subprocess.run(
        ["kubectl", "--context=" + CONTEXT, "--request-timeout=20s", *args],
        capture_output=True, timeout=45, check=False,
    )
    require(result.returncode == 0 and len(result.stdout) <= 1024 * 1024)
    return result.stdout.decode("utf-8", errors="strict")


TLS_PROBE = r'''
import hashlib, json, pathlib, socket, ssl, sys
from urllib.parse import urlsplit
try:
    ca = pathlib.Path('/trust/ca.crt').read_bytes()
    assert hashlib.sha256(ca).hexdigest() == sys.argv[1]
    ctx = ssl.create_default_context(cadata=ca.decode('ascii'))
    for endpoint in sys.argv[2:]:
        url = urlsplit(endpoint)
        assert url.scheme == 'https' and not url.username and not url.password
        with socket.create_connection((url.hostname, url.port), timeout=10) as raw:
            with ctx.wrap_socket(raw, server_hostname=url.hostname) as tls:
                assert tls.getpeercert()
    print('A_PROVIDER_TLS_OK')
except Exception:
    sys.exit(1)
'''


def preflight(h, call=kube):
    global stage
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    ns = h["namespace"]

    def binding():
        for name, uid in [(SOURCE, SOURCE_UID), (ns, h["namespace_uid"])]:
            require(call("get", "namespace", name, "-o", "jsonpath={.metadata.uid}") == uid)

    stage = "context_and_namespace"
    require(call("config", "current-context").strip() == CONTEXT)
    require(call("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.insecure-skip-tls-verify}") in ("", "false"))
    require(call("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.server}").startswith("https://"))
    binding()
    stage = "public_config_bindings"
    for name, field, expected in [(h["ca_configmap"], "ca.crt", h["ca_sha256"]),
                                  (h["bootstrap_client_configmap"], "client.py", h["bootstrap_client_sha256"])]:
        cm = json.loads(call("-n", ns, "get", "configmap", name, "-o", "json"))
        require(hashlib.sha256(cm["data"][field].encode("utf-8")).hexdigest() == expected)
    stage = "identity_metadata"
    # jsonpath selects metadata/immutable only; no Secret data enters this process.
    selector = 'jsonpath={.metadata.uid}{"|"}{.metadata.resourceVersion}{"|"}{.immutable}'
    for ref in h["identity_refs"].values():
        actual = call("-n", ns, "get", "secret", ref["secret_name"], "-o", selector)
        require(actual == ref["uid"] + "|" + ref["resource_version"] + "|true")
    stage = "tools_pod"
    pod = json.loads(call("-n", ns, "get", "pod", "lab-tools", "-o", "json"))
    spec = pod["spec"]
    require(pod["status"]["phase"] == "Running" and spec.get("automountServiceAccountToken") is False)
    require(len(spec["containers"]) == 1 and spec["containers"][0]["image"] == h["tools_image"])
    require(not spec.get("initContainers") and not spec.get("ephemeralContainers"))
    require(not spec["containers"][0].get("env") and not spec["containers"][0].get("envFrom"))
    for volume in spec["volumes"]:
        require(set(volume) <= {"name", "configMap", "emptyDir"})
        if "configMap" in volume:
            require(volume["configMap"]["name"] in ("lab-trust", "lab-client"))
    require(any(c["type"] == "Ready" and c["status"] == "True" for c in pod["status"].get("conditions", [])))
    pod_uid = pod["metadata"]["uid"]
    stage = "provider_tls"
    require(call("-n", ns, "exec", "lab-tools", "-c", "lab-tools", "--", "python", "-B", "-c", TLS_PROBE,
                 h["ca_sha256"], h["kms"]["endpoint"], h["evidence"]["endpoint"]).strip() == "A_PROVIDER_TLS_OK")
    stage = "final_identity_recheck"
    binding()
    require(call("-n", ns, "get", "pod", "lab-tools", "-o", "jsonpath={.metadata.uid}") == pod_uid)
    for ref in h["identity_refs"].values():
        require(call("-n", ns, "get", "secret", ref["secret_name"], "-o", selector) ==
                ref["uid"] + "|" + ref["resource_version"] + "|true")
    return {"kind": "a_provider_handoff_preflight_v1", "status": "passed",
            "started_at": started, "finished_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "namespace": ns, "namespace_uid": h["namespace_uid"], "identity_refs_checked": len(h["identity_refs"]),
            "tls_verified": True, "temporary_artifacts_created": False, "secret_values_extracted": False,
            "token_validity_verified": False, "provider_capability_approved": False, "evidence_registered": False}


if __name__ == "__main__":
    try:
        print(json.dumps(preflight(HANDOFF), separators=(",", ":")))
    except Exception:
        # Bounded diagnostics; no kubectl/provider response or traceback.
        print(json.dumps({"kind": "a_provider_handoff_preflight_v1", "status": "failed", "stage": stage}))
        sys.exit(1)
