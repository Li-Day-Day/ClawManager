"""Local-only crypto vectors and failure/cleanup mocks. Run with -B."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


client = load("evclient", "system-backup-a-evidence-client.py")
runner = load("evrunner", "system-backup-a-evidence-spike.py")
H = json.loads((ROOT / "docs/evidence/system-backup-d-provider-lab-handoff-20260924.json").read_text())["handoff"]
RID = "a-ev-" + "1" * 24


class EvidenceSpikeTests(unittest.TestCase):
    def test_aws_published_sigv4_vector(self):
        # Public synthetic AWS example, never a real credential:
        # https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html
        headers = client.sign("GET", "/test.txt", "", "examplebucket.s3.amazonaws.com", b"", {"range": "bytes=0-9"},
                              "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "20130524T000000Z")
        self.assertTrue(headers["authorization"].endswith("Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"))

    def test_mutations_only_use_two_owned_keys(self):
        for action in ("put", "put-conflict", "put-bad-checksum", "delete", "get", "range", "outside-get", "list"):
            method, key, _, body, headers = client.request_plan(action, RID)
            if method in ("PUT", "DELETE"):
                self.assertIn(key, runner.plan(H, RID)["keys"])
            if method == "PUT":
                self.assertEqual(headers["if-none-match"], "*")
                self.assertEqual(headers["x-amz-meta-a-run"], RID)
                self.assertLess(len(body), 1024)
        for invalid in ("../business", "a-ev-123", RID + "/evil"):
            with self.assertRaises(ValueError):
                client.request_plan("delete", invalid)

    def test_one_identity_per_pod_and_no_admin(self):
        for role in ("read", "write", "delete"):
            obj = runner.pod_manifest(H, RID, role, "owner-uid")
            self.assertIs(obj["spec"]["automountServiceAccountToken"], False)
            secrets = [v["secret"]["secretName"] for v in obj["spec"]["volumes"] if "secret" in v]
            self.assertEqual(secrets, ["d-evidence-" + role])
            self.assertNotIn("lab-recovery", json.dumps(obj))
            runner.check_pod(obj, H, RID, role, "owner-uid")
            for field, value in [("image", "wrong"), ("env", [{"name": "BAD", "value": "x"}])]:
                changed = copy.deepcopy(obj)
                changed["spec"]["containers"][0][field] = value
                with self.assertRaises(ValueError):
                    runner.check_pod(changed, H, RID, role, "owner-uid")

    def test_journal_refuses_wrong_namespace_or_keys(self):
        obj = runner.journal(H, RID)
        obj["metadata"]["uid"] = "owned"
        self.assertEqual(runner.check_journal(obj, H, RID), "owned")
        obj["data"]["intent.json"] = json.dumps({**runner.plan(H, RID), "keys": ["business/object"]})
        with self.assertRaises(ValueError):
            runner.check_journal(obj, H, RID)

    def matrix_call(self, role, action, which="payload"):
        value = {"http_status": 403, "error_code": "AccessDenied"}
        if (role, action) == ("write", "put"):
            return {"http_status": 200, "checksum_matches": True, "versioned": False}
        if (role, action) == ("write", "put-conflict"):
            return {"http_status": 412, "error_code": "PreconditionFailed"}
        if (role, action) == ("write", "put-bad-checksum"):
            return {"http_status": 400, "error_code": "BadDigest"}
        if role == "read" and action in ("get", "range"):
            raw = client.payload(RID) if action == "get" else client.payload(RID)[:16]
            return {"http_status": 200 if action == "get" else 206, "body_sha256": hashlib.sha256(raw).hexdigest(),
                    "body_length": len(raw), "range_matches": True, "owner_matches": True, "versioned": False}
        if action == "tls-negative":
            return {"untrusted_ca_rejected": True, "wrong_hostname_rejected": True}
        return value

    def test_full_matrix_and_false_denial_rejection(self):
        checks = runner.matrix(self.matrix_call, RID)
        self.assertEqual(len(checks), 18)
        for http, code in [(403, "SignatureDoesNotMatch"), (200, "none")]:
            def bad(role, action, which="payload"):
                return {"http_status": http, "error_code": code} if (role, action) == ("write", "get") else self.matrix_call(role, action)
            with self.assertRaises(ValueError):
                runner.matrix(bad, RID)

    def test_checksum_variants_are_exact_and_failure_preserves_progress(self):
        for http_status, code, accepted in [(400, "BadDigest", True), (400, "XAmzContentChecksumMismatch", True),
                                            (200, "none", False), (400, "InvalidRequest", False),
                                            (400, "XAmzContentSHA256Mismatch", False), (403, "AccessDenied", False),
                                            (500, "BadDigest", False), (400, "other", False)]:
            with self.subTest(http=http_status, code=code):
                checks = []
                def call(role, action):
                    return {"http_status": http_status, "error_code": code} if action == "put-bad-checksum" else self.matrix_call(role, action)
                if accepted:
                    runner.matrix(call, RID, checks)
                    self.assertEqual(len(checks), 18)
                else:
                    with self.assertRaises(ValueError):
                        runner.matrix(call, RID, checks)
                    self.assertEqual(checks, ["write-sha256", "conditional-create-conflict", "read-content-sha256", "range-content"])

    def test_nonzero_client_exit_preserves_diagnostic_but_not_success(self):
        for value, code in [({"status": "ok", "http_status": 200}, "client_failed"),
                            ({"status": "failed", "error_code": "provider_timeout"}, "provider_timeout"),
                            ({"status": "failed", "error_code": "PRIVATE_RESPONSE"}, "client_failed")]:
            result = SimpleNamespace(returncode=1, stdout=json.dumps(value).encode(), stderr=b"PRIVATE_STDERR")
            with patch.object(runner.subprocess, "run", return_value=result):
                actual = json.loads(runner.kube("exec", client_result=True))
            self.assertEqual(actual, {"status": "failed", "error_code": code})

    def test_observation_and_exception_diagnostics_never_emit_raw_text(self):
        for error in [TimeoutError("PRIVATE_TEXT"), ConnectionError("PRIVATE_TEXT"), ValueError("PRIVATE_TEXT")]:
            self.assertNotIn("PRIVATE_TEXT", json.dumps(client.safe_failure(error)))
        actual = runner.safe_observation({"http_status": 400, "error_code": "XAmzContentChecksumMismatch", "Message": "PRIVATE_TEXT"}, "write", "put-bad-checksum", "payload")
        self.assertEqual(actual["object"], "bad-checksum")
        self.assertEqual(actual["http_status"], 400)
        self.assertNotIn("PRIVATE_TEXT", json.dumps(actual))
        self.assertEqual(runner.safe_observation({"error_code": "PRIVATE_TEXT"}, "read", "get", "payload")["error_code"], "other")

    def test_execute_keeps_partial_progress_after_matrix_failure(self):
        obj = runner.journal(H, RID)
        obj["metadata"]["uid"] = "owned"
        def fail_matrix(call, rid, checks):
            checks.extend(["write-sha256", "conditional-create-conflict", "read-content-sha256", "range-content"])
            runner.stage = "probe_write_put-bad-checksum"
            raise ValueError("PRIVATE_TEXT")
        with patch.object(runner, "guard"), patch.object(runner, "get", side_effect=[None, obj, None, None, None]), \
             patch.object(runner, "create"), patch.object(runner, "ready"), patch.object(runner, "matrix", side_effect=fail_matrix), \
             patch.object(runner, "cleanup_objects"), patch.object(runner, "delete_owned"):
            result = runner.execute({"action": "run", "run_id": RID}, H)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(len(result["checks_passed"]), 4)
        self.assertEqual(result["failed_stage"], "probe_write_put-bad-checksum")
        self.assertIs(result["objects_removed"], True)

    def test_cleanup_requires_owner_and_real_absence(self):
        for change in ({"owner_matches": False}, {"versioned": True}, {"http_status": 403}):
            calls = []
            def bad(role, action, which):
                calls.append((role, action))
                return {"http_status": 200, "error_code": "none", "owner_matches": True, "versioned": False, **change}
            with self.assertRaises(ValueError):
                runner.cleanup_objects(bad)
            self.assertNotIn(("delete", "delete"), calls)
        deleted = set()
        def ok(role, action, which):
            if action == "delete":
                deleted.add(which)
                return {"http_status": 204}
            if which in deleted:
                return {"http_status": 404, "error_code": "NoSuchKey"}
            return {"http_status": 200, "owner_matches": True, "versioned": False}
        runner.cleanup_objects(ok)
        self.assertEqual(deleted, {"payload", "bad-checksum"})
        def ambiguous(role, action, which):
            if action == "delete": return {"http_status": 204}
            return {"http_status": 403, "error_code": "AccessDenied"}
        with self.assertRaises(ValueError): runner.cleanup_objects(ambiguous)

    def test_failure_cleans_pods_and_retains_intent_if_object_cleanup_unknown(self):
        obj = runner.journal(H, RID)
        obj["metadata"]["uid"] = "owned"
        removed = []
        def fake_get(kind, name, ns):
            return obj if kind == "configmap" else None
        with patch.object(runner, "guard"), patch.object(runner, "get", side_effect=fake_get), \
             patch.object(runner, "ready"), patch.object(runner, "cleanup_objects", side_effect=ValueError("unknown")), \
             patch.object(runner, "delete_owned", side_effect=lambda *a: removed.append(a)):
            result = runner.execute({"action": "cleanup", "run_id": RID}, H)
        self.assertEqual(result["status"], "failed")
        self.assertIs(result["pods_removed"], True)
        self.assertIs(result["objects_removed"], False)
        self.assertIs(result["recovery_intent_retained"], True)
        self.assertEqual(removed, [])

    def test_unknown_write_outcome_still_attempts_cleanup_and_never_passes(self):
        obj = runner.journal(H, RID)
        obj["metadata"]["uid"] = "owned"
        with patch.object(runner, "guard"), patch.object(runner, "get", side_effect=[None, obj, None, None, None]), \
             patch.object(runner, "create"), patch.object(runner, "ready"), \
             patch.object(runner, "matrix", side_effect=TimeoutError()), \
             patch.object(runner, "cleanup_objects") as cleanup, patch.object(runner, "delete_owned") as delete:
            result = runner.execute({"action": "run", "run_id": RID}, H)
        cleanup.assert_called_once()
        delete.assert_called_once_with("configmap", RID, H["namespace"], "owned")
        self.assertEqual(result["status"], "failed")
        self.assertIs(result["objects_removed"], True)

    def test_http_error_is_bounded_without_reflecting_credential_or_xml(self):
        ca = b"synthetic CA"
        h = copy.deepcopy(H)
        h["ca_sha256"] = hashlib.sha256(ca).hexdigest()
        class Response:
            status = 403
            def read(self, limit): return b'<Error xmlns="urn:s3"><Code>AccessDenied</Code><Message>PRIVATE_RESPONSE</Message></Error>'
            def getheader(self, key, default=None): return default
        class Connection:
            def request(self, method, path, body, headers):
                assert path.endswith("/payload")
                assert "authorization" in headers
            def getresponse(self): return Response()
            def close(self): pass
        with patch.object(client.Path, "read_bytes", return_value=ca), patch.object(client.Path, "read_text", return_value="SYNTHETIC_CREDENTIAL"), \
             patch.object(client.ssl, "create_default_context"), patch.object(client.http.client, "HTTPSConnection", return_value=Connection()):
            result = client.probe({"handoff": h, "action": "get", "run_id": RID})
        self.assertEqual(result["error_code"], "AccessDenied")
        self.assertNotIn("PRIVATE_RESPONSE", json.dumps(result))
        self.assertNotIn("SYNTHETIC_CREDENTIAL", json.dumps(result))

    def test_delete_uses_api_uid_precondition_and_refuses_replacement(self):
        calls = []
        with patch.object(runner, "get", side_effect=[{"metadata": {"uid": "owned"}}, None]), \
             patch.object(runner, "kube", side_effect=lambda *a, **kw: calls.append((a, kw))):
            runner.delete_owned("pod", RID + "-read", H["namespace"], "owned")
        self.assertEqual(json.loads(calls[0][1]["data"])["preconditions"], {"uid": "owned"})
        with patch.object(runner, "get", return_value={"metadata": {"uid": "other"}}), patch.object(runner, "kube") as k:
            with self.assertRaises(ValueError):
                runner.delete_owned("pod", RID + "-read", H["namespace"], "owned")
            k.assert_not_called()


if __name__ == "__main__":
    unittest.main()
