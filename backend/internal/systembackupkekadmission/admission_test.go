package systembackupkekadmission

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	first := copyInput(base)
	first.Snapshot.Bindings = []r.BindingFacts{}
	first.Coverage = coverageFixture{first.Snapshot, now.Add(time.Minute)}
	if _, err := Prepare(context.Background(), first, orig, capabilitiesFor(first, now), now); err != nil {
		t.Fatalf("independently authenticated first binding rejected: %v", err)
	}
	metadataChange := copyInput(base)
	oldRef := &metadataChange.Snapshot.Bindings[0].Binding.GenerateRef
	oldRef.RawJSON = bytes.Replace(oldRef.RawJSON, []byte("synthetic reference"), []byte("earlier description"), 1)
	oldHash := sha256.Sum256(oldRef.RawJSON)
	oldRef.SHA256 = hex.EncodeToString(oldHash[:])
	metadataChange.Coverage = coverageFixture{metadataChange.Snapshot, now.Add(time.Minute)}
	if _, err := Prepare(context.Background(), metadataChange, orig, capabilitiesFor(metadataChange, now), now); err != nil {
		t.Fatalf("redacted description change rejected: %v", err)
	}
	for name, change := range map[string]func(*r.AdmissionInput, *originalFixture){
		"missing original": func(_ *r.AdmissionInput, o *originalFixture) { o.SourceRecord.RecordID = "other" },
		"rebound key":      func(_ *r.AdmissionInput, o *originalFixture) { o.binding.Key.ProviderVersion = "2" },
		"stored rebind": func(v *r.AdmissionInput, _ *originalFixture) {
			v.Snapshot.Bindings[0].Binding.Key.ProviderVersion = "2"
			v.Coverage = coverageFixture{v.Snapshot, now.Add(time.Minute)}
		},
		"stale scan": func(v *r.AdmissionInput, _ *originalFixture) { v.Coverage = coverageFixture{v.Snapshot, now} },
		"dangling historical reference": func(v *r.AdmissionInput, _ *originalFixture) {
			v.Snapshot.Bindings = []r.BindingFacts{}
			v.Snapshot.References = []r.Reference{{Partition: r.RetainedArtifacts, SourceRecordID: "source", SourceRecordVersion: "v1", BackupPublicID: "sbk_one", AttemptNo: "1", EnvelopeID: "envelope", Key: v.Candidate.Key, BindingSHA256: keyBindingHash(v.Candidate), MappingSource: v.Observation.MappingSource, ExpectedRequestSource: v.Observation.MappingSource, LifecycleSource: v.Observation.MappingSource}}
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
