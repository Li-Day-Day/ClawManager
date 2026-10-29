"""Public JWT trust conversion; independent ASN.1 parser, no remote calls."""
import base64
import copy
import importlib.util
import json
from pathlib import Path
import unittest

from cryptography.hazmat.primitives.serialization import load_pem_public_key

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("jwt_trust", root / "scripts/system-backup-a-jwt-trust.py")
subject = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subject)


class TrustTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.evidence = json.loads((root / "docs/evidence/a-site-kek-jwt-trust-20261029.json").read_text())

    def test_spki_independent_parser_preserves_original_key(self):
        result = subject.prepare(self.evidence)
        key = load_pem_public_key(result["config"]["jwt_validation_pubkeys"][0].encode())
        numbers = key.public_numbers()
        source = self.evidence["jwks"]["keys"][0]
        self.assertEqual(numbers.n, int.from_bytes(base64.urlsafe_b64decode(source["n"] + "=="), "big"))
        self.assertEqual(numbers.e, 65537)
        self.assertEqual(key.key_size, 2048)
        self.assertEqual(result["keys"][0]["spki_sha256"], "849773cc876caae09a61d5cdd3adb3c0ea974f4715bf104469b81105819781d4")
        self.assertEqual(result["config_request_sha256"], "32cefa6049533b732d3a099f1993330eac961d5bb8960766429647ed9bb757b3")

    def test_no_discovery_or_latest_trust_fallback(self):
        result = subject.prepare(self.evidence)
        self.assertEqual(set(result["config"]), {"bound_issuer", "jwt_supported_algs", "jwt_validation_pubkeys", "default_role"})
        self.assertEqual(result["config"]["default_role"], "")
        self.assertEqual(result["config"]["jwt_supported_algs"], ["RS256"])

    def test_reject_ambiguous_weak_or_private_material(self):
        for mode in ("insecure-issuer", "algorithm", "duplicate-key", "private", "weak", "exponent", "padding"):
            with self.subTest(mode=mode):
                evidence = copy.deepcopy(self.evidence)
                key = evidence["jwks"]["keys"][0]
                if mode == "insecure-issuer": evidence["discovery"]["issuer"] = "http://cluster.example"
                elif mode == "algorithm": key["alg"] = "HS256"
                elif mode == "duplicate-key": evidence["jwks"]["keys"].append(copy.deepcopy(key))
                elif mode == "private": key["d"] = "not-accepted"
                elif mode == "weak": key["n"] = "AQAB"
                elif mode == "exponent": key["e"] = "Aw"
                elif mode == "padding": key["n"] += "="
                with self.assertRaises(ValueError): subject.prepare(evidence)


if __name__ == "__main__":
    unittest.main()
