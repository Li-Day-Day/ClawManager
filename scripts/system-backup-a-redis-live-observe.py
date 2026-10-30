#!/usr/bin/env python3
"""Read only Redis keyspace and persistence metadata from a UID-pinned Pod."""

import argparse
import json
import re
import subprocess
import sys


IDENTITY = re.compile(r"^[a-z0-9][a-z0-9.-]{0,252}[a-z0-9]$")
UID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20, check=False)
    if result.returncode or len(result.stdout) > 65536:
        raise RuntimeError("read-only Kubernetes or Redis query failed")
    return result.stdout.strip()


def info(text):
    result = {}
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition(":")
        if sep and re.fullmatch(r"[a-z0-9_]+", key):
            result[key] = value.strip()
    return result


def key_counts(value):
    fields = {}
    for item in value.split(","):
        key, sep, number = item.partition("=")
        if not sep or not re.fullmatch(r"[a-z_]+", key) or not re.fullmatch(r"[0-9]+", number) or key in fields:
            raise RuntimeError("unexpected Redis keyspace metadata")
        fields[key] = int(number)
    if "keys" not in fields or "expires" not in fields or fields["expires"] > fields["keys"]:
        raise RuntimeError("incomplete Redis keyspace metadata")
    return {"keys": fields["keys"], "expires": fields["expires"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("context", "namespace", "namespace-uid", "pod", "pod-uid"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    if not all(IDENTITY.fullmatch(x) for x in (args.namespace, args.pod)) or not all(
        UID.fullmatch(x) for x in (args.namespace_uid, args.pod_uid)
    ) or not args.context or len(args.context) > 256:
        raise RuntimeError("invalid pinned identity")
    kubectl = ("kubectl", "--context", args.context)
    observed_ns = run(*kubectl, "get", "namespace", args.namespace, "-o", "jsonpath={.metadata.uid}")
    observed_pod = run(*kubectl, "-n", args.namespace, "get", "pod", args.pod, "-o", "jsonpath={.metadata.uid}")
    if observed_ns != args.namespace_uid or observed_pod != args.pod_uid:
        raise RuntimeError("namespace or Redis Pod UID changed")
    base = (*kubectl, "-n", args.namespace, "exec", args.pod, "-c", "redis", "--", "redis-cli", "--raw")
    keyspace = info(run(*base, "INFO", "keyspace"))
    persistence = info(run(*base, "INFO", "persistence"))
    if persistence.get("loading") not in ("0", "1") or persistence.get("aof_enabled") not in ("0", "1"):
        raise RuntimeError("Redis INFO unavailable or unauthenticated")
    observed_pod_again = run(*kubectl, "-n", args.namespace, "get", "pod", args.pod, "-o", "jsonpath={.metadata.uid}")
    if observed_pod_again != args.pod_uid:
        raise RuntimeError("Redis Pod UID changed during observation")
    dbs = {}
    for key, value in keyspace.items():
        if re.fullmatch(r"db[0-9]+", key):
            dbs[key] = key_counts(value)
    fields = ("loading", "aof_enabled", "aof_last_write_status", "rdb_last_bgsave_status")
    filtered = {field: persistence.get(field, "unavailable") for field in fields}
    print(json.dumps({"status": "observed_read_only", "authorization": "none", "namespace": args.namespace,
                      "namespace_uid": args.namespace_uid, "pod": args.pod, "pod_uid": args.pod_uid,
                      "keyspace": dbs, "persistence": filtered, "data_values_read": False,
                      "ready_for_backup": False}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired) as exc:
        print("redis observation unavailable: " + str(exc), file=sys.stderr)
        sys.exit(1)
