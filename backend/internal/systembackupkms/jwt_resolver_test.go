package systembackupkms

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestProjectedJWTKeepsOriginalJobScope(t *testing.T) {
	for _, mode := range []string{"valid", "wrong-role", "wrong-policy", "extra-policy", "identity-policy", "wrong-pod", "wrong-sa", "wrong-namespace", "renewable", "service-token", "long-ttl", "missing-metadata", "login-denied", "revoked-after-login", "callback-outlives-token", "permit-revoked-in-use", "expired-token-at-provider"} {
		t.Run(mode, func(t *testing.T) {
			m, o, p, priv := testPermit(t)
			identityFile := filepath.Join(m.CredentialDirectory, "projected-jwt")
			if os.WriteFile(identityFile, []byte("synthetic-projected-jwt"), 0600) != nil {
				t.Fatal("fixture")
			}
			p.CredentialRef = ""
			p.CredentialSHA256 = ""
			p.ExpiresAt = time.Now().Add(45 * time.Second)
			p.JWT = JWTIdentityGrant{Mount: "backup-jwt", Role: "exact-job-role", Policy: "exact-job-generate", IdentityFile: identityFile}
			var logins, providers atomic.Int32
			server := httptest.NewTLSServer(http.HandlerFunc(func(out http.ResponseWriter, req *http.Request) {
				if req.URL.Path == "/v1/auth/backup-jwt/login" {
					logins.Add(1)
					var body map[string]string
					if json.NewDecoder(req.Body).Decode(&body) != nil || len(body) != 2 || body["role"] != p.JWT.Role || body["jwt"] != "synthetic-projected-jwt" || req.Header.Get("X-Vault-Token") != "" {
						t.Error("wrong login identity")
					}
					if mode == "login-denied" {
						out.WriteHeader(403)
						return
					}
					meta := map[string]string{"role": p.JWT.Role, "pod_uid": o.i.PodUID, "service_account_uid": o.i.ServiceAccountUID, "namespace": o.i.Namespace}
					auth := map[string]any{"client_token": "synthetic-jwt-issued-token", "token_type": "batch", "renewable": false, "lease_duration": 10, "policies": []string{p.JWT.Policy}, "identity_policies": []string{}, "metadata": meta}
					switch mode {
					case "wrong-role":
						meta["role"] = "other"
					case "wrong-policy":
						auth["policies"] = []string{"other-purpose"}
					case "extra-policy":
						auth["policies"] = []string{p.JWT.Policy, "default"}
					case "identity-policy":
						auth["identity_policies"] = []string{"admin"}
					case "wrong-pod":
						meta["pod_uid"] = "other"
					case "wrong-sa":
						meta["service_account_uid"] = "other"
					case "wrong-namespace":
						meta["namespace"] = "other"
					case "renewable":
						auth["renewable"] = true
					case "service-token":
						auth["token_type"] = "service"
					case "long-ttl":
						auth["lease_duration"] = 21
					case "missing-metadata":
						delete(auth, "metadata")
					case "revoked-after-login":
						o.revoked = true
					case "callback-outlives-token", "expired-token-at-provider":
						auth["lease_duration"] = 1
					}
					json.NewEncoder(out).Encode(map[string]any{"auth": auth})
					return
				}
				if req.URL.Path != "/v1/transit/datakey/plaintext/backup-key" || req.Header.Get("X-Vault-Token") != "synthetic-jwt-issued-token" {
					t.Error("wrong provider request")
				}
				providers.Add(1)
				if mode == "expired-token-at-provider" {
					time.Sleep(1100 * time.Millisecond)
				}
				json.NewEncoder(out).Encode(map[string]any{"data": map[string]any{"plaintext": bytes.Repeat([]byte{7}, 32), "ciphertext": testCiphertext(), "key_version": 3}})
			}))
			defer server.Close()
			p.Endpoint = server.URL
			o.access.Endpoint = server.URL
			writeTestPermit(t, &m, p, priv)
			job, e := NewCaptureJob(context.Background(), testConfig(server), m, o, testRequest())
			if e != nil {
				t.Fatal(e)
			}
			defer job.Close()
			used := false
			var borrowed []byte
			wrapped, e := job.WithDEK(context.Background(), func(b []byte) error {
				used = true
				borrowed = b
				if mode == "callback-outlives-token" {
					time.Sleep(1100 * time.Millisecond)
				}
				if mode == "permit-revoked-in-use" {
					os.Remove(m.PermitPath)
				}
				return nil
			})
			valid := mode == "valid" || mode == "callback-outlives-token"
			if valid {
				if e != nil || !used || len(wrapped.Ciphertext) == 0 {
					t.Fatalf("valid JWT operation: %v", e)
				}
			} else if e == nil || len(wrapped.Ciphertext) != 0 {
				t.Fatal("invalid JWT allowed")
			}
			if !valid && mode != "permit-revoked-in-use" && used {
				t.Fatal("denied JWT invoked use")
			}
			if logins.Load() != 1 {
				t.Fatal("login retried")
			}
			if mode != "valid" && mode != "callback-outlives-token" && mode != "permit-revoked-in-use" && mode != "expired-token-at-provider" && providers.Load() != 0 {
				t.Fatal("invalid login reached provider")
			}
			if !bytes.Equal(borrowed, make([]byte, len(borrowed))) {
				t.Fatal("DEK retained")
			}
			if mode == "valid" {
				if _, e = job.WithDEK(context.Background(), func([]byte) error { t.Fatal("reused envelope"); return nil }); e == nil || logins.Load() != 1 {
					t.Fatal("original envelope was generated again")
				}
				resolver, e := NewJobResolver(testConfig(server), m, o)
				if e != nil {
					t.Fatal(e)
				}
				for n := 0; n < 2; n++ {
					grant, e := resolver.Resolve(context.Background(), o.access)
					clear(grant.Secret)
					if e != nil {
						t.Fatal(e)
					}
				}
				if logins.Load() != 3 {
					t.Fatal("resolver cached JWT exchange")
				}
				o.until = o.until.Add(time.Minute)
				if _, e = resolver.Resolve(context.Background(), o.access); e == nil {
					t.Fatal("original lifetime silently extended")
				}
			}
		})
	}
}

func TestJWTGrantCannotFallbackToPinnedToken(t *testing.T) {
	m, o, p, priv := testPermit(t)
	p.JWT = JWTIdentityGrant{Mount: "jwt", Role: "role", Policy: "policy", IdentityFile: filepath.Join(m.CredentialDirectory, "missing-jwt")}
	writeTestPermit(t, &m, p, priv)
	r, e := NewPinnedJobResolver(m, o)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = r.Resolve(context.Background(), o.access); e == nil {
		t.Fatal("mixed JWT/static grant accepted")
	}
}
