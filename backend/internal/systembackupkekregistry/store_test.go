package systembackupkekregistry

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
	"time"
)

func testTypedReference(raw string) TypedReference {
	h := sha256.Sum256([]byte(raw))
	return TypedReference{RawJSON: []byte(raw), SHA256: hex.EncodeToString(h[:])}
}

func TestSemanticCorePreservesFirstProvenanceButAllowsRedactedDescription(t *testing.T) {
	b := Binding{
		InstallationID: "installation",
		GenerateRef:    testTypedReference(`{"purpose":"data_key_generation","description_redacted":"first"}`),
		UnwrapRef:      testTypedReference(`{"purpose":"kek_unwrap","description_redacted":"first"}`),
	}
	first, err := semanticCoreHash(b)
	if err != nil {
		t.Fatal(err)
	}
	firstRaw, firstRawHash, err := hashJSON(b)
	if err != nil {
		t.Fatal(err)
	}
	b.GenerateRef = testTypedReference(`{"purpose":"data_key_generation","description_redacted":"later"}`)
	later, err := semanticCoreHash(b)
	if err != nil || later != first {
		t.Fatalf("redacted description changed security core: %v", err)
	}
	prior := b
	prior.GenerateRef = testTypedReference(`{"purpose":"data_key_generation","description_redacted":"first"}`)
	if !SameSecurityBinding(prior, b) {
		t.Fatal("public semantic comparison rejected metadata-only change")
	}
	_, laterRawHash, err := hashJSON(b)
	if err != nil || laterRawHash == firstRawHash || len(firstRaw) == 0 {
		t.Fatalf("per-admission provenance lost: %v", err)
	}
	b.GenerateRef = testTypedReference(`{"purpose":"different","description_redacted":"later"}`)
	if changed, err := semanticCoreHash(b); err != nil || changed == first {
		t.Fatalf("security-bearing ref change accepted: %v", err)
	}
	if SameSecurityBinding(prior, b) {
		t.Fatal("public semantic comparison accepted changed purpose")
	}
	b = prior
	b.GenerateRef.SHA256 = firstRawHash
	if SameSecurityBinding(prior, b) {
		t.Fatal("public semantic comparison accepted mismatched typed-reference SHA")
	}
}

func TestSnapshotFactComparisonRetainsEmptyVsUnknownAndEpoch(t *testing.T) {
	now := time.Now().UTC()
	a := Snapshot{Epoch: 4, ObservedAt: now, Bindings: []BindingFacts{}, Coverage: []CoverageSource{}, References: []Reference{}}
	b := cloneSnapshot(a)
	b.ObservedAt = now.Add(time.Second)
	if !SameSnapshotFacts(a, b) {
		t.Fatal("SQL sample time mistaken for persisted change")
	}
	b.Epoch++
	if SameSnapshotFacts(a, b) {
		t.Fatal("fence advance ignored")
	}
	b = cloneSnapshot(a)
	b.References = nil
	if SameSnapshotFacts(a, b) {
		t.Fatal("unproven references treated as proven empty")
	}
}

func TestPurposeRevocationKeepsIndependentHistoricalUse(t *testing.T) {
	pin := ReferencePin{IdentityHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Version: "opaque-r1"}
	b := &Bound{epoch: 7, original: Snapshot{Epoch: 7, Bindings: []BindingFacts{{Binding: Binding{ConfigRef: pin}, RowVersion: 1, GenerateRevoked: &Revocation{Purpose: GenerateRevocation}}}}}
	if b.RequireUnrevoked(pin, GenerateRevocation) == nil {
		t.Fatal("revoked generation accepted")
	}
	if err := b.RequireUnrevoked(pin, UnwrapRevocation); err != nil {
		t.Fatalf("generation revocation destroyed independent unwrap fact: %v", err)
	}
	b.epoch++
	if b.RequireUnrevoked(pin, UnwrapRevocation) == nil {
		t.Fatal("stale bound snapshot accepted after same-transaction mutation")
	}
}
