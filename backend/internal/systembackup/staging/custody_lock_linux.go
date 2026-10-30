//go:build linux

package staging

import (
	"golang.org/x/sys/unix"
	"os"
)

func tryCustodyLock(f *os.File) error { return unix.Flock(int(f.Fd()), unix.LOCK_EX|unix.LOCK_NB) }
func releaseCustodyLock(f *os.File)   { _ = unix.Flock(int(f.Fd()), unix.LOCK_UN) }

func custodyAvailable(root *os.Root) (int64, error) {
	f, err := root.Open(".")
	if err != nil {
		return 0, err
	}
	defer f.Close()
	var st unix.Statfs_t
	if err = unix.Fstatfs(int(f.Fd()), &st); err != nil {
		return 0, err
	}
	block := int64(st.Bsize)
	if block <= 0 || uint64(st.Bavail) > uint64((1<<63-1)/block) {
		return 0, ErrCapacity
	}
	return int64(st.Bavail) * block, nil
}
