package publicadapter

import (
	"context"
	"errors"
	"testing"

	"clawreef/internal/systembackup/flow"
	d "clawreef/internal/systembackupdispatch"
)

func TestControlledWriterGroupFailureAndCancellationNeverReturnPartialWriters(t *testing.T) {
	for _, mode := range []string{"platform-error", "runtime-error", "platform-fence-lost", "runtime-fence-lost", "cancel-before", "cancel-between", "cancel-after"} {
		t.Run(mode, func(t *testing.T) {
			f := moduleTestInput(t)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			pCalls, rCalls := 0, 0
			platform := PlatformWriterGroup{IDs: []string{"platform"}, Build: func(context.Context, d.Input, SourceInventory, []FrozenWriter) ([]flow.Writer, error) {
				pCalls++
				if mode == "platform-fence-lost" {
					return nil, flow.ErrJournal
				}
				if mode == "platform-error" {
					return nil, errors.New("synthetic private payload")
				}
				if mode == "cancel-between" {
					cancel()
				}
				return []flow.Writer{groupedTestWriter{fixtureWriter{f}, "platform"}}, nil
			}}
			build, err := ComposeRuntimeWriters(func(context.Context, d.Input, SourceInventory, []FrozenWriter) ([]flow.Writer, error) {
				rCalls++
				if mode == "runtime-fence-lost" {
					return nil, flow.ErrJournal
				}
				if mode == "runtime-error" {
					return nil, errors.New("synthetic private payload")
				}
				if mode == "cancel-after" {
					cancel()
				}
				return []flow.Writer{groupedTestWriter{fixtureWriter{f}, "runtime"}}, nil
			}, platform)
			if err != nil {
				t.Fatal(err)
			}
			if mode == "cancel-before" {
				cancel()
			}
			writers, err := build(ctx, f.in, SourceInventory{}, nil)
			if err == nil || writers != nil || err.Error() == "synthetic private payload" {
				t.Fatal("partial/unsanitized construction escaped", err)
			}
			if mode == "cancel-before" || mode == "cancel-between" || mode == "cancel-after" {
				if !errors.Is(err, context.Canceled) {
					t.Fatal("cancellation category lost", err)
				}
			}
			if mode == "platform-fence-lost" || mode == "runtime-fence-lost" {
				var failure *Failure
				if !errors.As(err, &failure) || failure.Category != "coordination_invalid" {
					t.Fatal("fence category lost", err)
				}
			}
			if mode == "cancel-before" && pCalls != 0 {
				t.Fatal("constructed after cancellation")
			}
			if (mode == "cancel-before" || mode == "cancel-between" || mode == "platform-error" || mode == "platform-fence-lost") && rCalls != 0 {
				t.Fatal("runtime reservation attempted after failed platform boundary")
			}
			if len(f.events) != 0 || f.ensures != 0 {
				t.Fatal("physical effect during construction")
			}
		})
	}
}

type groupedTestWriter struct {
	flow.Writer
	id string
}

func (w groupedTestWriter) ID() string { return w.id }

func TestControlledWriterGroupsKeepPlatformAndOriginalFrozenPartitions(t *testing.T) {
	f := moduleTestInput(t)
	platformCalls, runtimeCalls := 0, 0
	platform := PlatformWriterGroup{IDs: []string{"platform"}, Build: func(_ context.Context, in d.Input, inv SourceInventory, frozen []FrozenWriter) ([]flow.Writer, error) {
		platformCalls++
		if len(inv.Instances) != 1 || inv.Instances[0].ID != 7 {
			t.Fatal("nonempty inventory was hidden from platform owner")
		}
		if frozen != nil && (len(frozen) != 1 || frozen[0].ID != "platform") {
			t.Fatal("platform received another group's state")
		}
		in.Backup.RequestedParts[0] = "forged"
		inv.Instances[0].ID = 99
		return []flow.Writer{groupedTestWriter{fixtureWriter{f}, "platform"}}, nil
	}}
	runtime := WriterBuilder(func(_ context.Context, in d.Input, inv SourceInventory, frozen []FrozenWriter) ([]flow.Writer, error) {
		runtimeCalls++
		if in.Backup.RequestedParts[0] != "workspace" || inv.Instances[0].ID != 7 {
			t.Fatal("platform modified D input")
		}
		if frozen != nil && (len(frozen) != 1 || frozen[0].ID != "runtime") {
			t.Fatal("runtime received another group's state")
		}
		return []flow.Writer{groupedTestWriter{fixtureWriter{f}, "runtime"}}, nil
	})
	build, err := ComposeRuntimeWriters(runtime, platform)
	if err != nil || platformCalls != 0 || runtimeCalls != 0 {
		t.Fatal("constructor did IO", err)
	}
	// Caller-owned declaration changes cannot change the frozen group.
	platform.IDs[0] = "forged"
	for _, frozen := range [][]FrozenWriter{nil, {{ID: "runtime"}, {ID: "platform"}}} {
		writers, err := build(context.Background(), f.in, SourceInventory{Instances: []InstanceIdentity{{ID: 7}}}, frozen)
		if err != nil || len(writers) != 2 || writers[0].ID() != "platform" || writers[1].ID() != "runtime" {
			t.Fatal(err)
		}
	}
	if len(f.events) != 0 || f.ensures != 0 || f.in.Backup.RequestedParts[0] != "workspace" {
		t.Fatal("assembly performed physical effects")
	}
}

func TestControlledWriterGroupsRejectMissingAliasedAndUnexpectedWriters(t *testing.T) {
	for _, mode := range []string{"missing-original-platform", "duplicate-frozen", "missing-runtime", "wrong-runtime", "alias", "nil-runtime", "wrong-platform"} {
		t.Run(mode, func(t *testing.T) {
			f := moduleTestInput(t)
			frozen := []FrozenWriter{{ID: "platform"}, {ID: "runtime"}}
			if mode == "missing-original-platform" {
				frozen = frozen[:0]
			}
			if mode == "duplicate-frozen" {
				frozen[1].ID = "platform"
			}
			p := PlatformWriterGroup{IDs: []string{"platform"}, Build: func(context.Context, d.Input, SourceInventory, []FrozenWriter) ([]flow.Writer, error) {
				id := "platform"
				if mode == "wrong-platform" {
					id = "foreign"
				}
				return []flow.Writer{groupedTestWriter{fixtureWriter{f}, id}}, nil
			}}
			r := WriterBuilder(func(context.Context, d.Input, SourceInventory, []FrozenWriter) ([]flow.Writer, error) {
				if mode == "missing-runtime" {
					return nil, nil
				}
				if mode == "nil-runtime" {
					return []flow.Writer{nil}, nil
				}
				id := "runtime"
				if mode == "wrong-runtime" {
					id = "foreign"
				}
				if mode == "alias" {
					id = "platform"
				}
				return []flow.Writer{groupedTestWriter{fixtureWriter{f}, id}}, nil
			})
			build, err := ComposeRuntimeWriters(r, p)
			if err != nil {
				t.Fatal(err)
			}
			if writers, err := build(context.Background(), f.in, SourceInventory{}, frozen); err == nil || writers != nil {
				t.Fatal("invalid combined group accepted")
			}
			if len(f.events) != 0 {
				t.Fatal("rejected group performed physical IO")
			}
		})
	}
}

func TestModuleProfileRecoveryOnlyRequiresNoForwardContextOrSourceDB(t *testing.T) {
	f := moduleTestInput(t)
	original := linuxFixture(t, f, &sourceFixture{})
	x, err := original.Discover(context.Background(), f.in)
	if err != nil {
		t.Fatal(err)
	}
	source := original.cfg
	source.Source = nil
	source.RecoveryOnly = true
	cfg, err := WithCaptureModules(source, nil)
	if err != nil {
		t.Fatal("recovery borrowed forward modules", err)
	}
	p, err := NewLinuxProfile(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = p.Discover(context.Background(), f.in); err == nil {
		t.Fatal("recovery-only rediscovered source")
	}
	if _, err = p.BindWriters(context.Background(), f.in, x); err != nil {
		t.Fatal("original bindings unavailable", err)
	}
	if _, err = cfg.BuildParts(f.in, SourceInventory{}, f.x.HoldUntil); err == nil {
		t.Fatal("recovery-only built new capture parts")
	}
	source.RecoveryOnly = false
	if _, err = WithCaptureModules(source, nil); err == nil {
		t.Fatal("forward missing module source accepted")
	}
}
