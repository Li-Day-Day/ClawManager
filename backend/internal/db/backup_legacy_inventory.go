package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var regexpImportInventoryFilename = regexp.MustCompile(`^[0-9]{3}_[A-Za-z0-9_-]+\.sql$`)
var regexpImportInventoryUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// BackupLegacyInventory is schema and migration provenance only. It contains
// no application rows, connection strings, or credentials. Its schema facts
// use the same representation as the reviewed copy importer.
type BackupLegacyInventory struct {
	Version               int          `json:"version"`
	ServerUUID            string       `json:"server_uuid"`
	Database              string       `json:"database"`
	LedgerSHA256          string       `json:"ledger_sha256"`
	Ledger                []string     `json:"ledger"`
	SchemaSHA256          string       `json:"schema_sha256"`
	Schema                importSchema `json:"schema"`
	MigrationAuthorized   bool         `json:"migration_authorized"`
	SchemaEquivalenceDone bool         `json:"schema_equivalence_verified"`
}

// CaptureBackupLegacyInventory reads only information_schema and the migration
// ledger. The caller must pin all three target identifiers; an inventory is
// never permission to migrate. A read-only transaction and a second observation
// reject changes while the inventory is assembled.
func CaptureBackupLegacyInventory(ctx context.Context, pool *sql.DB, serverUUID, database, ledgerSHA string) (BackupLegacyInventory, error) {
	var out BackupLegacyInventory
	if ctx == nil || pool == nil || !validImportInventoryPin(serverUUID, database, ledgerSHA) {
		return out, errors.New("legacy inventory pins invalid")
	}
	tx, err := pool.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	var observedServer, observedDatabase string
	if err = tx.QueryRowContext(ctx, "SELECT @@server_uuid,DATABASE()").Scan(&observedServer, &observedDatabase); err != nil || observedServer != serverUUID || observedDatabase != database {
		return out, errors.New("legacy inventory target identity mismatch")
	}
	before, err := readLegacyInventoryLedger(ctx, tx)
	if err != nil || legacyInventoryLedgerHash(before) != ledgerSHA {
		return out, errors.New("legacy inventory ledger mismatch")
	}
	first, err := readImportSchema(ctx, tx)
	if err != nil {
		return out, err
	}
	// A catalog already containing the new execution schema is outside this
	// source profile. Do not reinterpret it as the 97-migration installation.
	for _, table := range first.Tables {
		if strings.HasPrefix(table.Name, "system_backup_v2_") {
			return out, errors.New("legacy inventory source already contains v2 tables")
		}
	}
	after, err := readLegacyInventoryLedger(ctx, tx)
	if err != nil || legacyInventoryLedgerHash(after) != ledgerSHA {
		return out, errors.New("legacy inventory ledger changed")
	}
	second, err := readImportSchema(ctx, tx)
	if err != nil || importDigest(first) != importDigest(second) {
		return out, errors.New("legacy inventory schema changed")
	}
	if err = tx.Commit(); err != nil {
		return out, err
	}
	out = BackupLegacyInventory{
		Version: 1, ServerUUID: serverUUID, Database: database,
		LedgerSHA256: ledgerSHA, Ledger: before,
		SchemaSHA256: importDigest(first), Schema: first,
	}
	return out, nil
}

func validImportInventoryPin(serverUUID, database, ledgerSHA string) bool {
	if !regexpImportInventoryUUID.MatchString(serverUUID) || len(database) == 0 || len(database) > 64 || len(ledgerSHA) != 64 {
		return false
	}
	for _, c := range database {
		if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	_, err := hex.DecodeString(ledgerSHA)
	return err == nil && strings.ToLower(ledgerSHA) == ledgerSHA
}

func readLegacyInventoryLedger(ctx context.Context, tx *sql.Tx) ([]string, error) {
	rows, err := tx.QueryContext(ctx, "SELECT filename FROM schema_migrations ORDER BY BINARY filename")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var names []string
	last := ""
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			return nil, err
		}
		if !regexpImportInventoryFilename.MatchString(name) || (len(names) > 0 && name <= last) || len(names) >= 512 {
			return nil, fmt.Errorf("legacy inventory migration filename invalid")
		}
		names = append(names, name)
		last = name
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if len(names) == 0 {
		return nil, errors.New("legacy inventory ledger empty")
	}
	return names, nil
}

func legacyInventoryLedgerHash(names []string) string {
	h := sha256.New()
	for _, name := range names {
		h.Write([]byte(name))
		h.Write([]byte{'\n'})
	}
	return hex.EncodeToString(h.Sum(nil))
}

// EncodeBackupLegacyInventory bounds the metadata artifact before it leaves the
// trusted database process. It does not serialize any table rows.
func EncodeBackupLegacyInventory(in BackupLegacyInventory) ([]byte, error) {
	raw, err := json.Marshal(in)
	if err != nil || len(raw) > 16*1024*1024 {
		return nil, errors.New("legacy inventory metadata too large")
	}
	return append(raw, '\n'), nil
}
