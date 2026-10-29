package systembackupkekadmission

import (
	"context"
	"errors"
	"testing"
	"time"

	r "clawreef/internal/systembackupkekregistry"
	"clawreef/internal/systembackupkms"
)

type capabilityFixture struct {
	originalFixture
	operation systembackupkms.Operation
}

func (c capabilityFixture) Operation() systembackupkms.Operation { return c.operation }
func (c capabilityFixture) NotBefore() time.Time                 { return c.until.Add(-2 * time.Minute) }

func capabilitiesFor(in r.AdmissionInput, now time.Time) Capabilities {
	return Capabilities{
		Generate: capabilityFixture{originalFixture{in.Observation.GenerateCapabilitySource, in.Candidate, "", now.Add(time.Minute)}, systembackupkms.Generate},
		Unwrap:   capabilityFixture{originalFixture{in.Observation.UnwrapCapabilitySource, in.Candidate, "", now.Add(time.Minute)}, systembackupkms.Unwrap},
	}
}

type originalFixture struct {
	r.SourceRecord
	binding  r.Binding
	revision string
	until    time.Time
}

func (o originalFixture) Source() r.SourceRecord { return o.SourceRecord }
func (o originalFixture) Binding() r.Binding     { return o.binding }
func (o originalFixture) SourceRevision() string { return o.revision }
func (o originalFixture) ValidUntil() time.Time  { return o.until }
func (o originalFixture) Recheck(context.Context, r.SQLReadView, r.LockedSnapshot, time.Time) error {
	return nil
}

type coverageFixture struct {
	snapshot r.Snapshot
	until    time.Time
}

func (c coverageFixture) Sources() []r.CoverageSource { return c.snapshot.Coverage }
func (c coverageFixture) References() []r.Reference   { return c.snapshot.References }
func (c coverageFixture) ExpectedEpoch() uint64       { return c.snapshot.Epoch }
func (c coverageFixture) ValidUntil() time.Time       { return c.until }
func (c coverageFixture) Recheck(context.Context, r.SQLReadView, r.LockedSnapshot, time.Time) error {
	return nil
}

func TestPrepareRequiresIndependentMappingAndCompleteCoverage(t *testing.T) {
	in, now := candidateFixture(t)
	in.Snapshot.Bindings = []r.BindingFacts{{Binding: in.Candidate, BindingSHA256: keyBindingHash(in.Candidate), RowVersion: 1}}
	in.Coverage = coverageFixture{in.Snapshot, now.Add(time.Minute)}
	o := originalFixture{in.Observation.MappingSource, in.Candidate, in.Observation.SourceRevision, now.Add(time.Minute)}
	prepared, err := Prepare(context.Background(), in, o, capabilitiesFor(in, now), now)
	if err != nil || prepared == nil {
		t.Fatalf("valid independent sources: %v", err)
	}
	if !prepared.Risk().SecurityBoundary {
		t.Fatal("security risk lost")
	}
	// Preparation freezes all mutable bytes and slice members.
	in.Candidate.GenerateRef.RawJSON[0] = '['
	in.Snapshot.Bindings[0].Binding.GenerateRef.RawJSON[0] = '['
	if prepared.Binding().GenerateRef.RawJSON[0] == '[' || prepared.ExpectedSnapshot().Bindings[0].Binding.GenerateRef.RawJSON[0] == '[' {
		t.Fatal("prepared data aliased caller")
	}
	base, now := candidateFixture(t)
	base.Snapshot.Bindings = []r.BindingFacts{{Binding: base.Candidate, BindingSHA256: keyBindingHash(base.Candidate), RowVersion: 1}}
	base.Coverage = coverageFixture{base.Snapshot, now.Add(time.Minute)}
	orig := originalFixture{base.Observation.MappingSource, base.Candidate, base.Observation.SourceRevision, now.Add(time.Minute)}
	for name, change := range map[string]func(*r.AdmissionInput, *originalFixture){
		"missing original": func(_ *r.AdmissionInput, o *originalFixture) { o.SourceRecord.RecordID = "other" },
		"rebound key":      func(_ *r.AdmissionInput, o *originalFixture) { o.binding.Key.ProviderVersion = "2" },
		"stale scan":       func(v *r.AdmissionInput, _ *originalFixture) { v.Coverage = coverageFixture{v.Snapshot, now} },
		"missing current binding": func(v *r.AdmissionInput, _ *originalFixture) {
			v.Snapshot.Bindings = []r.BindingFacts{}
			v.Coverage = coverageFixture{v.Snapshot, now.Add(time.Minute)}
		},
		"revoked generate": func(v *r.AdmissionInput, _ *originalFixture) {
			v.Snapshot.Bindings[0].GenerateRevoked = &r.Revocation{Purpose: r.GenerateRevocation}
			v.Coverage = coverageFixture{v.Snapshot, now.Add(time.Minute)}
		},
	} {
		t.Run(name, func(t *testing.T) {
			v, owner := copyInput(base), orig
			change(&v, &owner)
			if _, err := Prepare(context.Background(), v, owner, capabilitiesFor(v, now), now); !errors.Is(err, ErrCandidate) {
				t.Fatalf("accepted invalid admission: %v", err)
			}
		})
	}
	var missingOriginal *originalFixture
	if _, err := Prepare(context.Background(), base, missingOriginal, capabilitiesFor(base, now), now); !errors.Is(err, ErrCandidate) {
		t.Fatalf("typed nil original accepted: %v", err)
	}
}
