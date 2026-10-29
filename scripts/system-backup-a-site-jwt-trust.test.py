import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("site_jwt", root / "scripts/system-backup-a-site-jwt-trust.py")
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class SiteTests(unittest.TestCase):
    def run_site(self, mode):
        name = "a-jwt-trust-0000000000000000"
        live = None
        deleted = []
        commands = []

        def get(kind, resource, namespace=None):
            if kind == "namespace": return {"metadata": {"uid": s.NS_UID}}
            if kind == "pod": return copy.deepcopy(live)
            raise AssertionError("unexpected read")

        def kube(*args, data=None, **kwargs):
            nonlocal live
            commands.append(args)
            if args[0] == "create":
                live = json.loads(data)
                live["metadata"]["uid"] = "original-uid"
                live["status"] = {"containerStatuses": [{"imageID": s.IMAGE}]}
                if mode == "admission": live["spec"]["containers"][0]["env"] = [{"name": "UNREVIEWED", "value": "yes"}]
                if mode == "unknown-create": raise s.trust.support.Rejected()
                return json.dumps(live).encode()
            if "wait" in args:
                if mode == "wait": raise s.trust.support.Rejected()
                return b""
            if "exec" in args:
                payload = json.loads(data)
                self.assertEqual(set(payload["sources"]), {"system-backup-a-apply-jwt-trust.py", "system-backup-a-apply-kek-policy.py"})
                self.assertNotIn("token", payload)
                if mode == "exec": raise s.trust.support.Rejected()
                if mode == "replacement": live["metadata"]["uid"] = "replacement-uid"
                return json.dumps({"status": "jwt_trust_readback_verified", "mount": "reviewed", "created": True,
                                   "config_request_sha256": "public", "config_readback_sha256": "public",
                                   "roles_created": False, "credentials_created": False, "task_authorized": False}).encode()
            if args[0] == "delete":
                self.assertEqual(json.loads(data)["preconditions"], {"uid": "original-uid"})
                deleted.append(live["metadata"]["uid"])
                live = None
                return b""
            raise AssertionError("unexpected command")

        with patch.object(s, "guard", return_value={"uid": "root-ref", "resource_version": "1"}), patch.object(s, "get", side_effect=get), patch.object(s, "kube", side_effect=kube):
            if mode == "valid":
                self.assertTrue(s.execute(b"public-plan", name)["temporary_control_pod_removed"])
            else:
                with self.assertRaises(s.trust.support.Rejected): s.execute(b"public-plan", name)
        self.assertEqual(deleted, [] if mode == "replacement" else ["original-uid"])
        if mode in ("admission", "wait", "unknown-create"):
            self.assertFalse(any("exec" in cmd for cmd in commands))

    def test_cleanup_after_success_failure_and_unknown_create(self):
        for mode in ("valid", "admission", "wait", "exec", "unknown-create", "replacement"):
            with self.subTest(mode=mode): self.run_site(mode)

    def test_no_secret_data_or_runtime_identity_mount(self):
        pod = s.manifest("a-jwt-test")
        self.assertFalse(pod["spec"]["automountServiceAccountToken"])
        self.assertEqual(pod["spec"]["volumes"][1]["secret"]["items"], [{"key": "root_token", "path": "root_token"}])
        self.assertEqual(pod["spec"]["volumes"][1]["secret"]["defaultMode"], 0o400)
        self.assertEqual(pod["spec"]["containers"][0]["image"], s.IMAGE)

    def test_published_plan_byte_pin(self):
        raw = (root / "docs/evidence/a-site-kek-jwt-trust-prepared-20261029.json").read_bytes()
        self.assertEqual(s.hashlib.sha256(raw).hexdigest(), s.PLAN_SHA)
        self.assertNotIn(b"\r", raw)
        s.trust.reviewed_plan(s.trust.support.decode(raw))


if __name__ == "__main__": unittest.main()
