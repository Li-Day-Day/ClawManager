import base64
import copy
import datetime
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent


def load(name, **values):
    m = types.ModuleType(name)
    m.__dict__.update(values)
    exec((ROOT / (name + ".py")).read_text(encoding="utf-8"), m.__dict__)
    return m


C = load("system-backup-d-lifecycle-client")
A = load("system-backup-d-lifecycle-audit")
R = load("system-backup-d-lifecycle", BASE_SOURCE=(ROOT / "system-backup-a-evidence-spike.py").read_text(),
         CLIENT_SOURCE=(ROOT / "system-backup-d-lifecycle-client.py").read_text())
H = json.loads((ROOT.parent / "docs/evidence/system-backup-d-provider-lab-handoff-20260924.json").read_text())["handoff"]
RUN = "d-lc-" + "a" * 24
UID = "11111111-1111-1111-1111-111111111111"
O = {"run_id": RUN, "owner_uid": UID, "handoff": H}
CIPHER = "vault:v1:" + base64.b64encode(b"synthetic cipher").decode()


class LifecycleTests(unittest.TestCase):
    def test_policy_cutover_retains_only_historical_unwrap(self):
        old = C.policy(H, RUN, "generate", "old")["path"]
        new = C.policy(H, RUN, "generate", "new")["path"]
        self.assertFalse(set(old) & set(new))
        decrypt = C.policy(H, RUN, "unwrap", "new")["path"]
        self.assertEqual(len(decrypt), 2)
        for v in decrypt.values():
            self.assertEqual(v["allowed_parameters"]["context"], [C.context(H, RUN)])
        for role in C.PURPOSES:
            paths = C.policy(H, RUN, role, "new")["path"]
            self.assertEqual(len(paths), 1)
            entry = next(iter(paths.values()))
            self.assertEqual(entry["required_parameters"], ["input", "key_version"])
            self.assertEqual(entry["allowed_parameters"]["key_version"], ["1"])
            body = json.loads(base64.b64decode(entry["allowed_parameters"]["input"][0]))
            self.assertEqual(body["purpose"], C.PURPOSES[role])
            self.assertEqual(body["ref"]["namespace_uid"], H["namespace_uid"])

    def test_no_baseline_or_unbounded_key_names(self):
        for run in ("d-kek-v1", RUN + "/../d-kek-v1", "", "d-lc-" + "x" * 24):
            with self.assertRaises(ValueError):
                C.key_name(run, "kms", "old")
        with self.assertRaises(ValueError):
            C.key_name(RUN, "root", "old")

    def test_single_identity_and_separate_control_pod(self):
        for role in ("admin", "expire-generate", "revoke-capture", "control-unwrap"):
            pod = R.manifest(H, RUN, role, UID)
            R.check_pod(pod, H, RUN, role, UID)
            secret = pod["spec"]["volumes"][1]["secret"]
            self.assertEqual(secret["secretName"], "lab-recovery" if role == "admin" else RUN + "-" + role)
            self.assertEqual(len(secret["items"]), 1)
            self.assertFalse(pod["spec"]["automountServiceAccountToken"])
            bad = copy.deepcopy(pod)
            bad["spec"]["containers"][0]["env"] = [{"name": "TOKEN", "value": "unsafe"}]
            with self.assertRaises(ValueError):
                R.check_pod(bad, H, RUN, role, UID)
            bad = copy.deepcopy(pod)
            bad["metadata"]["ownerReferences"][0]["uid"] = "other"
            with self.assertRaises(ValueError):
                R.check_pod(bad, H, RUN, role, UID)

    def test_token_cleanup_filters_run_owner_namespace_and_policy(self):
        own = {"meta": C.metadata(O, "generate", "revoke"), "policies": [RUN + "-generate"]}
        other = copy.deepcopy(own)
        other["meta"]["owner_uid"] = "different"
        class Bao:
            def call(self, method, path, body=None, expected=None):
                if method == "LIST":
                    return 200, {"data": {"keys": ["ours", "other", "expired"]}}
                if body["accessor"] == "expired":
                    return 400, {}
                return 200, {"data": own if body["accessor"] == "ours" else other}
        self.assertEqual([a for a, _ in C.owned_tokens(Bao(), O)], ["ours"])
        own["policies"] = ["root"]
        with self.assertRaises(ValueError):
            C.owned_tokens(Bao(), O)

    def test_key_cleanup_missing_or_drifted_fingerprint_never_deletes(self):
        info = {"latest_version": 1, "exportable": False, "allow_plaintext_backup": False,
                "name": C.key_name(RUN, "kms", "old"), "type": "aes256-gcm96", "keys": {"1": 123}, "derived": True}
        calls = []
        class Bao:
            def call(self, method, path, body=None, expected=None):
                calls.append(method)
                return 200, {"data": info}
        for fingerprint in (None, "wrong"):
            with self.assertRaises(ValueError):
                C.control(Bao(), dict(O, action="key-remove", role="kms", generation="old", fingerprint=fingerprint))
        self.assertEqual(calls, ["GET", "GET"])
        drift = copy.deepcopy(info)
        drift["keys"]["1"] += 1
        self.assertNotEqual(C.snapshot(info), C.snapshot(drift))

    def test_data_never_emits_dek_or_provider_error_body(self):
        plain = base64.b64encode(b"p" * 32).decode()
        class Bao:
            code = 200
            def call(self, *a):
                return self.code, {"data": {"plaintext": plain, "ciphertext": CIPHER}, "errors": ["raw-secret"]}
        b = Bao()
        v = C.data(b, dict(O, role="generate", generation="old"))
        self.assertNotIn(plain, json.dumps(v))
        self.assertNotIn("raw-secret", json.dumps(v))
        b.code = 403
        self.assertEqual(C.data(b, dict(O, role="generate", generation="old")), {"http_status": 403})

    def test_lifecycle_requires_expiry_positive_and_live_controls(self):
        # Virtual time tests ordering only; this is not evidence of real expiry.
        r = R.Run(H, RUN, {})
        wall, mono, calls = [1000.0], [0.0], []
        def issue(role, group):
            r.refs[group + "-" + role] = {"expire_time": datetime.datetime.fromtimestamp(wall[0] + 240, datetime.timezone.utc).isoformat(), "ttl_seconds": 240}
            return mono[0]
        def probe(role, generation="old", group="control", expected=200, **kw):
            calls.append((role, group, expected, mono[0]))
            return {"ciphertext": CIPHER}
        def sleep(seconds):
            wall[0] += seconds
            mono[0] += seconds
        with patch.object(R.time, "time", side_effect=lambda: wall[0]), patch.object(R.time, "monotonic", side_effect=lambda: mono[0]), patch.object(R.time, "sleep", side_effect=sleep), patch.object(r, "issue", side_effect=issue), patch.object(r, "probe", side_effect=probe), patch.object(r, "admin") as admin:
            r.lifecycle_matrix()
        self.assertEqual(len(r.checks), 10)
        self.assertTrue(all(call.args[0] == "revoke" for call in admin.call_args_list))
        for i, (role, group, code, t) in enumerate(calls):
            if code == 403:
                self.assertEqual(calls[i-1][1:3], ("control", 200))
                self.assertEqual(calls[i+1][1:3], ("control", 200))
            if group == "expire" and code == 403:
                earlier = [x for x in calls[:i] if x[:3] == (role, "expire", 200)][0]
                self.assertGreaterEqual(t - earlier[3], 250)
        with patch.object(r, "probe", side_effect=ValueError()), patch.object(r, "issue"), patch.object(r, "admin"):
            with self.assertRaises(ValueError):
                r.lifecycle_matrix()

    def test_rotation_checks_real_data_results_and_denials(self):
        r = R.Run(H, RUN, {})
        r.keys = {role + "-" + g: {"public_key_base64": "public", "fingerprint": "fingerprint"} for role in ("kms", *C.PURPOSES) for g in ("old", "new")}
        calls = []
        def probe(role, generation="old", group="control", expected=200, **kw):
            calls.append((role, generation, expected, kw))
            return {"ciphertext": CIPHER, "plaintext_sha256": "hash", "signature_base64": "signature"}
        with patch.object(r, "probe", side_effect=probe), patch.object(r, "admin"), patch.object(r, "invoke", return_value={"http_status": 403}):
            r.rotation_matrix()
        self.assertEqual(len(r.proofs), 6)
        self.assertEqual(len(r.checks), 4)
        self.assertEqual(len([x for x in calls if x[0] == "unwrap" and x[2] == 400]), 2)
        with patch.object(r, "probe", side_effect=probe), patch.object(r, "admin"), patch.object(r, "invoke", return_value={"http_status": 200}):
            with self.assertRaises(ValueError):
                r.rotation_matrix()

    def test_audit_projection_omits_raw_fields_and_unrelated_records(self):
        v = {"time": "2026-09-24T01:00:00Z", "type": "response", "request": {"id": UID, "path": "transit/keys/" + RUN + "-kms-old",
             "operation": "update", "data": {"token": "secret"}}, "auth": {"client_token": "secret", "accessor": "hmac"}, "response": {"data": {"plaintext": "secret"}}, "error": "sensitive details"}
        o = {"paths": [v["request"]["path"]], "request_ids": [], "identities": {"hmac": "control-generate"}, "started_at": "2026-09-24T00:59:00Z"}
        rows = A.project([json.dumps(v)], o)
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["error"])
        self.assertNotIn("secret", json.dumps(rows))
        self.assertNotIn("sensitive", json.dumps(rows))
        v["request"]["path"] = "unrelated"
        self.assertEqual(A.project([json.dumps(v)], o), [])

    def test_uid_replacement_blocks_delete(self):
        with patch.object(R, "guard"), patch.object(R.base, "get", return_value={"metadata": {"uid": "replaced"}}), patch.object(R.base, "kube") as kube:
            with self.assertRaises(ValueError):
                R.remove("pod", RUN + "-admin", H, UID)
            kube.assert_not_called()

    def test_failure_still_cleans_and_cleanup_failure_retains_intent(self):
        def opened(r, action):
            r.owner = UID
        with patch.object(R.Run, "open", opened), patch.object(R.Run, "ready"), patch.object(R.Run, "create_inputs", side_effect=ValueError()), patch.object(R.Run, "cleanup") as clean, patch.object(R.Run, "audit", return_value=[]), patch.object(R.Run, "finish"):
            v = R.execute({"run_id": RUN, "action": "run"}, H, {})
            self.assertEqual(v["status"], "failed")
            self.assertTrue(v["cleanup_verified"])
            clean.assert_called_once()
        with patch.object(R.Run, "open", opened), patch.object(R.Run, "ready"), patch.object(R.Run, "cleanup", side_effect=ValueError()), patch.object(R.base, "get", return_value=None):
            v = R.execute({"run_id": RUN, "action": "cleanup"}, H, {})
            self.assertFalse(v["cleanup_verified"])
            self.assertTrue(v["recovery_intent_retained"])


if __name__ == "__main__":
    unittest.main()
