//go:build !linux && !windows

package staging

import "os"

func tryCustodyLock(*os.File) error { return ErrFile }
func releaseCustodyLock(*os.File)   {}

func custodyAvailable(*os.Root) (int64, error) { return 0, ErrCapacity }
