// D-owned revision acceptance probes; copied into an isolated package by the runner.
package systembackupsecurity

import (
	"crypto/ed25519"
	"encoding/base64"
	"strings"
	"testing"
)

func TestDRevisionUnicodeSigningMetadata(t *testing.T) {
	for _, field := range []string{"key_id", "key_version"} {
		t.Run(field, func(t *testing.T) {
			proof := testProof()
			proof.Signature.Algorithm = "EdDSA"
			// Both lengths are within the public schema's character bounds.
			if field == "key_id" {
				proof.Signature.KeyID = strings.Repeat("界", 100)
			} else {
				proof.Signature.KeyVersion = strings.Repeat("界", 50)
			}
			// Deterministic synthetic key, never used by any real issuer.
			key := ed25519.NewKeyFromSeed(make([]byte, ed25519.SeedSize))
			adapter := Ed25519JWSVerifier{PublicKey: key.Public().(ed25519.PublicKey), KeyID: proof.Signature.KeyID, KeyVersion: proof.Signature.KeyVersion, Purpose: "strong_auth_issuer"}
			header := `{"alg":"EdDSA","key_version":` + jcsString(adapter.KeyVersion) + `,"kid":` + jcsString(adapter.KeyID) + `,"purpose":"strong_auth_issuer","typ":` + jcsString(DomainSeparator) + `}`
			proof.Signature.ProtectedHeader = base64.RawURLEncoding.EncodeToString([]byte(header))
			payload, err := CanonicalPayload(proof.Payload)
			if err != nil {
				t.Fatal(err)
			}
			input := proof.Signature.ProtectedHeader + "." + base64.RawURLEncoding.EncodeToString(payload)
			proof.Signature.Value = base64.RawURLEncoding.EncodeToString(ed25519.Sign(key, []byte(input)))
			if err := adapter.Verify(payload, proof.Signature); err != nil {
				t.Fatal("positive crypto control", err)
			}
			cfg := testConfig(adapter)
			cfg.TrustedSigners[proof.Payload.Issuer] = map[string]SignatureVerifier{adapter.KeyVersion: adapter}
			if _, err := Verify(proof, testRequest(), cfg); err != nil {
				t.Fatal("D-A-R1: schema-valid Unicode signing metadata rejected despite valid signature:", err)
			}
		})
	}
}

func TestDRevisionTemporaryCapabilityFailureIsNotUnsupported(t *testing.T) {
	for _, reason := range []string{"provider_unavailable", "credential_unavailable", "permission_denied", "response_invalid"} {
		t.Run(reason, func(t *testing.T) {
			e, p := testCapability(t)
			e.Capabilities[0].Status = "degraded"
			e.Capabilities[0].Reason = reason
			if err := ValidateCapabilityEvidence(e, p); err != nil {
				t.Fatal("positive degraded control", err)
			}
			e.Capabilities[0].Status = "unsupported"
			if err := ValidateCapabilityEvidence(e, p); err == nil {
				t.Fatal("D-A-R2: temporary capability failure accepted as deterministic unsupported")
			}
		})
	}
}
