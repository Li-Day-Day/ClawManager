// Package mutation lets detached business work participate in the shared gate.
// Configure once before services start. Disabled installations retain behavior.
package mutation

import (
	"context"
	"sync/atomic"
	"time"
)

type Gate interface {
	Enter(context.Context, string) (func() error, error)
}
type holder struct{ gate Gate }

var configured atomic.Pointer[holder]

func Configure(g Gate) { configured.Store(&holder{g}) }
func Enter(ctx context.Context, name string) (func() error, error) {
	h := configured.Load()
	if h == nil || h.gate == nil {
		return func() error { return nil }, nil
	}
	return h.gate.Enter(ctx, name)
}

// Wait is for once-only detached work: defer the work until admission reopens,
// rather than silently dropping it. Recurring workers use Enter and retry on
// their next tick. Never call Wait inside an already-held parent permit.
func Wait(ctx context.Context, name string) (func() error, error) {
	for {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		release, e := Enter(ctx, name)
		if e == nil {
			return release, nil
		}
		timer := time.NewTimer(250 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}
