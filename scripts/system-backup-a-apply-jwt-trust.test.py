import copy
import importlib.util
import json
from pathlib import Path
import unittest

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("apply_jwt", root / "scripts/system-backup-a-apply-jwt-trust.py")
subject = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subject)


class Provider:
    def __init__(self): self.mounts = {}; self.config = None; self.writes = []
    def request(self, method, path, body=None):
        if method == "POST":
            self.writes.append(path)
            if path.startswith("sys/auth/"): self.mounts[path.removeprefix("sys/auth/") + "/"] = copy.deepcopy(body)
            elif path.startswith("auth/") and path.endswith("/config"): self.config = {"data": copy.deepcopy(body)}
            else: raise AssertionError("unapproved mutation")
            return {}
        if path == "sys/auth": return {"data": self.mounts}
        if path.endswith("/tune"): return {"data": {"default_lease_ttl": 20, "max_lease_ttl": 20}}
        if path.endswith("/config"):
            if self.config is None: return None
            result = copy.deepcopy(self.config)
            # Model the pinned OpenBao release, not just the submitted JSON:
            # framework string-list parsing trims PEM boundary whitespace.
            result["data"]["jwt_validation_pubkeys"] = [k.strip() for k in result["data"]["jwt_validation_pubkeys"]]
            result["data"].setdefault("status", "valid")
            return result
        raise AssertionError("unapproved read")


class ApplyTrustTests(unittest.TestCase):
    def setUp(self): self.plan = json.loads((root / "docs/evidence/a-site-kek-jwt-trust-prepared-20261029.json").read_text())
    def test_create_exact_mount_and_idempotent_readback(self):
        provider = Provider()
        result = subject.apply(provider, self.plan)
        self.assertEqual(len(provider.writes), 2)
        self.assertFalse(result["credentials_created"])
        self.assertFalse(result["task_authorized"])
        second = subject.apply(provider, self.plan)
        self.assertFalse(second["created"])
        self.assertEqual(len(provider.writes), 2)
    def test_existing_trust_or_mount_is_not_overwritten(self):
        for mode in ("mount-type", "issuer", "public-key", "remote-jwks"):
            with self.subTest(mode=mode):
                provider = Provider()
                subject.apply(provider, self.plan)
                if mode == "mount-type": provider.mounts[self.plan["mount"] + "/"]["type"] = "userpass"
                elif mode == "issuer": provider.config["data"]["bound_issuer"] = "https://other"
                elif mode == "public-key": provider.config["data"]["jwt_validation_pubkeys"] = []
                elif mode == "remote-jwks": provider.config["data"]["jwks_url"] = "https://other"
                with self.assertRaises(subject.support.Rejected): subject.apply(provider, self.plan)
                self.assertEqual(len(provider.writes), 2)
    def test_changed_plan_cannot_reuse_content_name(self):
        self.plan["config"]["bound_issuer"] = "https://other"
        with self.assertRaises(subject.support.Rejected): subject.reviewed_plan(self.plan)

    def test_inspection_is_get_only_for_absent_partial_and_complete(self):
        for mode, status in (("absent", "jwt_trust_mount_absent"),
                             ("partial", "jwt_trust_config_absent"),
                             ("complete", "jwt_trust_readback_verified")):
            with self.subTest(mode=mode):
                provider = Provider()
                if mode != "absent": subject.apply(provider, self.plan)
                if mode == "partial": provider.config = None
                writes = list(provider.writes)
                original = provider.request
                def readonly(method, path, body=None):
                    self.assertEqual(method, "GET")
                    self.assertIsNone(body)
                    return original(method, path, body)
                provider.request = readonly
                result = subject.inspect(provider, self.plan)
                self.assertEqual(result["status"], status)
                self.assertFalse(result["provider_mutated"])
                self.assertEqual(provider.writes, writes)
                self.assertEqual(result["config_exists"], mode == "complete")

    def test_inspection_rejects_drift_without_repair(self):
        for mode, expected in (("type", "mount_validate"), ("issuer", "config_validate"),
                               ("remote-jwks", "config_validate"), ("ttl", "tune_validate")):
            with self.subTest(mode=mode):
                provider = Provider()
                subject.apply(provider, self.plan)
                if mode == "type": provider.mounts[self.plan["mount"] + "/"]["type"] = "userpass"
                elif mode == "issuer": provider.config["data"]["bound_issuer"] = "https://other"
                elif mode == "remote-jwks": provider.config["data"]["jwks_url"] = "https://other"
                original = provider.request
                def readonly(method, path, body=None):
                    self.assertEqual(method, "GET")
                    if mode == "ttl" and path.endswith("/tune"):
                        return {"data": {"default_lease_ttl": 3600, "max_lease_ttl": 3600}}
                    return original(method, path, body)
                provider.request = readonly
                progress = {}
                with self.assertRaises(subject.support.Rejected):
                    subject.inspect(provider, self.plan, progress)
                self.assertEqual(progress["failure_stage"], expected)
                self.assertEqual(len(provider.writes), 2)

    def test_write_attempt_and_failure_stage_survive_unknown_post(self):
        provider = Provider()
        original = provider.request
        def unknown(method, path, body=None):
            result = original(method, path, body)
            if method == "POST": raise TimeoutError("must_not_be_printed")
            return result
        provider.request = unknown
        progress = {"provider_write_attempted": False}
        with self.assertRaises(TimeoutError): subject.apply(provider, self.plan, progress)
        self.assertEqual(progress, {"provider_write_attempted": True, "failure_stage": "mount_create"})
        self.assertEqual(len(provider.writes), 1)

    def test_exact_key_and_missing_terminal_lf_are_the_only_equivalent_forms(self):
        expected = self.plan["config"]
        actual = {**copy.deepcopy(expected), "status": "valid"}
        subject.matches(actual, expected)
        actual["jwt_validation_pubkeys"] = [k[:-1] for k in expected["jwt_validation_pubkeys"]]
        before = copy.deepcopy(actual)
        subject.matches(actual, expected)
        self.assertEqual(actual, before)
        key = expected["jwt_validation_pubkeys"][0]
        for keys in ([], [key, key], [key.replace("MIIB", "NIIB", 1)], [key.replace("PUBLIC KEY", "CERTIFICATE")],
                     [key + "\n"], [key.replace("\n", "\r\n")], [" " + key], [key + key], [None]):
            with self.subTest(keys=keys):
                actual["jwt_validation_pubkeys"] = keys
                progress = {}
                with self.assertRaises(subject.support.Rejected): subject.matches(actual, expected, progress)
                self.assertEqual(progress["config_mismatch_fields"], ["jwt_validation_pubkeys"])

    def test_normalized_pem_never_normalizes_other_authority_fields(self):
        expected = self.plan["config"]
        for field, value in (("bound_issuer", expected["bound_issuer"] + " "),
                             ("jwt_supported_algs", ["RS256", "HS256"]), ("default_role", "other"),
                             ("status", "invalid"), ("status", None), ("oidc_client_secret", "private_value")):
            with self.subTest(field=field, value=value):
                actual = {**copy.deepcopy(expected), "status": "valid"}
                actual["jwt_validation_pubkeys"] = [k[:-1] for k in expected["jwt_validation_pubkeys"]]
                actual[field] = value
                progress = {}
                with self.assertRaises(subject.support.Rejected): subject.matches(actual, expected, progress)
                self.assertEqual(progress["config_mismatch_fields"], [field])
                self.assertNotIn("private_value", json.dumps(progress))

    def test_readback_hash_covers_provider_bytes_not_normalized_request(self):
        provider = Provider()
        subject.apply(provider, self.plan)
        result = subject.inspect(provider, self.plan)
        actual = provider.request("GET", "auth/" + self.plan["mount"] + "/config")["data"]
        self.assertEqual(result["config_readback_sha256"], subject.hashlib.sha256(subject.canonical(actual)).hexdigest())
        self.assertNotEqual(result["config_readback_sha256"], self.plan["config_request_sha256"])


if __name__ == "__main__": unittest.main()
