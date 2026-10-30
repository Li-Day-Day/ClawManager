#!/usr/bin/env python3
"""Read-only current-namespace DB/PVC footprint; does not inspect data values."""

import argparse
import json
import re
import subprocess
import sys


SQL = """SELECT 'INSTANCE',id,user_id,type,instance_mode,runtime_type,status,runtime_generation,
COALESCE(pvc_name,''),COALESCE(workspace_path,'') FROM instances ORDER BY id;
SELECT 'VOLUME',instance_id,pvc_name,pvc_namespace,storage_size_gb,COALESCE(storage_class,'')
FROM persistent_volumes ORDER BY instance_id,pvc_name;
"""
UID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\Z")
NAME = re.compile(r"[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?\Z")


def run(*command, input_text=None):
    result = subprocess.run(command, input=input_text, text=True, capture_output=True,
                            timeout=45, check=False)
    if result.returncode:
        raise RuntimeError("read-only Kubernetes or MySQL observation failed")
    if len(result.stdout) > 4 * 1024 * 1024:
        raise RuntimeError("observation output exceeds bound")
    return result.stdout.rstrip("\r\n")


def parse_sql(raw):
    instances, volumes = [], []
    seen_instances = set()
    for line in raw.splitlines():
        fields = line.split("\t")
        if fields[0] == "INSTANCE" and len(fields) == 10:
            if not fields[1].isdigit() or not fields[2].isdigit() or not fields[7].isdigit():
                raise ValueError("unexpected instance identity")
            identifier = int(fields[1])
            if identifier in seen_instances:
                raise ValueError("duplicate instance")
            seen_instances.add(identifier)
            instances.append({"id": identifier, "user_id": int(fields[2]), "type": fields[3],
                              "instance_mode": fields[4], "runtime_type": fields[5],
                              "status": fields[6], "runtime_generation": int(fields[7]),
                              "pvc_name": fields[8], "workspace_path": fields[9]})
        elif fields[0] == "VOLUME" and len(fields) == 6:
            if not fields[1].isdigit() or not fields[4].isdigit():
                raise ValueError("unexpected persistent volume identity")
            volumes.append({"instance_id": int(fields[1]), "pvc_name": fields[2],
                            "pvc_namespace": fields[3], "storage_size_gb": int(fields[4]),
                            "storage_class": fields[5]})
        else:
            raise ValueError("unexpected SQL result shape")
    if len(instances) > 9999 or len(volumes) > 9999:
        raise ValueError("inventory capacity exceeded")
    return instances, volumes


def summarize_pvcs(raw):
    root = json.loads(raw)
    if not isinstance(root, dict) or root.get("kind") != "List" or not isinstance(root.get("items"), list):
        raise ValueError("unexpected PVC response")
    out = []
    for item in root["items"]:
        metadata, spec, status = item["metadata"], item.get("spec", {}), item.get("status", {})
        name, uid = metadata["name"], metadata["uid"]
        if not NAME.fullmatch(name) or not UID.fullmatch(uid):
            raise ValueError("invalid PVC identity")
        out.append({"name": name, "uid": uid, "phase": status.get("phase", ""),
                    "volume_name": spec.get("volumeName", ""),
                    "storage_class": spec.get("storageClassName", "")})
    if len(out) > 9999:
        raise ValueError("PVC inventory capacity exceeded")
    return sorted(out, key=lambda item: item["name"])


def summarize_pods(raw):
    root = json.loads(raw)
    if not isinstance(root, dict) or root.get("kind") != "List" or not isinstance(root.get("items"), list):
        raise ValueError("unexpected Pod response")
    out = []
    for item in root["items"]:
        metadata = item["metadata"]
        name, uid = metadata["name"], metadata["uid"]
        if not NAME.fullmatch(name) or not UID.fullmatch(uid):
            raise ValueError("invalid Pod identity")
        claims = sorted({v["persistentVolumeClaim"]["claimName"] for v in item["spec"].get("volumes", [])
                         if "persistentVolumeClaim" in v})
        if any(not NAME.fullmatch(claim) for claim in claims):
            raise ValueError("invalid claim name")
        storage = []
        for volume in item["spec"].get("volumes", []):
            kinds = [kind for kind in ("persistentVolumeClaim", "emptyDir", "hostPath", "nfs", "csi")
                     if kind in volume]
            if not kinds:
                continue
            if len(kinds) != 1 or not NAME.fullmatch(volume["name"]):
                raise ValueError("invalid storage volume")
            kind = kinds[0]
            source = volume[kind]
            if kind == "persistentVolumeClaim":
                locator = source.get("claimName", "")
            elif kind == "hostPath":
                locator = source.get("path", "")
            elif kind == "nfs":
                locator = source.get("server", "") + ":" + source.get("path", "")
            elif kind == "csi":
                locator = source.get("driver", "")
            else:
                locator = source.get("medium", "")
            if not isinstance(locator, str) or len(locator) > 1024 or any(c in locator for c in "\x00\r\n\t"):
                raise ValueError("invalid storage locator")
            mounts = []
            for container in item["spec"].get("initContainers", []) + item["spec"].get("containers", []):
                for mount in container.get("volumeMounts", []):
                    if mount.get("name") == volume["name"]:
                        mounts.append({"container": container["name"], "path": mount["mountPath"],
                                       "sub_path": mount.get("subPath", ""),
                                       "read_only": mount.get("readOnly", False)})
            storage.append({"name": volume["name"], "kind": kind, "locator": locator,
                            "mounts": mounts})
        out.append({"name": name, "uid": uid, "phase": item.get("status", {}).get("phase", ""),
                    "claims": claims, "storage": storage})
    if len(out) > 9999:
        raise ValueError("Pod inventory capacity exceeded")
    return sorted(out, key=lambda item: item["name"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", default="kubernetes-admin@kubernetes")
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--namespace-uid", required=True)
    parser.add_argument("--mysql-pod", required=True)
    parser.add_argument("--mysql-pod-uid", required=True)
    parser.add_argument("--database", default="clawmanager")
    a = parser.parse_args()
    if not NAME.fullmatch(a.namespace) or not NAME.fullmatch(a.mysql_pod) or not UID.fullmatch(a.namespace_uid) or not UID.fullmatch(a.mysql_pod_uid) or not re.fullmatch(r"[A-Za-z0-9_]{1,64}", a.database):
        parser.error("invalid identity or database name")
    prefix = ("kubectl", "--context", a.context, "--request-timeout=20s")
    def check_pins():
        if run(*prefix, "get", "namespace", a.namespace, "-o", "jsonpath={.metadata.uid}") != a.namespace_uid:
            raise ValueError("namespace UID drift")
        if run(*prefix, "-n", a.namespace, "get", "pod", a.mysql_pod, "-o", "jsonpath={.metadata.uid}") != a.mysql_pod_uid:
            raise ValueError("MySQL Pod UID drift")
    try:
        check_pins()
        mysql = (*prefix, "-n", a.namespace, "exec", "-i", a.mysql_pod, "-c", "mysql", "--",
                 "sh", "-c", 'set -eu; test -n "$MYSQL_ROOT_PASSWORD"; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" '
                 'exec mysql --user=root --batch --raw --skip-column-names '
                 '--default-character-set=utf8mb4 --database="$1"', "a-namespace-observer", a.database)
        instances, volumes = parse_sql(run(*mysql, input_text=SQL))
        pvcs = summarize_pvcs(run(*prefix, "-n", a.namespace, "get", "persistentvolumeclaims", "-o", "json"))
        pods = summarize_pods(run(*prefix, "-n", a.namespace, "get", "pods", "-o", "json"))
        check_pins()
        print(json.dumps({"status": "observed_read_only", "authorization": "none", "namespace": a.namespace,
                          "namespace_uid": a.namespace_uid, "mysql_pod_uid": a.mysql_pod_uid,
                          "instances": instances, "instance_volumes": volumes, "pvcs": pvcs, "pods": pods,
                          "data_values_read": False, "ready_for_backup": False}, ensure_ascii=False, indent=2))
        return 0
    except (RuntimeError, ValueError, KeyError, TypeError, json.JSONDecodeError, subprocess.TimeoutExpired) as error:
        print("namespace footprint incomplete: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
