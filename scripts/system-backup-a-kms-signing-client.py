"""Single-token bounded OpenBao probe. Raw provider errors and secrets never escape."""
import base64
import hashlib
import http.client
import json
import pathlib
import re
import ssl
import sys
from urllib.parse import urlsplit


def require(ok):
    if not ok:
        raise ValueError("assertion")


def request_plan(o):
    h, action = o["handoff"], o["action"]
    require(re.fullmatch(r"a-ks-[a-f0-9]{24}", o["run_id"]))
    context = h["kms"]["context_base64"]
    if action in ("generate", "wrong-context", "wrong-bits"):
        return "POST", "transit/datakey/plaintext/d-kek-v1", {
            "context": base64.b64encode(b"A-wrong-context").decode() if action == "wrong-context" else context,
            "bits": "128" if action == "wrong-bits" else "256"}
    if action in ("unwrap", "unwrap-wrong-context"):
        require(re.fullmatch(r"vault:v1:[A-Za-z0-9+/=]{16,512}", o["ciphertext"]))
        return "POST", "transit/decrypt/d-kek-v1", {"context": context if action == "unwrap" else base64.b64encode(b"A-wrong-context").decode(), "ciphertext": o["ciphertext"]}
    require(o["purpose"] in h["signing"])
    ref = h["signing"][o["purpose"]]
    key = ref["key_path"].split("/")[-1]
    if action == "metadata":
        return "GET", ref["key_path"], None
    require(action in ("sign", "wrong-version"))
    payload = ("A-provider-spike/" + o["run_id"] + "/" + o["purpose"]).encode()
    return "POST", "transit/sign/" + key, {"input": base64.b64encode(payload).decode(), "key_version": "2" if action == "wrong-version" else "1"}


def sanitize(o, code, value):
    result = {"status": "ok", "http_status": code}
    if code != 200:
        return result
    data, action = value["data"], o["action"]
    if action in ("generate", "wrong-context", "wrong-bits", "unwrap", "unwrap-wrong-context"):
        raw = base64.b64decode(data["plaintext"], validate=True)
        require(len(raw) == 32)
        result["plaintext_sha256"] = hashlib.sha256(raw).hexdigest()
        if action in ("generate", "wrong-context", "wrong-bits"):
            require(re.fullmatch(r"vault:v1:[A-Za-z0-9+/=]{16,512}", data["ciphertext"]))
            result["ciphertext"] = data["ciphertext"]
    elif action == "metadata":
        ref = o["handoff"]["signing"][o["purpose"]]
        result["metadata_matches"] = (data["type"] == "ed25519" and data["latest_version"] == 1
            and data["exportable"] is False and data["allow_plaintext_backup"] is False
            and data["keys"]["1"]["public_key"] == ref["public_key_base64"])
    else:
        signature = data["signature"]
        require(signature.startswith("vault:v1:") and len(base64.b64decode(signature[9:], validate=True)) == 64)
        result["signature"] = signature[9:]
    return result


def execute(o):
    h = o["handoff"]
    require(hashlib.sha256(pathlib.Path("/trust/ca.crt").read_bytes()).hexdigest() == h["ca_sha256"])
    endpoint = urlsplit(h["kms"]["endpoint"])
    require(endpoint.scheme == "https" and endpoint.hostname == "bao." + h["namespace"] + ".svc" and endpoint.port == 8200)
    method, path, body = request_plan(o)
    token = pathlib.Path("/identity/token").read_text().strip()
    connection = http.client.HTTPSConnection(endpoint.hostname, 8200, timeout=20, context=ssl.create_default_context(cafile="/trust/ca.crt"))
    try:
        connection.request(method, "/v1/" + path, body=None if body is None else json.dumps(body), headers={"X-Vault-Token": token, "Content-Type": "application/json"})
        response = connection.getresponse()
        raw = response.read(65537)
        require(len(raw) <= 65536)
        return sanitize(o, response.status, json.loads(raw) if response.status == 200 else {})
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        print(json.dumps(execute(json.load(sys.stdin))))
    except Exception:
        print(json.dumps({"status": "failed", "error_code": "client_failed"}))
        sys.exit(1)
