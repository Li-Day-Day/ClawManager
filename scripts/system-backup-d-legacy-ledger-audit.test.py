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


if __name__ == "__main__":
    unittest.main()
