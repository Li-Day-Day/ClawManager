#!/usr/bin/env python3
"""Read-only UID-pinned stat of the current installation's NFS workspace roots."""

import argparse
import json
import re
import subprocess
import sys


PATHS = (
    "/workspaces",
    "/workspaces/openclaw/user-1/instance-7",
    "/workspaces/openclaw/user-1/instance-8",
    "/workspaces/openclaw/user-1/instance-11",
    "/workspaces/teams/user-1/team-3-shared",
)
SCRIPT = r'''set -eu
for p do
  if test -e "$p"; then
    printf 'PATH\t%s\t' "$p"
    stat -Lc '%d:%i:%F:%a:%u:%g' -- "$p"
    printf 'REAL\t%s\t' "$p"
    readlink -f -- "$p"
  else
    printf 'MISSING\t%s\n' "$p"
  fi
done'''


def run(*args):
    result = subprocess.run(args, text=True, capture_output=True, timeout=45, check=False)
    if result.returncode:
        raise RuntimeError("read-only Kubernetes observation failed")
    return result.stdout.rstrip("\r\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", default="kubernetes-admin@kubernetes")
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--namespace-uid", required=True)
    parser.add_argument("--pod", required=True)
    parser.add_argument("--pod-uid", required=True)
    parser.add_argument("--container", required=True)
    a = parser.parse_args()
    if not all(re.fullmatch(r"[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?", x)
               for x in (a.namespace, a.pod, a.container)):
        parser.error("invalid Kubernetes name")
    if not all(re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", x)
               for x in (a.namespace_uid, a.pod_uid)):
        parser.error("invalid UID")
    prefix = ("kubectl", "--context", a.context, "--request-timeout=20s")
    def pins():
        if run(*prefix, "get", "namespace", a.namespace, "-o", "jsonpath={.metadata.uid}") != a.namespace_uid:
            raise ValueError("namespace UID drift")
        if run(*prefix, "-n", a.namespace, "get", "pod", a.pod, "-o", "jsonpath={.metadata.uid}") != a.pod_uid:
            raise ValueError("Pod UID drift")
    try:
        pins()
        output = run(*prefix, "-n", a.namespace, "exec", a.pod, "-c", a.container,
                     "--", "sh", "-c", SCRIPT, "a-nfs-observer", *PATHS)
        pins()
        lines = output.splitlines()
        if len(lines) != 2 * len(PATHS) or any("\r" in line or "\x00" in line for line in lines):
            raise ValueError("incomplete filesystem output")
        paths = []
        for index, path in enumerate(PATHS):
            row, real = lines[2 * index:2 * index + 2]
            if not row.startswith("PATH\t" + path + "\t") or not real.startswith("REAL\t" + path + "\t"):
                raise ValueError("missing path or unexpected output")
            actual = real.split("\t", 2)[2]
            if actual != path:
                raise ValueError("workspace path resolves outside exact path: " + path)
            paths.append({"path": path, "stat": row.split("\t", 2)[2], "realpath": actual})
        print(json.dumps({"status": "observed_read_only", "namespace": a.namespace,
                          "namespace_uid": a.namespace_uid, "pod": a.pod,
                          "pod_uid": a.pod_uid, "paths": paths,
                          "internal_symlinks_scanned": False, "ready_for_backup": False}, indent=2))
        return 0
    except (RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        print("NFS path observation incomplete: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
