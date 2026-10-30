package publicadapter

import (
	"context"
	"time"

	"clawreef/internal/systembackup/flow"
	d "clawreef/internal/systembackupdispatch"
)

// RuntimeWriterMapping is D's admitted, task-scoped projection. On Bind it
// must come from the ORIGINAL durable mapping/reservations, not live discovery.
// Participants includes platform/background/external writers, not just Agents.
type RuntimeWriterMapping struct {
	Specs        []RuntimeWriterSpec
	Participants []ParticipantSpec
	// Platform contains D/C's existing concrete platform writers (for example
	// Deployment stop/witness/resume). They remain distinct from gate-only
	// participant proofs; constructors must not perform IO. No runtime instance
	// can be omitted from Specs merely because Platform is non-empty.
	Platform []flow.Writer
}

// RuntimeMappingResolver performs read-only binding; it must not reserve a
// generation, acquire a claim, open a gate or dispatch a runtime. A non-nil
// frozen slice means Bind/recovery, even when that slice has length zero.
type RuntimeMappingResolver func(context.Context, d.Input, SourceInventory, []FrozenWriter) (RuntimeWriterMapping, error)

// NewRuntimeLinuxProfileConfig fills LinuxProfile builder hooks for callers
// already holding admitted mappings. The unified D SQLRuntimeControl owns
// reservation/custody and exposes BuildWriters directly: use WithCaptureModules
// with that existing D builder rather than preparing reservations a second time.
// This lower-level factory performs no IO during construction.
// D retains its public Ports, mapping, callbacks, admission and inventory proof;
// nil inputs never select an experimental controller or an in-memory fallback.
// Callers must not prefill hooks or Participants: they come from this assembly
// and the task-specific authoritative mapping respectively.
func NewRuntimeLinuxProfileConfig(source LinuxProfileConfig, resolve RuntimeMappingResolver, runtime RuntimeWriterDependencies, modules *CaptureModules) (LinuxProfileConfig, error) {
	if source.BuildWriters != nil || source.BuildParts != nil || resolve == nil || nilValue(runtime.Ports) || runtime.Callbacks.Guard == nil || len(runtime.Participants) != 0 || (!source.RecoveryOnly && !validCaptureModules(modules)) || runtime.PollInterval < 0 || runtime.PollInterval > time.Second {
		return LinuxProfileConfig{}, d.ErrNotReady
	}
	source.BuildWriters = func(ctx context.Context, in d.Input, inv SourceInventory, frozen []FrozenWriter) ([]flow.Writer, error) {
		if nilValue(ctx) || ctx.Err() != nil || validateInput(in, true) != nil || in.Authority.TaskType != "backup" || d.ValidateBackupSpec(in.Backup) != nil {
			return nil, d.ErrNotReady
		}
		var detached []FrozenWriter
		if frozen != nil {
			detached = append(make([]FrozenWriter, 0, len(frozen)), frozen...)
		}
		mapping, err := resolve(ctx, cloneInput(in), cloneSourceInventory(inv), detached)
		if err != nil {
			return nil, classify(err)
		}
		deps := runtime
		deps.Participants = append([]ParticipantSpec(nil), mapping.Participants...)
		builder, err := NewRuntimeWriterBuilder(append([]RuntimeWriterSpec(nil), mapping.Specs...), deps)
		if err != nil {
			return nil, err
		}
		// Concrete writer construction enforces exact source ownership, supported
		// runtime capabilities, full callbacks and original restart reservations.
		writers, err := builder(ctx, cloneInput(in), cloneSourceInventory(inv), nil)
		if err != nil {
			return nil, err
		}
		writers = append(writers, append([]flow.Writer(nil), mapping.Platform...)...)
		if len(writers) > 10000 {
			return nil, d.ErrNotReady
		}
		ids := map[string]bool{}
		for _, writer := range writers {
			if nilValue(writer) || writer.ID() == "" || ids[writer.ID()] {
				return nil, d.ErrNotReady
			}
			ids[writer.ID()] = true
		}
		if frozen != nil {
			if len(frozen) != len(ids) {
				return nil, d.ErrNotReady
			}
			for _, original := range frozen {
				if !ids[original.ID] {
					return nil, d.ErrNotReady
				}
				delete(ids, original.ID)
			}
		}
		return writers, nil
	}
	return WithCaptureModules(source, modules)
}

func validCaptureModules(modules *CaptureModules) bool {
	return modules != nil && modules.resolve != nil && len(modules.modules) > 0 && hexHash.MatchString(modules.hash)
}

// WithCaptureModules is the unified production intake: keep D's actual writer
// callback (including SQL custody/recovery), replace only the explicitly opted-in
// part factory. Recovery-only construction requires no source DB or forward
// module/context credentials and can only Bind the original persisted plan.
func WithCaptureModules(source LinuxProfileConfig, modules *CaptureModules) (LinuxProfileConfig, error) {
	if source.BuildWriters == nil || (!source.RecoveryOnly && !validCaptureModules(modules)) {
		return LinuxProfileConfig{}, d.ErrNotReady
	}
	source.BuildParts = func(in d.Input, inv SourceInventory, hold time.Time) ([]JobPart, error) {
		if source.RecoveryOnly {
			return nil, d.ErrNotReady
		}
		if in.Authority.TaskType == "preflight" {
			return []JobPart{{Part: "source_inventory", Category: "preflight"}}, nil
		}
		return modules.BuildParts(in, inv, hold)
	}
	profile, err := NewLinuxProfile(source)
	if err != nil {
		return LinuxProfileConfig{}, err
	}
	// Return the validated defensive copy, ready for D's existing constructor.
	return profile.cfg, nil
}
