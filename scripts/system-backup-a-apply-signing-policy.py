"""Operator-run, reviewed three-purpose Transit signing ACL and JWT role setup.

This installs provider permissions only. It does not attest an original signing
mapping, authorize an artifact, mint a workload JWT, or invoke Transit sign.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys


_spec = importlib.util.spec_from_file_location(
    "backup_kek_policy", Path(__file__).with_name("system-backup-a-apply-kek-policy.py")
)
_kek = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_kek)

PURPOSES = ("capture_certificate", "acceptance_record", "catalog_record")
require = _kek.require
canonical = _kek.canonical
decode = _kek.decode


def bounded(value, limit):
    return isinstance(value, str) and 0 < len(value.encode("utf-8")) <= limit and all(ord(c) >= 33 for c in value)


def reviewed_plan(raw, endpoint):
    plan = decode(raw)
    require(isinstance(plan, dict) and set(plan) == {"contract", "status", "installation_id", "bindings", "workloads"})
    require(plan["contract"] == "system-backup-a-signing-acl.v1" and plan["status"] == "review_only_not_authorized")
    require(bounded(plan["installation_id"], 128) and isinstance(plan["bindings"], list) and len(plan["bindings"]) == 3)
    require(isinstance(plan["workloads"], list) and len(plan["workloads"]) == 3)
    bindings, public_keys, provider_keys = {}, set(), set()
    for binding in plan["bindings"]:
        require(isinstance(binding, dict) and set(binding) == {"purpose", "installation_id", "key_id", "registry_version", "endpoint", "key_name", "provider_version", "public_key_base64"})
        purpose = binding["purpose"]
        require(purpose in PURPOSES and purpose not in bindings and binding["installation_id"] == plan["installation_id"])
        require(bounded(binding["key_id"], 256) and re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", binding["registry_version"]))
        require(binding["endpoint"] == endpoint and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", binding["key_name"]))
        version = binding["provider_version"]
        require(isinstance(version, str) and re.fullmatch(r"[1-9][0-9]*", version) and int(version) <= 4294967295)
        encoded = binding["public_key_base64"]
        require(isinstance(encoded, str) and len(encoded) <= 44)
        try:
            public = base64.b64decode(encoded, validate=True)
        except (ValueError, base64.binascii.Error):
            raise _kek.Rejected("invalid_material") from None
        require(len(public) == 32 and base64.b64encode(public).decode("ascii") == encoded)
        require(public not in public_keys and binding["key_name"] not in provider_keys)
        public_keys.add(public)
        provider_keys.add(binding["key_name"])
        bindings[purpose] = binding
    require(set(bindings) == set(PURPOSES))

    policies, roles = {}, {}
    seen_workloads = set()
    for workload in plan["workloads"]:
        require(isinstance(workload, dict) and set(workload) == {"purpose", "namespace", "service_account", "service_account_uid", "pod_uid"})
        purpose = workload["purpose"]
        require(purpose in bindings and purpose not in seen_workloads)
        require(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", workload["namespace"]))
        require(re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", workload["service_account"]))
        require(bounded(workload["service_account_uid"], 256) and bounded(workload["pod_uid"], 256))
        seen_workloads.add(purpose)
        binding = bindings[purpose]
        rule = {"capabilities": ["update"], "required_parameters": ["input", "key_version"],
                "allowed_parameters": {"input": [], "key_version": [binding["provider_version"]]}}
        policy = {"path": {"transit/sign/" + binding["key_name"]: rule}}
        policy_hash = hashlib.sha256(canonical({"binding": binding, "policy": policy})).hexdigest()
        policy_name = "sbk-sign-" + policy_hash + "-" + purpose
        policies[policy_name] = policy
        role_hash = hashlib.sha256(canonical({"policy": policy_name, "workload": workload})).hexdigest()
        role_name = "sbk-sign-job-" + role_hash
        roles[role_name] = {
            "role_type": "jwt", "bound_audiences": ["clawmanager-backup-signing-" + purpose],
            "bound_subject": "system:serviceaccount:" + workload["namespace"] + ":" + workload["service_account"],
            "bound_claims_type": "string",
            "bound_claims": {"/kubernetes.io/namespace": workload["namespace"],
                             "/kubernetes.io/serviceaccount/uid": workload["service_account_uid"],
                             "/kubernetes.io/pod/uid": workload["pod_uid"]},
            "claim_mappings": {"/kubernetes.io/namespace": "namespace",
                               "/kubernetes.io/serviceaccount/uid": "service_account_uid",
                               "/kubernetes.io/pod/uid": "pod_uid"},
            "user_claim": "/kubernetes.io/pod/uid", "user_claim_json_pointer": True,
            "clock_skew_leeway": -1, "expiration_leeway": -1, "not_before_leeway": -1,
            "token_type": "batch", "token_ttl": 20, "token_max_ttl": 20, "token_explicit_max_ttl": 20,
            "token_no_default_policy": True, "token_policies": [policy_name], "token_num_uses": 0,
            "token_period": 0, "groups_claim": "", "verbose_oidc_logging": False,
            "token_policies_template_claims": False,
        }
    require(seen_workloads == set(PURPOSES) and len(policies) == 3 and len(roles) == 3)
    return bindings, policies, roles


def verify_provider_keys(provider, bindings):
    for purpose in PURPOSES:
        binding = bindings[purpose]
        data = provider.request("GET", "transit/keys/" + binding["key_name"])
        require(isinstance(data, dict) and isinstance(data.get("data"), dict))
        key = data["data"]
        version = int(binding["provider_version"])
        require(key.get("type") == "ed25519" and key.get("derived") is False)
        require(type(key.get("latest_version")) is int and key["latest_version"] >= version)
        require(type(key.get("min_available_version")) is int and key["min_available_version"] <= version)
        require(type(key.get("min_encryption_version")) is int and key["min_encryption_version"] <= version)
        require(key.get("deletion_allowed") is False and key.get("exportable") is False)
        require(isinstance(key.get("keys"), dict) and isinstance(key["keys"].get(str(version)), dict))
        require(key["keys"][str(version)].get("public_key") == binding["public_key_base64"])


def revoke_purpose(provider, policies, roles, mount, purpose):
    require(purpose in PURPOSES and re.fullmatch(r"[a-z0-9_-]{1,128}", mount))
    selected = [(name, doc) for name, doc in policies.items() if name.endswith("-" + purpose)]
    require(len(selected) == 1)
    name, policy = selected[0]
    role_names = [n for n, spec in roles.items() if spec["token_policies"] == [name]]
    require(len(role_names) == 1)
    for role_name in role_names:
        path = "auth/" + mount + "/role/" + role_name
        current = provider.request("GET", path)
        if current is not None:
            _kek.role_matches(current["data"], roles[role_name])
            provider.request("DELETE", path)
        require(provider.request("GET", path) is None)
    path = "sys/policies/acl/" + name
    current = provider.request("GET", path)
    if current is not None:
        require(_kek.policy_document(current) == policy)
        provider.request("DELETE", path)
    require(provider.request("GET", path) is None)
    return {"status": "signing_purpose_absence_verified", "purpose": purpose,
            "policy": name, "roles": role_names, "original_signing_revoked": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("plan", "plan-sha256", "endpoint", "ca-file", "ca-sha256", "operator-token-file", "jwt-mount", "jwt-config-sha256"):
        parser.add_argument("--" + name, required=True)
    mutation = parser.add_mutually_exclusive_group()
    mutation.add_argument("--apply", action="store_true")
    mutation.add_argument("--revoke", choices=PURPOSES)
    args = parser.parse_args(argv)
    provider = None
    try:
        raw = Path(args.plan).read_bytes()
        require(len(raw) <= 65536 and re.fullmatch(r"[0-9a-f]{64}", args.plan_sha256))
        require(hashlib.sha256(raw).hexdigest() == args.plan_sha256)
        bindings, policies, roles = reviewed_plan(raw, args.endpoint)
        require(re.fullmatch(r"[a-z0-9_-]{1,128}", args.jwt_mount) and re.fullmatch(r"[0-9a-f]{64}", args.jwt_config_sha256))
        if not args.apply and not args.revoke:
            print(json.dumps({"status": "review_only_not_applied", "policies": list(policies), "roles": list(roles)}))
            return 0
        provider = _kek.Provider(args.endpoint, args.ca_file, args.ca_sha256, args.operator_token_file)
        if args.revoke:
            print(json.dumps(revoke_purpose(provider, policies, roles, args.jwt_mount, args.revoke)))
            return 0
        verify_provider_keys(provider, bindings)
        receipt = _kek.apply(provider, policies)
        receipt["roles"] = _kek.apply_roles(provider, args.jwt_mount, args.jwt_config_sha256, roles)
        receipt["status"] = "signing_policy_and_role_readback_verified"
        receipt["original_signing_authorized"] = False
        print(json.dumps(receipt))
        return 0
    except Exception:
        print(json.dumps({"status": "failed_or_outcome_unknown", "next": "read back the exact reviewed names; do not broaden signing ACLs"}))
        return 1
    finally:
        if provider:
            provider.close()


if __name__ == "__main__":
    sys.exit(main())
