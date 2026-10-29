package quiesce

import (
	"clawreef/internal/systembackup/flow"
	"context"
	"testing"
	"time"
)

func TestPodStopWaitsForPersistedKubeletProof(t *testing.T) {
	f := newPodFixture(t, true)
	calls := 0
	f.writer.ConfirmStopped = func(context.Context, flow.State, []PodIdentity) error {
		calls++
		if calls < 3 {
			return ErrStopProofPending
		}
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	state, e := f.writer.Observe(ctx)
	if e != nil {
		t.Fatal(e)
	}
	ack, e := f.writer.Pause(ctx, state)
	if e != nil || !ack.Stopped || calls < 3 || f.deletes != 1 {
		t.Fatal("stop did not wait for proof", e, calls, f.deletes)
	}
}
