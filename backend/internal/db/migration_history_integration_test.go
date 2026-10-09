//go:build systembackup_integration

package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"clawreef/internal/config"
	c "clawreef/internal/systembackupcontroller"
)

// This destructive fixture setup is restricted to the smoke-created temporary
// MySQL, after its app was stopped and its namespace/UUID marker was verified.
// These historical SQL bytes are synthetic, never production provenance.
func TestDReviewedHistoryMySQL(t *testing.T) {
	testDReviewedHistory(t, false)
}

func TestDReviewedHistoryCLI(t *testing.T) {
	testDReviewedHistory(t, true)
}

func testDReviewedHistory(t *testing.T, cli bool) {
	run, uid := os.Getenv("D_INVARIANT_RUN"), os.Getenv("D_INVARIANT_NAMESPACE_UID")
	if os.Getenv("D_HISTORY_REVIEW_SMOKE") != "1" || !regexp.MustCompile(`^sbk-mig-[0-9]{12}-[0-9a-f]{4}$`).MatchString(run) || !regexp.MustCompile(`^[0-9a-f-]{36}$`).MatchString(uid) || os.Getenv("MYSQL_PASSWORD") == "" {
		t.Fatal("explicit isolated history smoke identity required")
	}
	session, err := ConnectSystemBackupController(config.DatabaseConfig{Host: "127.0.0.1", Port: 3306, User: "clawmanager", Password: os.Getenv("MYSQL_PASSWORD"), Database: "clawmanager", MaxOpenConns: 4, MaxIdleConns: 4})
	dMust(t, err)
	defer session.Close()
	database := session.Driver().(*sql.DB)
	ctx, cancel := context.WithTimeout(context.Background(), 240*time.Second)
	defer cancel()
	var markerRun, markerUID, markerUUID, server string
	dMust(t, database.QueryRowContext(ctx, "SELECT run_namespace, namespace_uid, server_uuid FROM d_invariant_run_marker WHERE id=1").Scan(&markerRun, &markerUID, &markerUUID))
	dMust(t, database.QueryRowContext(ctx, "SELECT @@server_uuid").Scan(&server))
	if markerRun != run || markerUID != uid || markerUUID != server {
		t.Fatal("temporary MySQL identity mismatch")
	}
	doc, sources := historyFixture(t)
	doc.ServerUUID = server
	// Detect accidental execution of evidence bytes, not only ledger changes.
	source := doc.Historical[0].Filename
	sources[source].Data = []byte("CREATE TABLE d_history_must_not_execute (id INT);\n")
	h := sha256.Sum256(sources[source].Data)
	doc.Historical[0].SQLSHA256 = hex.EncodeToString(h[:])
	raw, digest := encodeHistory(t, doc)
	review, err := ParseMigrationHistoryReview(raw, digest, sources)
	dMust(t, err)
	target := MigrationTarget{ServerUUID: server, Database: "clawmanager", CatalogSHA256: doc.CatalogSHA256, HistoryReview: review}
	apply := func(target MigrationTarget) error { return ApplyPinnedMigrations(ctx, database, target) }
	var runner *historyCLI
	if cli {
		runner = newHistoryCLI(t, ctx, doc, sources, raw, digest)
		apply = func(target MigrationTarget) error {
			err := runner.apply(target)
			if err != nil && err != errHistoryCLIRejected {
				t.Fatal(err)
			}
			return err
		}
	}
	if dInt(t, ctx, database, "SELECT COUNT(*) FROM schema_migrations") != int64(c.ContractMigrationCatalogFileCount) || dInt(t, ctx, database, "SELECT COUNT(*) FROM schema_migrations WHERE filename=?", reviewedRuntimeMigration) != 1 {
		t.Fatal("fresh current-catalog replay required")
	}
	for _, table := range []string{"system_backup_configs", "system_maintenance_locks", "system_backup_operations"} {
		if dInt(t, ctx, database, "SELECT COUNT(*) FROM "+table) != 0 {
			t.Fatal("fresh isolated database not empty")
		}
	}
	tables := []string{"system_backup_admin_sessions", "system_backup_admin_revocations", "system_backup_totp_credentials", "system_backup_metadata_reservations"}
	ddl := map[string]string{}
	for _, table := range tables {
		if dInt(t, ctx, database, "SELECT COUNT(*) FROM "+table) != 0 {
			t.Fatal("runtime table contains data; refusing fixture reset")
		}
		var name, create string
		dMust(t, database.QueryRowContext(ctx, "SHOW CREATE TABLE "+table).Scan(&name, &create))
		ddl[table] = create
	}
	for _, table := range tables {
		_, err = database.ExecContext(ctx, "DROP TABLE "+table)
		dMust(t, err)
	}
	_, err = database.ExecContext(ctx, "DELETE FROM schema_migrations WHERE filename=?", reviewedRuntimeMigration)
	dMust(t, err)
	for _, old := range doc.Historical {
		_, err = database.ExecContext(ctx, "INSERT INTO schema_migrations(filename,applied_at) VALUES(?,?)", old.Filename, "2026-08-12 02:32:22")
		dMust(t, err)
	}
	if dInt(t, ctx, database, "SELECT COUNT(*) FROM schema_migrations") != int64(len(doc.ExpectedApplied)) {
		t.Fatal("expected reviewed fixture entries")
	}
	snapshot := func(t *testing.T) map[string]string {
		rows, err := database.QueryContext(ctx, "SELECT filename,CONCAT(id,':',DATE_FORMAT(applied_at,'%Y-%m-%d %H:%i:%s')) FROM schema_migrations")
		dMust(t, err)
		defer rows.Close()
		values := map[string]string{}
		for rows.Next() {
			var name, value string
			dMust(t, rows.Scan(&name, &value))
			values[name] = value
		}
		dMust(t, rows.Err())
		return values
	}
	before := snapshot(t)
	assertNoDDL := func(t *testing.T) {
		t.Helper()
		if !reflect.DeepEqual(before, snapshot(t)) {
			t.Fatal("rejected migration changed ledger")
		}
		for _, table := range tables {
			if dInt(t, ctx, database, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", table) != 0 {
				t.Fatal("rejected migration created runtime table")
			}
		}
	}
	if !t.Run("unreviewed_ledger_rejected_without_DDL", func(t *testing.T) {
		unreviewed := target
		unreviewed.HistoryReview = nil
		if err := apply(unreviewed); err == nil || (!cli && !strings.Contains(err.Error(), "unknown migration")) {
			t.Fatal("expected unknown ledger rejection")
		}
		assertNoDDL(t)
	}) {
		t.FailNow()
	}
	if !t.Run("wrong_target_rejected_without_DDL", func(t *testing.T) {
		wrong := target
		wrong.ServerUUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
		if apply(wrong) == nil {
			t.Fatal("target mismatch accepted")
		}
		assertNoDDL(t)
	}) {
		t.FailNow()
	}
	if !t.Run("unreviewed_extra_rejected_without_DDL", func(t *testing.T) {
		_, err := database.ExecContext(ctx, "INSERT INTO schema_migrations(filename) VALUES('999_unreviewed.sql')")
		dMust(t, err)
		applyErr := apply(target)
		_, err = database.ExecContext(ctx, "DELETE FROM schema_migrations WHERE filename='999_unreviewed.sql'")
		dMust(t, err)
		if applyErr == nil || (!cli && !strings.Contains(applyErr.Error(), "ledger drift")) {
			t.Fatal("extra entry admitted")
		}
		assertNoDDL(t)
	}) {
		t.FailNow()
	}
	if !t.Run("capture_gate_rejects_then_recovers", func(t *testing.T) {
		policy := c.GatePolicy{LockTTL: 900 * time.Second, AcquisitionTimeout: 60 * time.Second, MaxHold: 600 * time.Second}
		key := c.GateKey{InstallationID: "installation_d_history_test", Scope: c.CaptureGateScope}
		dMust(t, (c.SQLGateInitializer{DB: database}).Ensure(ctx, key.InstallationID, policy))
		gate, err := c.NewSQLGateCoordinator(database)
		dMust(t, err)
		token, err := gate.BeginAcquisition(ctx, key, "controller:d", 1, policy)
		dMust(t, err)
		applyErr := apply(target)
		_, err = gate.AbortAcquisition(ctx, token)
		dMust(t, err)
		if applyErr == nil || (!cli && !strings.Contains(applyErr.Error(), "capture gate")) {
			t.Fatal("active gate admitted migration")
		}
		assertNoDDL(t)
	}) {
		t.FailNow()
	}
	if cli {
		runner.faults(t, database, target, ddl, func(t *testing.T) {
			if !reflect.DeepEqual(before, snapshot(t)) {
				t.Fatal("failed CLI changed existing ledger or recorded 080")
			}
		})
	}
	if !t.Run("apply_runtime_preserves_history_and_exact_runtime_DDL", func(t *testing.T) {
		dMust(t, apply(target))
		after := snapshot(t)
		if len(after) != len(doc.ExpectedApplied)+1 || after[reviewedRuntimeMigration] == "" {
			t.Fatal("080 not recorded exactly once")
		}
		delete(after, reviewedRuntimeMigration)
		if !reflect.DeepEqual(before, after) {
			t.Fatal("existing ledger id/time/filename changed")
		}
		for _, table := range tables {
			var name, create string
			dMust(t, database.QueryRowContext(ctx, "SHOW CREATE TABLE "+table).Scan(&name, &create))
			if create != ddl[table] {
				t.Fatal("runtime structure differs from fresh replay")
			}
		}
		if dInt(t, ctx, database, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='d_history_must_not_execute'") != 0 {
			t.Fatal("historical evidence was executed")
		}
	}) {
		t.FailNow()
	}
	if !t.Run("retry_preserves_ledger_and_runtime_rows", func(t *testing.T) {
		_, err := database.ExecContext(ctx, "INSERT INTO system_backup_metadata_reservations(id,sample_at,reserved_bytes) VALUES(1,UTC_TIMESTAMP(6),123)")
		dMust(t, err)
		beforeRetry := snapshot(t)
		dMust(t, apply(target))
		if !reflect.DeepEqual(beforeRetry, snapshot(t)) || dInt(t, ctx, database, "SELECT reserved_bytes FROM system_backup_metadata_reservations WHERE id=1") != 123 {
			t.Fatal("retry changed ledger or runtime data")
		}
	}) {
		t.FailNow()
	}
	t.Logf("history fixtures synthetic=true ledger=%d->%d historical-rows-retained=true original-sql-executed=false production-upgrade=false", len(doc.ExpectedApplied), len(doc.ExpectedApplied)+1)
}
