package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"clawreef/internal/systembackupobserver"
	"github.com/go-sql-driver/mysql"
)

func main() {
	kind := flag.String("kind", "", "backup or preflight")
	id := flag.String("public-id", "", "task public ID")
	version := flag.Uint64("config-version", 0, "expected config version")
	actor := flag.String("actor-id", "", "expected administrator ID")
	keyHash := flag.String("key-sha256", "", "SHA-256 of expected idempotency key")
	flag.Parse()
	if flag.NArg() != 0 {
		fail()
	}
	pins := systembackupobserver.Pins{InstallationID: os.Getenv("SBK_OBSERVER_INSTALLATION_ID"), ServerUUID: os.Getenv("SBK_OBSERVER_SERVER_UUID"), Database: os.Getenv("SBK_OBSERVER_DATABASE"), User: os.Getenv("SBK_OBSERVER_USER"), Host: os.Getenv("SBK_OBSERVER_HOST")}
	if pins.Validate() != nil {
		fail()
	}
	raw, err := os.ReadFile(os.Getenv("SBK_OBSERVER_DSN_FILE"))
	if err != nil || len(raw) > 16384 {
		fail()
	}
	cfg, err := mysql.ParseDSN(strings.TrimSpace(string(raw)))
	if err != nil || cfg.DBName != pins.Database || cfg.User != pins.User || cfg.MultiStatements || cfg.AllowAllFiles || cfg.AllowCleartextPasswords || cfg.InterpolateParams || len(cfg.Params) != 0 {
		fail()
	}
	// Remote observers require verified TLS. The built-in driver "true" mode
	// verifies the certificate and server name; skip-verify/preferred fail.
	host, _, err := net.SplitHostPort(cfg.Addr)
	ip := net.ParseIP(host)
	if cfg.Net != "tcp" || err != nil || cfg.TLSConfig != "true" && !(ip != nil && ip.IsLoopback() && cfg.TLSConfig == "") {
		fail()
	}
	if caPath := os.Getenv("SBK_OBSERVER_CA_FILE"); caPath != "" {
		if cfg.TLSConfig != "true" {
			fail()
		}
		ca, err := os.ReadFile(caPath)
		if err != nil || len(ca) > 65536 {
			fail()
		}
		tlsConfig := observerTLS(host, ca)
		if tlsConfig == nil {
			fail()
		}
		cfg.TLS = tlsConfig
	}
	cfg.ParseTime = true
	cfg.Loc = time.UTC
	cfg.Timeout = 5 * time.Second
	cfg.ReadTimeout = 8 * time.Second
	cfg.WriteTimeout = 5 * time.Second
	connector, err := mysql.NewConnector(cfg)
	if err != nil {
		fail()
	}
	db := sql.OpenDB(connector)
	defer db.Close()
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(0)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	result, err := systembackupobserver.Observe(ctx, db, pins, systembackupobserver.Request{Kind: *kind, PublicID: *id, ConfigVersion: *version, ActorID: *actor, IdempotencyKeySHA256: *keyHash})
	if err != nil {
		fail()
	}
	if json.NewEncoder(os.Stdout).Encode(result) != nil {
		fail()
	}
}

func observerTLS(host string, ca []byte) *tls.Config {
	pool := x509.NewCertPool()
	if host == "" || !pool.AppendCertsFromPEM(ca) {
		return nil
	}
	return &tls.Config{RootCAs: pool, ServerName: host, MinVersion: tls.VersionTLS12}
}

func fail() { fmt.Fprintln(os.Stderr, "system backup observer unavailable"); os.Exit(1) }
