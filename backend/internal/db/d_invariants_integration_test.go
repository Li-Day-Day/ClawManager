//go:build systembackup_integration

package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"clawreef/internal/config"
	"clawreef/internal/migrationcoord"
	c "clawreef/internal/systembackupcontroller"
)

// This is opt-in and must run only through the fresh-namespace smoke phase.
// There are no provider, participant, credential or backup-runner substitutes.
func TestDDatabaseInvariants(t *testing.T) {
	run := os.Getenv("D_INVARIANT_RUN")
	uid := os.Getenv("D_INVARIANT_NAMESPACE_UID")
	if !regexp.MustCompile(`^sbk-mig-[0-9]{12}-[0-9a-f]{4}$`).MatchString(run) ||
		!regexp.MustCompile(`^[0-9a-f-]{36}$`).MatchString(uid) || os.Getenv("MYSQL_PASSWORD") == "" {
		t.Fatal("isolated smoke identity and temporary database password are required")
	}
	host := os.Getenv("D_INVARIANT_MYSQL_HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	if net.ParseIP(host) == nil || strings.Contains(host, ":") {
		t.Fatal("isolated MySQL IPv4 address is required")
	}
	cfg := config.DatabaseConfig{Host: host, Port: 3306, User: "clawmanager", Password: os.Getenv("MYSQL_PASSWORD"), Database: "clawmanager", MaxOpenConns: 8, MaxIdleConns: 8}
	session, err := ConnectSystemBackupController(cfg)
	dMust(t, err)
	defer session.Close()
	db := session.Driver().(*sql.DB)
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
	defer cancel()
	var markerRun, markerUID, serverUUID, expectedUUID string
	dMust(t, db.QueryRowContext(ctx, "SELECT run_namespace, namespace_uid, server_uuid FROM d_invariant_run_marker WHERE id=1").Scan(&markerRun, &markerUID, &expectedUUID))
	dMust(t, db.QueryRowContext(ctx, "SELECT @@server_uuid").Scan(&serverUUID))
	if markerRun != run || markerUID != uid || serverUUID != expectedUUID {
		t.Fatal("temporary database identity mismatch")
	}
	for _, table := range []string{"system_backup_operations", "system_maintenance_locks", "system_maintenance_mutation_leases", "system_backups", "system_restore_drills", "system_backup_preflights", "system_backup_artifact_verifications"} {
		if dInt(t, ctx, db, "SELECT COUNT(*) FROM "+table) != 0 {
			t.Fatalf("isolated fixture is not empty: %s", table)
		}
	}
	catalog, err := EmbeddedMigrationCatalog()
	dMust(t, err)
	if catalog.Hash != c.ContractMigrationCatalogHash || len(catalog.Filenames) != c.ContractMigrationCatalogFileCount {
		t.Fatal("compiled migration catalog drift")
	}
	if dInt(t, ctx, db, "SELECT COUNT(*) FROM schema_migrations") != int64(len(catalog.Filenames)) {
		t.Fatal("migration replay is incomplete")
	}

	t.Run("pooled_connections_are_UTC_with_non_UTC_server_default", func(t *testing.T) {
		var globalZone string
		dMust(t, db.QueryRowContext(ctx, "SELECT @@global.time_zone").Scan(&globalZone))
		if globalZone != "+08:00" {
			t.Fatal("negative-control server timezone was not set")
		}
		ids := map[int64]bool{}
		for i := 0; i < 4; i++ {
			conn, err := db.Conn(ctx)
			dMust(t, err)
			defer conn.Close() // Keep all four physical connections checked out.
			var id, offset int64
			var zone string
			var now time.Time
			dMust(t, conn.QueryRowContext(ctx, "SELECT CONNECTION_ID(), @@session.time_zone, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()), NOW(6)").Scan(&id, &zone, &offset, &now))
			if ids[id] || zone != "+00:00" || offset != 0 || now.Location() != time.UTC {
				t.Fatal("pooled UTC invariant failed")
			}
			ids[id] = true
		}
	})
	t.Run("backup_read_pool_is_UTC_without_changing_business_pool", func(t *testing.T) {
		testDBackupReadConnectionPools(t, ctx, cfg)
	})
	t.Run("migration_lock_survives_DDL_and_connection_death_releases_it", func(t *testing.T) {
		lock, err := (migrationcoord.SQLLocker{DB: db, Timeout: time.Second}).AcquireSQL(ctx)
		dMust(t, err)
		defer lock.Release(context.Background())
		id := dLockInt(t, ctx, lock, "SELECT CONNECTION_ID()")
		_, err = lock.ExecContext(ctx, "CREATE TABLE d_invariant_ddl_probe (id INT PRIMARY KEY) ENGINE=InnoDB")
		dMust(t, err)
		if dInt(t, ctx, db, "SELECT IS_USED_LOCK(?)", migrationcoord.LockName) != id {
			t.Fatal("DDL released advisory lock")
		}
		other, err := (migrationcoord.SQLLocker{DB: db, Timeout: time.Second}).AcquireSQL(ctx)
		if err == nil {
			_ = other.Release(ctx)
			t.Fatal("competing connection acquired held migration lock")
		}
		if !strings.Contains(err.Error(), "lock is busy") {
			t.Fatalf("unexpected competing lock failure: %v", err)
		}
		_, err = db.ExecContext(ctx, fmt.Sprintf("KILL CONNECTION %d", id))
		dMust(t, err)
		if err := lock.Release(ctx); err == nil {
			t.Fatal("dead connection release succeeded")
		}
		next, err := (migrationcoord.SQLLocker{DB: db, Timeout: time.Second}).AcquireSQL(ctx)
		dMust(t, err)
		dMust(t, next.Release(ctx))
	})
	t.Run("uncertain_release_discards_physical_connection", func(t *testing.T) {
		oneCfg := cfg
		oneCfg.MaxOpenConns = 1
		oneCfg.MaxIdleConns = 1
		oneSession, err := connectWithOptions(oneCfg, systemBackupControllerOptions())
		dMust(t, err)
		defer oneSession.Close()
		one := oneSession.Driver().(*sql.DB)
		for _, canceled := range []bool{false, true} {
			lock, err := (migrationcoord.SQLLocker{DB: one, Timeout: time.Second}).AcquireSQL(ctx)
			dMust(t, err)
			before := dLockInt(t, ctx, lock, "SELECT CONNECTION_ID()")
			releaseCtx := ctx
			if canceled {
				var stop context.CancelFunc
				releaseCtx, stop = context.WithCancel(ctx)
				stop()
			} else if dLockInt(t, ctx, lock, "SELECT RELEASE_LOCK(?)", migrationcoord.LockName) != 1 {
				t.Fatal("failed to inject lost lock ownership")
			}
			if err := lock.Release(releaseCtx); err == nil {
				t.Fatal("uncertain release was accepted")
			}
			if after := dInt(t, ctx, one, "SELECT CONNECTION_ID()"); after == before {
				t.Fatal("uncertain physical connection returned to pool")
			}
			next, err := (migrationcoord.SQLLocker{DB: db, Timeout: time.Second}).AcquireSQL(ctx)
			dMust(t, err)
			dMust(t, next.Release(ctx))
		}
	})
	policy := c.GatePolicy{LockTTL: 900 * time.Second, AcquisitionTimeout: 60 * time.Second, MaxHold: 600 * time.Second}
	key := c.GateKey{InstallationID: "installation_d_invariants_a", Scope: c.CaptureGateScope}
	otherKey := c.GateKey{InstallationID: "installation_d_invariants_b", Scope: c.CaptureGateScope}
	for _, k := range []c.GateKey{key, otherKey} {
		dMust(t, (c.SQLGateInitializer{DB: db}).Ensure(ctx, k.InstallationID, policy))
	}
	gate, err := c.NewSQLGateCoordinator(db)
	dMust(t, err)
	gate.MigrationExclusion = migrationcoord.SQLLocker{DB: db, Timeout: time.Second}
	t.Run("capture_waits_for_migration_DDL_lock", func(t *testing.T) {
		lock, err := (migrationcoord.SQLLocker{DB: db, Timeout: time.Second}).AcquireSQL(ctx)
		dMust(t, err)
		_, err = lock.ExecContext(ctx, "CREATE TABLE d_invariant_capture_race_probe (id INT PRIMARY KEY) ENGINE=InnoDB")
		dMust(t, err)
		// BeginAcquisition uses another physical connection and must not write
		// the gate while the migration connection still owns the DDL lock.
		type acquisitionResult struct {
			token c.GateToken
			err   error
		}
		result := make(chan acquisitionResult, 1)
		go func() {
			token, acquireErr := gate.BeginAcquisition(ctx, otherKey, "controller:race", 1, policy)
			result <- acquisitionResult{token: token, err: acquireErr}
		}()
		select {
		case acquisition := <-result:
			_ = lock.Release(ctx)
			t.Fatalf("capture finished before migration released its DDL lock: %v", acquisition.err)
		case <-time.After(200 * time.Millisecond):
		}
		dMust(t, lock.Release(ctx))
		select {
		case acquisition := <-result:
			dMust(t, acquisition.err)
			if acquisition.token.State != c.GateAcquiring {
				t.Fatal("capture did not enter acquiring state")
			}
			_, err = gate.AbortAcquisition(ctx, acquisition.token)
			dMust(t, err)
		case <-time.After(5 * time.Second):
			t.Fatal("capture did not proceed after migration released its DDL lock")
		}
		if state := dInt(t, ctx, db, "SELECT COUNT(*) FROM system_maintenance_locks WHERE origin_installation_id=? AND gate_state='idle'", otherKey.InstallationID); state != 1 {
			t.Fatal("capture cleanup did not restore idle gate")
		}
	})
	t.Run("migration_and_gate_mutually_exclude", func(t *testing.T) {
		lock, err := (migrationcoord.SQLLocker{DB: db, Timeout: time.Second}).AcquireSQL(ctx)
		dMust(t, err)
		_, acquireErr := gate.BeginAcquisition(ctx, key, "controller:d", 1, policy)
		dMust(t, lock.Release(ctx))
		if acquireErr == nil || !strings.Contains(acquireErr.Error(), "lock is busy") {
			t.Fatalf("gate bypassed migration exclusion: %v", acquireErr)
		}
		if dInt(t, ctx, db, "SELECT row_version FROM system_maintenance_locks WHERE origin_installation_id=?", key.InstallationID) != 1 {
			t.Fatal("blocked acquisition changed gate")
		}
		token, err := gate.BeginAcquisition(ctx, key, "controller:d", 1, policy)
		dMust(t, err)
		// Remove only the last registry record to make a real pending migration.
		// The runner must reject it before executing any of its SQL.
		var filename string
		var appliedAt time.Time
		dMust(t, db.QueryRowContext(ctx, "SELECT filename, applied_at FROM schema_migrations ORDER BY filename DESC LIMIT 1").Scan(&filename, &appliedAt))
		_, err = db.ExecContext(ctx, "DELETE FROM schema_migrations WHERE filename=?", filename)
		dMust(t, err)
		defer func() {
			_, err := db.ExecContext(ctx, "INSERT INTO schema_migrations(filename,applied_at) VALUES(?,?)", filename, appliedAt)
			dMust(t, err)
		}()
		migrationResult := make(chan error, 1)
		go func() { migrationResult <- applyEmbeddedMigrations(session) }()
		select {
		case migrationErr := <-migrationResult:
			if migrationErr == nil || !strings.Contains(migrationErr.Error(), "blocked by system backup capture gate") {
				t.Fatalf("active gate did not block actual migration runner: %v", migrationErr)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("migration did not reject committed capture gate")
		}
		if dInt(t, ctx, db, "SELECT COUNT(*) FROM schema_migrations WHERE filename=?", filename) != 0 {
			t.Fatal("blocked migration was registered")
		}
		_, err = gate.AbortAcquisition(ctx, token)
		dMust(t, err)
		dMust(t, assertCaptureGateIdle(ctx, db))
	})
	t.Run("concurrent_claim_takeover_and_installation_isolation", func(t *testing.T) {
		target := c.Target{Kind: c.TargetOperation, PublicID: "sop_11111111-1111-4111-8111-111111111111"}
		_, err := db.ExecContext(ctx, `INSERT INTO system_backup_operations
		(public_id, origin_installation_id, operation_type, target_type, target_public_id, actor_type, actor_id, endpoint, idempotency_key, request_hash, external_action_public_ids_canonical_json, external_action_public_ids_size_bytes, external_action_public_ids_sha256, status, next_reconcile_at, deadline_at)
		VALUES (?,?,'control_metadata_gc','system',?,'system','system:controller','DInvariantProbe','d-invariant-claim-0001',REPEAT('a',64),'[]',2,SHA2('[]',256),'pending',UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 1 HOUR))`, target.PublicID, key.InstallationID, key.InstallationID)
		dMust(t, err)
		p := c.LeasePolicy{TTL: 15 * time.Second, HeartbeatInterval: 5 * time.Second, ReconcileInterval: time.Second}
		claims := c.ClaimCoordinator{Executor: db, InstallationID: key.InstallationID}
		foreign := c.ClaimCoordinator{Executor: db, InstallationID: otherKey.InstallationID}
		if _, err := foreign.Acquire(ctx, target, "controller:foreign", 1, p); !errors.Is(err, c.ErrClaimNotAcquired) {
			t.Fatalf("cross-install claim: %v", err)
		}
		type result struct {
			token c.ClaimToken
			err   error
		}
		start := make(chan struct{})
		results := make(chan result, 2)
		for _, owner := range []string{"controller:first", "controller:second"} {
			go func(owner string) {
				<-start
				token, err := claims.Acquire(ctx, target, owner, 1, p)
				results <- result{token, err}
			}(owner)
		}
		close(start)
		var winner c.ClaimToken
		won, lost := 0, 0
		for i := 0; i < 2; i++ {
			r := <-results
			if r.err == nil {
				won++
				winner = r.token
			} else if errors.Is(r.err, c.ErrClaimNotAcquired) {
				lost++
			} else {
				t.Fatalf("claim contender: %v", r.err)
			}
		}
		if won != 1 || lost != 1 || winner.RowVersion != 2 {
			t.Fatal("claim competition did not have exactly one winner")
		}
		if _, err := claims.Acquire(ctx, target, "controller:replacement", winner.RowVersion, p); !errors.Is(err, c.ErrClaimNotAcquired) {
			t.Fatalf("live lease stolen: %v", err)
		}
		if _, err := foreign.Renew(ctx, winner, p); !errors.Is(err, c.ErrClaimLost) {
			t.Fatalf("cross-install renew: %v", err)
		}
		if _, err := foreign.Release(ctx, winner, time.Second); !errors.Is(err, c.ErrClaimLost) {
			t.Fatalf("cross-install release: %v", err)
		}
		// Let database time expire the real 15-second lease; do not edit expiry.
		for dInt(t, ctx, db, "SELECT claim_expires_at > UTC_TIMESTAMP(6) FROM system_backup_operations WHERE public_id=?", target.PublicID) == 1 {
			select {
			case <-ctx.Done():
				t.Fatal(ctx.Err())
			case <-time.After(100 * time.Millisecond):
			}
		}
		if _, err := claims.Renew(ctx, winner, p); !errors.Is(err, c.ErrClaimLost) {
			t.Fatalf("expired owner renewed: %v", err)
		}
		replacement, err := claims.Acquire(ctx, target, "controller:replacement", winner.RowVersion, p)
		dMust(t, err)
		if _, err := claims.Renew(ctx, winner, p); !errors.Is(err, c.ErrClaimLost) {
			t.Fatalf("old owner renewed after takeover: %v", err)
		}
		if _, err := claims.Release(ctx, winner, time.Second); !errors.Is(err, c.ErrClaimLost) {
			t.Fatalf("old owner overwrote new claim: %v", err)
		}
		var owner string
		var version uint64
		dMust(t, db.QueryRowContext(ctx, "SELECT claim_owner,row_version FROM system_backup_operations WHERE public_id=?", target.PublicID).Scan(&owner, &version))
		if owner != replacement.Owner || version != replacement.RowVersion {
			t.Fatal("rejected writes changed current ownership")
		}
		_, err = claims.Release(ctx, replacement, time.Second)
		dMust(t, err)
	})
	t.Run("protected_mutation_rejects_stale_owner_and_rolls_back", func(t *testing.T) {
		_, err := db.ExecContext(ctx, "CREATE TABLE d_invariant_mutation_probe (id INT PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB")
		dMust(t, err)
		_, err = db.ExecContext(ctx, "INSERT INTO d_invariant_mutation_probe VALUES (1,0)")
		dMust(t, err)
		factory := c.SQLCoordinationTransactionFactory{DB: db}
		leases := c.MutationLeaseCoordinator{Factory: factory}
		generation := uint64(dInt(t, ctx, db, "SELECT generation FROM system_maintenance_locks WHERE origin_installation_id=?", key.InstallationID))
		token, err := leases.Acquire(ctx, c.MutationLeaseRequest{LeaseID: "22222222-2222-4222-8222-222222222222", Key: key, OperationIdentity: "DInvariantProbe", RequestID: "d:mutation", Owner: "api:old", ExpectedGeneration: generation}, c.MutationLeasePolicy{TTL: 30 * time.Second, HeartbeatInterval: 10 * time.Second})
		dMust(t, err)
		write := func(ctx context.Context, exec c.Executor) error {
			_, err := exec.ExecContext(ctx, "UPDATE d_invariant_mutation_probe SET value=value+1 WHERE id=1")
			return err
		}
		dMust(t, c.ExecuteProtectedMutation(ctx, factory, token, write))
		injected := errors.New("injected callback failure")
		err = c.ExecuteProtectedMutation(ctx, factory, token, func(ctx context.Context, exec c.Executor) error {
			if err := write(ctx, exec); err != nil {
				return err
			}
			return injected
		})
		if !errors.Is(err, injected) || dInt(t, ctx, db, "SELECT value FROM d_invariant_mutation_probe WHERE id=1") != 1 {
			t.Fatal("callback failure did not roll back")
		}
		wrong := token
		wrong.Key = otherKey
		wrong.Generation = uint64(dInt(t, ctx, db, "SELECT generation FROM system_maintenance_locks WHERE origin_installation_id=?", otherKey.InstallationID))
		if err := c.ExecuteProtectedMutation(ctx, factory, wrong, write); !errors.Is(err, c.ErrMutationLeaseLost) {
			t.Fatalf("foreign installation mutation: %v", err)
		}
		wrongOwner := token
		wrongOwner.Owner = "api:other"
		if err := c.ExecuteProtectedMutation(ctx, factory, wrongOwner, write); !errors.Is(err, c.ErrMutationLeaseLost) {
			t.Fatalf("wrong owner mutation: %v", err)
		}
		fresh, err := leases.Renew(ctx, token, c.MutationLeasePolicy{TTL: 30 * time.Second, HeartbeatInterval: 10 * time.Second})
		dMust(t, err)
		if err := c.ExecuteProtectedMutation(ctx, factory, token, write); !errors.Is(err, c.ErrMutationLeaseLost) {
			t.Fatalf("stale row version mutation: %v", err)
		}
		dMust(t, leases.Release(ctx, fresh))
		if err := c.ExecuteProtectedMutation(ctx, factory, fresh, write); !errors.Is(err, c.ErrMutationLeaseLost) {
			t.Fatalf("released owner mutation: %v", err)
		}
		if dInt(t, ctx, db, "SELECT value FROM d_invariant_mutation_probe WHERE id=1") != 1 {
			t.Fatal("rejected mutation wrote data")
		}
		replacement, err := leases.Acquire(ctx, c.MutationLeaseRequest{LeaseID: "33333333-3333-4333-8333-333333333333", Key: key, OperationIdentity: "DInvariantProbe", RequestID: "d:replacement", Owner: "api:new", ExpectedGeneration: generation}, c.MutationLeasePolicy{TTL: 30 * time.Second, HeartbeatInterval: 10 * time.Second})
		dMust(t, err)
		dMust(t, c.ExecuteProtectedMutation(ctx, factory, replacement, write))
		if err := c.ExecuteProtectedMutation(ctx, factory, fresh, write); !errors.Is(err, c.ErrMutationLeaseLost) {
			t.Fatalf("old owner wrote after replacement: %v", err)
		}
		if dInt(t, ctx, db, "SELECT value FROM d_invariant_mutation_probe WHERE id=1") != 2 {
			t.Fatal("replacement mutation result differs")
		}
		dMust(t, leases.Release(ctx, replacement))
	})
}

func dMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func dInt(t *testing.T, ctx context.Context, db *sql.DB, query string, args ...any) int64 {
	t.Helper()
	var n int64
	dMust(t, db.QueryRowContext(ctx, query, args...).Scan(&n))
	return n
}
func dLockInt(t *testing.T, ctx context.Context, lock *migrationcoord.SQLLock, query string, args ...any) int64 {
	t.Helper()
	rows, err := lock.QueryContext(ctx, query, args...)
	dMust(t, err)
	defer rows.Close()
	if !rows.Next() {
		t.Fatal("lock query returned no row")
	}
	var n int64
	dMust(t, rows.Scan(&n))
	if rows.Next() {
		t.Fatal("lock query returned multiple rows")
	}
	dMust(t, rows.Err())
	return n
}
