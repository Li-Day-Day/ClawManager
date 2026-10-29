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
        if path.endswith("/config"): return self.config
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


if __name__ == "__main__": unittest.main()
