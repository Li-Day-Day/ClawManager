"""D-only disposable lifecycle lab client; stdout is a PRIVATE parent pipe.

Control runs in a separate root-token Pod. Data Pods mount one token only.
No raw HTTP errors, token accessors, DEKs or private keys enter public reports.
"""
import base64
import hashlib
import http.client
import json
import pathlib
import re
import ssl
import sys
import time

ROLES = ("generate", "unwrap", "capture", "acceptance", "catalog")
PURPOSES = {"capture": "capture_certificate", "acceptance": "acceptance_record", "catalog": "catalog_record"}
GROUPS = ("revoke", "expire", "control")


def require(ok):
    if not ok:
        raise ValueError("lifecycle assertion")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def key_name(run, role, generation):
    require(re.fullmatch(r"d-lc-[a-f0-9]{24}", run) and role in ("kms", *PURPOSES) and generation in ("old", "new"))
    return run + "-" + role + "-" + generation


def context(h, run):
    return base64.b64encode((h["namespace_uid"] + "/" + run + "/capture").encode()).decode()


def key_ref(h, run, role, generation):
    return {"endpoint": h["kms"]["endpoint"], "namespace_uid": h["namespace_uid"],
            "key_path": "transit/keys/" + key_name(run, role, generation), "key_version": 1}


def payload(h, run, role, generation):
    return json.dumps({"run_id": run, "purpose": PURPOSES[role], "ref": key_ref(h, run, role, generation),
                       "message": "D lifecycle synthetic signature"}, sort_keys=True, separators=(",", ":")).encode()


def policy(h, run, role, generation):
    require(role in ROLES and generation in ("old", "new"))
    paths = {}
    if role == "unwrap":
        for g in ("old", "new"):
            paths["transit/decrypt/" + key_name(run, "kms", g)] = {"capabilities": ["update"],
                "required_parameters": ["context", "ciphertext"],
                "allowed_parameters": {"context": [context(h, run)], "ciphertext": []}}
    else:
        name = key_name(run, "kms" if role == "generate" else role, generation)
        params = ({"context": [context(h, run)], "bits": ["256"]} if role == "generate"
                  else {"input": [base64.b64encode(payload(h, run, role, generation)).decode()], "key_version": ["1"]})
        paths[("transit/datakey/plaintext/" if role == "generate" else "transit/sign/") + name] = {
            "capabilities": ["update"], "required_parameters": list(params), "allowed_parameters": params}
    return {"path": paths}


def metadata(o, role, group):
    require(role in ROLES and group in GROUPS)
    return {"run_id": o["run_id"], "owner_uid": o["owner_uid"], "namespace_uid": o["handoff"]["namespace_uid"],
            "role": role, "group": group}


class Bao:
    def __init__(self, o, control):
        self.o = o
        h = o["handoff"]
        require(hashlib.sha256(pathlib.Path("/trust/ca.crt").read_bytes()).hexdigest() == h["ca_sha256"])
        self.host = "bao." + h["namespace"] + ".svc"
        require(h["kms"]["endpoint"] == "https://" + self.host + ":8200")
        self.token = pathlib.Path("/identity/root_token" if control else "/identity/token").read_text().strip()
        self.events = []

    def call(self, method, path, body=None, expected=(200, 204)):
        conn = http.client.HTTPSConnection(self.host, 8200, timeout=20, context=ssl.create_default_context(cafile="/trust/ca.crt"))
        try:
            conn.request(method, "/v1/" + path, body=None if body is None else json.dumps(body),
                         headers={"X-Vault-Token": self.token, "Content-Type": "application/json"})
            response = conn.getresponse()
            raw = response.read(1048577)
            require(len(raw) <= 1048576)
            value = json.loads(raw) if raw and response.status in (200, 204) else {}
            request_id = value.get("request_id")
            require(request_id is None or re.fullmatch(r"[a-f0-9-]{36}", request_id))
            self.events.append({"path": path, "method": method, "http_status": response.status,
                                "request_id": request_id, "observed_unix": time.time()})
            require(response.status in expected)
            return response.status, value
        finally:
            conn.close()


def snapshot(info):
    require(info["latest_version"] == 1 and info["exportable"] is False and info["allow_plaintext_backup"] is False)
    # Stable material identity, excluding mutable deletion_allowed config.
    return digest({k: info[k] for k in ("name", "type", "keys", "derived", "latest_version")})


def owned_tokens(b, o):
    _, listed = b.call("LIST", "auth/token/accessors")
    result = []
    for accessor in listed["data"]["keys"]:
        code, value = b.call("POST", "auth/token/lookup-accessor", {"accessor": accessor}, (200, 400))
        if code == 400:  # expired during enumeration
            continue
        info = value["data"]
        meta = info.get("meta") or {}
        if (meta.get("run_id"), meta.get("owner_uid"), meta.get("namespace_uid")) != (o["run_id"], o["owner_uid"], o["handoff"]["namespace_uid"]):
            continue
        require(meta == metadata(o, meta.get("role"), meta.get("group")))
        require(info["policies"] == [o["run_id"] + "-" + meta["role"]])
        result.append((accessor, info))
    return result


def control(b, o):
    h, run, action = o["handoff"], o["run_id"], o["action"]
    if action == "audit-config":
        _, v = b.call("GET", "sys/audit")
        d = v["data"]["lab/"]
        opts = d["options"]
        require(d["type"] == "file" and opts["file_path"] == "/data/audit.json" and opts.get("log_raw", "false") == "false"
                and opts.get("hmac_accessor", "true") == "true")
        return {}
    if action in ("key-create", "key-remove", "key-check"):
        name = key_name(run, o["role"], o["generation"])
        path = "transit/keys/" + name
        code, v = b.call("GET", path, expected=(200, 404))
        if action == "key-create":
            require(code == 404)
            b.call("POST", path, {"type": "aes256-gcm96" if o["role"] == "kms" else "ed25519",
                "derived": o["role"] == "kms", "exportable": False, "allow_plaintext_backup": False})
            _, v = b.call("GET", path)
        elif action == "key-remove":
            if code == 404:
                return {"absent": True}
            require(snapshot(v["data"]) == o.get("fingerprint"))
            b.call("POST", path + "/config", {"deletion_allowed": True})
            b.call("DELETE", path)
            b.call("GET", path, expected=(404,))
            return {"absent": True}
        else:
            require(code == 200 and snapshot(v["data"]) == o["fingerprint"])
        info = v["data"]
        result = {"fingerprint": snapshot(info), "ref": key_ref(h, run, o["role"], o["generation"])}
        if o["role"] != "kms":
            public = info["keys"]["1"]["public_key"]
            require(len(base64.b64decode(public, validate=True)) == 32)
            result["public_key_base64"] = public
        return result
    if action in ("policy-old", "policy-new", "policy-remove"):
        role = o["role"]
        require(role in ROLES)
        path = "sys/policies/acl/" + run + "-" + role
        code, value = b.call("GET", path, expected=(200, 404))
        if action == "policy-old":
            require(code == 404)
        elif code == 200:
            require(json.loads(value["data"]["policy"]) in (policy(h, run, role, "old"), policy(h, run, role, "new")))
        if action == "policy-remove":
            if code == 200:
                b.call("DELETE", path)
            b.call("GET", path, expected=(404,))
        else:
            require(action == "policy-old" or code == 200)
            b.call("POST", path, {"policy": json.dumps(policy(h, run, role, action.split("-")[1]))})
        return {}
    if action == "issue":
        role, group = o["role"], o["group"]
        meta = metadata(o, role, group)
        ttl = {"expire": 240, "revoke": 900, "control": 3600}[group]
        _, value = b.call("POST", "auth/token/create", {"policies": [run + "-" + role], "no_default_policy": True,
            "type": "service", "no_parent": True, "ttl": str(ttl) + "s", "explicit_max_ttl": str(ttl) + "s",
            "renewable": False, "display_name": run + "-" + group + "-" + role, "meta": meta})
        auth = value["auth"]
        require(auth["renewable"] is False and auth["lease_duration"] == ttl)
        _, value = b.call("POST", "auth/token/lookup-accessor", {"accessor": auth["accessor"]})
        info = value["data"]
        require(info["meta"] == meta and info["renewable"] is False and info["explicit_max_ttl"] == ttl
                and info["policies"] == [run + "-" + role] and info["orphan"] is True)
        _, hashed = b.call("POST", "sys/audit-hash/lab", {"input": auth["accessor"]})
        return {"token": auth["client_token"], "issued": {"creation_time": info["creation_time"],
            "expire_time": info["expire_time"], "ttl_seconds": ttl, "renewable": False,
            "accessor_hmac": hashed["data"]["hash"]}}
    if action in ("revoke", "tokens-remove"):
        matches = owned_tokens(b, o)
        if action == "revoke":
            matches = [(a, i) for a, i in matches if i["meta"]["group"] == "revoke" and i["meta"]["role"] == o["role"]]
            require(len(matches) == 1)
        for accessor, _ in matches:
            b.call("POST", "auth/token/revoke-accessor", {"accessor": accessor})
        remaining = owned_tokens(b, o)
        require(not remaining if action == "tokens-remove" else not any(i["meta"]["group"] == "revoke" and i["meta"]["role"] == o["role"] for _, i in remaining))
        return {"removed": len(matches)}
    raise ValueError("control action")


def data(b, o):
    h, run, role, generation = o["handoff"], o["run_id"], o["role"], o["generation"]
    require(role in ROLES)
    name = key_name(run, "kms" if role in ("generate", "unwrap") else role, generation)
    ctx = context(h, run)
    if o.get("wrong_context"):
        ctx = base64.b64encode(b"D-wrong-context").decode()
    if role == "generate":
        path, body = "transit/datakey/plaintext/" + name, {"context": ctx, "bits": "256"}
    elif role == "unwrap":
        require(re.fullmatch(r"vault:v1:[A-Za-z0-9+/=]{16,512}", o["ciphertext"]))
        path, body = "transit/decrypt/" + name, {"context": ctx, "ciphertext": o["ciphertext"]}
    else:
        path, body = "transit/sign/" + name, {"input": base64.b64encode(payload(h, run, role, generation)).decode(), "key_version": "1"}
        if o.get("omit_version"):
            del body["key_version"]
        elif o.get("wrong_version"):
            body["key_version"] = "2"
    code, value = b.call("POST", path, body, (200, 400, 403))
    out = {"http_status": code}
    if code == 200:
        v = value["data"]
        if role in ("generate", "unwrap"):
            raw = base64.b64decode(v["plaintext"], validate=True)
            require(len(raw) == 32)
            out["plaintext_sha256"] = hashlib.sha256(raw).hexdigest()
            if role == "generate":
                require(re.fullmatch(r"vault:v1:[A-Za-z0-9+/=]{16,512}", v["ciphertext"]))
                out["ciphertext"] = v["ciphertext"]
        else:
            sig = v["signature"]
            require(sig.startswith("vault:v1:") and len(base64.b64decode(sig[9:], validate=True)) == 64)
            out["signature_base64"] = sig[9:]
    return out


def execute(o):
    key_name(o["run_id"], "kms", "old")
    require(re.fullmatch(r"[a-f0-9-]{36}", o["owner_uid"]))
    require(o["mode"] in ("control", "data"))
    b = Bao(o, o["mode"] == "control")
    result = control(b, o) if o["mode"] == "control" else data(b, o)
    return {"status": "ok", "result": result, "events": b.events}


if __name__ == "__main__":
    try:
        require(not sys.stdin.isatty() and not sys.stdout.isatty())
        print(json.dumps(execute(json.load(sys.stdin))))
    except Exception:
        print('{"status":"failed","error_code":"client_failed"}')
        sys.exit(1)
