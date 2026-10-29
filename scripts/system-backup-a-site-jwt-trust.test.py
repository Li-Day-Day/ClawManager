import copy
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("site_jwt", root / "scripts/system-backup-a-site-jwt-trust.py")
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class SiteTests(unittest.TestCase):
    def run_site(self, mode, inspect=False):
        name = "a-jwt-trust-0000000000000000"
        live = None
        deleted = []
        commands = []
        plan_raw = (root / "docs/evidence/a-site-kek-jwt-trust-prepared-20261029.json").read_bytes()
        plan = json.loads(plan_raw)
        progress = {}

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
                self.assertEqual(payload["mode"], "inspect" if inspect else "apply")
                if mode == "exec": raise s.trust.support.Rejected()
                if mode == "replacement": live["metadata"]["uid"] = "replacement-uid"
                if mode == "provider-failure":
                    return json.dumps({"status": "failed_or_outcome_unknown", "failure_stage": "config_read",
                                       "provider_write_attempted": not inspect}).encode()
                receipt = {"status": "jwt_trust_readback_verified", "mount": plan["mount"],
                           "config_request_sha256": plan["config_request_sha256"], "config_readback_sha256": "a" * 64,
                           "roles_created": False, "credentials_created": False, "task_authorized": False}
                if inspect:
                    receipt.update({"mount_exists": True, "config_exists": True, "provider_mutated": False})
                    if mode == "absent":
                        receipt.update({"status": "jwt_trust_mount_absent", "mount_exists": False,
                                        "config_exists": False, "config_readback_sha256": None})
                else:
                    receipt["created"] = True
                if mode == "wrong-mount": receipt["mount"] = "another-mount"
                return json.dumps(receipt).encode()
            if args[0] == "delete":
                self.assertEqual(json.loads(data)["preconditions"], {"uid": "original-uid"})
                deleted.append(live["metadata"]["uid"])
                live = None
                return b""
            raise AssertionError("unexpected command")

        with patch.object(s, "guard", return_value={"uid": "root-ref", "resource_version": "1"}), patch.object(s, "get", side_effect=get), patch.object(s, "kube", side_effect=kube):
            if mode in ("valid", "absent"):
                self.assertTrue(s.execute(plan_raw, name, inspect=inspect, progress=progress)["temporary_control_pod_removed"])
            else:
                with self.assertRaises(s.trust.support.Rejected): s.execute(plan_raw, name, inspect=inspect, progress=progress)
        self.assertEqual(deleted, [] if mode == "replacement" else ["original-uid"])
        if mode in ("admission", "wait", "unknown-create"):
            self.assertFalse(any("exec" in cmd for cmd in commands))
        expected_stage = {"admission": "temporary_pod_admission", "wait": "temporary_pod_ready",
                          "unknown-create": "temporary_pod_create", "exec": "provider_exec",
                          "provider-failure": "provider_receipt", "wrong-mount": "provider_receipt"}
        if mode in expected_stage:
            self.assertEqual(progress["failure_stage"], expected_stage[mode])
        if mode == "provider-failure": self.assertEqual(progress["provider_failure_stage"], "config_read")
        self.assertEqual(progress["temporary_control_pod_removed"], mode != "replacement")
        if inspect: self.assertFalse(progress["provider_write_attempted"])

    def test_cleanup_after_success_failure_and_unknown_create(self):
        for mode in ("valid", "admission", "wait", "exec", "unknown-create", "replacement", "provider-failure", "wrong-mount"):
            with self.subTest(mode=mode): self.run_site(mode)

    def test_inspection_transports_mode_and_cleans_up_on_failure(self):
        for mode in ("valid", "absent", "provider-failure", "exec"):
            with self.subTest(mode=mode): self.run_site(mode, inspect=True)

    def test_failure_receipt_does_not_print_raw_exception_or_claim_cleanup(self):
        output = io.StringIO()
        with patch.object(s.sys, "argv", ["setup", "--inspect"]), \
             patch.object(s, "guard", side_effect=RuntimeError("private_value_must_not_escape")), \
             contextlib.redirect_stdout(output):
            self.assertEqual(s.main(), 1)
        self.assertNotIn("private_value_must_not_escape", output.getvalue())
        receipt = json.loads(output.getvalue())
        self.assertEqual(receipt["failure_stage"], "preflight")
        self.assertIsNone(receipt["temporary_control_pod_removed"])
        self.assertFalse(receipt["provider_write_attempted"])
        self.assertEqual(receipt["mode"], "inspect")

    def test_only_closed_child_error_stages_are_reported(self):
        progress = {}
        raw = (root / "docs/evidence/a-site-kek-jwt-trust-prepared-20261029.json").read_bytes()
        for failure_stage in ("config_read", "private_value_must_not_escape"):
            with self.subTest(stage=failure_stage):
                receipt = {"status": "failed_or_outcome_unknown", "failure_stage": failure_stage,
                           "provider_write_attempted": False}
                with self.assertRaises(s.trust.support.Rejected):
                    s.validate_receipt(receipt, raw, True, progress)
                self.assertNotIn("private_value_must_not_escape", json.dumps(progress))

    def test_pod_diagnostics_keeps_exit_code_without_free_text(self):
        result = s.pod_diagnostics({"status": {"phase": "Failed", "message": "private_message", "containerStatuses": [
            {"state": {"terminated": {"reason": "ContainerCannotRun", "exitCode": 127, "message": "private_message"}}}]}})
        self.assertEqual(result, {"phase": "Failed", "container_state": "terminated",
                                  "reason": "ContainerCannotRun", "exit_code": 127})
        result = s.pod_diagnostics({"status": {"phase": "private_phase", "containerStatuses": [
            {"state": {"waiting": {"reason": "private_reason", "message": "private_message"}}}]}})
        self.assertEqual(result, {"phase": "unknown", "container_state": "waiting", "reason": "other"})

    def test_config_mismatch_receipt_accepts_field_names_not_values(self):
        raw = (root / "docs/evidence/a-site-kek-jwt-trust-prepared-20261029.json").read_bytes()
        for fields in (["jwt_validation_pubkeys"], ["private_value"], ["status", "status"], [], "bound_issuer"):
            with self.subTest(fields=fields):
                progress = {}
                receipt = {"status": "failed_or_outcome_unknown", "failure_stage": "config_validate",
                           "provider_write_attempted": False, "config_mismatch_fields": fields}
                with self.assertRaises(s.trust.support.Rejected):
                    s.validate_receipt(receipt, raw, True, progress)
                if fields == ["jwt_validation_pubkeys"]:
                    self.assertEqual(progress["config_mismatch_fields"], fields)
                else:
                    self.assertNotIn("config_mismatch_fields", progress)

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
