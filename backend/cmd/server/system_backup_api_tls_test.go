package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBackupAPITLSUsesActualHandshakeAndRejectsPartialInputs(t *testing.T) {
	if cfg, err := loadSystemBackupAPITLS(func(string) string { return "" }); err != nil || cfg != nil {
		t.Fatal("default listener changed")
	}
	for _, values := range []map[string]string{
		{"SYSTEM_BACKUP_API_TLS_CERT_FILE": "relative.pem", "SYSTEM_BACKUP_API_TLS_KEY_FILE": "relative.key"},
		{"SYSTEM_BACKUP_API_TLS_CERT_FILE": filepath.Join(t.TempDir(), "missing-private-path")},
	} {
		if cfg, err := loadSystemBackupAPITLS(func(k string) string { return values[k] }); cfg != nil || err == nil || strings.Contains(err.Error(), "missing-private-path") {
			t.Fatal("partial/private input escaped")
		}
	}
	root := t.TempDir()
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	template := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "localhost"}, NotBefore: now.Add(-time.Hour), NotAfter: now.Add(time.Hour), DNSNames: []string{"localhost"}, IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, template, template, pub, key)
	if err != nil {
		t.Fatal(err)
	}
	private, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	certFile, keyFile := filepath.Join(root, "server.pem"), filepath.Join(root, "server.key")
	if os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0600) != nil || os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: private}), 0600) != nil {
		t.Fatal("could not write model TLS inputs")
	}
	values := map[string]string{"SYSTEM_BACKUP_API_TLS_CERT_FILE": certFile, "SYSTEM_BACKUP_API_TLS_KEY_FILE": keyFile}
	cfg, err := loadSystemBackupAPITLS(func(k string) string { return values[k] })
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil || !r.TLS.HandshakeComplete {
			http.Error(w, "not_ready", 503)
			return
		}
		_, _ = io.WriteString(w, "real_tls")
	}))
	server.TLS = cfg
	server.StartTLS()
	defer server.Close()
	response, err := server.Client().Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil || response.StatusCode != 200 || string(body) != "real_tls" {
		t.Fatal("listener did not establish TLS")
	}
}
