package staging

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"
)

func TestProbeWorkerDiagnosticPreservesError(t *testing.T) {
	err := ProbeSealWorker(context.Background(), "relative", "invalid")
	if !errors.Is(err, ErrFile) || !strings.Contains(err.Error(), "step=validate-input") {
		t.Fatalf("missing actionable diagnostic or original error: %v", err)
	}
}

func TestProbeHolderWaitsForDelayedWorkerAcknowledgement(t *testing.T) {
	parent, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer parent.Close()
	id := "sbk_11111111-1111-4111-8111-111111111111"
	if err = parent.Mkdir(id, 0700); err != nil {
		t.Fatal(err)
	}
	root, err := parent.OpenRoot(id)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if err = exactCustodyJSON(root, ".probe-public", []byte(id)); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- ProbeSealHold(ctx, parent, id) }()
	defer func() {
		cancel()
		select {
		case <-done:
		case <-time.After(time.Second):
		}
	}()
	if err = waitProbeMarker(ctx, root, ".lock-ready", id); err != nil {
		t.Fatal(err)
	}
	// Reproduce a worker that observes readiness after the former ten-second
	// hold window. The holder must still own the lock at this point.
	select {
	case err = <-done:
		t.Fatalf("holder released before worker observation: %v", err)
	case <-time.After(11 * time.Second):
	}
	blocked, stop := context.WithTimeout(ctx, 200*time.Millisecond)
	defer stop()
	err = WithCustodyLock(blocked, root, func() error { t.Error("lock acquired while holder awaits acknowledgement"); return nil })
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected contention, got %v", err)
	}
	if err = exactCustodyJSON(root, ".lock-observed", []byte(id)); err != nil {
		t.Fatal(err)
	}
	select {
	case err = <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	if err = waitProbeMarker(ctx, root, ".lock-release", id); err != nil {
		t.Fatal(err)
	}
	if err = WithCustodyLock(ctx, root, func() error { return nil }); err != nil {
		t.Fatal(err)
	}
}

func TestProbeMarkerRejectsWrongRunAndCancellation(t *testing.T) {
	root, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if err = exactCustodyJSON(root, ".lock-observed", []byte("other-run")); err != nil {
		t.Fatal(err)
	}
	if err = waitProbeMarker(context.Background(), root, ".lock-observed", "original-run"); !errors.Is(err, ErrFile) {
		t.Fatalf("wrong run accepted: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err = waitProbeMarker(ctx, root, ".missing", "original-run"); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation ignored: %v", err)
	}
}
