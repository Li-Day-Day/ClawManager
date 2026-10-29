"""Install one reviewed content-addressed JWT trust mount. No roles or tokens."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("kek_policy", Path(__file__).with_name("system-backup-a-apply-kek-policy.py"))
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)
require, canonical = support.require, support.canonical


def reviewed_plan(plan):
    require(plan["status"] == "review_only_not_applied")
    config = plan["config"]
    require(set(config) == {"bound_issuer", "jwt_supported_algs", "jwt_validation_pubkeys", "default_role"})
    require(config["jwt_supported_algs"] == ["RS256"] and config["default_role"] == "" and config["bound_issuer"].startswith("https://"))
    require(isinstance(config["jwt_validation_pubkeys"], list) and 0 < len(config["jwt_validation_pubkeys"]) <= 8)
    require(all(isinstance(k, str) and k.startswith("-----BEGIN PUBLIC KEY-----\n") and k.endswith("-----END PUBLIC KEY-----\n") and len(k) <= 8192 for k in config["jwt_validation_pubkeys"]))
    digest = hashlib.sha256(canonical(config)).hexdigest()
    require(plan["config_request_sha256"] == digest and plan["mount"] == "sbk-kek-jwt-" + digest)
    return plan["mount"], config


def matches(actual, expected):
    require(isinstance(actual, dict) and all(actual.get(k) == v for k, v in expected.items()))
    for k in ("oidc_discovery_url", "jwks_url", "oidc_client_id", "oidc_client_secret", "provider_config", "override_allowed_server_names"):
        require(actual.get(k) in (None, "", [], {}))


def apply(provider, plan):
    mount, config = reviewed_plan(plan)
    description = "ClawManager backup KEK JWT; config " + plan["config_request_sha256"]
    mounts = provider.request("GET", "sys/auth")
    require(mounts is not None and isinstance(mounts.get("data"), dict))
    current = mounts["data"].get(mount + "/")
    created = current is None
    if created:
        provider.request("POST", "sys/auth/" + mount, {"type": "jwt", "description": description, "config": {"default_lease_ttl": 20, "max_lease_ttl": 20}})
    else:
        require(current.get("type") == "jwt" and current.get("description") == description)
    readback_mounts = provider.request("GET", "sys/auth")
    current = readback_mounts["data"][mount + "/"]
    require(current.get("type") == "jwt" and current.get("description") == description)
    tune = provider.request("GET", "sys/auth/" + mount + "/tune")
    require(tune is not None and tune["data"].get("default_lease_ttl") == 20 and tune["data"].get("max_lease_ttl") == 20)
    path = "auth/" + mount + "/config"
    current_config = provider.request("GET", path)
    if current_config is None:
        provider.request("POST", path, config)
    else:
        matches(current_config["data"], config)
    verified = provider.request("GET", path)
    require(verified is not None)
    matches(verified["data"], config)
    return {"status": "jwt_trust_readback_verified", "mount": mount, "created": created,
            "config_request_sha256": plan["config_request_sha256"],
            "config_readback_sha256": hashlib.sha256(canonical(verified["data"])).hexdigest(),
            "roles_created": False, "credentials_created": False, "task_authorized": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--ca-file", required=True)
    parser.add_argument("--ca-sha256", required=True)
    parser.add_argument("--operator-token-file", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    provider = None
    try:
        raw = Path(args.plan).read_bytes()
        require(len(raw) <= 65536 and hashlib.sha256(raw).hexdigest() == args.plan_sha256)
        plan = support.decode(raw)
        mount, _ = reviewed_plan(plan)
        if not args.apply:
            print(json.dumps({"status": "review_only_not_applied", "mount": mount}))
            return 0
        provider = support.Provider(args.endpoint, args.ca_file, args.ca_sha256, args.operator_token_file)
        print(json.dumps(apply(provider, plan)))
        return 0
    except Exception:
        print('{"status":"failed_or_outcome_unknown","next":"inspect the same content-addressed mount; no implicit retry or trust overwrite"}')
        return 1
    finally:
        if provider:
            provider.close()


if __name__ == "__main__":
    sys.exit(main())
