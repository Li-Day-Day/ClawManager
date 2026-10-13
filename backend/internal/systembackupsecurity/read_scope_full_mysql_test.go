//go:build systembackup_mysql

package systembackupsecurity

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"clawreef/internal/systembackupread"
	"github.com/golang-jwt/jwt/v5"
)

// This test runs only in the fresh migration namespace. It uses the complete
// migrated 066/067/080 schema, not the narrower A authorization probe DDL.
func TestDAdminReadFullSchemaMySQL(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	run, uid := os.Getenv("D_INVARIANT_RUN"), os.Getenv("D_INVARIANT_NAMESPACE_UID")
	cfg, err := sessionProbeConfig(run, uid, os.Getenv("D_INVARIANT_MYSQL_HOST"), os.Getenv("MYSQL_ROOT_PASSWORD"))
	mysqlMust(t, err)
	db, err := sql.Open("mysql", cfg.FormatDSN())
	mysqlMust(t, err)
	defer db.Close()
	db.SetMaxOpenConns(8)
	var gotRun, gotUID, pinnedUUID, actualUUID string
	mysqlMust(t, db.QueryRowContext(ctx, "SELECT run_namespace,namespace_uid,server_uuid FROM d_invariant_run_marker WHERE id=1").Scan(&gotRun, &gotUID, &pinnedUUID))
	mysqlMust(t, db.QueryRowContext(ctx, "SELECT @@server_uuid").Scan(&actualUUID))
	if gotRun != run || gotUID != uid || pinnedUUID != actualUUID {
		t.Fatal("full read probe is outside the pinned run-owned MySQL")
	}
	for _, filename := range []string{"066_add_system_backup_config_and_operations.sql", "067_add_system_backup_task_execution_core.sql", "080_add_system_backup_registration_runtime.sql"} {
		var count int
		mysqlMust(t, db.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations WHERE filename=?", filename).Scan(&count))
		if count != 1 {
			t.Fatal("complete migration not registered", filename)
		}
	}
	for _, table := range []string{"system_backup_configs", "system_backup_operations", "system_backups", "system_restore_drills", "system_backup_preflights", "system_backup_artifact_verifications", "system_backup_admin_sessions"} {
		var engine string
		mysqlMust(t, db.QueryRowContext(ctx, "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", table).Scan(&engine))
		if engine != "InnoDB" {
			t.Fatal("unexpected table engine", table, engine)
		}
	}
	fixture, err := os.ReadFile(os.Getenv("D_ADMIN_READ_FULL_FIXTURE"))
	mysqlMust(t, err)
	digest := sha256.Sum256(fixture)
	if hex.EncodeToString(digest[:]) != os.Getenv("D_ADMIN_READ_FULL_FIXTURE_SHA256") ||
		len(fixture) < 1000 || !strings.Contains(string(fixture), "INSERT INTO system_backup_configs") ||
		strings.Contains(strings.ToUpper(string(fixture)), "DROP DATABASE") {
		t.Fatal("full read fixture is not pinned")
	}
	const own = "installation_d_admin_read_full"
	const foreign = "installation_d_admin_read_foreign"
	seedConfig := func(installation string) {
		conn, e := db.Conn(ctx)
		mysqlMust(t, e)
		defer conn.Close()
		_, e = conn.ExecContext(ctx, "SET @installation_id=?", installation)
		mysqlMust(t, e)
		_, e = conn.ExecContext(ctx, string(fixture))
		mysqlMust(t, e)
	}
	seedConfig(own)
	seedConfig(foreign)
	var userID int64
	var passwordHash string
	mysqlMust(t, db.QueryRowContext(ctx, "SELECT id,password_hash FROM users WHERE role='admin' AND is_active=TRUE ORDER BY id LIMIT 1").Scan(&userID, &passwordHash))
	secret := []byte(strings.Repeat("s", 32))
	now := time.Now().UTC()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID, "token_type": "access", "jti": "d-full-read", "iat": now.Add(-time.Minute).Unix(), "exp": now.Add(5 * time.Minute).Unix(),
	}).SignedString(secret)
	mysqlMust(t, err)
	root := t.TempDir()
	newService := func(installation string) (*systembackupread.Service, *SystemBackupReadScope) {
		t.Helper()
		rbac := []byte(`{"schema_version":"system-backup-registration-rbac.draft.v1","version":"read-v1","installation_id":"` + installation + `","bindings":[{"actor_id":"` + strconv.FormatInt(userID, 10) + `","subject":"user:` + strconv.FormatInt(userID, 10) + `","role":"viewer"}]}`)
		rbacHash := registrationHash(string(rbac))
		registryPath := filepath.Join(root, installation, "rbac_bindings", "read-v1", rbacHash+".json")
		mysqlMust(t, os.MkdirAll(filepath.Dir(registryPath), 0700))
		mysqlMust(t, os.WriteFile(registryPath, rbac, 0600))
		_, e := db.ExecContext(ctx, "UPDATE system_backup_configs SET rbac_bindings_registry_version='read-v1',rbac_bindings_registry_sha256=?,config_sha256=SHA2('{}',256),config_size_bytes=2 WHERE origin_installation_id=? AND version=1", rbacHash, installation)
		mysqlMust(t, e)
		_, e = db.ExecContext(ctx, "INSERT INTO system_backup_admin_sessions(origin_installation_id,session_sha256,user_id,subject,credential_hash,expires_at,revoked) VALUES(?,?,?,?,?,UTC_TIMESTAMP(6)+INTERVAL 5 MINUTE,FALSE)", installation, registrationHash(token), userID, "user:"+strconv.FormatInt(userID, 10), registrationHash(passwordHash))
		mysqlMust(t, e)
		pinsRaw, e := json.Marshal(SystemBackupReadPins{InstallationID: installation, ConfigVersion: 1, RBACVersion: "read-v1", RBACSHA256: rbacHash, RegistryDirectory: filepath.Join(root, installation)})
		mysqlMust(t, e)
		pinsPath := filepath.Join(root, installation, "read-pins.json")
		mysqlMust(t, os.WriteFile(pinsPath, pinsRaw, 0600))
		sessions, e := NewSQLLoginSessions(db, DatabaseIdentity{ServerUUID: actualUUID, Database: cfg.DBName}, installation, secret)
		mysqlMust(t, e)
		authorizer, e := LoadSystemBackupReadAuthorizer(sessions, pinsPath, registrationHash(string(pinsRaw)))
		mysqlMust(t, e)
		request := httptest.NewRequest("GET", "/api/v1/admin/system-backups", nil)
		request.Header.Set("Authorization", "Bearer "+token)
		scope, e := authorizer.Scope(request)
		mysqlMust(t, e)
		service, e := systembackupread.NewService(db, scope, []byte(strings.Repeat("c", 32)))
		mysqlMust(t, e)
		return service, scope
	}
	ownService, ownScope := newService(own)
	foreignService, foreignScope := newService(foreign)
	seedBackup := func(installation, suffix string) string {
		publicID := "sbk_00000000-0000-4000-8000-0000000000" + suffix
		_, e := db.ExecContext(ctx, `INSERT INTO system_backups
		(public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
		 config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
		 source_orchestrator,source_profile,matrix_key,runner,requested_parts,artifact_read_identity_hash,
		 artifact_read_ref_version,artifact_ca_identity_hash,artifact_ca_ref_version,target_class,target_risks,target_failure_domain_id)
		 VALUES(?,?,'admin',?,'POST /system-backups',?,REPEAT('a',64),?,1,'{}',2,SHA2('{}',256),
		 UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,'kubernetes','single-node','k8s-single-node','k8s','mysql',
		 REPEAT('b',64),'fixture-v1',REPEAT('c',64),'fixture-v1','dr-ready-external','', 'isolated')`,
			publicID, installation, strconv.FormatInt(userID, 10), "d-full-read-backup-"+suffix, "d-full-read-"+suffix)
		mysqlMust(t, e)
		return publicID
	}
	first := seedBackup(own, "01")
	second := seedBackup(own, "02")
	third := seedBackup(own, "03")
	_ = seedBackup(foreign, "04")
	otherKinds := []struct {
		kind systembackupread.TaskKind
		id   string
	}{
		{systembackupread.DrillTask, "sdr_00000000-0000-4000-8000-000000000001"},
		{systembackupread.PreflightTask, "spf_00000000-0000-4000-8000-000000000001"},
		{systembackupread.VerificationTask, "sav_00000000-0000-4000-8000-000000000001"},
	}
	_, err = db.ExecContext(ctx, `INSERT INTO system_restore_drills
		(public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
		 config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
		 source_artifact_type,source_public_id,target_profile,restore_target_config_ref,restore_target_config_hash,cleanup_policy)
		 VALUES(?,?,'admin',?,'POST /system-restore-drills','d-full-read-drill-01',REPEAT('a',64),'d-full-read-drill-01',
		 1,'{}',2,SHA2('{}',256),UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,
		 'backup',?,'single-node','isolated-target',REPEAT('d',64),'delete-on-success')`, otherKinds[0].id, own, strconv.FormatInt(userID, 10), first)
	mysqlMust(t, err)
	_, err = db.ExecContext(ctx, `INSERT INTO system_backup_preflights
		(public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
		 config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
		 source_artifact_type,source_public_id,target_profile,restore_target_config_ref,restore_target_config_hash,artifact_compatibility)
		 VALUES(?,?,'admin',?,'POST /system-backup-preflights','d-full-read-preflight-01',REPEAT('a',64),'d-full-read-preflight-01',
		 1,'{}',2,SHA2('{}',256),UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,
		 'backup',?,'single-node','isolated-target',REPEAT('d',64),'supported')`, otherKinds[1].id, own, strconv.FormatInt(userID, 10), first)
	mysqlMust(t, err)
	_, err = db.ExecContext(ctx, `INSERT INTO system_backup_artifact_verifications
		(public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
		 config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
		 verification_scope,source_artifact_type,source_public_id,artifact_state_before,artifact_state_after,
		 unusable_reason_before,unusable_reason_after)
		 VALUES(?,?,'admin',?,'POST /system-backup-artifact-verifications','d-full-read-verify-01',REPEAT('a',64),'d-full-read-verify-01',
		 1,'{}',2,SHA2('{}',256),UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,
		 'health','backup',?,'staging','staging','not_committed','not_committed')`, otherKinds[2].id, own, strconv.FormatInt(userID, 10), first)
	mysqlMust(t, err)
	page, err := ownService.ListTaskDTO(ownScope.Context(), systembackupread.BackupTask, "", 2, "")
	mysqlMust(t, err)
	if len(page.Items) != 2 || page.Items[0].PublicID != third || page.Items[1].PublicID != second || page.NextCursor == nil || page.Consistency != "stable_cutoff" {
		t.Fatalf("first full-schema page invalid: %+v", page)
	}
	_ = seedBackup(own, "05") // A later insert must not drift into the held cutoff.
	page2, err := ownService.ListTaskDTO(ownScope.Context(), systembackupread.BackupTask, "", 2, *page.NextCursor)
	mysqlMust(t, err)
	if len(page2.Items) != 1 || page2.Items[0].PublicID != first || page2.NextCursor != nil {
		t.Fatalf("second full-schema page invalid: %+v", page2)
	}
	if _, err := foreignService.ListTaskDTO(foreignScope.Context(), systembackupread.BackupTask, "", 2, *page.NextCursor); !errors.Is(err, systembackupread.ErrDenied) {
		t.Fatalf("cross-install cursor was accepted: %v", err)
	}
	for _, item := range otherKinds {
		other, e := ownService.ListTaskDTO(ownScope.Context(), item.kind, "pending", 2, "")
		mysqlMust(t, e)
		if len(other.Items) != 1 || other.Items[0].PublicID != item.id || other.Items[0].TaskType != item.kind ||
			other.Items[0].OriginInstallationID != own || other.NextCursor != nil || other.Consistency != "eventual" {
			t.Fatalf("full-schema task list invalid for %s: %+v", item.kind, other)
		}
		cross, e := foreignService.ListTaskDTO(foreignScope.Context(), item.kind, "pending", 2, "")
		mysqlMust(t, e)
		if len(cross.Items) != 0 {
			t.Fatalf("cross-install task row leaked for %s: %+v", item.kind, cross)
		}
	}
	for i := 1; i <= 3; i++ {
		id := "sop_00000000-0000-4000-8000-00000000000" + strconv.Itoa(i)
		_, err = db.ExecContext(ctx, `INSERT INTO system_backup_operations
		(public_id,origin_installation_id,operation_type,target_type,target_public_id,actor_type,actor_id,endpoint,
		 idempotency_key,request_hash,external_action_public_ids_canonical_json,external_action_public_ids_size_bytes,
		 external_action_public_ids_sha256,status,next_reconcile_at,deadline_at)
		 VALUES(?,?,'control_metadata_gc','system',?,'system','system:controller','DFullRead',?,REPEAT('a',64),
		 '[]',2,SHA2('[]',256),'pending',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 1 HOUR)`, id, own, own, "d-full-read-operation-"+strconv.Itoa(i))
		mysqlMust(t, err)
	}
	operations, err := ownService.ListOperationDTO(ownScope.Context(), 2, "")
	mysqlMust(t, err)
	if len(operations.Items) != 2 || operations.NextCursor == nil {
		t.Fatalf("operation page invalid: %+v", operations)
	}
	operations2, err := ownService.ListOperationDTO(ownScope.Context(), 2, *operations.NextCursor)
	mysqlMust(t, err)
	if len(operations2.Items) != 1 || operations2.NextCursor != nil {
		t.Fatalf("operation continuation invalid: %+v", operations2)
	}
	detail, err := ownService.GetOperationDTO(ownScope.Context(), operations.Items[0].PublicID)
	mysqlMust(t, err)
	if detail.PublicID != operations.Items[0].PublicID || detail.OriginInstallationID != own || detail.FailureMessage != nil {
		t.Fatalf("operation detail projection invalid: %+v", detail)
	}
	if _, err := foreignService.ListOperationDTO(foreignScope.Context(), 2, *operations.NextCursor); !errors.Is(err, systembackupread.ErrDenied) {
		t.Fatalf("cross-install operation cursor was accepted: %v", err)
	}
	tx, err := db.BeginTx(ownScope.Context(), &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	mysqlMust(t, err)
	defer tx.Rollback()
	_, err = ownScope.AuthorizeRead(ownScope.Context(), tx)
	mysqlMust(t, err)
	revokeCtx, stopRevoke := context.WithTimeout(ctx, 5*time.Second)
	defer stopRevoke()
	revoked := make(chan error, 1)
	go func() {
		_, e := db.ExecContext(revokeCtx, "UPDATE system_backup_admin_sessions SET revoked=TRUE WHERE origin_installation_id=? AND session_sha256=?", own, registrationHash(token))
		revoked <- e
	}()
	select {
	case e := <-revoked:
		t.Fatal("revocation bypassed the held full-schema read lock", e)
	case <-time.After(200 * time.Millisecond):
	}
	mysqlMust(t, ownScope.RecheckRead(ownScope.Context(), tx, own))
	mysqlMust(t, tx.Commit())
	select {
	case e := <-revoked:
		mysqlMust(t, e)
	case <-revokeCtx.Done():
		t.Fatal("revocation did not finish after read commit")
	}
	if _, err := ownService.ListTaskDTO(ownScope.Context(), systembackupread.BackupTask, "", 2, ""); !errors.Is(err, ErrRegistrationPermission) {
		t.Fatalf("revoked session retained task read: %v", err)
	}
	if _, err := ownService.ListOperationDTO(ownScope.Context(), 2, ""); !errors.Is(err, ErrRegistrationPermission) {
		t.Fatalf("revoked session retained operation read: %v", err)
	}
	t.Log("PASS full 066/067/080 schema, real rows, pagination, cross-install cursor, revocation lock")
}
