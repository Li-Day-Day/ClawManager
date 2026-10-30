"""Offline acceptance checks for the one-shot live schema inventory runner."""

import copy
import json
from pathlib import Path
import runpy
import unittest


ROOT = Path(__file__).resolve().parent.parent
runner = runpy.run_path(str(ROOT / "scripts/system-backup-a-legacy-inventory-remote.py"))


class InventoryAcceptance(unittest.TestCase):
    def setUp(self):
        names = (ROOT / "docs/evidence/d-existing-db-ledger-20261030.txt").read_text(encoding="ascii").splitlines()
        self.record = {
            "version": 1,
            "server_uuid": runner["SERVER_UUID"],
            "database": runner["DATABASE"],
            "ledger_sha256": runner["LEDGER_SHA256"],
            "ledger": names,
            "schema_sha256": "a" * 64,
            "schema": {"tables": [{"name": "example", "columns": ["id"]}], "facts": []},
            "migration_authorized": False,
            "schema_equivalence_verified": False,
        }

    def accept(self, record):
        return runner["accepted_inventory"](json.dumps(record, separators=(",", ":")).encode())

    def test_exact_legacy_identity_and_non_authorization(self):
        self.assertEqual(self.accept(self.record)["server_uuid"], runner["SERVER_UUID"])
        for field, bad in (("server_uuid", "other"), ("database", "other"),
                           ("ledger_sha256", "0" * 64), ("migration_authorized", True),
                           ("schema_equivalence_verified", True), ("version", True)):
            with self.subTest(field=field):
                changed = copy.deepcopy(self.record)
                changed[field] = bad
                with self.assertRaises(RuntimeError):
                    self.accept(changed)

    def test_ledger_mutation_and_duplicate_json_rejected(self):
        changed = copy.deepcopy(self.record)
        changed["ledger"][0] = "000_substituted.sql"
        with self.assertRaises(RuntimeError):
            self.accept(changed)
        raw = json.dumps(self.record).encode()
        raw = raw[:-1] + b',"migration_authorized":false}'
        with self.assertRaises(ValueError):
            runner["accepted_inventory"](raw)


if __name__ == "__main__":
    unittest.main()
