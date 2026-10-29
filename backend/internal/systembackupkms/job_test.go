package systembackupkms

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJobConstructionUsesIndependentCaptureAndRecovery(t *testing.T) {
	s := httptest.NewTLSServer(http.HandlerFunc(func(out http.ResponseWriter, r *http.Request) {
		data := map[string]any{"plaintext": bytes.Repeat([]byte{7}, 32)}
		switch r.URL.Path {
		case "/v1/transit/datakey/plaintext/backup-key":
			data["ciphertext"] = testCiphertext()
			data["key_version"] = 3
		case "/v1/transit/decrypt/backup-key":
		default:
			t.Error("unexpected provider path")
		}
		json.NewEncoder(out).Encode(map[string]any{"data": data})
	}))
	defer s.Close()
	m, o, p, priv := testPermit(t)
	o.access.Endpoint = s.URL
	p.Endpoint = s.URL
	writeTestPermit(t, &m, p, priv)
	j, e := NewCaptureJob(context.Background(), testConfig(s), m, o, testRequest())
	if e != nil {
		t.Fatal(e)
	}
	defer j.Close()
	var borrowed []byte
	wrapped, e := j.WithDEK(context.Background(), func(b []byte) error { borrowed = b; return nil })
	if e != nil {
		t.Fatal(e)
	}
	if !bytes.Equal(borrowed, make([]byte, 32)) {
		t.Fatal("callback buffer retained")
	}
	o.revoked = true
	if _, e = j.WithDEK(context.Background(), func([]byte) error { t.Fatal("revoked capture used"); return nil }); e == nil {
		t.Fatal("revoked capture success")
	}
	// Separate current recovery authority; the disabled forward object is never
	// consulted. The retained exact mapping still selects provider version 3.
	rm, ro, rp, rpriv := testPermit(t)
	ro.access.Endpoint = s.URL
	ro.access.Operation = Unwrap
	rp.Endpoint = s.URL
	rp.Operation = Unwrap
	writeTestPermit(t, &rm, rp, rpriv)
	u, e := NewRecoveryJob(context.Background(), testConfig(s), rm, ro, testRequest())
	if e != nil {
		t.Fatal(e)
	}
	defer u.Close()
	used := false
	if e = u.WithDEK(context.Background(), wrapped, func(b []byte) error {
		used = true
		if !bytes.Equal(b, bytes.Repeat([]byte{7}, 32)) {
			t.Fatal("recovered plaintext")
		}
		return nil
	}); e != nil || !used {
		t.Fatalf("recovery depended on forward: %v", e)
	}
}
