"""Local mocks only; python -B prevents compiled test artifacts."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("preflight", ROOT / "scripts/system-backup-a-provider-handoff-preflight.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
H = json.loads((ROOT / "docs/evidence/system-backup-d-provider-lab-handoff-20260924.json").read_text())["handoff"]


class HandoffPreflightTests(unittest.TestCase):
    def run_probe(self, failure=None):
        h = copy.deepcopy(H)
        h["ca_sha256"] = hashlib.sha256(b"synthetic ca").hexdigest()
        h["bootstrap_client_sha256"] = hashlib.sha256(b"synthetic client").hexdigest()
        calls = []

        def kube(*args):
            calls.append(args)
            self.assertFalse(any(a in args for a in ["apply", "create", "delete", "patch", "replace"]))
            if "secret" in args:
                self.assertNotIn("json", args)
                self.assertEqual(args[-1], 'jsonpath={.metadata.uid}{"|"}{.metadata.resourceVersion}{"|"}{.immutable}')
                self.assertNotIn("lab-recovery", args)
                ref = h["identity_refs"][args[4]]
                return ref["uid"] + "|" + ("drift" if failure == "secret" else ref["resource_version"]) + "|true"
            if "current-context" in args:
                return probe.CONTEXT
            if "view" in args:
                return ("true" if failure == "api_tls" else "false") if "insecure" in args[-1] else "https://synthetic-api"
            if "namespace" in args:
                if failure == "namespace":
                    return "wrong-uid"
                return probe.SOURCE_UID if probe.SOURCE in args else h["namespace_uid"]
            if "configmap" in args:
                data = {"ca.crt": "synthetic ca", "client.py": "synthetic client"}
                if failure == "ca":
                    data["ca.crt"] = "wrong ca"
                return json.dumps({"data": data})
            if "exec" in args:
                self.assertIn("-B", args)
                self.assertIn(h["kms"]["endpoint"], args)
                return "FAIL" if failure == "tls" else "A_PROVIDER_TLS_OK"
            if "pod" in args:
                if "json" not in args:
                    return "drift" if failure == "pod_uid" else "synthetic-pod-uid"
                volumes = [{"name": "trust", "configMap": {"name": "lab-trust"}}, {"name": "tmp", "emptyDir": {}}]
                if failure == "secret_mount":
                    volumes.append({"name": "secret", "secret": {"secretName": "lab-recovery"}})
                return json.dumps({"metadata": {"uid": "synthetic-pod-uid"}, "spec": {
                    "automountServiceAccountToken": False, "containers": [{"name": "lab-tools", "image": "wrong" if failure == "image" else h["tools_image"]}],
                    "volumes": volumes}, "status": {"phase": "Running", "conditions": [{"type": "Ready", "status": "True"}]}})
            raise AssertionError("unexpected kubectl call")

        return probe.preflight(h, kube), calls

    def test_positive_has_no_credential_or_capability_claim(self):
        result, calls = self.run_probe()
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["identity_refs_checked"], 8)
        for field in ["secret_values_extracted", "token_validity_verified", "provider_capability_approved", "temporary_artifacts_created", "evidence_registered"]:
            self.assertIs(result[field], False)
        self.assertEqual(sum("secret" in args for args in calls), 16)

    def test_binding_and_tls_failures_reject(self):
        for reason in ["namespace", "api_tls", "ca", "secret", "image", "secret_mount", "tls", "pod_uid"]:
            with self.subTest(reason=reason), self.assertRaises(ValueError):
                self.run_probe(reason)

    def test_in_pod_tls_code_compiles_without_files(self):
        compile(probe.TLS_PROBE, "tls-probe", "exec")
        self.assertIn("ssl.create_default_context", probe.TLS_PROBE)
        self.assertIn("server_hostname=url.hostname", probe.TLS_PROBE)


if __name__ == "__main__":
    unittest.main()
