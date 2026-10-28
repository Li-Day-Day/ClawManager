"""Offline fixture regression; no Docker pulls, kubectl, or network access."""

import base64
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import prepare_k8s_smoke as smoke


IMAGE = "registry.example.test/minio/minio@sha256:" + "a" * 64
SOURCE = smoke.ROOT / "deployments/k8s/single-node/clawmanager.yaml"


class ManifestTests(unittest.TestCase):
    def test_actual_manifest_only_changes_declared_ci_settings(self):
        source = SOURCE.read_text(encoding="utf-8")
        rendered = smoke.render_manifest(source, IMAGE)
        self.assertEqual(rendered.count("image: clawmanager:ci"), 3)
        self.assertIn("image: " + IMAGE, rendered)
        self.assertNotIn("image: minio/minio:latest", rendered)
        self.assertEqual(rendered.count("emptyDir: {}"), 6)
        self.assertIn("claimName: minio-data", rendered)
        self.assertIn("name: wait-secret-broker", rendered)
        self.assertIn("-verify_hostname " + smoke.BROKER_DNS, rendered)
        self.assertIn("-verify_return_error", rendered)
        self.assertIn("name: clawmanager-secret-broker-ca\n            optional: false", rendered)
        self.assertIn('audience: clawmanager-secret-broker', rendered)
        self.assertIn('value: "https://' + smoke.BROKER_DNS + ':9444"', rendered)
        self.assertIn('name: CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE\n              value: "true"', rendered)
        self.assertEqual(SOURCE.read_text(encoding="utf-8"), source)

    def test_source_drift_fails_instead_of_silent_regex_success(self):
        source = SOURCE.read_text(encoding="utf-8")
        for original in ("image: minio/minio:latest", "claimName: mysql-data",
                         "claimName: clawmanager-workspaces", "type: NodePort",
                         "name: clawmanager-app\n  namespace", "nodePort: "):
            with self.subTest(original=original), self.assertRaisesRegex(ValueError, "source drift"):
                smoke.render_manifest(source.replace(original, "drifted"), IMAGE)

    def test_missing_mutable_malformed_or_inline_credentials_rejected(self):
        for image in ("", "minio/minio:latest", "quay.io/minio/minio:latest", "minio/minio",
                      "minio/minio@sha256:" + "a" * 64,
                      "https://" + IMAGE, "user:password@" + IMAGE, IMAGE + "\n",
                      IMAGE[:-1], IMAGE.replace("a" * 64, "g" * 64)):
            with self.subTest(image=image), self.assertRaises(ValueError):
                smoke.validate_minio_image(image)

    def test_validation_never_generates_keys_or_calls_cluster(self):
        with patch.object(smoke, "tls_resources", side_effect=AssertionError("must not create keys")):
            smoke.main(["--validate-inputs", "--minio-image", IMAGE])

    def test_cli_creates_private_manifest_without_logging_or_overwriting(self):
        with tempfile.TemporaryDirectory(prefix="clawmanager-ci-output-") as work:
            output = Path(work) / "install.yaml"
            stdout = io.StringIO()
            fixtures = ({"kind": "ConfigMap", "data": {"ca.crt": "test-ca"}},
                        {"kind": "Secret", "data": {"tls.key": "private-test-material"}})
            args = ["--minio-image", IMAGE, "--output", str(output)]
            with patch.object(smoke, "tls_resources", return_value=fixtures), contextlib.redirect_stdout(stdout):
                smoke.main(args)
                original = output.read_bytes()
                with self.assertRaises(FileExistsError):
                    smoke.main(args)
            self.assertEqual(output.read_bytes(), original)
            self.assertEqual(json.loads(original.decode().split("\n---\n")[-1]), fixtures[1])
            self.assertNotIn("private-test-material", stdout.getvalue())
            self.assertNotIn("test-ca", stdout.getvalue())


class TLSFixtureTests(unittest.TestCase):
    def test_real_cert_trust_identity_private_key_and_wrong_identity_rejection(self):
        ca, secret = smoke.tls_resources()
        self.assertEqual(ca["metadata"]["namespace"], smoke.NAMESPACE)
        self.assertEqual(secret["metadata"]["name"], "clawmanager-secret-broker-tls")
        self.assertEqual(secret["type"], "kubernetes.io/tls")
        self.assertEqual(set(secret["data"]), {"tls.crt", "tls.key"})
        self.assertEqual(set(ca["data"]), {"ca.crt"})
        with tempfile.TemporaryDirectory(prefix="clawmanager-ci-verify-") as work:
            directory = Path(work)
            (directory / "ca.crt").write_text(ca["data"]["ca.crt"], encoding="ascii")
            for name, data in secret["data"].items():
                (directory / name).write_bytes(base64.b64decode(data, validate=True))
            def openssl(*args):
                return subprocess.run(["openssl", *args], cwd=work, capture_output=True)
            good = openssl("verify", "-CAfile", "ca.crt", "-purpose", "sslserver",
                           "-verify_hostname", smoke.BROKER_DNS, "tls.crt")
            self.assertEqual(good.returncode, 0, good.stderr.decode())
            wrong = openssl("verify", "-CAfile", "ca.crt", "-verify_hostname", "wrong.invalid", "tls.crt")
            self.assertNotEqual(wrong.returncode, 0)
            untrusted = openssl("verify", "-no-CAfile", "-no-CApath", "tls.crt")
            self.assertNotEqual(untrusted.returncode, 0)
            cert_key = openssl("x509", "-in", "tls.crt", "-pubkey", "-noout")
            private_key = openssl("pkey", "-in", "tls.key", "-pubout")
            self.assertEqual(cert_key.returncode, 0)
            self.assertEqual(private_key.returncode, 0)
            self.assertEqual(cert_key.stdout, private_key.stdout)
            validity = openssl("x509", "-in", "tls.crt", "-checkend", "259200", "-noout")
            self.assertNotEqual(validity.returncode, 0, "fixture must expire within three days")


if __name__ == "__main__":
    unittest.main()
