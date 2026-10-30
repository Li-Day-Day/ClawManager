#!/usr/bin/env python3
"""Read-only, source-pinned inventory for the 4fe83bcd database import profile.

This does not inspect a live schema, authorize replay, or write any SQL.
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path


SOURCE_COMMIT = "4fe83bcde5a8a693dddb2635e9a3e397d6e3472e"
MIGRATION_DIR = "backend/internal/db/migrations"
NAME = re.compile(r"[0-9]{3}_[A-Za-z0-9_-]+\.sql\Z")
HEX = re.compile(r"[0-9a-f]{64}\Z")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_ledger(path, expected):
    raw = path.read_bytes()
    if not HEX.fullmatch(expected) or len(raw) > 65536 or digest(raw) != expected:
        raise ValueError("ledger digest mismatch")
    if not raw.endswith(b"\n") or b"\r" in raw or b"\x00" in raw:
        raise ValueError("ledger encoding invalid")
    try:
        names = raw.decode("ascii").splitlines()
    except UnicodeDecodeError as exc:
        raise ValueError("ledger encoding invalid") from exc
    if not names or any(not NAME.fullmatch(n) for n in names) or len(set(names)) != len(names):
        raise ValueError("ledger filename invalid or duplicated")
    return names


def source_sql(repo):
    proc = subprocess.run(
        ["git", "-C", str(repo), "ls-tree", "-r", "-z", SOURCE_COMMIT, MIGRATION_DIR],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    objects = []
    names = set()
    for row in proc.stdout.split(b"\x00"):
        if not row:
            continue
        try:
            metadata, path = row.split(b"\t", 1)
            mode, kind, oid = metadata.split(b" ")
            path = path.decode("ascii")
        except (ValueError, UnicodeDecodeError) as exc:
            raise ValueError("source migration tree invalid") from exc
        name = Path(path).name
        if (mode != b"100644" or kind != b"blob" or
                not re.fullmatch(rb"[0-9a-f]{40,64}", oid) or
                path != MIGRATION_DIR + "/" + name or
                not NAME.fullmatch(name) or name in names):
            raise ValueError("source migration tree invalid")
        names.add(name)
        objects.append((name, oid))
    if not objects:
        raise ValueError("source migration tree empty")
    proc = subprocess.run(
        ["git", "-C", str(repo), "cat-file", "--batch"],
        input=b"".join(oid + b"\n" for _, oid in objects),
        check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    out = {}
    payload = proc.stdout
    offset = 0
    for name, oid in objects:
        end = payload.find(b"\n", offset)
        if end < 0:
            raise ValueError("source blob response invalid")
        try:
            response_oid, kind, size_ascii = payload[offset:end].split(b" ")
            size = int(size_ascii)
        except ValueError as exc:
            raise ValueError("source blob response invalid") from exc
        offset = end + 1
        if response_oid != oid or kind != b"blob" or size < 1 or size > 1_048_576:
            raise ValueError("source blob response invalid")
        raw = payload[offset:offset + size]
        offset += size
        if len(raw) != size or payload[offset:offset + 1] != b"\n":
            raise ValueError("source blob response invalid")
        offset += 1
        out[name] = digest(raw)
    if offset != len(payload):
        raise ValueError("source blob response invalid")
    return out


def current_sql(repo):
    folder = repo / MIGRATION_DIR
    out = {}
    for path in folder.glob("*.sql"):
        if path.is_symlink() or not path.is_file() or not NAME.fullmatch(path.name):
            raise ValueError("current migration file invalid")
        raw = path.read_bytes()
        if len(raw) == 0 or len(raw) > 1_048_576:
            raise ValueError("current SQL size invalid")
        out[path.name] = digest(raw)
    if not out:
        raise ValueError("current migration directory empty")
    return out


def analyze(names, source, current, ledger_sha):
    applied = set(names)
    old = set(source)
    new = set(current)
    common = sorted(applied & old & new)
    return {
        "kind": "d_legacy_ledger_audit.v1",
        "source_commit": SOURCE_COMMIT,
        "ledger_sha256": ledger_sha,
        "ledger_count": len(names),
        "source_sql_count": len(source),
        "current_sql_count": len(current),
        "ledger_not_in_source": sorted(applied - old),
        "source_not_in_ledger": sorted(old - applied),
        "ledger_not_in_current": sorted(applied - new),
        "current_not_in_ledger": sorted(new - applied),
        "applied_source_sql_sha256": {name: source[name] for name in sorted(applied & old)},
        "same_name_sql_changed": [
            {"filename": name, "source_sha256": source[name], "current_sha256": current[name]}
            for name in common if source[name] != current[name]
        ],
        "schema_equivalence_verified": False,
        "migration_authorized": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger-file", type=Path, required=True)
    parser.add_argument("--expected-ledger-sha256", required=True)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        names = read_ledger(args.ledger_file, args.expected_ledger_sha256)
        repo = args.repo_root.resolve(strict=True)
        result = analyze(names, source_sql(repo), current_sql(repo), args.expected_ledger_sha256)
    except (OSError, ValueError, subprocess.CalledProcessError):
        print("legacy ledger audit rejected; no migration authorized", file=sys.stderr)
        return 1
    json.dump(result, sys.stdout, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
