package systembackupkms

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Synthetic original authority is ONLY a resolver unit-test double. Production
// must supply the original D/B Job guard, not this in-memory boolean.
type testOriginal struct {
	i       JobIdentity
	until   time.Time
	access  Access
	revoked bool
}

func (o *testOriginal) Identity() JobIdentity { return o.i }
func (o *testOriginal) ValidUntil() time.Time { return o.until }
func (o *testOriginal) Recheck(c context.Context, a Access) error {
	if c == nil || c.Err() != nil || o.revoked || a != o.access {
		return ErrPermission
	}
	return nil
}
func (o *testOriginal) WithUse(c context.Context, a Access, f func() error) error {
	if e := o.Recheck(c, a); e != nil {
		return e
	}
	if e := f(); e != nil {
		return e
	}
	return o.Recheck(c, a)
}

func testPermit(t *testing.T) (PermitMount, *testOriginal, ProviderPermit, ed25519.PrivateKey) {
	t.Helper()
	dir := t.TempDir()
	pub, priv, e := ed25519.GenerateKey(rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	a := Access{Request: testRequest(), Operation: Generate, Endpoint: "https://bao.example:8200", KeyName: "backup-key"}
	o := &testOriginal{i: JobIdentity{Namespace: "backup", PodUID: "pod-original", ServiceAccountUID: "sa-original", JobUID: "job-original", InvocationSHA256: hash([]byte("invocation")), ExecutionGrantSHA256: hash([]byte("existing-execution-grant"))}, until: time.Now().Add(time.Minute), access: a}
	c, e := TransitContext(a.Request)
	if e != nil {
		t.Fatal(e)
	}
	token := []byte("synthetic-token-only")
	p := ProviderPermit{Version: "system-backup-provider-permit.v1", Identity: o.i, Operation: Generate, Endpoint: a.Endpoint, KeyName: a.KeyName, ContextBase64: c, NotBefore: time.Now().Add(-time.Second), ExpiresAt: time.Now().Add(15 * time.Second), CredentialRef: "credential-v1", CredentialSHA256: hash(token)}
	m := PermitMount{PermitPath: filepath.Join(dir, "permit.json"), CredentialDirectory: dir, PublicKey: pub}
	if os.WriteFile(filepath.Join(dir, p.CredentialRef), token, 0600) != nil {
		t.Fatal("fixture")
	}
	writeTestPermit(t, &m, p, priv)
	return m, o, p, priv
}
func writeTestPermit(t *testing.T, m *PermitMount, p ProviderPermit, priv ed25519.PrivateKey) {
	t.Helper()
	body, _ := json.Marshal(p)
	raw, _ := json.Marshal(map[string]string{"payload_base64": base64.StdEncoding.EncodeToString(body), "signature_base64": base64.StdEncoding.EncodeToString(ed25519.Sign(priv, body))})
	if os.WriteFile(m.PermitPath, raw, 0600) != nil {
		t.Fatal("fixture")
	}
	m.PermitSHA256 = hash(raw)
}

func TestPinnedProviderPermitNeedsOriginalAuthority(t *testing.T) {
	for _, mode := range []string{"valid", "wrong-purpose", "cross-installation", "wrong-provider-version", "wrong-registry-version", "wrong-context", "wrong-pod", "wrong-job", "wrong-execution-grant", "wrong-invocation", "expired", "future", "excess-ttl", "credential-changed", "permit-removed", "permit-replaced", "original-revoked", "original-renewed", "missing-original"} {
		t.Run(mode, func(t *testing.T) {
			m, o, p, priv := testPermit(t)
			switch mode {
			case "wrong-purpose":
				p.Operation = Unwrap
			case "cross-installation":
				r := o.access.Request
				r.Context.InstallationID = "other"
				p.ContextBase64, _ = TransitContext(r)
			case "wrong-provider-version":
				r := o.access.Request
				r.Key.ProviderVersion = "1"
				p.ContextBase64, _ = TransitContext(r)
			case "wrong-registry-version":
				r := o.access.Request
				r.Key.RegistryVersion = "latest"
				p.ContextBase64, _ = TransitContext(r)
			case "wrong-context":
				r := o.access.Request
				r.Context.EnvelopeID = "other"
				p.ContextBase64, _ = TransitContext(r)
			case "wrong-pod":
				p.Identity.PodUID = "other"
			case "wrong-job":
				p.Identity.JobUID = "other"
			case "wrong-execution-grant":
				p.Identity.ExecutionGrantSHA256 = hash([]byte("other"))
			case "wrong-invocation":
				p.Identity.InvocationSHA256 = hash([]byte("other"))
			case "expired":
				p.ExpiresAt = time.Now().Add(-time.Second)
			case "future":
				p.NotBefore = time.Now().Add(time.Second)
			case "excess-ttl":
				p.ExpiresAt = p.NotBefore.Add(time.Minute)
			}
			writeTestPermit(t, &m, p, priv)
			if mode == "missing-original" {
				if _, e := NewPinnedJobResolver(m, nil); e == nil {
					t.Fatal("missing authority allowed")
				}
				return
			}
			r, e := NewPinnedJobResolver(m, o)
			if e != nil {
				t.Fatal(e)
			}
			switch mode {
			case "credential-changed":
				os.WriteFile(filepath.Join(m.CredentialDirectory, p.CredentialRef), []byte("different-token-only"), 0600)
			case "permit-removed":
				os.Remove(m.PermitPath)
			case "permit-replaced":
				p.CredentialRef = "credential-v2"
				writeTestPermit(t, &m, p, priv)
			case "original-revoked":
				o.revoked = true
			case "original-renewed":
				o.until = o.until.Add(time.Minute)
			}
			g, e := r.Resolve(context.Background(), o.access)
			defer clear(g.Secret)
			if mode == "valid" {
				if e != nil || len(g.Secret) == 0 {
					t.Fatal(e)
				}
				if g.Recheck(context.Background(), o.access) != nil {
					t.Fatal("valid recheck")
				}
				called := false
				if g.WithUse(context.Background(), o.access, func() error { called = true; return nil }) != nil || !called {
					t.Fatal("valid use")
				}
				o.revoked = true
				if g.Recheck(context.Background(), o.access) == nil {
					t.Fatal("revoke ignored")
				}
			} else if e == nil || len(g.Secret) != 0 {
				t.Fatal("invalid permit allowed")
			}
		})
	}
}

func TestPinnedProviderPermitFinalBoundary(t *testing.T) {
	for _, mode := range []string{"remove-permit", "remove-credential", "revoke-original", "change-access", "remove-after-use"} {
		t.Run(mode, func(t *testing.T) {
			m, o, _, _ := testPermit(t)
			r, e := NewPinnedJobResolver(m, o)
			if e != nil {
				t.Fatal(e)
			}
			g, e := r.Resolve(context.Background(), o.access)
			if e != nil {
				t.Fatal(e)
			}
			defer clear(g.Secret)
			a := o.access
			switch mode {
			case "remove-permit":
				os.Remove(m.PermitPath)
			case "remove-credential":
				os.Remove(filepath.Join(m.CredentialDirectory, "credential-v1"))
			case "revoke-original":
				o.revoked = true
			case "change-access":
				a.Request.Key.ProviderVersion = "2"
			}
			called := false
			e = g.WithUse(context.Background(), a, func() error {
				called = true
				if mode == "remove-after-use" {
					os.Remove(m.PermitPath)
				}
				return nil
			})
			if e == nil {
				t.Fatal("invalid use allowed")
			}
			if mode != "remove-after-use" && called {
				t.Fatal("callback on revoked material")
			}
		})
	}
}

func TestClosedPermitJSONRejectsDuplicates(t *testing.T) {
	var v struct {
		A string `json:"a"`
	}
	for _, raw := range []string{`{"a":"first","a":"last"}`, `{"unknown":1}`, `{} {}`} {
		if closedJSON([]byte(raw), &v) == nil {
			t.Fatal("accepted ambiguous permit")
		}
	}
}
