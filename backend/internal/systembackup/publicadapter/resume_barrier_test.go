package publicadapter

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"clawreef/internal/systembackup/flow"
	d "clawreef/internal/systembackupdispatch"
)

type resumeBarrierFixture struct {
	*fixture
	blocked error
}

func (p resumeBarrierFixture) BeforeResume(ctx context.Context, a d.Authority) error {
	p.events = append(p.events, "resume-barrier")
	if err := p.Check(ctx, a); err != nil {
		return err
	}
	if !p.stopped {
		return p.blocked
	}
	return nil
}

func TestPinnedWriterRequiresCollectorBarrierBeforePhysicalResume(t *testing.T) {
	for _, stopped := range []bool{false, true} {
		name := "collector-running"
		if stopped {
			name = "collector-stopped"
		}
		t.Run(name, func(t *testing.T) {
			f, _, _ := setup(t)
			f.stopped = stopped
			blocked := errors.New("original collector termination unproven")
			ports := resumeBarrierFixture{fixture: f, blocked: blocked}
			original := f.x.Writers[0].Original
			w := pinnedWriter{Writer: fixtureWriter{f}, original: original, j: journal{in: f.in, ports: ports}}

			err := w.Resume(context.Background(), original)
			want := []string{"resume-barrier"}
			if stopped {
				want = append(want, "resume")
				if err != nil {
					t.Fatal(err)
				}
			} else if !errors.Is(err, blocked) {
				t.Fatalf("expected collector barrier failure, got %v", err)
			}
			if !reflect.DeepEqual(f.events, want) {
				t.Fatalf("physical resume must follow the successful barrier exactly once: got %v, want %v", f.events, want)
			}

			f.events = nil
			changed := original
			changed.Generation++
			if err := w.Resume(context.Background(), changed); !errors.Is(err, flow.ErrQuiesce) {
				t.Fatalf("changed original state accepted: %v", err)
			}
			if len(f.events) != 0 {
				t.Fatalf("changed original state reached barrier or physical resume: %v", f.events)
			}
		})
	}
}
