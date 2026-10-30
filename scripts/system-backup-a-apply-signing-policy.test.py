"""Offline checks for reviewed signing ACLs; no provider or workload writes."""
import base64
import copy
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("signing_policy", ROOT / "system-backup-a-apply-signing-policy.py")
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)


def fixture():
    endpoint = "https://provider.example:8200"
    purposes = signing.PURPOSES
    return {
        "contract": "system-backup-a-signing-acl.v1",
        "status": "review_only_not_authorized",
        "installation_id": "installation_test",
        "bindings": [{"purpose": purpose, "installation_id": "installation_test", "key_id": purpose,
                      "registry_version": "registry-v1", "endpoint": endpoint, "key_name": purpose,
                      "provider_version": str(i + 1), "public_key_base64": base64.b64encode(bytes([i + 1]) * 32).decode()}
                     for i, purpose in enumerate(purposes)],
        "workloads": [{"purpose": purpose, "namespace": "backup", "service_account": "signer-" + str(i),
                       "service_account_uid": "sa-" + str(i), "pod_uid": "pod-" + str(i)}
                      for i, purpose in enumerate(purposes)],
    }


def review(plan):
    return signing.reviewed_plan(json.dumps(plan, separators=(",", ":")).encode(), "https://provider.example:8200")


class SigningPolicyTests(unittest.TestCase):
    def test_three_policies_bind_exact_key_and_numeric_version(self):
        bindings, policies, roles = review(fixture())
        self.assertEqual(set(bindings), set(signing.PURPOSES))
        self.assertEqual(len(policies), 3)
        self.assertEqual(len(roles), 3)
        for purpose in signing.PURPOSES:
            name, policy = next((n, p) for n, p in policies.items() if n.endswith("-" + purpose))
            rule = policy["path"]["transit/sign/" + purpose]
            self.assertEqual(rule, {"capabilities": ["update"],
                                    "required_parameters": ["input", "key_version"],
                                    "allowed_parameters": {"input": [], "key_version": [bindings[purpose]["provider_version"]]}})
            role = next(r for r in roles.values() if r["token_policies"] == [name])
            self.assertEqual(role["bound_audiences"], ["clawmanager-backup-signing-" + purpose])
            self.assertEqual(role["token_type"], "batch")
            self.assertEqual(role["token_ttl"], 20)
            self.assertTrue(role["token_no_default_policy"])
            self.assertEqual(role["bound_claims"]["/kubernetes.io/pod/uid"],
                             "pod-" + str(signing.PURPOSES.index(purpose)))

    def test_closed_plan_rejects_self_claim_and_cross_purpose_binding(self):
        for name, change in {
            "wrong contract": lambda p: p.update(contract="candidate"),
            "claimed authorization": lambda p: p.update(status="authorized"),
            "extra flag": lambda p: p.update(approved=True),
            "missing purpose": lambda p: p["bindings"].pop(),
            "duplicate purpose": lambda p: p["bindings"][1].update(purpose=p["bindings"][0]["purpose"]),
            "shared provider key": lambda p: p["bindings"][1].update(key_name=p["bindings"][0]["key_name"]),
            "shared public key": lambda p: p["bindings"][1].update(public_key_base64=p["bindings"][0]["public_key_base64"]),
            "wrong version": lambda p: p["bindings"][0].update(provider_version="latest"),
            "wrong endpoint": lambda p: p["bindings"][0].update(endpoint="https://other.example"),
            "wrong installation": lambda p: p["bindings"][0].update(installation_id="other"),
            "wrong workload": lambda p: p["workloads"][0].update(pod_uid="bad\nuid"),
        }.items():
            with self.subTest(name=name):
                plan = copy.deepcopy(fixture())
                change(plan)
                with self.assertRaises(Exception):
                    review(plan)

    def test_duplicate_json_members_are_rejected(self):
        raw = json.dumps(fixture(), separators=(",", ":")).encode()
        raw = raw.replace(b'"contract":', b'"contract":"fake","contract":', 1)
        with self.assertRaises(Exception):
            signing.reviewed_plan(raw, "https://provider.example:8200")

    def test_provider_public_keys_are_pinned_before_policy_write(self):
        bindings, _, _ = review(fixture())
        values = {}
        for binding in bindings.values():
            version = binding["provider_version"]
            values["transit/keys/" + binding["key_name"]] = {"data": {
                "type": "ed25519", "derived": False, "latest_version": int(version),
                "min_available_version": 1, "min_encryption_version": 0,
                "deletion_allowed": False, "exportable": False,
                "keys": {version: {"public_key": binding["public_key_base64"]}},
            }}

        class Provider:
            def request(self, method, path, body=None):
                self_calls.append((method, path))
                return values[path]

        self_calls = []
        signing.verify_provider_keys(Provider(), bindings)
        self.assertEqual(len(self_calls), 3)
        values["transit/keys/capture_certificate"]["data"]["keys"]["1"]["public_key"] = "different"
        with self.assertRaises(Exception):
            signing.verify_provider_keys(Provider(), bindings)

    def test_revoke_removes_only_selected_role_and_policy(self):
        _, policies, roles = review(fixture())
        current = {"sys/policies/acl/" + name: {"data": {"policy": json.dumps(doc)}} for name, doc in policies.items()}
        current.update({"auth/signing_jwt/role/" + name: {"data": spec} for name, spec in roles.items()})

        class Provider:
            def request(self, method, path, body=None):
                if method == "GET":
                    return current.get(path)
                if method == "DELETE":
                    current.pop(path)
                    return {}
                raise AssertionError("unexpected write")

        receipt = signing.revoke_purpose(Provider(), policies, roles, "signing_jwt", "capture_certificate")
        self.assertEqual(receipt["status"], "signing_purpose_absence_verified")
        self.assertFalse(receipt["original_signing_revoked"])
        self.assertEqual(len(current), 4)
        self.assertTrue(all("capture_certificate" not in path for path in current))


if __name__ == "__main__":
    unittest.main()
