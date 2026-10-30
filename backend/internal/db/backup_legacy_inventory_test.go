package db

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"strings"
	"testing"
)

const siteLedgerSHA = "5d303453289c28d0b8abf7abab8b3abe15ad605079feb01e599d919b53068903"

func TestLegacyInventorySiteLedgerPin(t *testing.T) {
	raw, err := os.ReadFile("../../../docs/evidence/d-existing-db-ledger-20261030.txt")
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(raw)
	if got := hex.EncodeToString(sum[:]); got != siteLedgerSHA {
		t.Fatalf("site ledger bytes changed: %s", got)
	}
	if !strings.HasSuffix(string(raw), "\n") || strings.Contains(string(raw), "\r") {
		t.Fatal("site ledger must preserve exact LF bytes")
	}
	names := strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n")
	if len(names) != 97 || legacyInventoryLedgerHash(names) != siteLedgerSHA {
		t.Fatal("site ledger count or digest changed")
	}
}

func TestLegacyInventoryPinsRejectMalformedInput(t *testing.T) {
	server := "f1f5f76a-95f5-11f1-b08e-366835b4a029"
	if !validImportInventoryPin(server, "clawmanager", siteLedgerSHA) {
		t.Fatal("site pins rejected")
	}
	for _, pin := range []struct{ server, database, ledger string }{
		{strings.Replace(server, "-", "x", 1), "clawmanager", siteLedgerSHA},
		{server, "clawmanager;DROP", siteLedgerSHA},
		{server, "", siteLedgerSHA},
		{server, "clawmanager", strings.ToUpper(siteLedgerSHA)},
		{server, "clawmanager", "0"},
	} {
		if validImportInventoryPin(pin.server, pin.database, pin.ledger) {
			t.Fatalf("malformed pin accepted: %#v", pin)
		}
	}
}

func TestLegacyInventoryArtifactCannotClaimMigration(t *testing.T) {
	raw, err := EncodeBackupLegacyInventory(BackupLegacyInventory{
		Version: 1, ServerUUID: "f1f5f76a-95f5-11f1-b08e-366835b4a029",
		Database: "clawmanager", LedgerSHA256: siteLedgerSHA,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, claim := range []string{`"migration_authorized":false`, `"schema_equivalence_verified":false`} {
		if !strings.Contains(string(raw), claim) {
			t.Fatalf("read-only boundary missing: %s", claim)
		}
	}
}
