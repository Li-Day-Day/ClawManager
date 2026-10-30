#!/usr/bin/env python3
"""Read-only, source-pinned inventory for the 4fe83bcd database import profile.

The optional direct inventory is pinned to the observed live schema. This
never authorizes replay or writes SQL.
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path


SOURCE_COMMIT = "4fe83bcde5a8a693dddb2635e9a3e397d6e3472e"
DEPLOYED_SOURCE_COMMIT = "acf59b7933303b879af80ed192fa0ca4466c79d7"
DEPLOYED_IMAGE_ID = "sha256:c16f07c25c6dc8362aa09b7a1e81f5d1204f2812ae542bbcb21a3946975c6c9d"
DEPLOYED_CATALOG_SHA256 = "0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93"
LIVE_INVENTORY_SHA256 = "71b22c009b3ad9bdeef324d2cafd2aa4c1a646110f2080d1b6f42746f8f7013f"
LIVE_SCHEMA_SHA256 = "140b053e6d3a40a8b5d7c305e3429020a1bc394b3c156167d9683072ec0908bf"
LIVE_SERVER_UUID = "f1f5f76a-95f5-11f1-b08e-366835b4a029"
LIVE_DATABASE = "clawmanager"
LIVE_LEDGER_SHA256 = "5d303453289c28d0b8abf7abab8b3abe15ad605079feb01e599d919b53068903"
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


def read_live_inventory(path, ledger):
    raw = path.read_bytes()
    if len(raw) > 2_000_000 or digest(raw) != LIVE_INVENTORY_SHA256:
        raise ValueError("live inventory digest mismatch")
    try:
        report = json.loads(raw)
        schema = report["schema"]
        facts = schema["facts"]
        tables = schema["tables"]
        valid = (report["version"] == 1 and
                 report["server_uuid"] == LIVE_SERVER_UUID and
                 report["database"] == LIVE_DATABASE and
                 report["ledger_sha256"] == LIVE_LEDGER_SHA256 and
                 report["schema_sha256"] == LIVE_SCHEMA_SHA256 and
                 report["ledger"] == ledger and
                 report["migration_authorized"] is False and
                 report["schema_equivalence_verified"] is False and
                 len(tables) == 99 and
                 [len(group) for group in facts] == [99, 1948, 896, 188, 266])
    except (KeyError, TypeError, ValueError, IndexError):
        valid = False
    if not valid:
        raise ValueError("live inventory identity or shape mismatch")
    return report


def source_blobs(repo, commit):
    proc = subprocess.run(
        ["git", "-C", str(repo), "ls-tree", "-r", "-z", commit, MIGRATION_DIR],
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
        out[name] = raw
    if offset != len(payload):
        raise ValueError("source blob response invalid")
    return out


def source_sql(repo):
    return {name: digest(raw) for name, raw in source_blobs(repo, SOURCE_COMMIT).items()}


def catalog_hash_blobs(blobs, filenames):
    h = hashlib.sha256(b"system-backup-migration-catalog.v1\x00")
    for name in sorted(filenames):
        raw = blobs[name].replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        for value in (name.encode("ascii"), raw):
            h.update(len(value).to_bytes(8, "big"))
            h.update(value)
    return h.hexdigest()


def deployed_source(repo, ledger):
    evidence = json.loads((repo / "docs/evidence/d-deployed-app-catalog-20261030.json").read_text("utf-8"))
    catalog = evidence["catalog"]
    filenames = catalog["filenames"]
    blobs = source_blobs(repo, DEPLOYED_SOURCE_COMMIT)
    if (evidence["image_id"] != DEPLOYED_IMAGE_ID or
            catalog["sha256"] != DEPLOYED_CATALOG_SHA256 or
            catalog["file_count"] != 94 or len(filenames) != 94 or
            set(filenames) != set(blobs) or len(set(filenames)) != 94 or
            not set(filenames).issubset(set(ledger)) or
            catalog_hash_blobs(blobs, filenames) != DEPLOYED_CATALOG_SHA256):
        raise ValueError("deployed image catalog source invalid")
    return {name: digest(raw) for name, raw in blobs.items()}


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


def current_catalog_hash(repo, filenames):
    """Match migrationcatalog.Compute and its reviewed source pin."""
    h = hashlib.sha256()
    h.update(b"system-backup-migration-catalog.v1\x00")
    for name in sorted(filenames):
        raw = (repo / MIGRATION_DIR / name).read_bytes()
        normalized = raw.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        for value in (name.encode("ascii"), normalized):
            h.update(len(value).to_bytes(8, "big"))
            h.update(value)
    result = h.hexdigest()
    reviewed = (repo / "backend/internal/migrationcatalog/reviewed_catalog.go").read_text("ascii")
    expected = re.search(r'const ReviewedHash = "([0-9a-f]{64})"', reviewed)
    count = re.search(r"const ReviewedFileCount = ([0-9]+)", reviewed)
    if expected is None or count is None or result != expected.group(1) or len(filenames) != int(count.group(1)):
        raise ValueError("current migration catalog does not match reviewed source pin")
    return result


def analyze(names, source, current, ledger_sha, catalog_sha):
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
        "current_catalog_sha256": catalog_sha,
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
    parser.add_argument("--inventory-file", type=Path,
                        help="optional byte-pinned direct live schema inventory")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        names = read_ledger(args.ledger_file, args.expected_ledger_sha256)
        repo = args.repo_root.resolve(strict=True)
        current = current_sql(repo)
        result = analyze(names, source_sql(repo), current, args.expected_ledger_sha256,
                         current_catalog_hash(repo, current))
        deployed = deployed_source(repo, names)
        result.update({
            "deployed_source_commit": DEPLOYED_SOURCE_COMMIT,
            "deployed_image_id": DEPLOYED_IMAGE_ID,
            "deployed_catalog_sha256": DEPLOYED_CATALOG_SHA256,
            "deployed_catalog_count": len(deployed),
            "ledger_not_in_deployed_catalog": sorted(set(names) - set(deployed)),
            "deployed_source_sql_sha256": {name: deployed[name] for name in sorted(deployed)},
            "four_fe_sql_changed_from_deployed": sorted(
                name for name in deployed if result["applied_source_sql_sha256"].get(name) != deployed[name]
            ),
        })
        if args.inventory_file is not None:
            inventory = read_live_inventory(args.inventory_file, names)
            result.update({
                "live_inventory_sha256": LIVE_INVENTORY_SHA256,
                "live_schema_sha256": inventory["schema_sha256"],
                "live_server_uuid": inventory["server_uuid"],
                "live_database": inventory["database"],
                "live_table_count": len(inventory["schema"]["tables"]),
                "live_column_count": len(inventory["schema"]["facts"][1]),
            })
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError):
        print("legacy ledger audit rejected; no migration authorized", file=sys.stderr)
        return 1
    json.dump(result, sys.stdout, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
