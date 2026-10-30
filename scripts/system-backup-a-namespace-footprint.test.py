"""Offline shape and fail-closed checks for the read-only namespace footprint."""

import importlib.util
import json
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "footprint", Path(__file__).with_name("system-backup-a-namespace-footprint.py"))
footprint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(footprint)


UID = "337cfe30-2c17-4b8e-b32a-760778b8098e"


class FootprintTests(unittest.TestCase):
    def test_sql_keeps_stopped_instance_and_separate_volume(self):
        raw = ("INSTANCE\t12\t1\topenclaw\tpro\tdesktop\tstopped\t0\tinstance-12\t\n"
               "VOLUME\t12\tinstance-12\tclawmanager-zhanghui08-system\t20\tfast")
        instances, volumes = footprint.parse_sql(raw)
        self.assertEqual(instances[0]["id"], 12)
        self.assertEqual(instances[0]["runtime_generation"], 0)
        self.assertEqual(instances[0]["workspace_path"], "")
        self.assertEqual(volumes[0]["pvc_name"], "instance-12")

    def test_duplicate_or_unexpected_sql_row_rejected(self):
        row = "INSTANCE\t7\t1\topenclaw\tlite\tgateway\trunning\t1\t\t/workspaces/openclaw/user-1/instance-7"
        with self.assertRaises(ValueError):
            footprint.parse_sql(row + "\n" + row)
        with self.assertRaises(ValueError):
            footprint.parse_sql("PASSWORD\tsecret")

    def test_pvc_and_pod_output_is_metadata_only(self):
        pvc = {"kind": "List", "items": [{"metadata": {"name": "mysql-data", "uid": UID},
                "spec": {"volumeName": "pv-name", "storageClassName": "fast", "secretRef": "private"},
                "status": {"phase": "Bound"}}]}
        pod = {"kind": "List", "items": [{"metadata": {"name": "mysql-1", "uid": UID},
                "spec": {"volumes": [{"name": "data", "persistentVolumeClaim": {"claimName": "mysql-data"}}],
                         "containers": [{"name": "mysql", "env": [{"name": "TOKEN", "value": "private"}],
                                         "volumeMounts": [{"name": "data", "mountPath": "/var/lib/mysql"}]}]},
                "status": {"phase": "Running"}}]}
        p = footprint.summarize_pvcs(json.dumps(pvc))
        pods = footprint.summarize_pods(json.dumps(pod))
        self.assertEqual(p[0]["name"], "mysql-data")
        self.assertEqual(pods[0]["claims"], ["mysql-data"])
        self.assertEqual(pods[0]["storage"][0]["mounts"][0]["path"], "/var/lib/mysql")
        self.assertNotIn("private", json.dumps((p, pods)))

    def test_invalid_identity_rejected(self):
        with self.assertRaises(ValueError):
            footprint.summarize_pvcs(json.dumps({"kind": "List", "items": [
                {"metadata": {"name": "../escape", "uid": UID}}]}))
        with self.assertRaises(ValueError):
            footprint.summarize_pods(json.dumps({"kind": "List", "items": [
                {"metadata": {"name": "pod", "uid": "bad"}, "spec": {}}]}))


if __name__ == "__main__":
    unittest.main()
