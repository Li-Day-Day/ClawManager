package systembackupsecurity

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Independent A review probes. Run in an isolated source copy with the runner.
// Negative cases intentionally fail until the production decoder is corrected.
func TestAReviewActualIssuerCandidate(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(os.Getenv("A_REVIEW_ROOT"), "docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json"))
	if err != nil {
		t.Fatal(err)
	}
	r, err := DecodeProviderIssuerRegistry(raw, "d-issuer-d7f0a14ec84d78927620d25f", "c1b76a352d37cee763235c645cf82ded5e4193cb66fb12614a83c4cb950ed4a8", time.Date(2026, 9, 24, 8, 0, 0, 0, time.UTC))
	if err != nil || len(r.Keys) != 1 || r.Scope.InstallationID != "installation_sbk_provider_zh_7474d6e0b052" {
		t.Fatalf("candidate rejected: %v", err)
	}
}

func TestAReviewProviderRegistryRequiresExplicitRevocation(t *testing.T) {
	_, pc, _ := providerSignedFixture(t)
	k := pc.Keys[0]
	r := ProviderIssuerRegistry{SchemaVersion: "system-backup-provider-issuers.draft.v1", Version: "v1", Scope: pc.Scope, Keys: []ProviderIssuerRegistryKey{{Issuer: k.Issuer, KeyID: k.KeyID, KeyVersion: k.KeyVersion, Purpose: k.Purpose, PublicKey: k.PublicKey, NotBefore: k.NotBefore, NotAfter: k.NotAfter, Revoked: true, TargetTypes: k.TargetTypes, ProofTypes: k.ProofTypes}}}
	raw, _ := json.Marshal(r)
	for name, replacement := range map[string]string{"case_alias_override": `"revoked":true,"Revoked":false`, "null_revocation": `"revoked":null`, "missing_revocation": ""} {
		t.Run(name, func(t *testing.T) {
			bad := strings.Replace(string(raw), `"revoked":true`, replacement, 1)
			if replacement == "" {
				bad = strings.Replace(bad, `,,`, `,`, 1)
			}
			parsed, err := DecodeProviderIssuerRegistry([]byte(bad), "v1", registrationHash(bad), pc.DatabaseNow)
			if err == nil {
				t.Fatalf("malformed registry accepted; revoked=%v", parsed.Keys[0].Revoked)
			}
		})
	}
}

func TestAReviewRBACRejectsCaseAliasRoleOverride(t *testing.T) {
	raw := []byte(`{"schema_version":"system-backup-registration-rbac.draft.v1","version":"v1","installation_id":"installation_synthetic","bindings":[{"actor_id":"42","subject":"review-subject","role":"viewer","Role":"security_admin"}]}`)
	a := PinnedRegistrationAuthority{
		InstallationID:            "installation_synthetic",
		RegistryBytes:             func(string, string, string) ([]byte, error) { return raw, nil },
		CheckSessionAndVisibility: func(context.Context, *sql.Tx, RegistrationActor, ProviderProofTarget) error { return nil },
		TargetBinding: func(context.Context, *sql.Tx, ProviderProofTarget) (ProviderProofBinding, error) {
			return ProviderProofBinding{}, nil
		},
		NonceKeys: func(context.Context, *sql.Tx, RegistrationConfig, []string) (map[string][]byte, error) {
			return nil, nil
		},
		ReserveMetadata: func(context.Context, *sql.Tx, int64, int) error { return nil },
	}
	err := a.Authorize(context.Background(), nil, RegistrationActor{UserID: 42, Subject: "review-subject", Session: "review-session"}, ProviderProofTarget{}, RegistrationConfig{RBACRegistryVersion: "v1", RBACRegistrySHA256: registrationHash(string(raw))})
	if err == nil {
		t.Fatal("ambiguous viewer/Role registry granted destructive authorization")
	}
}
