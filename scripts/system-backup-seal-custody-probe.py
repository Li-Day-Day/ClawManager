#!/usr/bin/env python3
"""Run-owned PVC checks; no backup data, SQL mutation, or production Pod deletion."""
import argparse
import hashlib
import json
import subprocess
import sys
import time
import uuid


def manifest(cfg, run_id, node):
    security = cfg["worker_security"]
    if node not in security["node_uids"] or "@sha256:" not in cfg["worker_image"]:
        raise ValueError("node/image must be independently pinned")
    pod = {
        "apiVersion": "v1", "kind": "Pod",
        "metadata": {"name": "seal-probe-" + run_id[4:20], "namespace": cfg["namespace"],
                     "labels": {"backup-seal-probe": run_id}},
        "spec": {
            "restartPolicy": "Never", "activeDeadlineSeconds": 120,
            "nodeName": node, "serviceAccountName": security["ServiceAccountName"],
            "automountServiceAccountToken": False,
            "securityContext": {"seccompProfile": {"type": "RuntimeDefault"}},
            "containers": [{
                "name": "probe", "image": cfg["worker_image"],
                "command": ["/system-backup-seal-custody"],
                "args": ["-mode", "probe-worker", "-root", "/staging", "-run-id", run_id],
                "securityContext": {"runAsUser": 0, "readOnlyRootFilesystem": True,
                    "allowPrivilegeEscalation": False,
                    "capabilities": {"drop": ["ALL"], "add": ["DAC_READ_SEARCH"]}},
                "resources": {"requests": {"cpu": "100m", "memory": "128Mi"},
                              "limits": {"cpu": "1", "memory": "512Mi"}},
                "volumeMounts": [{"name": "staging", "mountPath": "/staging", "subPath": run_id},
                                 {"name": "workspace", "mountPath": "/workspace", "readOnly": True,
                                  "subPath": cfg["workspace"].get("sub_path", "")},
                                 {"name": "memory", "mountPath": "/tmp"}]}],
            "volumes": [{"name": "staging", "persistentVolumeClaim": {"claimName": cfg["staging_claim"]}},
                        {"name": "workspace", "persistentVolumeClaim": {"claimName": cfg["workspace"]["claim"]}},
                        {"name": "memory", "emptyDir": {"medium": "Memory", "sizeLimit": "32Mi"}}]}}
    if not cfg["workspace"].get("sub_path"):
        del pod["spec"]["containers"][0]["volumeMounts"][1]["subPath"]
    return pod


def verify_probe(actual, wanted, uid):
    if actual["metadata"]["uid"] != uid:
        raise ValueError("probe UID replaced")
    a, w = actual["spec"], wanted["spec"]
    if any(a.get(key) for key in ("hostNetwork", "hostPID", "hostIPC", "shareProcessNamespace")):
        raise ValueError("host/process isolation changed")
    for key in ("nodeName", "serviceAccountName", "automountServiceAccountToken", "securityContext"):
        if a.get(key) != w[key]:
            raise ValueError("probe admission changed security")
    if len(a.get("containers", [])) != 1 or a.get("initContainers") or a.get("ephemeralContainers"):
        raise ValueError("unexpected probe container")
    ac, wc = a["containers"][0], w["containers"][0]
    if any(ac.get(key) for key in ("env", "envFrom", "lifecycle")):
        raise ValueError("unexpected probe credentials or hooks")
    for key in ("image", "command", "args", "securityContext", "volumeMounts"):
        if ac.get(key) != wc[key]:
            raise ValueError("probe admission changed mount or command")
    # API defaults add fields inside PVC/emptyDir; names and backing identity
    # are checked explicitly, and extra volumes (including tokens) reject.
    if len(a.get("volumes", [])) != 3:
        raise ValueError("unexpected probe volume")
    volumes = {v["name"]: v for v in a["volumes"]}
    if volumes["staging"].get("persistentVolumeClaim", {}).get("claimName") != w["volumes"][0]["persistentVolumeClaim"]["claimName"]:
        raise ValueError("probe PVC replaced")
    if volumes["memory"].get("emptyDir", {}).get("medium") != "Memory":
        raise ValueError("probe scratch replaced")
    if volumes["workspace"].get("persistentVolumeClaim", {}).get("claimName") != w["volumes"][1]["persistentVolumeClaim"]["claimName"]:
        raise ValueError("source PVC replaced")


def run(args):
    raw = open(args.config, "rb").read()
    if hashlib.sha256(raw).hexdigest() != args.config_sha256:
        raise ValueError("deployment pin mismatch")
    cfg = json.loads(raw)
    node = args.worker_node or cfg["workspace"]["node"]
    run_id = "sbk_" + str(uuid.uuid4())
    wanted = manifest(cfg, run_id, node)
    if not args.execute:
        print(json.dumps({"execute": False, "pod": wanted}, indent=2))
        return
    if not args.controller_uid or not args.controller_image_id:
        raise ValueError("controller UID and actual image ID required")
    base = [args.kubectl, "--context", args.context]
    ns = cfg["namespace"]

    def command(argv, body=None, timeout=60):
        p = subprocess.run(base + argv, input=None if body is None else json.dumps(body),
                           text=True, capture_output=True, timeout=timeout, check=False)
        if p.returncode:
            raise RuntimeError("kubectl operation failed; retain local run ID for cleanup")
        return p.stdout

    def get(kind, name, namespaced=True):
        return json.loads(command((["-n", ns] if namespaced else []) + ["get", kind, name, "-o", "json"]))

    def controller():
        pod = get("pod", args.controller_pod)
        if pod["metadata"]["uid"] != args.controller_uid or pod["metadata"].get("deletionTimestamp"):
            raise ValueError("controller identity changed")
        statuses = [c for c in pod["status"].get("containerStatuses", []) if c["name"] == args.container]
        if len(statuses) != 1 or statuses[0]["imageID"] != args.controller_image_id:
            raise ValueError("controller image changed")
        container = next(c for c in pod["spec"]["containers"] if c["name"] == args.container)
        mounts = [m for m in container.get("volumeMounts", []) if m["mountPath"] == cfg["staging_directory"]]
        if len(mounts) != 1 or mounts[0].get("subPath") or mounts[0].get("subPathExpr") or mounts[0].get("readOnly"):
            raise ValueError("controller must mount the original staging volume root")
        volumes = {v["name"]: v for v in pod["spec"]["volumes"]}
        if volumes[mounts[0]["name"]].get("persistentVolumeClaim", {}).get("claimName") != cfg["staging_claim"]:
            raise ValueError("controller PVC mismatch")
        return pod

    if get("namespace", ns, False)["metadata"]["uid"] != cfg["namespace_uid"]:
        raise ValueError("namespace UID mismatch")
    security = cfg["worker_security"]
    if get("serviceaccount", security["ServiceAccountName"])["metadata"]["uid"] != security["ServiceAccountUID"]:
        raise ValueError("worker ServiceAccount replaced")
    actual_node = get("node", node, False)
    if actual_node["metadata"]["uid"] != security["node_uids"][node] or actual_node["status"]["nodeInfo"]["operatingSystem"] != "linux":
        raise ValueError("worker node identity mismatch")
    pvc = get("pvc", cfg["staging_claim"])
    pins = [v for v in security["volumes"] if v["Kind"] == "PersistentVolumeClaim" and v["Name"] == cfg["staging_claim"]]
    if len(pins) != 1 or pvc["metadata"]["uid"] != pins[0]["UID"] or pvc["spec"]["volumeName"] != pins[0]["PVName"]:
        raise ValueError("staging PVC pin mismatch")
    if get("pv", pins[0]["PVName"], False)["metadata"]["uid"] != pins[0]["PVUID"]:
        raise ValueError("staging PV pin mismatch")
    source_pins = [v for v in security["volumes"] if v["Kind"] == "PersistentVolumeClaim" and v["Name"] == cfg["workspace"]["claim"]]
    source = get("pvc", cfg["workspace"]["claim"])
    if len(source_pins) != 1 or source["metadata"]["uid"] != source_pins[0]["UID"] or source["spec"]["volumeName"] != source_pins[0]["PVName"]:
        raise ValueError("source PVC pin mismatch")
    if get("pv", source_pins[0]["PVName"], False)["metadata"]["uid"] != source_pins[0]["PVUID"]:
        raise ValueError("source PV pin mismatch")
    initial_controller = controller()

    def control_args(mode):
        controller()
        return ["-n", ns, "exec", args.controller_pod, "-c", args.container, "--",
                "/usr/local/bin/system-backup-seal-custody", "-mode", mode,
                "-root", cfg["staging_directory"], "-run-id", run_id]

    uid, hold, initialized, create_attempted = None, None, False, False
    report = {"run_id": run_id, "namespace_uid": cfg["namespace_uid"], "pv_uid": pins[0]["PVUID"],
              "controller_uid": args.controller_uid, "controller_image_id": args.controller_image_id,
              "worker_image": cfg["worker_image"], "worker_node_uid": security["node_uids"][node],
              "cross_node": node != initial_controller["spec"]["nodeName"], "passed": False, "cleaned": False}
    print(json.dumps({"probe_started": report}), flush=True)
    stage = "initialize"
    try:
        # An error here may still leave a run-owned directory; cleanup is tried.
        initialized = True
        command(control_args("probe-init"))
        stage = "create-worker"
        create_attempted = True
        created = json.loads(command(["-n", ns, "create", "-f", "-", "-o", "json"], wanted))
        uid = created["metadata"]["uid"]
        report["worker_pod_uid"] = uid
        stage = "wait-worker-running"
        end = time.monotonic() + 60
        while True:
            pod = get("pod", wanted["metadata"]["name"])
            verify_probe(pod, wanted, uid)
            if pod["status"].get("phase") == "Running":
                break
            if time.monotonic() > end or pod["status"].get("phase") in ("Failed", "Succeeded"):
                raise RuntimeError("probe did not reach running")
            time.sleep(1)
        hold = subprocess.Popen(base + control_args("probe-hold"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stage = "wait-worker-result"
        end = time.monotonic() + 65
        while True:
            pod = get("pod", wanted["metadata"]["name"])
            verify_probe(pod, wanted, uid)
            phase = pod["status"].get("phase")
            if phase == "Succeeded":
                break
            if phase == "Failed" or time.monotonic() > end:
                raise RuntimeError("worker isolation/locking probe failed")
            time.sleep(1)
        out, _ = hold.communicate(timeout=20)
        stage = "read-receipts"
        if hold.returncode or json.loads(out).get("run_id") != run_id:
            raise RuntimeError("controller lock probe failed")
        worker = json.loads(command(["-n", ns, "logs", wanted["metadata"]["name"], "-c", "probe"]))
        if worker != {"run_id": run_id, "worker_isolation": True, "cross_process_lock": True}:
            raise RuntimeError("unexpected worker receipt")
        controller()
        command(control_args("probe-verify"))
        report["passed"] = True
    except Exception as exc:
        report["failure_stage"] = stage
        report["failure"] = str(exc)[:1000]
        if uid is not None:
            try:
                failed_pod = get("pod", wanted["metadata"]["name"])
                verify_probe(failed_pod, wanted, uid)
                report["worker_status"] = failed_pod.get("status", {})
                report["worker_log_tail"] = command(["-n", ns, "logs", wanted["metadata"]["name"],
                    "-c", "probe", "--tail=30", "--limit-bytes=4096"])
            except Exception as diagnostic_error:
                report["worker_diagnostic_error"] = type(diagnostic_error).__name__
        raise
    finally:
        cleanup_ok = True
        if create_attempted and uid is None:
            try:
                recovered = get("pod", wanted["metadata"]["name"])
                if recovered["metadata"].get("labels", {}).get("backup-seal-probe") != run_id:
                    raise ValueError("unknown create outcome")
                uid = recovered["metadata"]["uid"]
                verify_probe(recovered, wanted, uid)
                report["worker_pod_uid"] = uid
            except Exception:
                cleanup_ok = False
        if hold is not None:
            try:
                hold_out, hold_err = hold.communicate(timeout=20)
                if not report["passed"]:
                    report["holder_stdout"] = hold_out[-4096:]
                    report["holder_stderr"] = hold_err[-4096:]
            except subprocess.TimeoutExpired:
                cleanup_ok = False  # Never remove a lock inode with a possible holder.
        if hold is not None and hold.poll() != 0:
            cleanup_ok = False  # A lost exec response does not prove remote exit.
        if hold is not None:
            report["holder_exit"] = hold.poll()
        if uid is not None:
            try:
                options = {"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": {"uid": uid}}
                command(["delete", "--raw", f"/api/v1/namespaces/{ns}/pods/{wanted['metadata']['name']}", "-f", "-"], options)
                command(["-n", ns, "wait", "--for=delete", "pod/" + wanted["metadata"]["name"], "--timeout=60s"])
            except Exception:
                cleanup_ok = False
        if initialized and cleanup_ok:
            try:
                command(control_args("probe-clean"))
            except Exception:
                cleanup_ok = False
        report["cleaned"] = cleanup_ok
        print(json.dumps(report), flush=True)
        if not cleanup_ok:
            raise RuntimeError("probe cleanup pending; retain run ID and exact Pod UID")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--config", required=True)
    p.add_argument("--config-sha256", required=True)
    p.add_argument("--context", required=True)
    p.add_argument("--controller-pod", required=True)
    p.add_argument("--controller-uid")
    p.add_argument("--controller-image-id")
    p.add_argument("--container", default="controller")
    p.add_argument("--worker-node")
    p.add_argument("--kubectl", default="kubectl")
    p.add_argument("--execute", action="store_true")
    try:
        run(p.parse_args())
    except Exception as exc:
        print(type(exc).__name__ + ": seal probe did not pass; retain the JSON run receipt", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
