"""Offline security checks; no subprocess/network/filesystem writes."""
import base64
import pathlib
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
client = types.ModuleType("signing_client")
exec(compile((ROOT / "system-backup-d-issuer-signing-client.py").read_text(), "client", "exec"), client.__dict__)


def require(ok):
    if not ok:
        raise ValueError("assertion")


class SigningTests(unittest.TestCase):
    def fixture(self):
        return {"run_id": "d-sig-" + "a" * 24, "owner_uid": "12345678-1234-1234-1234-123456789abc",
                "handoff": {"namespace_uid": "lab-uid"}, "role": "provider", "action": "sign",
                "challenges": {"provider": "YQ==", "strong": "Yg=="},
                "candidates": {r: {"key": {"key_path": "transit/keys/" + r}} for r in ("provider", "strong")}}

    def test_policy_has_only_exact_sign_path_and_required_version(self):
        p = client.policy(self.fixture()["candidates"]["provider"])
        self.assertEqual(p, {"path": {"transit/sign/provider": {"capabilities": ["update"],
            "required_parameters": ["input", "key_version"], "allowed_parameters": {"input": [], "key_version": ["1"]}}}})

    def test_data_uses_pinned_string_version_and_one_nonroot_identity(self):
        o, calls = self.fixture(), []
        class Bao:
            def __init__(self, options, control):
                require(not control)
            def call(self, method, path, body=None, expected=(200, 204)):
                calls.append((method, path, body, expected))
                return 200, {"data": {"signature": "vault:v1:" + base64.b64encode(bytes(64)).decode()}}
        result = client.execute(o, types.SimpleNamespace(require=require, Bao=Bao))
        self.assertEqual(result["http_status"], 200)
        self.assertEqual(calls, [("POST", "transit/sign/provider", {"input": "YQ==", "key_version": "1"}, tuple(range(100, 600)))])
        self.assertIs(type(calls[0][2]["key_version"]), str)

    def test_all_negative_requests_require_403(self):
        for kw in ({"target": "strong"}, {"action": "key-read"}, {"action": "revoked"},
                   *({"variant": v} for v in ("omitted", "zero", "wrong", "wrong-string", "extra"))):
            calls = []
            class Bao:
                def __init__(self, options, control):
                    require(not control)
                def call(self, method, path, body=None, expected=(200, 204)):
                    calls.append(expected)
                    return 403, {}
            client.execute(dict(self.fixture(), **kw), types.SimpleNamespace(require=require, Bao=Bao))
            self.assertEqual(calls, [tuple(range(100, 600))])

    def test_unexpected_status_has_only_safe_diagnostic(self):
        class Bao:
            def __init__(self, *args):
                pass
            def call(self, *args):
                return 403, {"errors": ["PRIVATE token=must-not-escape"]}
        with self.assertRaises(client.ClientFailure) as failed:
            client.execute(self.fixture(), types.SimpleNamespace(require=require, Bao=Bao))
        self.assertEqual(failed.exception.diagnostic, {"code": "unexpected_http_status", "http_status": 403})
        self.assertNotIn("PRIVATE", str(failed.exception))

    def test_unexpected_success_on_negative_request_is_failure(self):
        class Bao:
            def __init__(self, *args):
                pass
            def call(self, *args, **kw):
                return 200, {"data": {}}
        for kw in ({"target": "strong"}, {"action": "revoked"}, {"action": "key-read"}):
            with self.assertRaises(client.ClientFailure) as failed:
                client.execute(dict(self.fixture(), **kw), types.SimpleNamespace(require=require, Bao=Bao))
            self.assertEqual(failed.exception.diagnostic["http_status"], 200)

    def test_cleanup_selects_exact_metadata_not_prefix(self):
        o = self.fixture()
        own = client.token_metadata(o, "provider")
        other = dict(own, owner_uid="different")
        policies = [o["run_id"] + "-provider"]
        values = {"ours": {"meta": own, "policies": policies}, "foreign": {"meta": other, "policies": policies}}
        class Bao:
            def call(self, method, path, body=None, expected=(200, 204)):
                return (200, {"data": {"keys": list(values)}}) if method == "LIST" else (200, {"data": values[body["accessor"]]})
        self.assertEqual(client.owned_tokens(Bao(), o, require), ["ours"])
        values["ours"]["policies"] = ["root"]
        with self.assertRaises(ValueError):
            client.owned_tokens(Bao(), o, require)

    def orchestration(self, fail_checks=False, fail_cleanup=False):
        mod = types.ModuleType("orchestration")
        mod.BASE_SOURCE, mod.CLIENT_SOURCE = "", ""
        mod.LIFECYCLE_SOURCE = "import types\nbase=types.SimpleNamespace()\nrequire=lambda ok: None\n"
        exec(compile((ROOT / "system-backup-d-issuer-signing.py").read_text(), "orchestration", "exec"), mod.__dict__)
        events = []
        class FakeRun:
            def __init__(self, *args):
                pass
            def open(self):
                events.append("open")
                return True
            def run_checks(self):
                events.append("checks")
                mod.stage = "provider.sign.wrong"
                if fail_checks:
                    raise ValueError("check failure")
                return {}
            def cleanup(self):
                events.append("cleanup")
                mod.stage = "admin.cleanup.normal"
                if fail_cleanup:
                    raise ValueError("cleanup failure")
        mod.Acceptance = FakeRun
        return mod, events

    def test_cleanup_runs_after_probe_failure_and_preserves_failed_stage(self):
        mod, events = self.orchestration(fail_checks=True)
        with self.assertRaisesRegex(ValueError, "check failure"):
            mod.execute({"action": "run"}, {}, {})
        self.assertEqual(events, ["open", "checks", "cleanup"])
        self.assertEqual(mod.stage, "provider.sign.wrong")
        self.assertTrue(mod.cleanup_completed)

    def test_cleanup_failure_cannot_report_pass(self):
        mod, events = self.orchestration(fail_cleanup=True)
        with self.assertRaisesRegex(ValueError, "cleanup failure"):
            mod.execute({"action": "run"}, {}, {})
        self.assertEqual(events, ["open", "checks", "cleanup"])
        self.assertFalse(mod.cleanup_completed)

    def test_recovery_does_not_run_checks_or_issue_tokens(self):
        mod, events = self.orchestration()
        self.assertTrue(mod.execute({"action": "cleanup", "run_id": "test"}, {}, {})["cleaned"])
        self.assertEqual(events, ["open", "cleanup"])


if __name__ == "__main__":
    unittest.main()
