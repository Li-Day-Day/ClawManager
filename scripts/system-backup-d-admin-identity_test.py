"""Offline checks. No imports that contact the cluster or create bytecode."""
import pathlib
import types
import unittest

m = types.ModuleType("admin_identity")
exec(compile(pathlib.Path(__file__).with_name("system-backup-d-admin-identity.py").read_text(), "admin_identity", "exec"), m.__dict__)


class IdentityTests(unittest.TestCase):
    def snapshot(self):
        return {"database": "clawmanager", "server_uuid": "12345678-1234-1234-1234-123456789abc",
                "observed_at": "2026-09-28T03:00:00.000000Z", "users": [
                    {"id": 42, "username": "admin", "role": "admin", "is_active": 1, "auth_provider": "local"}],
                "config_rows": 0, "active_installations": 0, "target_installations": 0,
                "target_active_config_version": None, "runtime_table_count": 0}

    def test_query_is_readonly_and_never_selects_password(self):
        sql = m.identity_sql("admin", "installation_test")
        self.assertTrue(sql.startswith("START TRANSACTION READ ONLY;"))
        self.assertTrue(sql.endswith("ROLLBACK;\n"))
        self.assertIn("BINARY username=0x61646d696e", sql)
        for forbidden in ("password", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"):
            self.assertNotIn(forbidden.lower(), sql.lower())

    def test_operator_strings_cannot_be_sql(self):
        for value in ("admin' OR 1=1", "a;DROP TABLE users", "$(secret)", "admin\n", "a" * 65):
            with self.assertRaises(ValueError):
                m.identity_sql(value, "installation_test")

    def test_one_active_local_admin_is_accepted(self):
        v = self.snapshot()
        self.assertEqual(m.validate_snapshot(v, "admin"), v)

    def test_non_admin_or_ambiguous_identity_is_rejected(self):
        for change in ({"role": "user"}, {"is_active": 0}, {"id": True}, {"auth_provider": "ldap"}, {"username": "Admin"}):
            v = self.snapshot()
            v["users"][0].update(change)
            with self.assertRaises(ValueError):
                m.validate_snapshot(v, "admin")
        v = self.snapshot()
        v["users"].append(dict(v["users"][0]))
        with self.assertRaises(ValueError):
            m.validate_snapshot(v, "admin")

    def test_credential_columns_fail_closed(self):
        v = self.snapshot()
        v["users"][0]["password_hash"] = "private"
        with self.assertRaises(ValueError):
            m.validate_snapshot(v, "admin")


if __name__ == "__main__":
    unittest.main()
