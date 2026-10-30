package systembackupsecurity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSigningJWTTokenSourceAuthenticatesExactPurposeAndMetadata(t *testing.T) {
	jwtFile := filepath.Join(t.TempDir(), "projected-jwt")
	if err := os.WriteFile(jwtFile, []byte(strings.Repeat("j", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	var requests int
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/v1/auth/signing-jwt/login" || r.Method != "POST" {
			t.Error("wrong login path")
		}
		var body struct {
			Role string `json:"role"`
			JWT  string `json:"jwt"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.Role != "capture-role" || body.JWT != strings.Repeat("j", 32) {
			t.Error("wrong JWT exchange")
		}
		json.NewEncoder(w).Encode(map[string]any{"auth": map[string]any{"client_token": strings.Repeat("t", 32), "token_type": "batch", "renewable": false, "lease_duration": 10, "policies": []string{"capture-policy"}, "token_policies": []string{"capture-policy"}, "identity_policies": []string{}, "metadata": map[string]string{"role": "capture-role", "namespace": "backup", "pod_uid": "pod-1", "service_account_uid": "sa-1"}}})
	}))
	defer server.Close()
	ca := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw})
	h := sha256.Sum256(ca)
	purposes := []string{"capture_certificate", "acceptance_record", "catalog_record"}
	mounts := make([]SigningJWTMount, 0, 3)
	for i, purpose := range purposes {
		role, policy := "capture-role", "capture-policy"
		if i > 0 {
			role, policy = purpose+"-role", purpose+"-policy"
		}
		file := jwtFile
		if i > 0 {
			file = filepath.Join(t.TempDir(), "jwt")
		}
		mounts = append(mounts, SigningJWTMount{Binding: TransitSigningBinding{InstallationID: "installation_test", Purpose: purpose, KeyID: purpose, KeyVersion: "opaque-v1", Endpoint: server.URL, KeyName: purpose, ProviderVersion: "1"}, AuthMount: "signing-jwt", Role: role, Policy: policy, JWTFile: file, CAPEM: ca, CASHA256: hex.EncodeToString(h[:])})
	}
	source, err := NewJWTSigningTokenSource(mounts)
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	request := TransitSigningRequest{Binding: mounts[0].Binding, InputSHA256: strings.Repeat("a", 64)}
	use := OriginalSigningUse{Request: request, Workload: SigningWorkloadIdentity{"backup", "pod-1", "sa-1"}, NotBefore: time.Now().Add(-time.Second), ExpiresAt: time.Now().Add(time.Minute), Recheck: func(context.Context, TransitSigningRequest) error { return nil }}
	token, err := source.ResolveSigningToken(context.Background(), use)
	if err != nil || token.Request != request || string(token.Secret) != strings.Repeat("t", 32) || requests != 1 {
		t.Fatalf("valid exchange rejected: %v", err)
	}
	if token.Recheck(context.Background(), request) != nil {
		t.Fatal("token changed before use")
	}
	if err := os.WriteFile(jwtFile, []byte(strings.Repeat("k", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	if token.Recheck(context.Background(), request) == nil {
		t.Fatal("replaced projected JWT accepted")
	}
	clearSigningToken(token.Secret)
	wrong := use
	wrong.Request.Binding.KeyVersion = "other"
	if _, err := source.ResolveSigningToken(context.Background(), wrong); err == nil || requests != 1 {
		t.Fatal("wrong-purpose role reached provider")
	}
}

func TestSigningJWTLoginRejectsWrongPolicyAndMetadata(t *testing.T) {
	m := SigningJWTMount{Role: "capture-role", Policy: "capture-policy"}
	w := SigningWorkloadIdentity{"backup", "pod-1", "sa-1"}
	base := map[string]any{"auth": map[string]any{"client_token": strings.Repeat("t", 32), "token_type": "batch", "renewable": false, "lease_duration": 10, "policies": []string{"capture-policy"}, "metadata": map[string]string{"role": "capture-role", "namespace": "backup", "pod_uid": "pod-1", "service_account_uid": "sa-1"}}}
	valid, _ := json.Marshal(base)
	if _, _, err := parseSigningJWTLogin(valid, m, w); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(map[string]any){
		"wrong policy":      func(a map[string]any) { a["policies"] = []string{"root"} },
		"wrong pod":         func(a map[string]any) { a["metadata"].(map[string]any)["pod_uid"] = "other" },
		"renewable":         func(a map[string]any) { a["renewable"] = true },
		"missing renewable": func(a map[string]any) { delete(a, "renewable") },
		"long token":        func(a map[string]any) { a["lease_duration"] = 21 },
	} {
		t.Run(name, func(t *testing.T) {
			var doc map[string]any
			json.Unmarshal(valid, &doc)
			auth := doc["auth"].(map[string]any)
			change(auth)
			raw, _ := json.Marshal(doc)
			if _, _, err := parseSigningJWTLogin(raw, m, w); err == nil {
				t.Fatal("invalid provider reply accepted")
			}
		})
	}
}
