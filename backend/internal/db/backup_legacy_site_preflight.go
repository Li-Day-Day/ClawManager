package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
)

// These pins describe the directly observed 97-migration test installation.
// They are deliberately separate from the 136-migration ImportBackupCopy map.
const (
	legacySiteInventorySHA  = "71b22c009b3ad9bdeef324d2cafd2aa4c1a646110f2080d1b6f42746f8f7013f"
	legacySiteSchemaSHA     = "140b053e6d3a40a8b5d7c305e3429020a1bc394b3c156167d9683072ec0908bf"
	legacyDumpCopySchemaSHA = "ec1b3e004d83fb6e82aebecf33d1d5ad1d88cb2e094325c26aea9d3530d5e28b"
	legacySiteLedgerSHA     = "5d303453289c28d0b8abf7abab8b3abe15ad605079feb01e599d919b53068903"
	legacySiteServerUUID    = "f1f5f76a-95f5-11f1-b08e-366835b4a029"
)

// LegacySiteCopyPreflight is a read-only gate for a disposable database copy.
// It is not an import decision: no source row digests, copy preservation proof,
// or reviewed old-to-new SQL map are present yet.
type LegacySiteCopyPreflight struct {
	State                    string `json:"state"`
	SourceServerUUID         string `json:"source_server_uuid"`
	SourceSchemaSHA256       string `json:"source_schema_sha256"`
	SourceInventorySHA256    string `json:"source_inventory_sha256"`
	CopyServerUUID           string `json:"copy_server_uuid"`
	CopyDatabase             string `json:"copy_database"`
	CopySchemaSHA256         string `json:"copy_schema_sha256"`
	CopySchemaVariant        string `json:"copy_schema_variant"`
	LedgerSHA256             string `json:"ledger_sha256"`
	TableCount               int    `json:"table_count"`
	LegacyControlTables      int    `json:"legacy_control_tables"`
	DataPreservationVerified bool   `json:"data_preservation_verified"`
	MigrationAuthorized      bool   `json:"migration_authorized"`
}

func parseLegacySiteInventory(raw []byte) (BackupLegacyInventory, error) {
	var source BackupLegacyInventory
	if len(raw) == 0 || len(raw) > 2_000_000 {
		return source, errors.New("legacy source inventory unavailable")
	}
	h := sha256.Sum256(raw)
	if hex.EncodeToString(h[:]) != legacySiteInventorySHA || json.Unmarshal(raw, &source) != nil ||
		source.Version != 1 || source.ServerUUID != legacySiteServerUUID || source.Database != "clawmanager" ||
		source.LedgerSHA256 != legacySiteLedgerSHA || source.SchemaSHA256 != legacySiteSchemaSHA ||
		source.MigrationAuthorized || source.SchemaEquivalenceDone || len(source.Ledger) != 97 ||
		legacyInventoryLedgerHash(source.Ledger) != legacySiteLedgerSHA || len(source.Schema.Tables) != 99 ||
		importDigest(source.Schema) != legacySiteSchemaSHA {
		return BackupLegacyInventory{}, errors.New("legacy source inventory identity mismatch")
	}
	return source, nil
}

// PreflightLegacySiteCopy checks an isolated copy before any conversion DDL.
// The dump-copy variant accounts for the one reviewed MySQL 8.4.8 generated
// expression normalization observed when replaying the site's no-data dump.
// A matching schema and ledger alone never establish copied row equivalence.
func PreflightLegacySiteCopy(ctx context.Context, pool *sql.DB, inventoryRaw []byte) (LegacySiteCopyPreflight, error) {
	var report LegacySiteCopyPreflight
	if ctx == nil || pool == nil || ctx.Err() != nil {
		return report, errors.New("legacy copy preflight unavailable")
	}
	source, err := parseLegacySiteInventory(inventoryRaw)
	if err != nil {
		return report, err
	}
	tx, err := pool.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return report, err
	}
	defer tx.Rollback()
	var server, database string
	if err = tx.QueryRowContext(ctx, "SELECT @@server_uuid,DATABASE()").Scan(&server, &database); err != nil ||
		!regexpImportInventoryUUID.MatchString(server) || !regexpImportDatabase.MatchString(database) {
		return report, errors.New("legacy preflight requires an isolated cm_import_<32hex> database")
	}
	var journal int
	if err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='system_backup_v2_import_journal'").Scan(&journal); err != nil || journal != 0 {
		return report, errors.New("legacy copy already has an import journal")
	}
	firstLedger, err := readLegacyInventoryLedger(ctx, tx)
	if err != nil || legacyInventoryLedgerHash(firstLedger) != legacySiteLedgerSHA || !sameLegacyLedger(firstLedger, source.Ledger) {
		return report, errors.New("legacy copy ledger differs from site source")
	}
	firstSchema, err := readImportSchema(ctx, tx)
	if err != nil {
		return report, err
	}
	schemaSHA := importDigest(firstSchema)
	variant := ""
	switch schemaSHA {
	case legacySiteSchemaSHA:
		variant = "exact_source"
	case legacyDumpCopySchemaSHA:
		variant = "mysqldump_8_4_8"
	default:
		return report, errors.New("legacy copy schema differs from reviewed source/copy variants")
	}
	if err = assertImportSourceIdle(ctx, tx, backupImportMap{}, false); err != nil {
		return report, err
	}
	controlTables, err := assertLegacyControlTablesEmpty(source.Schema, func(query string) (uint64, error) {
		var rows uint64
		err := tx.QueryRowContext(ctx, query).Scan(&rows)
		return rows, err
	})
	if err != nil {
		return report, err
	}
	secondLedger, err := readLegacyInventoryLedger(ctx, tx)
	if err != nil || !sameLegacyLedger(firstLedger, secondLedger) {
		return report, errors.New("legacy copy ledger changed during preflight")
	}
	secondSchema, err := readImportSchema(ctx, tx)
	if err != nil || importDigest(secondSchema) != schemaSHA {
		return report, errors.New("legacy copy schema changed during preflight")
	}
	if err = tx.Commit(); err != nil {
		return report, err
	}
	return LegacySiteCopyPreflight{State: "read_only_schema_and_ledger_verified", SourceServerUUID: source.ServerUUID,
		SourceSchemaSHA256: source.SchemaSHA256, SourceInventorySHA256: legacySiteInventorySHA,
		CopyServerUUID: server, CopyDatabase: database, CopySchemaSHA256: schemaSHA,
		CopySchemaVariant: variant, LedgerSHA256: legacySiteLedgerSHA, TableCount: len(firstSchema.Tables),
		LegacyControlTables: controlTables}, nil
}

func assertLegacyControlTablesEmpty(source importSchema, countRows func(string) (uint64, error)) (int, error) {
	if countRows == nil {
		return 0, errors.New("legacy control table counter unavailable")
	}
	count := 0
	for _, table := range source.Tables {
		name := table.Name
		if !(strings.HasPrefix(name, "system_backup") || strings.HasPrefix(name, "system_maintenance") ||
			strings.HasPrefix(name, "system_restore") || strings.HasPrefix(name, "system_artifact")) {
			continue
		}
		quoted, err := importIdentifier(name)
		if err != nil {
			return 0, err
		}
		rows, err := countRows("SELECT COUNT(*) FROM " + quoted)
		if err != nil || rows != 0 {
			return 0, errors.New("legacy copy contains control history; reviewed empty-table conversion unavailable")
		}
		count++
	}
	if count != 35 {
		return 0, errors.New("legacy copy control table set changed")
	}
	return count, nil
}

func sameLegacyLedger(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
