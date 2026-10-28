package northbound

import (
	"context"
	"errors"
	"testing"

	"clawreef/internal/systembackup/mutation"
)

type operationBackupGateFunc func(context.Context, string) (func() error, error)

func (f operationBackupGateFunc) Enter(ctx context.Context, name string) (func() error, error) {
	return f(ctx, name)
}

func TestOperationBackupGateBlocksAllWritePaths(t *testing.T) {
	closed := errors.New("backup gate closed")
	for _, path := range []string{"ordinary", "batch", "reservation"} {
		t.Run(path, func(t *testing.T) {
			calls := 0
			mutation.Configure(operationBackupGateFunc(func(context.Context, string) (func() error, error) {
				calls++
				return nil, closed
			}))
			t.Cleanup(func() { mutation.Configure(nil) })
			// No service/repository: reaching a claim or reservation would panic.
			w := &OperationWorker{}
			switch path {
			case "ordinary":
				w.processOne(context.Background())
			case "batch":
				w.processNext(context.Background(), true)
			case "reservation":
				if err := w.advanceLifecycleBatches(context.Background()); !errors.Is(err, closed) {
					t.Fatalf("reservation error: %v", err)
				}
			}
			if calls != 1 {
				t.Fatalf("gate admissions = %d", calls)
			}
		})
	}
}

func TestOperationBackupGateCancellationReleasesWithoutWriting(t *testing.T) {
	for _, path := range []string{"ordinary", "batch", "reservation"} {
		t.Run(path, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			calls, releases := 0, 0
			releaseErr := errors.New("release failed")
			mutation.Configure(operationBackupGateFunc(func(context.Context, string) (func() error, error) {
				calls++
				cancel()
				return func() error { releases++; return releaseErr }, nil
			}))
			t.Cleanup(func() { mutation.Configure(nil) })
			w := &OperationWorker{}
			run := func() {
				switch path {
				case "ordinary":
					w.processOne(ctx)
				case "batch":
					w.processNext(ctx, true)
				case "reservation":
					err := w.advanceLifecycleBatches(ctx)
					if !errors.Is(err, context.Canceled) || !errors.Is(err, releaseErr) {
						t.Fatalf("cancellation/release error: %v", err)
					}
				}
			}
			run()
			if calls != 1 || releases != 1 {
				t.Fatalf("calls=%d releases=%d", calls, releases)
			}
			// Already-cancelled work must not acquire another permit.
			if path == "reservation" {
				if err := w.advanceLifecycleBatches(ctx); !errors.Is(err, context.Canceled) {
					t.Fatal(err)
				}
			} else {
				run()
			}
			if calls != 1 || releases != 1 {
				t.Fatalf("cancelled work acquired a permit: calls=%d releases=%d", calls, releases)
			}
		})
	}
}
