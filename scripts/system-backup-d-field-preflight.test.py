import json
import os
import pathlib
import re
import subprocess
import sys
import unittest


class ReadOnlyFieldPreflight(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = pathlib.Path(__file__).with_name("system-backup-d-field-preflight.sh").read_text(encoding="utf-8")
        cls.parts = re.findall(r"python3 -c '([\s\S]*?)'", source)
        if len(cls.parts) != 3:
            raise AssertionError("expected three fixed Python programs")

    def run_part(self, number, payload=None, env=None):
        return subprocess.run([sys.executable, "-c", self.parts[number]], input=json.dumps(payload) if payload is not None else "",
                              text=True, capture_output=True, env=env, timeout=5)

    def test_public_projection_does_not_emit_literal_secrets(self):
        value = {"items": [{"kind": "Pod", "metadata": {"name": "app", "uid": "uid"}, "spec": {
            "containers": [{"name": "app", "image": "image@sha256:test", "env": [
                {"name": "PRIVATE_PASSWORD", "value": "NEVER_EMIT"},
                {"name": "SYSTEM_BACKUP_REGISTRATION_DSN", "value": "NEVER_EMIT"},
                {"name": "SYSTEM_BACKUP_READ_PINS_PATH", "valueFrom": {"configMapKeyRef": {"name": "pins", "key": "path"}}}]}]}}]}
        result = self.run_part(1, value)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("NEVER_EMIT", result.stdout)
        refs = json.loads(result.stdout)["containers"][0]["references"]
        self.assertEqual(len(refs), 2)
        self.assertTrue(refs[0]["literal_present"])

    def test_account_plan_has_six_exact_select_grants_and_locked_account(self):
        env = dict(os.environ, SBK_OBSERVER_DATABASE="unit_control", SBK_OBSERVER_USER="unit_reader", SBK_OBSERVER_HOST="127.0.0.1")
        result = self.run_part(2, env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.count("GRANT SELECT ON `unit_control`."), 6)
        self.assertIn("REQUIRE SSL ACCOUNT LOCK", result.stdout)
        self.assertNotIn("IDENTIFIED BY", result.stdout)
        self.assertNotIn("ON *.*", result.stdout)

    def test_account_plan_rejects_missing_wildcard_or_sql_text(self):
        for host in ("", "%", "host'; DROP USER x;"):
            env = dict(os.environ, SBK_OBSERVER_DATABASE="unit_control", SBK_OBSERVER_USER="unit_reader", SBK_OBSERVER_HOST=host)
            result = self.run_part(2, env=env)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
