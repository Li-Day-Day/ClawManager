"""Local contract/side-effect tests; no provider access or credentials."""
import copy
import importlib.util
import json
import hashlib
from pathlib import Path
import subprocess
import unittest

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("apply_kek", root / "scripts/system-backup-a-apply-kek-policy.py")
subject = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subject)


class Provider:
    def __init__(self, state=None):
        self.state = state or {}
        self.writes = []

    def request(self, method, path, body=None):
        if method == "GET":
            return self.state.get(path)
        if method == "DELETE":
            self.writes.append((path, None))
            self.state.pop(path, None)
            return {}
        if method != "POST" or not path.startswith("sys/policies/acl/sbk-backup-"):
            raise AssertionError("unexpected provider mutation")
        self.writes.append((path, body))
        self.state[path] = {"data": {"policy": body["policy"]}}
        return {}


class PolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Differential check against A's JS planner and C's JCS implementation.
        source = """
import {backupTransitPlan} from './scripts/system-backup-a-backup-transit-plan.mjs';
const key={provider:'external-kms',identity_hash:'a'.repeat(64),registry_version:'registry-r17',provider_key_id:'backup-key',provider_version:'3'};
const context={origin_installation_id:'installation_synthetic',backup_public_id:'sbk_test',attempt_no:'1',phase:'capture',part:'workspace',part_index:'0',envelope_id:'env-1',capture_context_hash:'c'.repeat(64)};
console.log(JSON.stringify(backupTransitPlan({installation:context.origin_installation_id,key_name:'backup-key',key},{key,context})));
"""
        result = subprocess.run(["node", "--input-type=module", "-e", source], cwd=root, capture_output=True, check=True, timeout=15)
        cls.plan = json.loads(result.stdout)

    def test_exact_plan_and_content_addressed_names(self):
        policies = subject.policies(self.plan)
        self.assertEqual(len(policies), 2)
        self.assertEqual([len(v["path"]) for v in policies.values()], [1, 1])
        self.assertTrue(all(name.startswith("sbk-backup-") for name in policies))

    def test_reject_broader_acl_and_changed_bindings(self):
        for mode in ("context", "version", "registry", "installation", "key", "part", "bits", "extra-permission", "extra-path", "latest", "extra-field"):
            with self.subTest(mode=mode):
                plan = copy.deepcopy(self.plan)
                key, context = plan["request"]["key"], plan["request"]["context"]
                generate = next(iter(plan["generate_policy"]["path"].values()))
                if mode == "context": plan["context_base64"] = "bad"
                elif mode == "version": key["provider_version"] = "1"
                elif mode == "registry": key["registry_version"] = "changed"
                elif mode == "installation": context["origin_installation_id"] = "other"
                elif mode == "key": key["provider_key_id"] = "other"
                elif mode == "part": context["part"] = "mysql"
                elif mode == "bits": plan["generate_request"]["body"]["bits"] = "128"
                elif mode == "extra-permission": generate["capabilities"].append("create")
                elif mode == "extra-path": plan["generate_policy"]["path"]["transit/*"] = generate
                elif mode == "latest": key["provider_version"] = "0"
                elif mode == "extra-field": context["allow_all"] = "true"
                with self.assertRaises(subject.Rejected): subject.policies(plan)

    def test_apply_and_idempotent_readback(self):
        provider = Provider()
        reviewed = subject.policies(self.plan)
        receipt = subject.apply(provider, reviewed)
        self.assertEqual(len(provider.writes), 2)
        self.assertFalse(receipt["credentials_created"])
        self.assertFalse(receipt["workload_authorized"])
        second = subject.apply(provider, reviewed)
        self.assertEqual(len(provider.writes), 2)
        self.assertTrue(all(not p["created"] for p in second["policies"]))

    def test_existing_conflict_never_overwritten(self):
        reviewed = subject.policies(self.plan)
        first = next(iter(reviewed))
        provider = Provider({"sys/policies/acl/" + first: {"data": {"policy": '{"path":{"*":{"capabilities":["root"]}}}'}}})
        with self.assertRaises(subject.Rejected): subject.apply(provider, reviewed)
        self.assertEqual(provider.writes, [])

    def test_reject_duplicate_json(self):
        with self.assertRaises(subject.Rejected): subject.decode('{"data":1,"data":2}')

    def test_api_policy_response_shapes(self):
        self.assertEqual(subject.policy_document({"policy": "{}"}), {})
        self.assertEqual(subject.policy_document({"data": {"policy": "{}"}}), {})
        with self.assertRaises(subject.Rejected): subject.policy_document({"data": {"policy": "{}"}, "policy": "different"})

    def test_capture_revocation_preserves_recovery(self):
        provider = Provider()
        reviewed = subject.policies(self.plan)
        subject.apply(provider, reviewed)
        result = subject.revoke(provider, reviewed, "generate")
        self.assertEqual(result["operation"], "generate")
        self.assertFalse(result["worker_stopped"])
        self.assertEqual(len(provider.state), 1)
        self.assertTrue(next(iter(provider.state)).endswith("-unwrap"))
        self.assertEqual(len(provider.writes), 3)
        subject.revoke(provider, reviewed, "generate")
        self.assertEqual(len(provider.writes), 3)

    def test_revocation_does_not_delete_conflicting_policy(self):
        provider = Provider()
        reviewed = subject.policies(self.plan)
        subject.apply(provider, reviewed)
        generate = next(name for name in reviewed if name.endswith("-generate"))
        provider.state["sys/policies/acl/" + generate] = {"data": {"policy": "{}"}}
        with self.assertRaises(subject.Rejected): subject.revoke(provider, reviewed, "generate")
        self.assertEqual(len(provider.writes), 2)

    def job_identity(self):
        return {"namespace": "backup", "service_account": "backup-worker", "service_account_uid": "sa-original", "pod_uid": "pod-original", "job_uid": "job-original", "invocation_sha256": "a" * 64, "execution_grant_sha256": "b" * 64, "operation": "backup_dek_generate"}

    def test_roles_bind_exact_pod_and_separate_operation(self):
        identity = self.job_identity()
        roles = subject.workload_roles(subject.policies(self.plan), identity)
        self.assertEqual(len(roles), 1)
        policies = []
        for role in roles.values():
            self.assertEqual(role["bound_claims"]["/kubernetes.io/pod/uid"], "pod-original")
            self.assertEqual(role["bound_claims"]["/kubernetes.io/serviceaccount/uid"], "sa-original")
            self.assertEqual(role["bound_audiences"], ["clawmanager-backup-kek-generate"])
            self.assertEqual(role["token_type"], "batch")
            self.assertTrue(role["token_no_default_policy"])
            self.assertEqual(role["token_explicit_max_ttl"], 20)
            self.assertEqual(role["claim_mappings"]["/kubernetes.io/pod/uid"], "pod_uid")
            policies += role["token_policies"]
        self.assertEqual(len(set(policies)), 1)
        self.assertTrue(policies[0].endswith("-generate"))
        recovery = dict(identity, operation="backup_dek_unwrap", pod_uid="recovery-pod", job_uid="recovery-job")
        unwrap = subject.workload_roles(subject.policies(self.plan), recovery)
        role = next(iter(unwrap.values()))
        self.assertEqual(role["bound_audiences"], ["clawmanager-backup-kek-unwrap"])
        self.assertTrue(role["token_policies"][0].endswith("-unwrap"))
        self.assertEqual(len(unwrap), 1)
        for operation in ("", "backup_dek_sign", "both"):
            with self.assertRaises(subject.Rejected):
                subject.workload_roles(subject.policies(self.plan), dict(identity, operation=operation))
        identity["pod_uid"] = "replacement"
        self.assertTrue(set(roles).isdisjoint(subject.workload_roles(subject.policies(self.plan), identity)))

    def test_role_readback_rejects_broader_authentication(self):
        role = next(iter(subject.workload_roles(subject.policies(self.plan), self.job_identity()).values()))
        for field, value in {"token_policies": ["root"], "token_no_default_policy": False, "bound_claims": {}, "token_type": "service", "groups_claim": "groups", "expiration_leeway": 0, "token_explicit_max_ttl": 3600}.items():
            with self.subTest(field=field):
                changed = copy.deepcopy(role)
                changed[field] = value
                with self.assertRaises(subject.Rejected): subject.role_matches(changed, role)
        subject.role_matches(role, role)

    def test_roles_require_reviewed_mount_and_readback(self):
        config = {"bound_issuer": "https://cluster.example", "jwt_supported_algs": ["RS256"], "jwks_url": "https://cluster.example/openid/v1/jwks"}
        config_sha = hashlib.sha256(subject.canonical(config)).hexdigest()
        class RoleProvider:
            def __init__(self): self.state = {"auth/job-jwt/config": {"data": config}}; self.writes = 0
            def request(self, method, path, body=None):
                if method == "GET": return self.state.get(path)
                if method != "POST" or not path.startswith("auth/job-jwt/role/sbk-job-"): raise AssertionError("unexpected mutation")
                self.writes += 1
                self.state[path] = {"data": copy.deepcopy(body)}
                return {}
        provider = RoleProvider()
        roles = subject.workload_roles(subject.policies(self.plan), self.job_identity())
        with self.assertRaises(subject.Rejected): subject.apply_roles(provider, "job-jwt", "0" * 64, roles)
        self.assertEqual(provider.writes, 0)
        receipt = subject.apply_roles(provider, "job-jwt", config_sha, roles)
        self.assertEqual(provider.writes, 1)
        self.assertTrue(all(x["created"] for x in receipt))
        subject.apply_roles(provider, "job-jwt", config_sha, roles)
        self.assertEqual(provider.writes, 1)
        next(iter(roles.values()))["bound_claims"] = {}
        with self.assertRaises(subject.Rejected): subject.apply_roles(provider, "job-jwt", config_sha, roles)
        self.assertEqual(provider.writes, 1)


if __name__ == "__main__":
    unittest.main()
