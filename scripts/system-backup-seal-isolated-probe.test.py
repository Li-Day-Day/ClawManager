import argparse
import contextlib
import importlib.util
import io
import json
import pathlib
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("isolated", pathlib.Path(__file__).with_name("system-backup-seal-isolated-probe.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ProbeTests(unittest.TestCase):
    def args(self, **kw):
        return argparse.Namespace(**(dict(image="registry/probe@sha256:" + "a" * 64,
            controller_node="node-a", worker_node="node-b", context="test",
            kubectl="kubectl", storage_class="test", execute=True) | kw))

    def test_plan_has_no_cluster_calls(self):
        with patch.object(module.subprocess, "run") as call, contextlib.redirect_stdout(io.StringIO()):
            module.run(self.args(execute=False))
        call.assert_not_called()

    def test_unpinned_or_same_node_rejected(self):
        for args in [self.args(image="registry/probe:latest"), self.args(worker_node="node-a")]:
            with self.assertRaises(ValueError), patch.object(module.subprocess, "run") as call:
                module.run(args)
            call.assert_not_called()

    def scenario(self, fail_probe=False, fail_delete=False):
        objects, deletes, creates = {}, [], []
        def execute(argv, input=None, **kwargs):
            out = {}
            if "create" in argv:
                out = json.loads(input)
                kind = out["kind"].lower()
                kind = {"persistentvolumeclaim": "pvc"}.get(kind, kind)
                out["metadata"]["uid"] = kind + "-" + out["metadata"]["name"]
                creates.append(kind)
                if kind == "pod":
                    out["status"] = {"containerStatuses": [{"imageID": "registry/probe@sha256:" + "a" * 64}]}
                if kind == "pvc":
                    out["spec"]["volumeName"] = "pv-" + out["metadata"]["name"]
                objects[kind, out["metadata"]["name"]] = out
            elif "get" in argv:
                idx = argv.index("get")
                kind, name = argv[idx + 1:idx + 3]
                if kind == "node":
                    out = {"metadata": {"uid": name}, "status": {"nodeInfo": {"operatingSystem": "linux", "architecture": "amd64"}}}
                elif kind == "storageclass":
                    out = {"metadata": {"uid": "sc"}, "reclaimPolicy": "Delete"}
                elif kind == "pv":
                    out = {"metadata": {"name": name, "uid": name + "-uid"}, "spec": {
                        "persistentVolumeReclaimPolicy": "Delete", "claimRef": {"uid": "pvc-" + name[3:]}}}
                elif kind == "pvc" and name == "-o":
                    out = {"items": [v for (k, n), v in objects.items() if k == "pvc"]}
                else:
                    out = objects[kind, name]
            elif "delete" in argv:
                deletes.append(json.loads(input))
                if fail_delete:
                    return types.SimpleNamespace(returncode=1, stderr="deletion refused", stdout="")
            return types.SimpleNamespace(returncode=0, stdout=json.dumps(out), stderr="")
        output = io.StringIO()
        # Keep the real probe module, replacing only its run function after import.
        original = module.importlib.util.module_from_spec
        def imported(s):
            result = original(s)
            loader = s.loader
            original_exec = loader.exec_module
            def load(m):
                original_exec(m)
                def probe_run(args):
                    self.assertEqual(args.worker_node, "node-b")
                    if fail_probe:
                        raise RuntimeError("probe failed")
                m.run = probe_run
            loader.exec_module = load
            return result
        with patch.object(module.subprocess, "run", side_effect=execute), patch.object(module.importlib.util, "module_from_spec", side_effect=imported), contextlib.redirect_stdout(output):
            if fail_probe or fail_delete:
                with self.assertRaises(RuntimeError):
                    module.run(self.args())
            else:
                module.run(self.args())
        report = json.loads(output.getvalue().splitlines()[-1])
        self.assertFalse(report["production_accepted"])
        self.assertEqual(report["passed"], not fail_probe)
        self.assertEqual(report["cleaned"], not fail_delete)
        self.assertEqual(deletes[0]["preconditions"]["uid"], report["namespace_uid"])
        self.assertEqual(creates.count("pvc"), 2)

    def test_success_cleanup(self):
        self.scenario()

    def test_probe_failure_cleanup(self):
        self.scenario(fail_probe=True)

    def test_cleanup_failure_not_success(self):
        self.scenario(fail_delete=True)


if __name__ == "__main__":
    unittest.main()
