import base64
import copy
import hashlib
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
def load(name, filename, **values):
    module = types.ModuleType(name)
    module.__dict__.update(values)
    exec((ROOT / "scripts" / filename).read_text(), module.__dict__)
    return module

client = load("client", "system-backup-a-kms-signing-client.py")
runner = load("runner", "system-backup-a-kms-signing-spike.py", BASE_SOURCE=(ROOT / "scripts/system-backup-a-evidence-spike.py").read_text())
H = json.loads((ROOT / "docs/evidence/system-backup-d-provider-lab-handoff-20260924.json").read_text())["handoff"]
RID = "a-ks-" + "1" * 24
CIPHER = "vault:v1:" + base64.b64encode(b"synthetic ciphertext").decode()

class KmsSigningTests(unittest.TestCase):
    def options(self, action, **kw):
        return {"handoff": H, "run_id": RID, "action": action, **kw}

    def test_exact_wire_parameters(self):
        self.assertEqual(client.request_plan(self.options("generate"))[2], {"context": H["kms"]["context_base64"], "bits": "256"})
        self.assertEqual(client.request_plan(self.options("sign", purpose="capture_certificate"))[2]["key_version"], "1")
        with self.assertRaises(ValueError):
            client.request_plan(self.options("rotate", purpose="capture_certificate"))

    def test_no_plaintext_or_raw_errors_in_client_output(self):
        raw = b"a" * 32
        result = client.sanitize(self.options("generate"), 200, {"data": {"plaintext": base64.b64encode(raw).decode(), "ciphertext": CIPHER}})
        self.assertEqual(result["plaintext_sha256"], hashlib.sha256(raw).hexdigest())
        self.assertNotIn(base64.b64encode(raw).decode(), json.dumps(result))
        self.assertEqual(client.sanitize(self.options("generate"), 403, {"errors": ["SECRET"]}), {"status": "ok", "http_status": 403})
        with self.assertRaises(ValueError):
            client.sanitize(self.options("generate"), 200, {"data": {"plaintext": "YQ==", "ciphertext": CIPHER}})

    def test_five_single_identity_pods(self):
        for role, alias in runner.ROLES.items():
            pod = runner.pod_manifest(H, RID, role, "owner")
            secret = pod["spec"]["volumes"][1]["secret"]
            self.assertEqual(secret["secretName"], alias)
            self.assertEqual(secret["items"], [{"key": "token", "path": "token"}])
            runner.check_pod(pod, H, RID, role, "owner")
            pod["spec"]["containers"][0]["volumeMounts"][1]["mountPath"] = "/wrong"
            with self.assertRaises(ValueError):
                runner.check_pod(pod, H, RID, role, "owner")

    def test_positive_controls_and_partial_progress(self):
        checks, proofs, calls = [], [], []
        def call(role, action, **kw):
            calls.append((role, action))
            if (role, action) == ("generate", "generate"):
                return {"http_status": 200, "plaintext_sha256": "a" * 64, "ciphertext": CIPHER}
            if (role, action) == ("unwrap", "unwrap"):
                return {"http_status": 200, "plaintext_sha256": "a" * 64}
            if action == "metadata":
                return {"http_status": 200, "metadata_matches": True}
            if action == "sign" and kw["purpose"] == runner.PURPOSES[role]:
                return {"http_status": 200, "signature": "public-test-proof"}
            return {"http_status": 403}
        runner.matrix(call, RID, checks, proofs)
        self.assertEqual(len(checks), 18)
        self.assertEqual(len(proofs), 3)
        with self.assertRaises(ValueError):
            runner.matrix(lambda *a, **kw: {"http_status": 403}, RID, [], [])
        partial = []
        def wrong_roundtrip(role, action, **kw):
            v = call(role, action, **kw)
            if role == "unwrap" and action == "unwrap":
                v["plaintext_sha256"] = "b" * 64
            return v
        with self.assertRaises(ValueError):
            runner.matrix(wrong_roundtrip, RID, partial, [])
        self.assertEqual(partial, [])

    def test_cleanup_runs_after_matrix_failure(self):
        journal = runner.base.journal(H, RID)
        journal["metadata"]["uid"] = "owner"
        def get(kind, name, ns):
            return None
        with patch.object(runner, "guard"), patch.object(runner.base, "get", side_effect=get), patch.object(runner.base, "create", return_value=journal), patch.object(runner.base, "ready"), patch.object(runner, "matrix", side_effect=ValueError()), patch.object(runner.base, "delete_owned") as delete:
            value = runner.execute({"run_id": RID, "action": "run"}, H)
            self.assertEqual(value["status"], "failed")
            self.assertTrue(value["pods_removed"])
            self.assertFalse(value["recovery_intent_retained"])
            delete.assert_called_once_with("configmap", RID, H["namespace"], "owner")

    def test_cleanup_failure_retains_intent(self):
        journal = runner.base.journal(H, RID)
        journal["metadata"]["uid"] = "owner"
        with patch.object(runner, "guard"), patch.object(runner.base, "get", side_effect=[journal, None, None, None, None, None]), patch.object(runner.base, "delete_owned", side_effect=ValueError()):
            value = runner.execute({"run_id": RID, "action": "cleanup"}, H)
            self.assertEqual(value["status"], "failed")
            self.assertTrue(value["recovery_intent_retained"])

if __name__ == "__main__":
    unittest.main()
