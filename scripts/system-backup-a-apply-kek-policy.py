"""Operator-run installation of reviewed, content-addressed backup KEK ACLs.

No key creation, rotation, export, token minting, workload grant or retry. The
operator supplies an independently reviewed public plan hash and mounted token.
Only sanitized receipts go to stdout; credentials must stay outside Git.
"""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import ssl
import sys
from urllib.parse import urlsplit


class Rejected(Exception):
    pass


def require(ok):
    if not ok:
        raise Rejected("invalid_material")


def canonical(value):
    # This restricted input has ASCII member names, string values, and no
    # numbers. Python's compact UTF-8 form therefore matches the C JCS subset.
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def closed_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result)
        result[key] = value
    return result


def decode(raw):
    return json.loads(raw, object_pairs_hook=closed_pairs)


def policies(plan):
    require(plan["contract"] == "public-c-crypto.v1" and plan["status"] == "review_only_not_authorized")
    request = plan["request"]
    require(set(request) == {"key", "context"})
    key, context = request["key"], request["context"]
    require(set(key) == {"provider", "identity_hash", "registry_version", "provider_key_id", "provider_version"})
    require(set(context) == {"origin_installation_id", "backup_public_id", "attempt_no", "phase", "part", "part_index", "envelope_id", "capture_context_hash"})
    require(all(isinstance(v, str) and 0 < len(v.encode("utf-8")) <= 256 for v in [*key.values(), *context.values()]))
    require(key["provider"] == "external-kms" and re.fullmatch(r"[0-9a-f]{64}", key["identity_hash"]) and re.fullmatch(r"[0-9a-f]{64}", context["capture_context_hash"]))
    registry_version = key["registry_version"]
    require(re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", registry_version) and registry_version not in ("latest", "current", "default"))
    version = key["provider_version"]
    require(re.fullmatch(r"[1-9][0-9]*", version) and int(version) <= 4294967295)
    require(re.fullmatch(r"[1-9][0-9]*", context["attempt_no"]) and re.fullmatch(r"0|[1-9][0-9]*", context["part_index"]) and re.fullmatch(r"sbk_[A-Za-z0-9_-]+", context["backup_public_id"]))
    import base64
    expected = base64.b64encode(canonical({**context, "kek_binding_sha256": hashlib.sha256(canonical(key)).hexdigest()})).decode()
    require(plan["context_base64"] == expected)
    generate_path = plan["generate_request"]["path"]
    prefix = "transit/datakey/plaintext/"
    require(generate_path.startswith(prefix))
    name = generate_path[len(prefix):]
    require(re.fullmatch(r"[A-Za-z0-9_-]{1,128}", name))
    require(plan["generate_request"]["body"] == {"context": expected, "bits": "256", "key_version": version})

    def rule(parameters):
        return {"capabilities": ["update"], "required_parameters": list(parameters), "allowed_parameters": parameters}

    generate = {"path": {generate_path: rule({"context": [expected], "bits": ["256"], "key_version": [version]})}}
    unwrap = {"path": {"transit/decrypt/" + name: rule({"context": [expected], "ciphertext": ["vault:v" + version + ":*"]})}}
    require(plan["generate_policy"] == generate and plan["unwrap_policy"] == unwrap)
    suffix = hashlib.sha256(canonical({"generate": generate, "unwrap": unwrap})).hexdigest()
    return {"sbk-backup-" + suffix + "-generate": generate, "sbk-backup-" + suffix + "-unwrap": unwrap}


def workload_roles(reviewed_policies, identity):
    """One exact Pod, one operation, one policy; no shared SA-wide role."""
    require(set(identity) == {"namespace", "service_account", "service_account_uid", "pod_uid", "job_uid", "invocation_sha256", "execution_grant_sha256", "operation"})
    require(identity["operation"] in ("backup_dek_generate", "backup_dek_unwrap"))
    operation = identity["operation"].removeprefix("backup_dek_")
    require(all(isinstance(v, str) and 0 < len(v) <= 256 for v in identity.values()))
    require(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", identity["namespace"]))
    require(re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", identity["service_account"]))
    for field in ("invocation_sha256", "execution_grant_sha256"):
        require(re.fullmatch(r"[0-9a-f]{64}", identity[field]))
    output = {}
    for policy in reviewed_policies:
        if not policy.endswith("-" + operation):
            continue
        suffix = hashlib.sha256(canonical({"identity": identity, "policy": policy})).hexdigest()
        output["sbk-job-" + suffix] = {
            "role_type": "jwt", "bound_audiences": ["clawmanager-backup-kek-" + operation],
            "bound_subject": "system:serviceaccount:" + identity["namespace"] + ":" + identity["service_account"],
            "bound_claims_type": "string",
            "bound_claims": {"/kubernetes.io/namespace": identity["namespace"], "/kubernetes.io/serviceaccount/uid": identity["service_account_uid"], "/kubernetes.io/pod/uid": identity["pod_uid"]},
            "claim_mappings": {"/kubernetes.io/namespace": "namespace", "/kubernetes.io/serviceaccount/uid": "service_account_uid", "/kubernetes.io/pod/uid": "pod_uid"},
            "user_claim": "/kubernetes.io/pod/uid", "user_claim_json_pointer": True,
            "clock_skew_leeway": -1, "expiration_leeway": -1, "not_before_leeway": -1,
            "token_type": "batch", "token_ttl": 20, "token_max_ttl": 20, "token_explicit_max_ttl": 20,
            "token_no_default_policy": True, "token_policies": [policy], "token_num_uses": 0, "token_period": 0,
            "groups_claim": "", "verbose_oidc_logging": False, "token_policies_template_claims": False,
        }
    require(len(output) == 1)
    return output


def role_matches(actual, expected):
    require(isinstance(actual, dict))
    require(all(name in actual and actual[name] == value for name, value in expected.items()))
    # Reject deprecated aliases or extra identity/group privileges on an old
    # content-addressed role. No overwrite or permissive default conversion.
    require(actual.get("policies") in (None, [], "", expected["token_policies"]))
    for name in ("bound_cidrs", "token_bound_cidrs", "allowed_redirect_uris", "oidc_scopes"):
        require(actual.get(name) in (None, [], ""))


def apply_roles(provider, mount, config_sha256, reviewed_roles):
    require(re.fullmatch(r"[a-z0-9_-]{1,128}", mount) and re.fullmatch(r"[0-9a-f]{64}", config_sha256))
    config = provider.request("GET", "auth/" + mount + "/config")
    require(config is not None and isinstance(config.get("data"), dict))
    data = config["data"]
    require(hashlib.sha256(canonical(data)).hexdigest() == config_sha256 and data.get("bound_issuer") and data.get("jwt_supported_algs"))
    # This tool does not create or change cluster JWT trust. That mount's
    # issuer/JWKS/CA pin is independently reviewed before granting any role.
    receipts = []
    for name, role in reviewed_roles.items():
        path = "auth/" + mount + "/role/" + name
        current = provider.request("GET", path)
        created = current is None
        if created:
            provider.request("POST", path, role)
        else:
            role_matches(current["data"], role)
        readback = provider.request("GET", path)
        require(readback is not None)
        role_matches(readback["data"], role)
        receipts.append({"name": name, "created": created, "role_sha256": hashlib.sha256(canonical(role)).hexdigest()})
    return receipts


class Provider:
    def __init__(self, endpoint, ca_path, ca_sha256, token_path):
        url = urlsplit(endpoint)
        require(url.scheme == "https" and url.hostname and not url.username and not url.password and not url.path and not url.query and not url.fragment)
        ca = Path(ca_path).read_bytes()
        require(len(ca) <= 65536 and hashlib.sha256(ca).hexdigest() == ca_sha256)
        self.host, self.port = url.hostname, url.port or 443
        self.tls = ssl.create_default_context(cadata=ca.decode("ascii"))
        token_file = Path(token_path)
        require(token_file.is_absolute() and token_file.is_file())
        if os.name == "posix":
            require(token_file.stat().st_mode & 0o077 == 0)
        self.token = bytearray(token_file.read_bytes())
        try:
            require(16 <= len(self.token) <= 4096 and all(33 <= b <= 126 for b in self.token))
        except Exception:
            self.close()
            raise

    def close(self):
        self.token[:] = bytes(len(self.token))

    def request(self, method, path, body=None):
        # http.client never follows redirects or environment proxies.
        connection = http.client.HTTPSConnection(self.host, self.port, timeout=15, context=self.tls)
        try:
            connection.request(method, "/v1/" + path, body=None if body is None else canonical(body), headers={"Content-Type": "application/json", "X-Vault-Token": self.token.decode("ascii")})
            response = connection.getresponse()
            raw = response.read(65537)
            require(len(raw) <= 65536 and not response.getheader("Content-Encoding"))
            if response.status == 404 and method == "GET":
                return None
            if response.status not in (200, 204):
                raise Rejected("provider_denied_or_unknown")
            return decode(raw) if raw else {}
        finally:
            connection.close()


def apply(provider, reviewed):
    receipts = []
    for name, policy in reviewed.items():
        path = "sys/policies/acl/" + name
        current = provider.request("GET", path)
        created = current is None
        if current is not None:
            require(policy_document(current) == policy)
        else:
            provider.request("POST", path, {"policy": canonical(policy).decode("utf-8")})
        readback = provider.request("GET", path)
        require(readback is not None and policy_document(readback) == policy)
        receipts.append({"name": name, "created": created, "policy_sha256": hashlib.sha256(canonical(policy)).hexdigest()})
    return {"status": "policy_readback_verified", "policies": receipts, "workload_authorized": False, "credentials_created": False}


def policy_document(response):
    data = response.get("data", response)
    require(isinstance(data, dict) and isinstance(data.get("policy"), str))
    if data is not response and "policy" in response:
        require(response["policy"] == data["policy"])
    return decode(data["policy"])


def revoke(provider, reviewed, operation, roles=None, mount=None):
    require(operation in ("generate", "unwrap"))
    selected = [(name, policy) for name, policy in reviewed.items() if name.endswith("-" + operation)]
    require(len(selected) == 1)
    name, policy = selected[0]
    removed_roles = []
    for role_name, role in (roles or {}).items():
        if role["token_policies"] != [name]:
            continue
        require(mount and re.fullmatch(r"[a-z0-9_-]{1,128}", mount))
        path = "auth/" + mount + "/role/" + role_name
        existing = provider.request("GET", path)
        if existing is not None:
            role_matches(existing["data"], role)
            provider.request("DELETE", path)
        require(provider.request("GET", path) is None)
        removed_roles.append(role_name)
    path = "sys/policies/acl/" + name
    existing = provider.request("GET", path)
    if existing is not None:
        require(policy_document(existing) == policy)
        provider.request("DELETE", path)
    require(provider.request("GET", path) is None)
    return {"status": "purpose_policy_absence_verified", "operation": operation, "policy": name,
            "roles": removed_roles, "worker_stopped": False,
            "limits": ["Provider ACL removal is not proof that an already admitted DEK callback stopped.", "Complete original Job draining and worker stop proof before reporting execution revocation complete."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--ca-file", required=True)
    parser.add_argument("--ca-sha256", required=True)
    parser.add_argument("--operator-token-file", required=True)
    parser.add_argument("--job-identity")
    parser.add_argument("--job-identity-sha256")
    parser.add_argument("--jwt-mount")
    parser.add_argument("--jwt-config-sha256")
    mutation = parser.add_mutually_exclusive_group()
    mutation.add_argument("--apply", action="store_true", help="write the exact reviewed ACLs/optional roles; default only validates the public plan")
    mutation.add_argument("--revoke", choices=("generate", "unwrap"), help="remove only this exact purpose policy and optional associated role; keeps the other purpose")
    args = parser.parse_args()
    provider = None
    try:
        raw = Path(args.plan).read_bytes()
        require(len(raw) <= 65536 and hashlib.sha256(raw).hexdigest() == args.plan_sha256)
        reviewed = policies(decode(raw))
        role_args = [args.job_identity, args.job_identity_sha256, args.jwt_mount, args.jwt_config_sha256]
        require(not any(role_args) or all(role_args))
        roles = {}
        if all(role_args):
            identity_raw = Path(args.job_identity).read_bytes()
            require(len(identity_raw) <= 8192 and hashlib.sha256(identity_raw).hexdigest() == args.job_identity_sha256)
            roles = workload_roles(reviewed, decode(identity_raw))
        if not args.apply and not args.revoke:
            print(json.dumps({"status": "review_only_not_applied", "policy_names": list(reviewed), "roles": roles}))
            return 0
        provider = Provider(args.endpoint, args.ca_file, args.ca_sha256, args.operator_token_file)
        if args.revoke:
            print(json.dumps(revoke(provider, reviewed, args.revoke, roles, args.jwt_mount)))
            return 0
        receipt = apply(provider, reviewed)
        if roles:
            receipt["roles"] = apply_roles(provider, args.jwt_mount, args.jwt_config_sha256, roles)
            receipt["status"] = "policy_and_role_readback_verified"
        print(json.dumps(receipt))
        return 0
    except Exception:
        # An interrupted write may have committed. Never retry implicitly or
        # emit raw provider exceptions (which may embed sensitive request data).
        print(json.dumps({"status": "failed_or_outcome_unknown", "next": "read back the same content-addressed policy names; do not broaden ACLs"}))
        return 1
    finally:
        if provider:
            provider.close()


if __name__ == "__main__":
    sys.exit(main())
