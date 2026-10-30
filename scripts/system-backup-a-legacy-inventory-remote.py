#!/usr/bin/env python3
"""Build and run D's read-only legacy schema inventory in the pinned live App Pod.

Run locally. The remote host needs kubectl but no checkout. The temporary binary
is removed from the Pod on exit; the local build and cache are removed as well.
"""

import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parent.parent
CONTEXT = "kubernetes-admin@kubernetes"
NAMESPACE = "clawmanager-zhanghui08-system"
NAMESPACE_UID = "337cfe30-2c17-4b8e-b32a-760778b8098e"
POD = "clawmanager-app-788b97b78f-l8k5f"
POD_UID = "aabba383-5db9-48a7-a3b7-2b92624c2f3a"
CONTAINER = "clawmanager-app"
SERVER_UUID = "f1f5f76a-95f5-11f1-b08e-366835b4a029"
DATABASE = "clawmanager"
LEDGER_SHA256 = "5d303453289c28d0b8abf7abab8b3abe15ad605079feb01e599d919b53068903"
OUTPUT = ROOT / "docs/evidence/a-site-legacy-inventory-direct-20261030.json"
MARKER = "A_LEGACY_INVENTORY_REMOTE_CLEANED"


def command(*words):
    return " ".join(shlex.quote(word) for word in words)


def ssh_executable():
    path = Path(os.environ.get("WINDIR", "")) / "System32/OpenSSH/ssh.exe"
    if not path.is_file():
        raise RuntimeError("local Windows OpenSSH unavailable")
    return str(path)


def ssh(remote, *, payload=None, timeout=45, max_stdout=65536):
    result = ssh_call(remote, payload=payload, timeout=timeout)
    if result.returncode or len(result.stdout) > max_stdout:
        raise RuntimeError("SSH or pinned read-only command failed")
    return result.stdout, result.stderr


def ssh_call(remote, *, payload=None, timeout=45):
    return subprocess.run(
        [ssh_executable(), "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15",
         "--", "root@10.130.14.23", remote],
        input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False,
    )


def kubectl(*words):
    return command("kubectl", "--context", CONTEXT, "--request-timeout=30s", *words)


def check_identity():
    namespace, _ = ssh(kubectl("get", "namespace", NAMESPACE, "-o", "jsonpath={.metadata.uid}"))
    pod, _ = ssh(kubectl("-n", NAMESPACE, "get", "pod", POD, "-o", "jsonpath={.metadata.uid}"))
    if namespace.decode("ascii").strip() != NAMESPACE_UID or pod.decode("ascii").strip() != POD_UID:
        raise RuntimeError("namespace or App Pod UID changed")


def no_duplicate_pairs(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("duplicate inventory JSON member")
        out[key] = value
    return out


def accepted_inventory(raw):
    if len(raw) > 16 * 1024 * 1024 + 1:
        raise RuntimeError("inventory exceeds bounded metadata output")
    record = json.loads(raw, object_pairs_hook=no_duplicate_pairs)
    schema_hash = record.get("schema_sha256") if isinstance(record, dict) else None
    if not isinstance(record, dict) or type(record.get("version")) is not int or record["version"] != 1 or record.get("server_uuid") != SERVER_UUID or \
            record.get("database") != DATABASE or record.get("ledger_sha256") != LEDGER_SHA256 or \
            record.get("migration_authorized") is not False or record.get("schema_equivalence_verified") is not False or \
            not isinstance(schema_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", schema_hash) or \
            not isinstance(record.get("ledger"), list) or len(record["ledger"]) != 97 or \
            not isinstance(record.get("schema"), dict) or \
            not isinstance(record["schema"].get("tables"), list) or not record["schema"]["tables"] or \
            not isinstance(record["schema"].get("facts"), list):
        raise RuntimeError("live inventory identity or read-only status rejected")
    names = record["ledger"]
    if any(not isinstance(name, str) or not re.fullmatch(r"[0-9]{3}_[A-Za-z0-9_-]+\.sql", name) for name in names) or \
            hashlib.sha256("".join(name + "\n" for name in names).encode("ascii")).hexdigest() != LEDGER_SHA256:
        raise RuntimeError("live inventory migration ledger rejected")
    return record


def source_fingerprint():
    backend = ROOT / "backend"
    paths = [backend / "go.mod", backend / "go.sum"]
    for directory in (backend / "cmd/system-backup-legacy-inventory", backend / "internal/db"):
        paths.extend(path for path in directory.rglob("*") if path.is_file() and not path.name.endswith("_test.go"))
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.relative_to(backend).as_posix().encode("utf-8") + b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.digest()


def main():
    if OUTPUT.exists():
        raise RuntimeError("evidence output already exists; preserve prior result")
    check_identity()
    arch_raw, _ = ssh(kubectl("-n", NAMESPACE, "exec", POD, "-c", CONTAINER, "--", "uname", "-m"))
    arch = arch_raw.decode("ascii").strip()
    goarch = {"x86_64": "amd64", "aarch64": "arm64"}.get(arch)
    if goarch is None:
        raise RuntimeError("unsupported pinned App Pod architecture")
    env_check = 'test -n "$DB_HOST" && test -n "$DB_PORT" && test -n "$DB_USER" && test -n "$DB_PASSWORD" && test "$DB_NAME" = ' + shlex.quote(DATABASE)
    ssh(kubectl("-n", NAMESPACE, "exec", POD, "-c", CONTAINER, "--", "sh", "-c", env_check))
    source_before = source_fingerprint()
    with tempfile.TemporaryDirectory(prefix="sbk-a-legacy-inventory-") as scratch:
        binary = Path(scratch) / "system-backup-legacy-inventory"
        build_env = dict(os.environ, GOOS="linux", GOARCH=goarch, CGO_ENABLED="0", GOCACHE=str(Path(scratch) / "gocache"))
        build = subprocess.run(
            ["go", "build", "-mod=readonly", "-p", "1", "-o", str(binary), "./cmd/system-backup-legacy-inventory"],
            cwd=ROOT / "backend", env=build_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=900, check=False,
        )
        if build.returncode or not binary.is_file() or binary.stat().st_size > 64 * 1024 * 1024:
            raise RuntimeError("local pinned inventory build failed")
        if source_before != source_fingerprint():
            raise RuntimeError("inventory source changed during build; retry from current files")
        content = binary.read_bytes()
        if content[:6] != b"\x7fELF\x02\x01" or int.from_bytes(content[18:20], "little") != {"amd64": 62, "arm64": 183}[goarch]:
            raise RuntimeError("local binary architecture mismatch")
        name = "/tmp/sbk-a-legacy-inventory-" + secrets.token_hex(12)
        shell = (
            "set -eu; p=" + shlex.quote(name) + "; test ! -e \"$p\"; umask 077; "
            "cleanup() { if rm -f \"$p\"; then printf '" + MARKER + "\\n' >&2; "
            "else printf 'A_LEGACY_INVENTORY_CLEANUP_PENDING\\n' >&2; fi; }; "
            "trap cleanup EXIT; base64 -d > \"$p\"; chmod 700 \"$p\"; "
            "\"$p\" --app-env --expected-server-uuid " + shlex.quote(SERVER_UUID) +
            " --expected-database " + shlex.quote(DATABASE) +
            " --expected-ledger-sha256 " + shlex.quote(LEDGER_SHA256)
        )
        remote = command("kubectl", "--context", CONTEXT, "--request-timeout=300s", "-n", NAMESPACE,
                         "exec", "-i", POD, "-c", CONTAINER, "--", "sh", "-c", shell)
        payload = base64.b64encode(content) + b"\n"
        result = None
        try:
            result = ssh_call(remote, payload=payload, timeout=330)
        except subprocess.TimeoutExpired:
            pass
        cleaned = result is not None and MARKER.encode() in result.stderr.splitlines()
        if not cleaned:
            cleanup = command("kubectl", "--context", CONTEXT, "--request-timeout=30s", "-n", NAMESPACE,
                              "exec", POD, "-c", CONTAINER, "--", "sh", "-c",
                              "rm -f " + shlex.quote(name) + "; test ! -e " + shlex.quote(name))
            try:
                cleaned = ssh_call(cleanup, timeout=45).returncode == 0
            except subprocess.TimeoutExpired:
                cleaned = False
        if not cleaned:
            raise RuntimeError("remote temporary binary cleanup unverified: " + name)
        if result is None or result.returncode or len(result.stdout) > 16 * 1024 * 1024 + 1:
            raise RuntimeError("remote read-only inventory failed; temporary binary cleaned")
        check_identity()
        record = accepted_inventory(result.stdout)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        temporary = OUTPUT.with_suffix(".json.partial")
        try:
            with temporary.open("xb") as file:
                file.write(result.stdout)
            temporary.replace(OUTPUT)
        finally:
            temporary.unlink(missing_ok=True)
        summary = {"status": "observed_read_only", "file": str(OUTPUT),
                   "sha256": hashlib.sha256(result.stdout).hexdigest(), "schema_sha256": record["schema_sha256"],
                   "tables": len(record["schema"].get("tables", [])), "remote_binary_cleaned": True,
                   "local_build_cleaned": True, "migration_authorized": False}
    print(json.dumps(summary))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, UnicodeError, OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as error:
        print(json.dumps({"status": "failed", "reason": str(error), "migration_authorized": False}), file=sys.stderr)
        sys.exit(1)
