//go:build windows

package staging

import (
	"golang.org/x/sys/windows"
	"os"
)

func tryCustodyLock(f *os.File) error {
	return windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &windows.Overlapped{})
}
func releaseCustodyLock(f *os.File) {
	_ = windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, &windows.Overlapped{})
}

func custodyAvailable(root *os.Root) (int64, error) {
	path, err := windows.UTF16PtrFromString(root.Name())
	if err != nil {
		return 0, err
	}
	var available, total, free uint64
	if err = windows.GetDiskFreeSpaceEx(path, &available, &total, &free); err != nil || available > 1<<63-1 {
		return 0, ErrCapacity
	}
	return int64(available), nil
}
