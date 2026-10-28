package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	ca "clawreef/internal/systembackupcatrust"
	nonce "clawreef/internal/systembackupnoncebootstrap"
	pd "clawreef/internal/systembackupproducer"
	sec "clawreef/internal/systembackupsecurity"
)

// Constructor model only; it must never be linked by main.
type materialCompositionAuthority struct{}

func (*materialCompositionAuthority) PrepareBootstrapCandidates(context.Context, sec.OfflineBootstrapGrant, sec.BootstrapConfig, pd.BootstrapConsumptionRequest) (sec.PreparedBootstrapCandidateAuthority, error) {
	return sec.PreparedBootstrapCandidateAuthority{}, sec.ErrRegistrationUnavailable
}

func TestBootstrapMaterialCompositionCannotBypassMissingAuthorityOrOwners(t *testing.T) {
	var output bytes.Buffer
	if code := runWithBootstrapMaterials(context.Background(), []string{"--apply"}, &output, linkedOwnerAdapters(), bootstrapMaterialInputs{}); code != 1 || output.Len() != 0 {
		t.Fatal("missing original authority reached run")
	}
	root := t.TempDir()
	now := time.Now().UTC()
	hash := strings.Repeat("a", 64)
	n := nonce.Binding{InstallationID: "installation_model", ServerUUID: "11111111-2222-3333-4444-555555555555", Database: "model", ConfigSHA256: hash, NotBefore: now, ExpiresAt: now.Add(time.Hour), Keys: []nonce.Key{{IdentityHash: hash, Version: "v1", ProviderIdentityHash: hash, ScopeHash: hash, DescriptorFile: filepath.Join(root, "nonce.json"), DescriptorSHA256: hash, MaterialFile: filepath.Join(root, "nonce.key"), MaterialSHA256: hash, ProtectedUntil: now.Add(2 * time.Hour)}}}
	a := ca.Binding{InstallationID: n.InstallationID, ServerUUID: n.ServerUUID, Database: n.Database, ConfigSHA256: hash, Purpose: "artifact_ca", ProviderIdentityHash: hash, ScopeHash: hash, DescriptorFile: filepath.Join(root, "ca.json"), DescriptorSHA256: hash, CAFile: filepath.Join(root, "ca.pem"), CASHA256: hash, Endpoint: "https://model.example", TargetIP: netip.MustParseAddr("127.0.0.1"), NotBefore: now, ExpiresAt: now.Add(time.Hour)}
	e := a
	e.Purpose = "evidence_ca"
	inputs := bootstrapMaterialInputs{Original: &materialCompositionAuthority{}, Nonce: n, ArtifactCA: a, EvidenceCA: e}
	// The constructor must reject a missing selection; merely adding the three
	// validators is not a candidate route or approval. No files/TLS/SQL exist.
	if _, err := composeBootstrapMaterials(linkedOwnerAdapters(), inputs); err == nil {
		t.Fatal("missing candidate selection accepted")
	}
	materials, _, err := composeBootstrapMaterialOwners(linkedOwnerAdapters(), inputs)
	if err != nil {
		t.Fatal(err)
	}
	if missing := sec.MissingBootstrapOwnerAdapters(materials); len(missing) != 24 {
		t.Fatal("remaining owners bypassed", missing)
	}
	if materials.Candidates != nil {
		t.Fatal("candidate route fabricated")
	}
	if _, err := json.Marshal(inputs.Nonce); err == nil {
		t.Fatal("private mapping serializable")
	}
	// Use the existing C1 comparison vector only in this test. It supplies no
	// production authority and its original synthetic authority refuses Apply.
	raw, err := os.ReadFile("../../../contracts/system-backup/v12/producer-authority-vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vectors struct {
		Positive []struct {
			ID    string          `json:"id"`
			Value json.RawMessage `json:"value"`
		} `json:"positive"`
	}
	if json.Unmarshal(raw, &vectors) != nil {
		t.Fatal("vectors")
	}
	for _, vector := range vectors.Positive {
		if vector.ID == "unconfigured_signing" {
			request, err := pd.DecodeResult(vector.Value)
			if err != nil {
				t.Fatal(err)
			}
			inputs.Selections = []pd.BootstrapCandidateSelection{{Purpose: "capture_signing", ReferenceIdentityHash: pd.Hash(hash), ReferenceVersion: "v1", MappingHash: pd.Hash(hash), Request: request, ResultVersion: "1"}}
		}
	}
	base := linkedOwnerAdapters()
	link, err := newBootstrapMaterialLink(base, inputs)
	if err != nil {
		t.Fatal(err)
	}
	// Mutating caller tables and selections cannot remove captured validators.
	base.Registries["rbac_bindings"] = nil
	inputs.Selections[0].Request.Admission.Unconfigured.PolicyHash = pd.Hash(strings.Repeat("b", 64))
	output.Reset()
	if code := runLinkedBootstrap(context.Background(), []string{"--requirements"}, &output, link); code != 2 {
		t.Fatal(code)
	}
	var report struct {
		Missing  []string `json:"missing_adapters"`
		Database bool     `json:"database_opened"`
	}
	if json.Unmarshal(output.Bytes(), &report) != nil || len(report.Missing) != 24 || report.Database {
		t.Fatal("real main route bypassed remaining owners", output.String())
	}
	for _, missing := range report.Missing {
		if missing == "reference:nonce_hmac" || missing == "reference:artifact_ca" || missing == "reference:evidence_ca" || missing == "registry:rbac_bindings" {
			t.Fatal("compiled material link lost a real validator", missing)
		}
	}
	output.Reset()
	if runLinkedBootstrap(context.Background(), []string{"--requirements"}, &output, &bootstrapMaterialLink{}) != 1 || output.Len() != 0 {
		t.Fatal("invalid compiled link fell back")
	}
	if _, err := json.Marshal(link); err == nil {
		t.Fatal("compiled link serialized")
	}
	if json.Unmarshal([]byte(`{}`), &bootstrapMaterialLink{}) == nil {
		t.Fatal("JSON created compiled link")
	}
}
