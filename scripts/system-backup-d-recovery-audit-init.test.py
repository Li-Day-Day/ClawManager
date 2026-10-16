"""Run on Linux as a non-root user; all test files are temporary and removed."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("audit_init", Path(__file__).with_name("system-backup-d-recovery-audit-init.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PlatformGuard(unittest.TestCase):
    def test_unsupported_platform_has_no_write_fallback(self):
        with patch.object(module.os, "name", "nt"):
            with self.assertRaises(RuntimeError):
                module.initialize("/not-created/journal", 10001, 10001)


@unittest.skipUnless(os.name == "posix" and os.geteuid() > 0 and hasattr(os, "O_NOFOLLOW"), "Linux non-root filesystem required")
class JournalFilesystem(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="d-audit-init-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(os.path.realpath(self.temp.name))
        self.path = self.root / "management.jsonl"

    def create(self):
        return module.initialize(str(self.path), os.geteuid(), os.getegid())

    def test_empty_regular_file_and_identity_receipt(self):
        receipt = self.create()
        self.assertEqual(self.path.read_bytes(), b"")
        self.assertEqual(receipt["inode"], str(self.path.stat().st_ino))
        self.assertEqual(receipt["mode"], "0600")
        self.assertTrue(receipt["fsync_completed"])

    def test_existing_content_is_never_truncated(self):
        self.path.write_bytes(b"existing audit\n")
        with self.assertRaises(FileExistsError):
            self.create()
        self.assertEqual(self.path.read_bytes(), b"existing audit\n")

    def test_leaf_and_parent_symlinks_rejected(self):
        target = self.root / "target"
        target.write_bytes(b"unchanged")
        self.path.symlink_to(target)
        with self.assertRaises(OSError):
            self.create()
        self.assertEqual(target.read_bytes(), b"unchanged")
        self.path.unlink()
        alias = self.root / "alias"
        alias.symlink_to(self.root, target_is_directory=True)
        self.path = alias / "new-journal"
        with self.assertRaises(OSError):
            self.create()
        self.assertFalse((self.root / "new-journal").exists())

    def test_wrong_writer_and_parent_path_rejected(self):
        with self.assertRaises(RuntimeError):
            module.initialize(str(self.path), os.geteuid() + 1, os.getegid())
        with self.assertRaises(ValueError):
            module.initialize(str(self.root) + "/../new-journal", os.geteuid(), os.getegid())
        self.assertFalse(self.path.exists())

    def test_sync_failure_never_returns_receipt_or_retries_existing_file(self):
        with patch.object(module.os, "fsync", side_effect=OSError("injected sync failure")):
            with self.assertRaises(OSError):
                self.create()
        with self.assertRaises(FileExistsError):
            self.create()

    def test_directory_rebinding_rejected(self):
        directory = self.root / "mount"
        directory.mkdir()
        self.path = directory / "journal"
        original_sync = os.fsync
        swapped = False
        def rebind(fd):
            nonlocal swapped
            original_sync(fd)
            if not swapped:
                directory.rename(self.root / "old-mount")
                directory.mkdir()
                swapped = True
        with patch.object(module.os, "fsync", side_effect=rebind):
            with self.assertRaises(RuntimeError):
                self.create()
        self.assertFalse(self.path.exists())

    def test_permissions_changed_during_sync_rejected(self):
        original_sync = os.fsync
        def change_mode(fd):
            original_sync(fd)
            self.path.chmod(0o644)
        with patch.object(module.os, "fsync", side_effect=change_mode):
            with self.assertRaisesRegex(RuntimeError, "permissions changed"):
                self.create()


if __name__ == "__main__":
    unittest.main(verbosity=2)
