"""Private in-cluster client. Never print credentials or raw provider errors.

Only the control Pod mounts root_token. Each data Pod mounts one disposable
signing token. Challenges have a test domain, never a user MFA/business claim.
"""
import base64
import json
import re
import sys
import types


class ClientFailure(Exception):
    def __init__(self, code, http_status=None):
        self.diagnostic = {"code": code, "http_status": http_status}


class CheckedBao:
    def __init__(self, delegate):
        self.delegate = delegate

    def call(self, method, path, body=None, expected=(200, 204)):
        # Inspect only the status; never export response bodies or error text.
        status, value = self.delegate.call(method, path, body, tuple(range(100, 600)))
        if status not in expected:
            raise ClientFailure("unexpected_http_status", status)
        return status, value


def policy(candidate):
    name = candidate["key"]["key_path"].removeprefix("transit/keys/")
    return {"path": {"transit/sign/" + name: {
        "capabilities": ["update"], "required_parameters": ["input", "key_version"],
        "allowed_parameters": {"input": [], "key_version": ["1"]}}}}


def token_metadata(o, role):
    return {"run_id": o["run_id"], "owner_uid": o["owner_uid"],
            "namespace_uid": o["handoff"]["namespace_uid"],
            "role": role, "purpose": "d_issuer_signing_acceptance"}


def owned_tokens(b, o, require):
    _, listed = b.call("LIST", "auth/token/accessors")
    found = []
    for accessor in listed["data"]["keys"]:
        status, v = b.call("POST", "auth/token/lookup-accessor", {"accessor": accessor}, (200, 400))
        if status == 400:
            continue
        info = v["data"]
        meta = info.get("meta") or {}
        if (meta.get("run_id"), meta.get("owner_uid"), meta.get("namespace_uid")) != (
                o["run_id"], o["owner_uid"], o["handoff"]["namespace_uid"]):
            continue
        role = meta.get("role")
        require(role in ("provider", "strong") and meta == token_metadata(o, role))
        require(info["policies"] == [o["run_id"] + "-" + role])
        found.append(accessor)
    return found


def execute(o, c):
    require = c.require
    require(re.fullmatch(r"d-sig-[a-f0-9]{24}", o["run_id"]))
    require(re.fullmatch(r"[a-f0-9-]{36}", o["owner_uid"]))
    role, action = o["role"], o["action"]
    require(role in ("admin", "provider", "strong"))
    b = CheckedBao(c.Bao(o, role == "admin"))
    if role != "admin":
        target = o.get("target", role)
        require(target in ("provider", "strong"))
        key_path = o["candidates"][target]["key"]["key_path"]
        if action == "key-read":
            status, _ = b.call("GET", key_path, expected=(403,))
            return {"http_status": status}
        require(action in ("sign", "revoked"))
        body = {"input": o["challenges"][role], "key_version": "1"}
        mode = o.get("variant", "normal")
        require(mode in ("normal", "omitted", "zero", "wrong", "wrong-string", "extra"))
        if mode == "omitted":
            del body["key_version"]
        elif mode in ("zero", "wrong", "wrong-string"):
            body["key_version"] = {"zero": 0, "wrong": 2, "wrong-string": "2"}[mode]
        elif mode == "extra":
            body["prehashed"] = False
        expected = 200 if action == "sign" and target == role and mode == "normal" else 403
        status, v = b.call("POST", key_path.replace("transit/keys/", "transit/sign/", 1), body, (expected,))
        out = {"http_status": status}
        if status == 200:
            sig = v["data"]["signature"]
            if not isinstance(sig, str) or not sig.startswith("vault:v1:"):
                raise ClientFailure("invalid_signature_format", status)
            try:
                raw = base64.b64decode(sig[9:], validate=True)
                require(len(raw) == 64 and base64.b64encode(raw).decode() == sig[9:])
            except Exception:
                raise ClientFailure("invalid_signature_format", status) from None
            out["signature_base64"] = sig[9:]
        return out

    if action == "check":
        _, v = b.call("GET", "sys/audit")
        audit = v["data"]["lab/"]
        require(audit["type"] == "file" and audit["options"]["file_path"] == "/data/audit.json"
                and audit["options"].get("log_raw", "false") == "false")
        for candidate in o["candidates"].values():
            _, v = b.call("GET", candidate["key"]["key_path"])
            info = v["data"]
            require(info["type"] == "ed25519" and info["derived"] is False)
            require(c.snapshot(info) == candidate["key"]["fingerprint"])
            require(info["keys"]["1"]["public_key"] == candidate["key"]["public_key_base64"])
        return {"keys_unchanged": True}
    if action == "issue":
        target = o["target"]
        require(target in ("provider", "strong"))
        name = o["run_id"] + "-" + target
        path = "sys/policies/acl/" + name
        b.call("GET", path, expected=(404,))
        expected_policy = policy(o["candidates"][target])
        b.call("POST", path, {"policy": json.dumps(expected_policy)})
        _, saved = b.call("GET", path)
        require(json.loads(saved["data"]["policy"]) == expected_policy)
        meta = token_metadata(o, target)
        _, v = b.call("POST", "auth/token/create", {"policies": [name], "no_default_policy": True,
            "type": "service", "no_parent": True, "ttl": "900s", "explicit_max_ttl": "900s",
            "renewable": False, "display_name": name, "meta": meta})
        auth = v["auth"]
        require(auth["renewable"] is False and auth["lease_duration"] == 900)
        _, looked = b.call("POST", "auth/token/lookup-accessor", {"accessor": auth["accessor"]})
        info = looked["data"]
        require(info["meta"] == meta and info["policies"] == [name] and info["orphan"] is True
                and info["renewable"] is False and info["explicit_max_ttl"] == 900)
        # This return travels only through the remote parent memory into a Secret.
        return {"token": auth["client_token"]}
    if action in ("revoke", "cleanup"):
        for accessor in owned_tokens(b, o, require):
            b.call("POST", "auth/token/revoke-accessor", {"accessor": accessor})
        require(not owned_tokens(b, o, require))
        if action == "cleanup":
            for target in ("provider", "strong"):
                path = "sys/policies/acl/" + o["run_id"] + "-" + target
                code, saved = b.call("GET", path, expected=(200, 404))
                if code == 200:
                    require(json.loads(saved["data"]["policy"]) == policy(o["candidates"][target]))
                    b.call("DELETE", path)
                b.call("GET", path, expected=(404,))
        return {"tokens_absent": True}
    raise ValueError("unsupported control action")


if __name__ == "__main__":
    try:
        c = types.ModuleType("bao_client")
        exec(CLIENT_SOURCE, c.__dict__)
        print(json.dumps(execute(json.load(sys.stdin), c)))
    except Exception as error:
        diagnostic = error.diagnostic if isinstance(error, ClientFailure) else {"code": "client_assertion_or_transport", "http_status": None}
        print(json.dumps({"error": "signing_acceptance_client_failed", "diagnostic": diagnostic}))
        sys.exit(1)
