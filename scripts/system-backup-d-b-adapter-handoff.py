"""Build and verify D's narrowly scoped patch against B's exact PR head.

Uses only Python's standard library and existing Git. No dependency install,
shared index write, checkout, merge, remote mutation or production operation.
"""
import difflib
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import uuid

ROOT = Path(__file__).resolve().parent.parent
BASE = "08d15abf443511376bf1a0c9c9593caea8feef5c"
PATHS = [
    "backend/internal/systembackupdispatch/contract.go",
    "backend/internal/systembackupdispatch/backup_spec.go",
    "backend/internal/systembackupdispatch/task_binding.go",
    "backend/internal/systembackupdispatch/task_binding_test.go",
    "backend/internal/systembackup/publicadapter/runner.go",
    "backend/internal/systembackup/publicadapter/linux_profile.go",
    "backend/internal/systembackup/publicadapter/d_spec_integration_test.go",
]
PREFIX = ROOT / "docs/evidence/d-b-task-binding-handoff-20261028"
OWNER = ROOT / (".tmp-d-b-adapter-handoff-" + uuid.uuid4().hex)


def git(*args, cwd=ROOT):
    return subprocess.check_output(["git", *args], cwd=cwd, stderr=subprocess.PIPE)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    report = dict(kind="d_b_task_binding_handoff.v1", base=BASE, status="running",
                  dependencies_installed=False, production_approved=False,
                  complete_d_workstore_included=False, cleanup=False, sources=[])
    try:
        if git("rev-parse", "origin/pr-1").decode().strip() != BASE:
            raise ValueError("PR ref changed: review before exporting another patch")
        chunks, existing, expected = [], [], {}
        for path in PATHS:
            current = (ROOT / path).read_bytes()
            exists = subprocess.run(["git", "cat-file", "-e", BASE + ":" + path],
                                    cwd=ROOT, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL).returncode == 0
            original = git("show", BASE + ":" + path) if exists else b""
            if exists:
                existing.append(path)
            expected[path] = current
            report["sources"].append(dict(path=path, base_sha256=sha(original) if exists else None,
                                          current_sha256=sha(current), size=len(current)))
            if current == original:
                continue
            chunks.append("diff --git a/" + path + " b/" + path + "\n")
            if not exists:
                chunks.append("new file mode 100644\n")
            chunks.extend(difflib.unified_diff(original.decode("utf-8").splitlines(keepends=True),
                                               current.decode("utf-8").splitlines(keepends=True),
                                               fromfile="a/" + path if exists else "/dev/null",
                                               tofile="b/" + path))
        patch = "".join(chunks).encode("utf-8")
        patch_path = PREFIX.with_suffix(".patch")
        patch_path.write_bytes(patch)
        report["patch_sha256"] = sha(patch)
        OWNER.mkdir()
        # Extract only regular files from known paths, never archive symlinks.
        archive = git("-c", "core.autocrlf=false", "archive", "--format=tar", BASE, "--", *existing)
        with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
            for item in stream:
                if item.isdir():
                    continue
                name = PurePosixPath(item.name)
                if not item.isfile() or str(name) not in existing or ".." in name.parts:
                    raise ValueError("Unexpected archive entry")
                dest = OWNER.joinpath(*name.parts)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(stream.extractfile(item).read())
        # An isolated empty Git directory prevents discovery of the shared repo.
        git("init", "--quiet", "--template=", str(OWNER))
        git("-c", "core.autocrlf=false", "apply", "--check", str(patch_path), cwd=OWNER)
        report["apply_check"] = True
        git("-c", "core.autocrlf=false", "apply", str(patch_path), cwd=OWNER)
        for path, current in expected.items():
            if (OWNER / path).read_bytes() != current or (ROOT / path).read_bytes() != current:
                raise ValueError("Applied or current source differs: " + path)
        report["applied_bytes_equal_current"] = True
        report["status"] = "passed"
    except Exception as error:
        report["status"] = "failed"
        report["error"] = type(error).__name__ + ": " + str(error)
    finally:
        target = OWNER.resolve()
        if target.parent != ROOT.resolve() or not target.name.startswith(".tmp-d-b-adapter-handoff-"):
            raise RuntimeError("Cleanup escaped exact task owner")
        if target.exists():
            shutil.rmtree(target)
        report["cleanup"] = not target.exists()
        PREFIX.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                                               encoding="utf-8")
    print(str(PREFIX.with_suffix(".json")))
    return 0 if report["status"] == "passed" and report["cleanup"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
