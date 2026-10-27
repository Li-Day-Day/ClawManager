//go:build systembackup_integration

package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"clawreef/internal/migrationcoord"
	"github.com/go-sql-driver/mysql"
)

const historyCLIRejection = "migration rejected or failed; partial DDL may exist; retain the same target/catalog for recovery"

type historyCLI struct {
	ctx                          context.Context
	binary, dir, digest, catalog string
}

// Called only after the parent test authenticates the disposable database's
// run/namespace/server marker. Credentials never enter argv or test output.
func newHistoryCLI(t *testing.T, ctx context.Context, doc migrationHistoryDocument, sources fstest.MapFS, raw []byte, digest string) *historyCLI {
	t.Helper()
	binary := os.Getenv("D_HISTORY_CLI_BINARY")
	pin := os.Getenv("D_HISTORY_CLI_SHA256")
	if !filepath.IsAbs(binary) || len(pin) != 64 {
		t.Fatal("explicit pinned CLI binary required")
	}
	b, err := os.ReadFile(binary)
	dMust(t, err)
	h := sha256.Sum256(b)
	if hex.EncodeToString(h[:]) != pin {
		t.Fatal("CLI binary pin mismatch")
	}
	r := &historyCLI{ctx: ctx, binary: binary, dir: t.TempDir(), digest: digest, catalog: doc.CatalogSHA256}
	dMust(t, os.Mkdir(filepath.Join(r.dir, "sources"), 0700))
	for name, source := range sources {
		dMust(t, os.WriteFile(filepath.Join(r.dir, "sources", name), source.Data, 0600))
	}
	dMust(t, os.WriteFile(filepath.Join(r.dir, "review.json"), raw, 0600))
	cfg := mysql.NewConfig()
	cfg.User, cfg.Passwd, cfg.Net, cfg.Addr, cfg.DBName = "clawmanager", os.Getenv("MYSQL_PASSWORD"), "tcp", "127.0.0.1:3306", doc.Database
	dMust(t, os.WriteFile(filepath.Join(r.dir, "dsn"), []byte(cfg.FormatDSN()), 0600))
	out, err := r.command("--catalog-only").Output()
	if err != nil {
		t.Fatal("CLI catalog failed")
	}
	var got struct {
		SHA       string   `json:"sha256"`
		Count     int      `json:"file_count"`
		Filenames []string `json:"filenames"`
	}
	dMust(t, json.Unmarshal(out, &got))
	want, err := EmbeddedMigrationCatalog()
	dMust(t, err)
	if got.SHA != want.Hash || got.Count != len(want.Filenames) || !reflect.DeepEqual(got.Filenames, want.Filenames) {
		t.Fatal("CLI/probe catalog mismatch")
	}
	t.Logf("CLI binary_sha256=%s catalog=%s synthetic=true", pin, got.SHA)
	return r
}

func (r *historyCLI) command(args ...string) *exec.Cmd {
	cmd := exec.CommandContext(r.ctx, r.binary, args...)
	// The runner needs only mounted files; do not inherit the probe's DB/root
	// passwords, Kubernetes metadata, or unrelated process environment.
	cmd.Env = []string{"TZ=UTC"}
	cmd.WaitDelay = 3 * time.Second
	return cmd
}

func (r *historyCLI) args(target MigrationTarget) []string {
	a := []string{"--apply", "--dsn-file", filepath.Join(r.dir, "dsn"), "--expected-server-uuid", target.ServerUUID, "--expected-database", target.Database, "--expected-catalog-sha256", target.CatalogSHA256}
	if target.HistoryReview != nil {
		a = append(a, "--history-review-file", filepath.Join(r.dir, "review.json"), "--expected-history-review-sha256", r.digest, "--historical-sql-dir", filepath.Join(r.dir, "sources"))
	}
	return a
}

func (r *historyCLI) apply(target MigrationTarget) error {
	out, err := r.command(r.args(target)...).CombinedOutput()
	return r.result(out, err, target.HistoryReview != nil)
}

func (r *historyCLI) result(out []byte, err error, reviewed bool) error {
	if err != nil {
		var exit *exec.ExitError
		if !errors.As(err, &exit) || exit.ExitCode() != 1 || strings.TrimSpace(string(out)) != historyCLIRejection {
			return errors.New("unexpected CLI exit/output (raw output withheld)")
		}
		return errHistoryCLIRejected
	}
	var got struct {
		Result     string `json:"result"`
		Catalog    string `json:"migration_catalog_sha256"`
		Count      int    `json:"migration_count"`
		Review     string `json:"history_review_sha256"`
		Equivalent bool   `json:"historical_equivalence_verified"`
		Activated  bool   `json:"config_activated"`
		MFA        bool   `json:"human_mfa_verified"`
	}
	wantReview := ""
	if reviewed {
		wantReview = r.digest
	}
	catalog, catalogErr := EmbeddedMigrationCatalog()
	if catalogErr != nil {
		return catalogErr
	}
	if json.Unmarshal(out, &got) != nil || got.Result != "PASS" || got.Catalog != r.catalog || got.Count != len(catalog.Filenames) || got.Review != wantReview || got.Equivalent || got.Activated || got.MFA {
		return errors.New("CLI success receipt mismatch")
	}
	return nil
}

var errHistoryCLIRejected = errors.New("CLI rejected with exact public error and exit 1")

func (r *historyCLI) faults(t *testing.T, database *sql.DB, target MigrationTarget, ddl map[string]string, unchanged func(*testing.T)) {
	t.Helper()
	ctx := r.ctx
	interrupt := func(t *testing.T, queryPrefix string, completedTables []string) {
		t.Helper()
		proxy, err := startHistoryFaultProxy(ctx, "127.0.0.1:3306", queryPrefix)
		dMust(t, err)
		defer proxy.close()
		call := *r
		dsn, err := os.ReadFile(filepath.Join(r.dir, "dsn"))
		dMust(t, err)
		cfg, err := mysql.ParseDSN(string(dsn))
		dMust(t, err)
		cfg.Addr = proxy.address
		faultDSN := filepath.Join(t.TempDir(), "dsn")
		dMust(t, os.WriteFile(faultDSN, []byte(cfg.FormatDSN()), 0600))
		callCtx, stop := context.WithCancel(ctx)
		defer stop()
		call.ctx = callCtx
		args := r.args(target)
		args[2] = faultDSN
		cmd := call.command(args...)
		// Wait is joined on every path before temporary credentials are removed.
		done := make(chan error, 1)
		go func() { out, err := cmd.CombinedOutput(); done <- r.result(out, err, true) }()
		joined := false
		defer func() {
			if !joined {
				stop()
				<-done
			}
		}()
		var connection uint32
		select {
		case connection = <-proxy.reached:
		case result := <-done:
			joined = true
			t.Fatalf("CLI exited before fault injection: %v", result)
		case <-time.After(20 * time.Second):
			t.Fatal("did not observe CLI statement at fault boundary")
		case <-ctx.Done():
			t.Fatal("fault boundary context expired")
		}
		var lockOwner sql.NullInt64
		dMust(t, database.QueryRowContext(ctx, "SELECT IS_USED_LOCK(?)", migrationcoord.LockName).Scan(&lockOwner))
		if !lockOwner.Valid || lockOwner.Int64 != int64(connection) {
			t.Fatal("blocked connection is not the migration lock owner; refusing KILL")
		}
		for _, table := range completedTables {
			var name, create string
			dMust(t, database.QueryRowContext(ctx, "SHOW CREATE TABLE "+table).Scan(&name, &create))
			if create != ddl[table] {
				t.Fatal("completed DDL differs from fresh baseline before interruption")
			}
		}
		unchanged(t)
		t.Logf("fault boundary observed before forwarding SQL; completed_tables=%d migration_lock_owner_verified=true", len(completedTables))
		_, err = database.ExecContext(ctx, fmt.Sprintf("KILL CONNECTION %d", connection))
		dMust(t, err)
		result := <-done
		joined = true
		if result != errHistoryCLIRejected {
			t.Fatalf("killed CLI did not reject: %v", result)
		}
		unchanged(t)
	}
	if !t.Run("CLI_partial_DDL_connection_killed_preserves_ledger", func(t *testing.T) {
		// Hold statement 3 before it reaches MySQL. Statements 1/2 have
		// committed for real; neither table 3 nor table 4 is precreated.
		interrupt(t, "CREATE TABLE IF NOT EXISTS system_backup_metadata_reservations", []string{"system_backup_admin_revocations", "system_backup_totp_credentials"})
		for _, table := range []string{"system_backup_metadata_reservations", "system_backup_admin_sessions"} {
			if dInt(t, ctx, database, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", table) != 0 {
				t.Fatal("CLI continued after connection loss")
			}
		}
		// Operator-style structure review before any retry: existing objects
		// must exactly match the fresh replay. IF NOT EXISTS is not a verifier.
		for _, table := range []string{"system_backup_admin_revocations", "system_backup_totp_credentials"} {
			var name, create string
			dMust(t, database.QueryRowContext(ctx, "SHOW CREATE TABLE "+table).Scan(&name, &create))
			if create != ddl[table] {
				t.Fatal("partial DDL differs from reviewed fresh baseline; retry forbidden")
			}
		}
	}) {
		t.FailNow()
	}
	if !t.Run("CLI_complete_DDL_ledger_write_failure_no_false_PASS", func(t *testing.T) {
		// All four DDL statements complete. Pause the INSERT query/prepare
		// before it is sent; this does not simulate a committed response loss.
		interrupt(t, "INSERT INTO schema_migrations", []string{"system_backup_admin_revocations", "system_backup_totp_credentials", "system_backup_metadata_reservations", "system_backup_admin_sessions"})
		for table, expected := range ddl {
			var name, create string
			dMust(t, database.QueryRowContext(ctx, "SHOW CREATE TABLE "+table).Scan(&name, &create))
			if create != expected {
				t.Fatal("completed DDL mismatch; retry forbidden")
			}
		}
	}) {
		t.FailNow()
	}
}
