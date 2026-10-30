#!/usr/bin/env python3
"""Read-only, UID-pinned observation of workspace paths in two installations.

Run via SSH stdin from the local repository. This is an inventory, not an
authorization to capture, stop writers, or restore any NFS directory.
"""

import argparse
import json
import posixpath
import re
import subprocess
import sys


DNS = re.compile(r"^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$")
UID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
SQL = (
    "SELECT i.id,i.user_id,i.type,i.status,COALESCE(i.workspace_path,''),"
    "COALESCE(b.workspace_path,'') FROM instances i "
    "LEFT JOIN instance_runtime_bindings b ON b.instance_id=i.id ORDER BY i.id"
)


def run(*command, input_text=None):
    result = subprocess.run(command, input=input_text, text=True, capture_output=True, timeout=45, check=False)
    if result.returncode != 0:
        raise RuntimeError("read-only kubectl observation failed: " + " ".join(command[:4]))
    return result.stdout.rstrip("\r\n")


def workspace(path):
    if not path:
        return ""
    if any(c in path for c in ("\x00", "\t", "\n", "\r")) or not path.startswith("/workspaces/"):
        raise ValueError("workspace path outside expected mount or contains control character")
    normalized = posixpath.normpath(path)
    if normalized != path or normalized == "/workspaces":
        raise ValueError("noncanonical workspace path")
    return path


def observe(context, namespace, namespace_uid, pod, pod_uid, database):
    prefix = ("kubectl", "--context", context, "--request-timeout=20s")
    actual_ns_uid = run(*prefix, "get", "namespace", namespace, "-o", "jsonpath={.metadata.uid}")
    if actual_ns_uid != namespace_uid:
        raise ValueError("namespace UID changed: " + namespace)
    actual_pod_uid = run(*prefix, "-n", namespace, "get", "pod", pod, "-o", "jsonpath={.metadata.uid}")
    if actual_pod_uid != pod_uid:
        raise ValueError("MySQL Pod UID changed: " + namespace)
    phase = run(*prefix, "-n", namespace, "get", "pod", pod, "-o", "jsonpath={.status.phase}")
    if phase != "Running":
        raise ValueError("MySQL Pod is not Running: " + namespace)
    mysql = (
        *prefix, "-n", namespace, "exec", "-i", pod, "-c", "mysql", "--", "sh", "-c",
        'set -eu; test -n "$MYSQL_ROOT_PASSWORD"; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" '
        'exec mysql --user=root --batch --raw --skip-column-names '
        '--default-character-set=utf8mb4 --database="$1"',
        "a-workspace-observer", database,
    )
    raw = run(*mysql, input_text=SQL + ";\n")
    rows = []
    seen = set()
    for line in raw.splitlines():
        fields = line.split("\t")
        if len(fields) != 6 or not fields[0].isdigit() or not fields[1].isdigit():
            raise ValueError("unexpected MySQL result shape: " + namespace)
        instance_id, user_id = int(fields[0]), int(fields[1])
        if instance_id in seen or len(rows) >= 9999:
            raise ValueError("duplicate instance or inventory capacity exceeded: " + namespace)
        seen.add(instance_id)
        instance_path, binding_path = workspace(fields[4]), workspace(fields[5])
        rows.append({"instance_id": instance_id, "user_id": user_id, "type": fields[2],
                     "status": fields[3], "instance_path": instance_path,
                     "binding_path": binding_path,
                     "path_mismatch": bool(instance_path and binding_path and instance_path != binding_path)})
    if run(*prefix, "get", "namespace", namespace, "-o", "jsonpath={.metadata.uid}") != namespace_uid:
        raise ValueError("namespace UID changed during observation: " + namespace)
    if run(*prefix, "-n", namespace, "get", "pod", pod, "-o", "jsonpath={.metadata.uid}") != pod_uid:
        raise ValueError("MySQL Pod UID changed during observation: " + namespace)
    return {"namespace": namespace, "namespace_uid": namespace_uid, "mysql_pod": pod,
            "mysql_pod_uid": pod_uid, "instances": rows}


def overlaps(a, b):
    return bool(a and b and (a == b or a.startswith(b + "/") or b.startswith(a + "/")))


def report(primary, external):
    conflicts = []
    for own in primary["instances"]:
        for other in external["instances"]:
            for own_path in {own["instance_path"], own["binding_path"]} - {""}:
                for other_path in {other["instance_path"], other["binding_path"]} - {""}:
                    if overlaps(own_path, other_path):
                        conflicts.append({"primary_instance_id": own["instance_id"],
                                          "external_instance_id": other["instance_id"],
                                          "primary_path": own_path, "external_path": other_path})
    return {"status": "observed_read_only", "authorization": "none", "primary": primary,
            "external": external, "cross_installation_path_overlaps": conflicts,
            "ready_for_backup": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", default="kubernetes-admin@kubernetes")
    parser.add_argument("--primary-namespace", required=True)
    parser.add_argument("--primary-namespace-uid", required=True)
    parser.add_argument("--primary-pod", required=True)
    parser.add_argument("--primary-pod-uid", required=True)
    parser.add_argument("--external-namespace", required=True)
    parser.add_argument("--external-namespace-uid", required=True)
    parser.add_argument("--external-pod", required=True)
    parser.add_argument("--external-pod-uid", required=True)
    parser.add_argument("--database", default="clawmanager")
    args = parser.parse_args()
    if not all(DNS.fullmatch(x) for x in (args.primary_namespace, args.primary_pod,
                                            args.external_namespace, args.external_pod)):
        parser.error("invalid Kubernetes name")
    if not all(UID.fullmatch(x) for x in (args.primary_namespace_uid, args.primary_pod_uid,
                                            args.external_namespace_uid, args.external_pod_uid)):
        parser.error("invalid UID")
    if not re.fullmatch(r"[A-Za-z0-9_]{1,64}", args.database):
        parser.error("invalid database name")
    if args.primary_namespace == args.external_namespace:
        parser.error("installations must be distinct")
    try:
        primary = observe(args.context, args.primary_namespace, args.primary_namespace_uid,
                          args.primary_pod, args.primary_pod_uid, args.database)
        external = observe(args.context, args.external_namespace, args.external_namespace_uid,
                           args.external_pod, args.external_pod_uid, args.database)
        print(json.dumps(report(primary, external), ensure_ascii=False, indent=2))
    except (RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        print("workspace ownership inventory incomplete: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
