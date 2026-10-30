package db

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"testing"
)

func TestLegacySitePreflightPinsDirectSourceAndCopyDelta(t *testing.T) {
	liveRaw, err := os.ReadFile("../../../docs/evidence/d-existing-db-live-inventory-direct-20261030.json")
	if err != nil {
		t.Fatal(err)
	}
	source, err := parseLegacySiteInventory(liveRaw)
	if err != nil {
		t.Fatal(err)
	}
	if source.SchemaSHA256 != legacySiteSchemaSHA || legacyInventoryLedgerHash(source.Ledger) != legacySiteLedgerSHA {
		t.Fatal("direct source identity changed")
	}
	mutated := append(bytes.Clone(liveRaw), ' ')
	if _, err := parseLegacySiteInventory(mutated); err == nil {
		t.Fatal("modified inventory accepted")
	}
	copyRaw, err := os.ReadFile("../../../docs/evidence/d-existing-db-source-schema-candidate-20261030.json")
	if err != nil {
		t.Fatal(err)
	}
	var copyProfile struct {
		Schema       importSchema `json:"schema"`
		SchemaSHA256 string       `json:"schema_sha256"`
	}
	if err := json.Unmarshal(copyRaw, &copyProfile); err != nil {
		t.Fatal(err)
	}
	if copyProfile.SchemaSHA256 != legacyDumpCopySchemaSHA || importDigest(copyProfile.Schema) != legacyDumpCopySchemaSHA {
		t.Fatal("dump copy schema pin changed")
	}
	if len(source.Schema.Facts) != len(copyProfile.Schema.Facts) || len(source.Schema.Tables) != len(copyProfile.Schema.Tables) {
		t.Fatal("source/copy inventory shape changed")
	}
	for i := range source.Schema.Tables {
		if source.Schema.Tables[i].Name != copyProfile.Schema.Tables[i].Name || !sameLegacyLedger(source.Schema.Tables[i].Columns, copyProfile.Schema.Tables[i].Columns) {
			t.Fatal("source/copy table changed", i)
		}
	}
	difference := 0
	for group := range source.Schema.Facts {
		if len(source.Schema.Facts[group]) != len(copyProfile.Schema.Facts[group]) {
			t.Fatal("source/copy fact count changed", group)
		}
		for row := range source.Schema.Facts[group] {
			a, b := source.Schema.Facts[group][row], copyProfile.Schema.Facts[group][row]
			if len(a) != len(b) {
				t.Fatal("source/copy fact width changed", group, row)
			}
			for col := range a {
				if (a[col] == nil) != (b[col] == nil) {
					t.Fatal("source/copy NULL changed", group, row, col)
				}
				if a[col] != nil && *a[col] != *b[col] {
					difference++
					if group != 1 || col != 9 || a[0] == nil || *a[0] != "system_artifact_leases" || a[1] == nil || *a[1] != "delete_source_guard" ||
						b[col] == nil || !bytes.Contains([]byte(*b[col]), []byte("convert(`source_public_id` using utf8mb4)")) {
						t.Fatal("unreviewed source/copy schema difference", group, row, col)
					}
				}
			}
		}
	}
	if difference != 1 {
		t.Fatal("expected exactly one reviewed dump normalization", difference)
	}
	if _, err := PreflightLegacySiteCopy(context.Background(), nil, liveRaw); err == nil {
		t.Fatal("preflight accepted a missing isolated database")
	}
	queries := map[string]bool{}
	count, err := assertLegacyControlTablesEmpty(source.Schema, func(query string) (uint64, error) {
		queries[query] = true
		return 0, nil
	})
	if err != nil || count != 35 || len(queries) != 35 {
		t.Fatal("reviewed empty control table set changed", count, err)
	}
	if _, err := assertLegacyControlTablesEmpty(source.Schema, func(query string) (uint64, error) {
		if query == "SELECT COUNT(*) FROM `system_backup_events`" {
			return 1, nil
		}
		return 0, nil
	}); err == nil {
		t.Fatal("nonempty legacy control table accepted")
	}
}
