package staging

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestCustodyCapacityIncludesUnknownFilesAndPinsPolicy(t *testing.T) {
	source, root, scope, r, key := observationFixture(t)
	p := CustodyPolicy{scope.Installation, 1 << 20}
	if err := root.WriteFile("legacy-unknown", make([]byte, 1<<20), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := ObserveManaged(context.Background(), source, root, p, scope, r, key, 1<<20); !errors.Is(err, ErrCapacity) {
		t.Fatal("untracked bytes ignored", err)
	}
	root.Remove("legacy-unknown")
	observed, err := ObserveManaged(context.Background(), source, root, p, scope, r, key, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := InventoryCustody(context.Background(), root, p)
	again, err := ObserveManaged(context.Background(), source, root, p, scope, r, key, 1<<20)
	if err != nil || again != observed {
		t.Fatal("retry", err)
	}
	after, _ := InventoryCustody(context.Background(), root, p)
	if before.UsedBytes != after.UsedBytes {
		t.Fatal("retry charged more bytes")
	}
	for _, bad := range []CustodyPolicy{{scope.Installation, 2 << 20}, {"foreign", 1 << 20}, {scope.Installation, 0}} {
		if _, err := ObserveManaged(context.Background(), source, root, bad, scope, r, key, 1<<20); err == nil {
			t.Fatal("policy drift accepted")
		}
	}
}

func TestCustodyConcurrentCopiesCannotOverbook(t *testing.T) {
	source, root, scope, _, key := observationFixture(t)
	r, err := SealFile(context.Background(), source, "large.enc", key, scope.Binding, func(w io.Writer) error { _, e := w.Write(bytes.Repeat([]byte{42}, 600<<10)); return e })
	if err != nil {
		t.Fatal(err)
	}
	p := CustodyPolicy{scope.Installation, 1 << 20}
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, uid := range []string{"job-one", "job-two"} {
		wg.Add(1)
		go func(uid string) {
			defer wg.Done()
			s := scope
			s.JobUID = uid
			_, e := ObserveManaged(context.Background(), source, root, p, s, r, key, 1<<20)
			results <- e
		}(uid)
	}
	wg.Wait()
	close(results)
	success, full := 0, 0
	for e := range results {
		if e == nil {
			success++
		} else if errors.Is(e, ErrCapacity) {
			full++
		} else {
			t.Fatal(e)
		}
	}
	if success != 1 || full != 1 {
		t.Fatal("capacity overbooked", success, full)
	}
	inventory, err := InventoryCustody(context.Background(), root, p)
	if err != nil || inventory.UsedBytes > p.MaxBytes {
		t.Fatal(inventory, err)
	}
}

type pruneOwner struct {
	allow bool
	calls int
	fail  bool
}

func (p *pruneOwner) WithUnreferencedSeal(_ context.Context, _ SealIntent, _ string, remove func() error) (bool, error) {
	p.calls++
	if p.fail {
		return false, errors.New("database unavailable")
	}
	if !p.allow {
		return false, nil
	}
	return true, remove()
}

func TestCustodyPruneRequiresOwnerAndKeepsUnknownFiles(t *testing.T) {
	source, root, scope, r, key := observationFixture(t)
	p := CustodyPolicy{scope.Installation, 1 << 20}
	observed, err := ObserveManaged(context.Background(), source, root, p, scope, r, key, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	partial := ".seal-" + strings.Repeat("a", 32) + ".partial"
	unknown := "unowned.enc"
	root.WriteFile(partial, []byte("interrupted"), 0600)
	root.WriteFile(unknown, []byte("unknown"), 0600)
	for _, name := range []string{observed.Receipt().Name, observed.Receipt().Name + ".intent.json", partial, unknown} {
		old := time.Now().Add(-48 * time.Hour)
		if err = os.Chtimes(filepath.Join(root.Name(), name), old, old); err != nil {
			t.Fatal(err)
		}
	}
	owner := &pruneOwner{}
	if _, err = PruneCustody(context.Background(), root, p, time.Now().Add(-24*time.Hour), false, owner); err != nil {
		t.Fatal(err)
	}
	if _, err = root.Stat(partial); err != nil {
		t.Fatal("dry run deleted bytes")
	}
	if _, err = PruneCustody(context.Background(), root, p, time.Now().Add(-24*time.Hour), true, owner); err != nil {
		t.Fatal(err)
	}
	if _, err = root.Stat(observed.Receipt().Name); err != nil {
		t.Fatal("referenced file deleted")
	}
	if _, err = root.Stat(partial); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("stale partial retained", err)
	}
	owner.allow = true
	owner.fail = true
	if _, err = PruneCustody(context.Background(), root, p, time.Now().Add(-24*time.Hour), true, owner); err == nil {
		t.Fatal("authority failure ignored")
	}
	owner.fail = false
	if _, err = PruneCustody(context.Background(), root, p, time.Now().Add(-24*time.Hour), true, owner); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{observed.Receipt().Name, observed.Receipt().Name + ".intent.json"} {
		if _, err = root.Stat(name); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("orphan/intent retained", name, err)
		}
	}
	if _, err = root.Stat(unknown); err != nil {
		t.Fatal("unknown file deleted")
	}
}

func TestCustodyCrashBeforeCopyLeavesPrunableIntent(t *testing.T) {
	source, root, scope, r, key := observationFixture(t)
	p := CustodyPolicy{scope.Installation, 1 << 20}
	key[0]++
	if _, err := ObserveManaged(context.Background(), source, root, p, scope, r, key, 1<<20); err == nil {
		t.Fatal("bad key accepted")
	}
	entries, _ := os.ReadDir(root.Name())
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".intent.json") {
			old := time.Now().Add(-48 * time.Hour)
			os.Chtimes(filepath.Join(root.Name(), e.Name()), old, old)
		}
	}
	owner := &pruneOwner{allow: true}
	if _, err := PruneCustody(context.Background(), root, p, time.Now().Add(-24*time.Hour), true, owner); err != nil || owner.calls != 1 {
		t.Fatal("intent cannot converge", err, owner.calls)
	}
}

func TestCustodyLockCrossProcess(t *testing.T) {
	if path := os.Getenv("CLAW_SEAL_LOCK_CHILD"); path != "" {
		root, err := os.OpenRoot(path)
		if err != nil {
			t.Fatal(err)
		}
		defer root.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
		defer cancel()
		acquired := false
		err = WithCustodyLock(ctx, root, func() error { acquired = true; return nil })
		if os.Getenv("CLAW_SEAL_LOCK_EXPECT") == "blocked" {
			if acquired || !errors.Is(err, context.DeadlineExceeded) {
				t.Fatal("lock escaped process boundary", err)
			}
		} else if err != nil || !acquired {
			t.Fatal("lock not released", err)
		}
		return
	}
	root, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	child := func(expect string) {
		cmd := exec.Command(os.Args[0], "-test.run=^TestCustodyLockCrossProcess$")
		cmd.Env = append(os.Environ(), "CLAW_SEAL_LOCK_CHILD="+root.Name(), "CLAW_SEAL_LOCK_EXPECT="+expect)
		if output, e := cmd.CombinedOutput(); e != nil {
			t.Fatalf("child: %v %s", e, output)
		}
	}
	if err = WithCustodyLock(context.Background(), root, func() error { child("blocked"); return nil }); err != nil {
		t.Fatal(err)
	}
	child("available")
}
