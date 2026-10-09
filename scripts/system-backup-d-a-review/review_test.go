// D-owned cross-owner acceptance probes. Run in a scratch copy of A's package
// via ../system-backup-d-a-review.ps1; do not add these to A's implementation.
package systembackupsecurity

import (
	"bytes"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestDReviewCanonicalPayloadJCSStrings(t *testing.T) {
	p := testProof().Payload
	p.Subject = "user:<>&\u2028\u2029"
	got, err := CanonicalPayload(p)
	if err != nil {
		t.Fatal(err)
	}
	// All keys are ASCII and the payload has no numbers. JCS preserves these
	// string characters literally; Go's default HTML/JS escaping changes bytes.
	if !bytes.Contains(got, []byte(`"subject":"`+p.Subject+`"`)) {
		t.Fatal("D-A-01: canonical signature bytes escape valid JCS string characters")
	}
}

func TestDReviewMissingRetainedNonceKeyFailsClosed(t *testing.T) {
	cfg := testConfig(SignatureVerifierFunc(func([]byte, ProofSignature) error { return nil }))
	cfg.NonceHMACKeys["retained-old-version"] = nil
	if _, err := Verify(testProof(), testRequest(), cfg); err == nil {
		t.Fatal("D-A-02: accepted proof while a configured retained nonce key is unavailable")
	}
}

func TestDReviewProviderTimeWindow(t *testing.T) {
	now := time.Date(2026, 9, 20, 1, 2, 0, 0, time.UTC)
	for _, tc := range []struct{ name, issued, expiry string }{
		{"expired_within_skew", "2026-09-20T01:01:00Z", "2026-09-20T01:01:50Z"},
		{"lifetime_exceeds_max_age", "2026-09-20T01:01:00Z", "2026-09-20T01:06:20Z"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := testProviderRegistration()
			p.Proof.IssuedAt, p.Proof.ExpiresAt = tc.issued, tc.expiry
			err := VerifyProviderProof(p, now, 5*time.Minute, 30*time.Second,
				ProviderProofVerifierFunc(func(ProviderProofTarget, ProviderProof, []byte) error { return nil }))
			if err == nil {
				t.Fatal("D-A-03: accepted provider proof outside plan 14.2 time bounds")
			}
		})
	}
}

func TestDReviewProviderErrorsDoNotExposeAdapterText(t *testing.T) {
	const synthetic = "SYNTHETIC_PRIVATE_PROVIDER_ERROR"
	err := VerifyProviderProof(testProviderRegistration(), time.Date(2026, 9, 20, 1, 2, 0, 0, time.UTC),
		5*time.Minute, 0, ProviderProofVerifierFunc(func(ProviderProofTarget, ProviderProof, []byte) error {
			return errors.New(synthetic)
		}))
	if err == nil {
		t.Fatal("expected signature rejection")
	}
	if strings.Contains(err.Error(), synthetic) {
		t.Fatal("D-A-04: security boundary returned raw provider adapter error")
	}
}

func TestDReviewProviderPublicIDAndFieldBounds(t *testing.T) {
	for _, tc := range []string{"non_uuid", "oversized_resource_version"} {
		t.Run(tc, func(t *testing.T) {
			p := testProviderRegistration()
			if tc == "non_uuid" {
				p.Target.TargetPublicID = "sxa_x"
			} else {
				v := strings.Repeat("x", 257)
				p.Proof.ResourceVersion = &v
			}
			err := VerifyProviderProof(p, time.Date(2026, 9, 20, 1, 2, 0, 0, time.UTC), 5*time.Minute, 0,
				ProviderProofVerifierFunc(func(ProviderProofTarget, ProviderProof, []byte) error { return nil }))
			if err == nil {
				t.Fatal("D-A-05: accepted provider identity outside plan/schema bounds")
			}
		})
	}
}
