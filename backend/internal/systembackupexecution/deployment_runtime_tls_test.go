package systembackupexecution

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNativeBackupAgentUsesPinnedTLS13CA(t *testing.T) {
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	cert := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "lite-agent.clawmanager.internal"}, DNSNames: []string{"lite-agent.clawmanager.internal"}, NotBefore: now.Add(-time.Minute), NotAfter: now.Add(time.Hour), BasicConstraintsValid: true, IsCA: true, KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, key.Public(), key)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/health" || r.Header.Get("X-ClawManager-Control-Token") != "fixture-token" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	server.TLS = &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}, MinVersion: tls.VersionTLS13}
	server.StartTLS()
	defer server.Close()
	dir := t.TempDir()
	ca := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	caPath, tokenPath := filepath.Join(dir, "ca.pem"), filepath.Join(dir, "token")
	if err := os.WriteFile(caPath, ca, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(tokenPath, []byte("fixture-token"), 0600); err != nil {
		t.Fatal(err)
	}
	agent, err := nativeBackupAgent(RuntimeSourceConfig{AgentTokenFile: tokenPath, AgentCAFile: caPath, AgentCASHA256: hash(ca)})
	if err != nil {
		t.Fatal(err)
	}
	client, ok := agent.(interface {
		Health(context.Context, string) error
	})
	if !ok || client.Health(context.Background(), server.URL) != nil {
		t.Fatal("pinned native Agent TLS connection failed")
	}
	if _, err := nativeBackupAgent(RuntimeSourceConfig{AgentTokenFile: tokenPath, AgentCAFile: caPath, AgentCASHA256: hash([]byte("other CA"))}); err == nil {
		t.Fatal("changed CA admitted against pinned digest")
	}
}
