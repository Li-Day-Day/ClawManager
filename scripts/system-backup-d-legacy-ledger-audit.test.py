#!/usr/bin/env python3
"""Boundary checks for the read-only legacy migration ledger audit."""

import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("system-backup-d-legacy-ledger-audit.py")
SPEC = importlib.util.spec_from_file_location("legacy_ledger_audit", MODULE_PATH)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


class LedgerAuditTest(unittest.TestCase):
    def read(self, raw, expected=None):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "ledger.txt"
            path.write_bytes(raw)
            return audit.read_ledger(path, expected or hashlib.sha256(raw).hexdigest())

    def test_exact_lf_ledger(self):
        self.assertEqual(self.read(b"001_one.sql\n002_two.sql\n"), ["001_one.sql", "002_two.sql"])

    def test_digest_mismatch_rejected(self):
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            self.read(b"001_one.sql\n", "0" * 64)

    def test_duplicate_and_crlf_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicated"):
            self.read(b"001_one.sql\n001_one.sql\n")
        with self.assertRaisesRegex(ValueError, "encoding invalid"):
            self.read(b"001_one.sql\r\n")

    def test_same_name_changed_never_authorizes_migration(self):
        report = audit.analyze(
            ["001_one.sql", "002_two.sql"],
            {"001_one.sql": "a" * 64, "002_two.sql": "b" * 64},
            {"001_one.sql": "c" * 64, "003_three.sql": "d" * 64},
            "e" * 64,
            "f" * 64,
        )
        self.assertEqual(report["ledger_not_in_current"], ["002_two.sql"])
        self.assertEqual(report["same_name_sql_changed"], [{
            "filename": "001_one.sql", "source_sha256": "a" * 64, "current_sha256": "c" * 64,
        }])
        self.assertFalse(report["schema_equivalence_verified"])
        self.assertFalse(report["migration_authorized"])

    def test_pinned_source_reads_git_blob_bytes(self):
        repo = MODULE_PATH.resolve().parents[1]
        source = audit.source_sql(repo)
        self.assertEqual(len(source), 137)
        self.assertEqual(
            source["001_init_schema.sql"],
            "f08923b5e4dfab3b560a7736833cc53b8733f55cdae4c2990393d07770f9451b",
        )

    def test_current_catalog_matches_reviewed_pin(self):
        repo = MODULE_PATH.resolve().parents[1]
        current = audit.current_sql(repo)
        self.assertEqual(
            audit.current_catalog_hash(repo, current),
            "d82eb65ecd839741255722bc8bdcd77de28c4fa25f8c1c25a622ba588f4156b5",
        )

    def test_deployed_image_catalog_matches_pinned_git_source(self):
        repo = MODULE_PATH.resolve().parents[1]
        names = audit.read_ledger(repo / "docs/evidence/d-existing-db-ledger-20261030.txt", audit.digest((repo / "docs/evidence/d-existing-db-ledger-20261030.txt").read_bytes()))
        deployed = audit.deployed_source(repo, names)
        self.assertEqual(len(deployed), 94)
        self.assertEqual(sorted(set(names) - set(deployed)), [
            "045_update_workbuddy_windows_runtime.sql",
            "046_add_instance_pvc_name.sql",
            "047_add_instance_runtime_variant.sql",
        ])


if __name__ == "__main__":
    unittest.main()
