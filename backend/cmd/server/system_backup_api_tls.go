package main

import (
	"crypto/tls"
	"errors"
	"path/filepath"
)

// A's action authorizer requires a real HTTPS request. Forwarded headers cannot
// create Request.TLS. Mount an existing server certificate/key and terminate TLS
// on this listener (or use ingress TLS passthrough/re-encryption to this listener).
// With no inputs the existing HTTP listener remains available; task applications
// still cannot authorize a plaintext action request.
func loadSystemBackupAPITLS(getenv func(string) string) (*tls.Config, error) {
	fail := func() (*tls.Config, error) { return nil, errors.New("system backup API TLS unavailable") }
	if getenv == nil {
		return fail()
	}
	cert, key := getenv("SYSTEM_BACKUP_API_TLS_CERT_FILE"), getenv("SYSTEM_BACKUP_API_TLS_KEY_FILE")
	if cert == "" && key == "" {
		return nil, nil
	}
	if !filepath.IsAbs(cert) || !filepath.IsAbs(key) {
		return fail()
	}
	pair, err := tls.LoadX509KeyPair(cert, key)
	if err != nil {
		return fail()
	}
	return &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{pair}}, nil
}
