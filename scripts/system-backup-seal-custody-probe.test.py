import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("seal_probe", pathlib.Path(__file__).with_name("system-backup-seal-custody-probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.cfg = {"namespace": "backup", "worker_image": "example/worker@sha256:" + "a" * 64,
                    "staging_claim": "staging", "workspace": {"claim":"source","sub_path":""}, "worker_security": {
                        "node_uids": {"node": "node-uid"}, "ServiceAccountName": "worker"}}
        self.run = "sbk_11111111-1111-4111-8111-111111111111"
        self.expected = probe.manifest(self.cfg, self.run, "node")
        self.actual = copy.deepcopy(self.expected)
        self.actual["metadata"]["uid"] = "original-pod-uid"

    def test_only_task_subpath_and_no_credentials(self):
        pod = self.expected
        self.assertFalse(pod["spec"]["automountServiceAccountToken"])
        self.assertEqual(pod["spec"]["containers"][0]["volumeMounts"][0]["subPath"], self.run)
        self.assertNotIn("env", pod["spec"]["containers"][0])
        probe.verify_probe(self.actual, self.expected, "original-pod-uid")

    def test_rejects_mount_identity_and_security_changes(self):
        for fault in ("uid", "root_mount", "extra_container", "privilege", "token", "image", "pvc", "extra_volume", "host_pid", "credentials"):
            with self.subTest(fault=fault):
                p = copy.deepcopy(self.actual)
                c = p["spec"]["containers"][0]
                if fault == "uid": p["metadata"]["uid"] = "replacement"
                if fault == "root_mount": del c["volumeMounts"][0]["subPath"]
                if fault == "extra_container": p["spec"]["containers"].append(copy.deepcopy(c))
                if fault == "privilege": c["securityContext"]["allowPrivilegeEscalation"] = True
                if fault == "token": p["spec"]["automountServiceAccountToken"] = True
                if fault == "image": c["image"] = "example:latest"
                if fault == "pvc": p["spec"]["volumes"][0]["persistentVolumeClaim"]["claimName"] = "other"
                if fault == "extra_volume": p["spec"]["volumes"].append({"name": "root", "hostPath": {"path": "/"}})
                if fault == "host_pid": p["spec"]["hostPID"] = True
                if fault == "credentials": c["envFrom"] = [{"secretRef": {"name": "unexpected"}}]
                with self.assertRaises(ValueError): probe.verify_probe(p, self.expected, "original-pod-uid")

    def test_requires_node_and_image_pins(self):
        with self.assertRaises(ValueError): probe.manifest(self.cfg, self.run, "unadmitted")
        self.cfg["worker_image"] = "example:latest"
        with self.assertRaises(ValueError): probe.manifest(self.cfg, self.run, "node")


if __name__ == "__main__":
    unittest.main()
