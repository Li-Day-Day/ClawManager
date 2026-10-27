"""Provision one new journal on an already reviewed Linux audit mount.

This creates no management authority and never overwrites an existing file.
The approved initializer image must contain Python 3; no packages are installed.
"""
import argparse
import json
import os
import stat


def open_directory(parts, flags):
    directory = os.open("/", flags)
    try:
        for component in parts:
            child = os.open(component, flags, dir_fd=directory)
            os.close(directory)
            directory = child
        return directory
    except BaseException:
        os.close(directory)
        raise


def initialize(path, expected_uid, expected_gid):
    if os.name != "posix" or not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
        raise RuntimeError("Linux no-follow directory operations are required")
    parts = path.split("/")
    if not path.startswith("/") or any(part in ("", ".", "..") for part in parts[1:]) or len(parts) < 3:
        raise ValueError("A fixed absolute journal path below a mount is required")
    if os.geteuid() != expected_uid or os.getegid() != expected_gid or expected_uid <= 0 or expected_gid <= 0:
        raise RuntimeError("Initializer identity differs from the reviewed non-root writer")
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    directory = open_directory(parts[1:-1], flags)
    try:
        os.umask(0o077)
        fd = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size != 0:
                raise RuntimeError("New journal is not an empty unaliased ordinary file")
            if info.st_uid != expected_uid or info.st_gid != expected_gid or stat.S_IMODE(info.st_mode) != 0o600:
                raise RuntimeError("Journal permissions differ from the reviewed writer")
            os.fsync(fd)
            os.fsync(directory)
            verified_directory = open_directory(parts[1:-1], flags)
            try:
                if not os.path.samestat(os.fstat(directory), os.fstat(verified_directory)):
                    raise RuntimeError("Journal directory changed during initialization")
                current = os.stat(parts[-1], dir_fd=verified_directory, follow_symlinks=False)
            finally:
                os.close(verified_directory)
            if not os.path.samestat(info, current) or current.st_nlink != 1 or current.st_size != 0:
                raise RuntimeError("Journal identity changed during initialization")
            if not stat.S_ISREG(current.st_mode) or current.st_uid != expected_uid or current.st_gid != expected_gid or stat.S_IMODE(current.st_mode) != 0o600:
                raise RuntimeError("Journal permissions changed during initialization")
            return {"result": "JOURNAL_FILE_INITIALIZED_NOT_PRODUCTION_ACCEPTANCE", "path": path,
                    "device": str(info.st_dev), "inode": str(info.st_ino), "uid": info.st_uid,
                    "gid": info.st_gid, "mode": "0600", "size_bytes": 0, "fsync_completed": True}
        finally:
            os.close(fd)
    finally:
        os.close(directory)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", required=True)
    parser.add_argument("--uid", required=True, type=int)
    parser.add_argument("--gid", required=True, type=int)
    args = parser.parse_args()
    print(json.dumps(initialize(args.path, args.uid, args.gid), sort_keys=True))
