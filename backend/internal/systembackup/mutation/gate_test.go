package mutation

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

type fakeGate struct {
	closed atomic.Bool
	active atomic.Int64
}

func (g *fakeGate) Enter(context.Context, string) (func() error, error) {
	if g.closed.Load() {
		return nil, errors.New("closed")
	}
	g.active.Add(1)
	return func() error { g.active.Add(-1); return nil }, nil
}
func TestDetachedWorkWaitsForReopenAndReleasesAfterWork(t *testing.T) {
	g := &fakeGate{}
	g.closed.Store(true)
	Configure(g)
	defer Configure(nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() {
		release, e := Wait(ctx, "detached")
		if e != nil {
			done <- e
			return
		}
		if g.active.Load() != 1 {
			done <- errors.New("not registered")
			return
		}
		done <- release()
	}()
	select {
	case <-done:
		t.Fatal("work crossed closed gate")
	case <-time.After(20 * time.Millisecond):
	}
	g.closed.Store(false)
	if e := <-done; e != nil || g.active.Load() != 0 {
		t.Fatal(e)
	}
}
func TestDetachedWorkHonorsCancellation(t *testing.T) {
	g := &fakeGate{}
	g.closed.Store(true)
	Configure(g)
	defer Configure(nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := Wait(ctx, "detached"); e == nil || g.active.Load() != 0 {
		t.Fatal("canceled work admitted")
	}
}
