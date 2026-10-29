"""Install one reviewed content-addressed JWT trust mount. No roles or tokens."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("kek_policy", Path(__file__).with_name("system-backup-a-apply-kek-policy.py"))
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)
require, canonical = support.require, support.canonical

STAGES = {"plan", "provider_client", "mount_read", "mount_validate", "mount_create",
          "mount_readback", "tune_read", "tune_validate", "config_read", "config_validate",
          "config_write", "config_readback", "key_input", "trust_readback_pin", "key_read", "key_profile"}
DISABLED_CONFIG_FIELDS = ("oidc_discovery_url", "jwks_url", "oidc_client_id", "oidc_client_secret",
                          "provider_config", "override_allowed_server_names")
CONFIG_DIAGNOSTIC_FIELDS = {"response_data", "bound_issuer", "jwt_supported_algs", "jwt_validation_pubkeys",
                            "default_role", "status", *DISABLED_CONFIG_FIELDS}
KEY_FLAGS = {"derived": True, "exportable": False, "allow_plaintext_backup": False,
             "deletion_allowed": False, "convergent_encryption": False, "soft_deleted": False,
             "supports_encryption": True, "supports_decryption": True, "supports_derivation": True,
             "supports_signing": False}
KEY_WATERMARKS = ("min_available_version", "min_decryption_version", "min_encryption_version", "latest_version")
KEY_OBSERVATION_FIELDS = {"name_matches", "type_matches", "requested_version_present", "kdf", *KEY_FLAGS, *KEY_WATERMARKS}


def key_observation(data, name, version):
    """Public metadata only. Never exports key bytes or infers registry admission."""
    require(isinstance(data, dict))
    keys = data.get("keys")
    observed = {"name_matches": data.get("name") == name,
                "type_matches": data.get("type") == "aes256-gcm96",
                "requested_version_present": isinstance(keys, dict) and str(version) in keys,
                "kdf": data.get("kdf") if data.get("kdf") in ("hkdf_sha256", "hmac-sha256-counter") else "other"}
    for field in KEY_FLAGS:
        observed[field] = data.get(field) if type(data.get(field)) is bool else None
    for field in KEY_WATERMARKS:
        value = data.get(field)
        observed[field] = value if type(value) is int and 0 <= value <= 4294967295 else None
    return observed


def key_mismatches(observed, version):
    require(isinstance(observed, dict) and set(observed) == KEY_OBSERVATION_FIELDS)
    differences = []
    for field in ("name_matches", "type_matches", "requested_version_present"):
        require(type(observed[field]) is bool)
        if not observed[field]: differences.append(field)
    require(observed["kdf"] in ("hkdf_sha256", "hmac-sha256-counter", "other"))
    if observed["kdf"] == "other": differences.append("kdf")
    for field, expected in KEY_FLAGS.items():
        require(observed[field] is None or type(observed[field]) is bool)
        if observed[field] is not expected: differences.append(field)
    for field in KEY_WATERMARKS:
        value = observed[field]
        require(value is None or (type(value) is int and 0 <= value <= 4294967295))
        if value is None or (value < version if field == "latest_version" else value > version):
            differences.append(field)
    return sorted(differences)


def inspect_kek(provider, plan, name, version, trust_sha256, progress=None):
    mark(progress, "key_input")
    require(isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", name))
    require(type(version) is int and 1 <= version <= 4294967295)
    require(isinstance(trust_sha256, str) and re.fullmatch(r"[0-9a-f]{64}", trust_sha256))
    trust_receipt = inspect(provider, plan, progress)
    mark(progress, "trust_readback_pin")
    require(trust_receipt["status"] == "jwt_trust_readback_verified" and
            trust_receipt["config_readback_sha256"] == trust_sha256)
    mark(progress, "key_read")
    result = provider.request("GET", "transit/keys/" + name)
    if result is None:
        return {"status": "backup_kek_not_found", "key_name": name, "provider_version": str(version),
                "trust_config_readback_sha256": trust_sha256, "key_profile_sha256": None, "observation": None,
                "profile_matches": False, "mismatch_fields": [], "provider_mutated": False,
                "registry_admitted": False, "credentials_created": False, "task_authorized": False}
    mark(progress, "key_profile")
    observed = key_observation(result["data"], name, version)
    mismatches = key_mismatches(observed, version)
    return {"status": "backup_kek_profile_observed", "key_name": name, "provider_version": str(version),
            "trust_config_readback_sha256": trust_sha256,
            "key_profile_sha256": hashlib.sha256(canonical(result["data"])).hexdigest(),
            "observation": observed, "profile_matches": not mismatches, "mismatch_fields": mismatches,
            "provider_mutated": False, "registry_admitted": False, "credentials_created": False, "task_authorized": False}


def mark(progress, stage):
    if progress is not None:
        progress["failure_stage"] = stage


def inspect(provider, plan, progress=None):
    """Resolve an unknown prior outcome with GET only, never completing a write."""
    mount, config = reviewed_plan(plan)
    result = {"status": "jwt_trust_mount_absent", "mount": mount,
              "config_request_sha256": plan["config_request_sha256"], "config_readback_sha256": None,
              "mount_exists": False, "config_exists": False, "provider_mutated": False,
              "roles_created": False, "credentials_created": False, "task_authorized": False}
    mark(progress, "mount_read")
    mounts = provider.request("GET", "sys/auth")
    require(mounts is not None and isinstance(mounts.get("data"), dict))
    current = mounts["data"].get(mount + "/")
    if current is None:
        return result
    mark(progress, "mount_validate")
    require(current.get("type") == "jwt" and current.get("description") ==
            "ClawManager backup KEK JWT; config " + plan["config_request_sha256"])
    result["mount_exists"] = True
    mark(progress, "tune_read")
    tune = provider.request("GET", "sys/auth/" + mount + "/tune")
    mark(progress, "tune_validate")
    require(tune is not None and tune["data"].get("default_lease_ttl") == 20 and tune["data"].get("max_lease_ttl") == 20)
    mark(progress, "config_read")
    current_config = provider.request("GET", "auth/" + mount + "/config")
    if current_config is None:
        return {**result, "status": "jwt_trust_config_absent"}
    mark(progress, "config_validate")
    matches(current_config["data"], config, progress)
    return {**result, "status": "jwt_trust_readback_verified", "config_exists": True,
            "config_readback_sha256": hashlib.sha256(canonical(current_config["data"])).hexdigest()}


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


def public_keys_match(actual, expected):
    if not isinstance(actual, list) or len(actual) != len(expected):
        return False
    # OpenBao 2.6.2 TypeCommaStringSlice -> ParseCommaStringSlice -> TrimStrings
    # removes the terminal LF of the submitted canonical PEM. Permit only that
    # one formatting difference; retain exact bytes, order, and number of keys.
    return all(isinstance(a, str) and (a == e or (e.endswith("\n") and a == e[:-1]))
               for a, e in zip(actual, expected))


def matches(actual, expected, progress=None):
    mismatches = []
    if not isinstance(actual, dict):
        mismatches.append("response_data")
    else:
        for key, value in expected.items():
            equal = public_keys_match(actual.get(key), value) if key == "jwt_validation_pubkeys" else actual.get(key) == value
            if not equal:
                mismatches.append(key)
        for key in DISABLED_CONFIG_FIELDS:
            if actual.get(key) not in (None, "", [], {}):
                mismatches.append(key)
        # This exact provider release returns the validator's public status.
        if actual.get("status") != "valid":
            mismatches.append("status")
    if progress is not None and mismatches:
        progress["config_mismatch_fields"] = sorted(mismatches)
    require(not mismatches)


def apply(provider, plan, progress=None):
    mount, config = reviewed_plan(plan)
    description = "ClawManager backup KEK JWT; config " + plan["config_request_sha256"]
    mark(progress, "mount_read")
    mounts = provider.request("GET", "sys/auth")
    require(mounts is not None and isinstance(mounts.get("data"), dict))
    current = mounts["data"].get(mount + "/")
    created = current is None
    if created:
        mark(progress, "mount_create")
        if progress is not None:
            progress["provider_write_attempted"] = True
        provider.request("POST", "sys/auth/" + mount, {"type": "jwt", "description": description, "config": {"default_lease_ttl": 20, "max_lease_ttl": 20}})
    else:
        mark(progress, "mount_validate")
        require(current.get("type") == "jwt" and current.get("description") == description)
    mark(progress, "mount_readback")
    readback_mounts = provider.request("GET", "sys/auth")
    current = readback_mounts["data"][mount + "/"]
    require(current.get("type") == "jwt" and current.get("description") == description)
    mark(progress, "tune_read")
    tune = provider.request("GET", "sys/auth/" + mount + "/tune")
    mark(progress, "tune_validate")
    require(tune is not None and tune["data"].get("default_lease_ttl") == 20 and tune["data"].get("max_lease_ttl") == 20)
    path = "auth/" + mount + "/config"
    mark(progress, "config_read")
    current_config = provider.request("GET", path)
    if current_config is None:
        mark(progress, "config_write")
        if progress is not None:
            progress["provider_write_attempted"] = True
        provider.request("POST", path, config)
    else:
        mark(progress, "config_validate")
        matches(current_config["data"], config, progress)
    mark(progress, "config_readback")
    verified = provider.request("GET", path)
    require(verified is not None)
    matches(verified["data"], config, progress)
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
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--inspect", action="store_true", help="GET-only readback of the exact mount/config")
    mode.add_argument("--inspect-kek", action="store_true", help="GET-only metadata of one exact backup KEK after checking trust")
    parser.add_argument("--key-name")
    parser.add_argument("--key-version", type=int)
    parser.add_argument("--trust-readback-sha256")
    args = parser.parse_args()
    provider = None
    progress = {"failure_stage": "plan", "provider_write_attempted": False}
    try:
        raw = Path(args.plan).read_bytes()
        require(len(raw) <= 65536 and hashlib.sha256(raw).hexdigest() == args.plan_sha256)
        plan = support.decode(raw)
        mount, _ = reviewed_plan(plan)
        key_args = (args.key_name, args.key_version, args.trust_readback_sha256)
        require(all(v is not None for v in key_args) if args.inspect_kek else all(v is None for v in key_args))
        if not args.apply and not args.inspect and not args.inspect_kek:
            print(json.dumps({"status": "review_only_not_applied", "mount": mount}))
            return 0
        mark(progress, "provider_client")
        provider = support.Provider(args.endpoint, args.ca_file, args.ca_sha256, args.operator_token_file)
        if args.inspect_kek:
            receipt = inspect_kek(provider, plan, *key_args, progress=progress)
        else:
            operation = inspect if args.inspect else apply
            receipt = operation(provider, plan, progress)
        print(json.dumps(receipt))
        return 0
    except Exception:
        print(json.dumps({"status": "failed_or_outcome_unknown", **progress}))
        return 1
    finally:
        if provider:
            provider.close()


if __name__ == "__main__":
    sys.exit(main())
