package staging

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"time"
)

var probeID = regexp.MustCompile(`^sbk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// ProbeSealInit uses a fresh, run-owned task-shaped directory on the ACTUAL
// mounted volume. It never tests against backup objects or changes SQL state.
func ProbeSealInit(parent *os.Root, id string) error {
	if runtime.GOOS != "linux" || parent == nil || !probeID.MatchString(id) {
		return ErrFile
	}
	if err := parent.Mkdir(id, 0700); err != nil {
		return err
	}
	root, err := parent.OpenRoot(id)
	if err != nil {
		return err
	}
	defer root.Close()
	if err = exactCustodyJSON(root, ".probe-public", []byte(id)); err != nil {
		return err
	}
	f, err := root.OpenFile("source", os.O_RDWR|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	if err = writeAll(f, []byte(id)); err == nil {
		err = f.Sync()
	}
	f.Close()
	if err != nil {
		return err
	}
	if err = root.Link("source", "link"); err != nil {
		return err
	}
	a, err := root.Lstat("source")
	if err != nil {
		return err
	}
	b, err := root.Lstat("link")
	if err != nil || !os.SameFile(a, b) {
		return ErrFile
	}
	if err = root.Link("source", "link"); !errors.Is(err, os.ErrExist) {
		return ErrFile
	}
	if err = root.Chmod("link", 0400); err != nil {
		return err
	}
	b, err = root.Lstat("link")
	if err != nil || b.Mode().Perm() != 0400 {
		return ErrFile
	}
	raw, err := root.ReadFile("link")
	if err != nil || !bytes.Equal(raw, []byte(id)) {
		return ErrFile
	}
	custody, err := OpenSealCustody(parent)
	if err != nil {
		return err
	}
	defer custody.Close()
	if err = exactCustodyJSON(custody, ".probe-"+id, []byte(id)); err != nil {
		return err
	}
	if err = syncDirectory(root); err != nil {
		return err
	}
	return syncDirectory(parent)
}

func waitProbeMarker(ctx context.Context, root *os.Root, name, id string) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		data, err := root.ReadFile(name)
		if err == nil {
			if string(data) != id {
				return ErrFile
			}
			return nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		timer := time.NewTimer(100 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func ProbeSealHold(ctx context.Context, parent *os.Root, id string) error {
	if !probeID.MatchString(id) {
		return ErrFile
	}
	root, err := parent.OpenRoot(id)
	if err != nil {
		return err
	}
	defer root.Close()
	raw, err := root.ReadFile(".probe-public")
	if err != nil || string(raw) != id {
		return ErrFile
	}
	err = WithCustodyLock(ctx, root, func() error {
		if e := exactCustodyJSON(root, ".lock-ready", []byte(id)); e != nil {
			return e
		}
		// Do not infer that the other node has observed readiness after a fixed
		// sleep: shared filesystem negative lookup caching can outlast it.
		return waitProbeMarker(ctx, root, ".lock-observed", id)
	})
	if err != nil {
		return err
	}
	return exactCustodyJSON(root, ".lock-release", []byte(id))
}

// Run INSIDE a Pod with the same task subPath and security context as a worker.
// Parent also proves the sibling marker exists before and after this request.
func ProbeSealWorker(ctx context.Context, path, id string) (result error) {
	step := "validate-input"
	defer func() {
		if result != nil {
			result = fmt.Errorf("seal probe worker step=%s: %w", step, result)
		}
	}()
	if runtime.GOOS != "linux" || !probeID.MatchString(id) || !filepath.IsAbs(path) {
		return ErrFile
	}
	step = "open-task-root"
	root, err := os.OpenRoot(path)
	if err != nil {
		return err
	}
	defer root.Close()
	step = "read-own-marker"
	raw, err := root.ReadFile(".probe-public")
	if err != nil || string(raw) != id {
		return ErrFile
	}
	step = "reject-parent-marker"
	forbidden := filepath.Join(path, "..", ".controller-seals", ".probe-"+id)
	if _, err = os.ReadFile(forbidden); !errors.Is(err, os.ErrNotExist) && !errors.Is(err, os.ErrPermission) {
		return ErrFile
	}
	step = "reject-workspace-alias"
	for _, alias := range []string{filepath.Join("/workspace", ".controller-seals", ".probe-"+id), filepath.Join("/workspace", "..", ".controller-seals", ".probe-"+id)} {
		if _, err = os.ReadFile(alias); !errors.Is(err, os.ErrNotExist) && !errors.Is(err, os.ErrPermission) {
			return ErrFile
		}
	}
	step = "create-escape-symlink"
	if err = root.Symlink("../.controller-seals/.probe-"+id, ".escape"); err != nil {
		return err
	}
	defer root.Remove(".escape")
	step = "reject-escape-symlink"
	if _, err = os.ReadFile(filepath.Join(path, ".escape")); !errors.Is(err, os.ErrNotExist) && !errors.Is(err, os.ErrPermission) {
		return ErrFile
	}
	step = "wait-lock-ready"
	if err = waitProbeMarker(ctx, root, ".lock-ready", id); err != nil {
		return err
	}
	step = "lock-must-block"
	blocked, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	acquired := false
	err = WithCustodyLock(blocked, root, func() error { acquired = true; return nil })
	// Acknowledge completion even on a failed contention check, so the holder
	// can release. This acknowledgement is NOT a successful worker receipt.
	if ackErr := exactCustodyJSON(root, ".lock-observed", []byte(id)); ackErr != nil {
		step = "acknowledge-lock-observation"
		return ackErr
	}
	if acquired || !errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("acquired=%t lock_error=%v: %w", acquired, err, ErrFile)
	}
	step = "wait-lock-release"
	if err = waitProbeMarker(ctx, root, ".lock-release", id); err != nil {
		return err
	}
	step = "lock-after-release"
	return WithCustodyLock(ctx, root, func() error { return nil })
}

func ProbeSealClean(parent *os.Root, id string) error {
	if !probeID.MatchString(id) {
		return ErrFile
	}
	root, err := parent.OpenRoot(id)
	if err != nil {
		return err
	}
	defer root.Close()
	raw, err := root.ReadFile(".probe-public")
	if err != nil || string(raw) != id {
		return ErrFile
	}
	custody, err := OpenSealCustody(parent)
	if err != nil {
		return err
	}
	defer custody.Close()
	marker := ".probe-" + id
	raw, err = custody.ReadFile(marker)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err == nil {
		if string(raw) != id {
			return ErrFile
		}
		if err = custody.Remove(marker); err != nil {
			return err
		}
	}
	// Caller has already stopped and deleted the exact probe Pod by UID.
	for _, name := range []string{"source", "link", ".lock-ready", ".lock-observed", ".lock-release", ".custody.lock", ".escape", ".probe-public"} {
		info, e := root.Lstat(name)
		if errors.Is(e, os.ErrNotExist) {
			continue
		}
		if e != nil || (!info.Mode().IsRegular() && name != ".escape") {
			return ErrFile
		}
		if name != ".escape" {
			if e = root.Chmod(name, 0600); e != nil {
				return e
			}
		}
		if e = root.Remove(name); e != nil {
			return e
		}
	}
	root.Close()
	if err = parent.Remove(id); err != nil {
		return err
	}
	if err = syncDirectory(custody); err != nil {
		return err
	}
	return syncDirectory(parent)
}

func ProbeSealVerify(parent *os.Root, id string) error {
	if !probeID.MatchString(id) {
		return ErrFile
	}
	root, err := parent.OpenRoot(id)
	if err != nil {
		return err
	}
	defer root.Close()
	raw, err := root.ReadFile(".probe-public")
	if err != nil || string(raw) != id {
		return ErrFile
	}
	custody, err := OpenSealCustody(parent)
	if err != nil {
		return err
	}
	defer custody.Close()
	raw, err = custody.ReadFile(".probe-" + id)
	if err != nil || string(raw) != id {
		return ErrFile
	}
	return nil
}
