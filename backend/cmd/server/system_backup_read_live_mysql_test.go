//go:build systembackup_mysql

package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"clawreef/internal/systembackupsecurity"
	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
	"github.com/golang-jwt/jwt/v5"
)

// Run only inside the UID-pinned fresh-migration namespace. This exercises
// the actual Gin handlers, A read scope, and D SQL reader as one request path.
func TestDAdminReadLiveHTTPMySQL(t *testing.T) {
	run, uid := os.Getenv("D_INVARIANT_RUN"), os.Getenv("D_INVARIANT_NAMESPACE_UID")
	if !regexp.MustCompile(`^sbk-mig-[0-9]{12}-[0-9a-f]{4}$`).MatchString(run) ||
		!regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).MatchString(uid) {
		t.Fatal("isolated run and namespace UID required")
	}
	host, password := os.Getenv("D_INVARIANT_MYSQL_HOST"), os.Getenv("MYSQL_ROOT_PASSWORD")
	if host == "" {
		host = "127.0.0.1"
	}
	if net.ParseIP(host) == nil || strings.Contains(host, ":") || password == "" {
		t.Fatal("isolated IPv4 MySQL credentials required")
	}
	cfg := mysql.NewConfig()
	cfg.User, cfg.Passwd, cfg.Net, cfg.Addr, cfg.DBName = "root", password, "tcp", net.JoinHostPort(host, "3306"), "clawmanager"
	cfg.ParseTime, cfg.Loc, cfg.MultiStatements = true, time.UTC, true
	cfg.Params = map[string]string{"time_zone": "'+00:00'"}
	cfg.Timeout, cfg.ReadTimeout, cfg.WriteTimeout = 5*time.Second, 20*time.Second, 20*time.Second
	db, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	var gotRun, gotUID, pinnedUUID, actualUUID string
	if err := db.QueryRowContext(ctx, "SELECT run_namespace,namespace_uid,server_uuid FROM d_invariant_run_marker WHERE id=1").Scan(&gotRun, &gotUID, &pinnedUUID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, "SELECT @@server_uuid").Scan(&actualUUID); err != nil {
		t.Fatal(err)
	}
	if gotRun != run || gotUID != uid || pinnedUUID != actualUUID {
		t.Fatal("HTTP probe is outside the pinned run-owned MySQL")
	}
	fixture, err := os.ReadFile(os.Getenv("D_ADMIN_READ_FULL_FIXTURE"))
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(fixture)
	if hex.EncodeToString(digest[:]) != os.Getenv("D_ADMIN_READ_FULL_FIXTURE_SHA256") ||
		len(fixture) < 1000 || !strings.Contains(string(fixture), "INSERT INTO system_backup_configs") {
		t.Fatal("full-schema fixture hash mismatch")
	}
	const installation = "installation_d_admin_http"
	const foreign = "installation_d_admin_http_foreign"
	for _, id := range []string{installation, foreign} {
		conn, err := db.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		_, err = conn.ExecContext(ctx, "SET @installation_id=?", id)
		if err == nil {
			_, err = conn.ExecContext(ctx, string(fixture))
		}
		conn.Close()
		if err != nil {
			t.Fatal(err)
		}
	}
	// Both own and foreign task rows reference the exact config snapshot hash
	// and byte count. The stock controller fixture has a different snapshot.
	updated, err := db.ExecContext(ctx, "UPDATE system_backup_configs SET config_sha256=SHA2('{}',256),config_size_bytes=2 WHERE origin_installation_id IN (?,?) AND version=1", installation, foreign)
	if err != nil {
		t.Fatal(err)
	}
	if count, err := updated.RowsAffected(); err != nil || count != 2 {
		t.Fatalf("expected both HTTP probe config snapshots: count=%d err=%v", count, err)
	}
	var userID int64
	var passwordHash string
	if err := db.QueryRowContext(ctx, "SELECT id,password_hash FROM users WHERE role='admin' AND is_active=TRUE ORDER BY id LIMIT 1").Scan(&userID, &passwordHash); err != nil {
		t.Fatal(err)
	}
	hash := func(s string) string {
		sum := sha256.Sum256([]byte(s))
		return hex.EncodeToString(sum[:])
	}
	secret := []byte(strings.Repeat("s", 32))
	now := time.Now().UTC()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID, "token_type": "access", "jti": "d-live-http", "iat": now.Add(-time.Minute).Unix(), "exp": now.Add(5 * time.Minute).Unix(),
	}).SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	rbac := []byte(`{"schema_version":"system-backup-registration-rbac.draft.v1","version":"read-v1","installation_id":"` + installation + `","bindings":[{"actor_id":"` + strconv.FormatInt(userID, 10) + `","subject":"user:` + strconv.FormatInt(userID, 10) + `","role":"viewer"}]}`)
	rbacHash := hash(string(rbac))
	rbacPath := filepath.Join(root, "rbac_bindings", "read-v1", rbacHash+".json")
	if err := os.MkdirAll(filepath.Dir(rbacPath), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(rbacPath, rbac, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "UPDATE system_backup_configs SET rbac_bindings_registry_version='read-v1',rbac_bindings_registry_sha256=? WHERE origin_installation_id=? AND version=1", rbacHash, installation); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO system_backup_admin_sessions(origin_installation_id,session_sha256,user_id,subject,credential_hash,expires_at,revoked) VALUES(?,?,?,?,?,UTC_TIMESTAMP(6)+INTERVAL 5 MINUTE,FALSE)", installation, hash(token), userID, "user:"+strconv.FormatInt(userID, 10), hash(passwordHash)); err != nil {
		t.Fatal(err)
	}
	pins, err := json.Marshal(systembackupsecurity.SystemBackupReadPins{InstallationID: installation, ConfigVersion: 1, RBACVersion: "read-v1", RBACSHA256: rbacHash, RegistryDirectory: root})
	if err != nil {
		t.Fatal(err)
	}
	pinsPath := filepath.Join(root, "read-pins.json")
	if err := os.WriteFile(pinsPath, pins, 0600); err != nil {
		t.Fatal(err)
	}
	sessions, err := systembackupsecurity.NewSQLLoginSessions(db, systembackupsecurity.DatabaseIdentity{ServerUUID: actualUUID, Database: cfg.DBName}, installation, secret)
	if err != nil {
		t.Fatal(err)
	}
	env := map[string]string{
		"SYSTEM_BACKUP_READ_LIVE_ENABLED": "true", "SYSTEM_BACKUP_READ_PINS_PATH": pinsPath,
		"SYSTEM_BACKUP_READ_PINS_SHA256":    hash(string(pins)),
		"SYSTEM_BACKUP_READ_CURSOR_KEY_HEX": hex.EncodeToString([]byte(strings.Repeat("c", 32))),
	}
	live, err := loadLiveBackupRead(db, sessions, func(k string) string { return env[k] })
	if err != nil {
		t.Fatal(err)
	}
	const ownBackup = "sbk_00000000-0000-4000-8000-000000000091"
	const foreignBackup = "sbk_00000000-0000-4000-8000-000000000092"
	const secondBackup = "sbk_00000000-0000-4000-8000-000000000093"
	const laterBackup = "sbk_00000000-0000-4000-8000-000000000094"
	seedBackup := func(id, origin string) {
		t.Helper()
		if _, err := db.ExecContext(ctx, `INSERT INTO system_backups
			(public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
			 config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
			 source_orchestrator,source_profile,matrix_key,runner,requested_parts,artifact_read_identity_hash,
			 artifact_read_ref_version,artifact_ca_identity_hash,artifact_ca_ref_version,target_class,target_risks,target_failure_domain_id)
			 VALUES(?,?,'admin',?,'POST /system-backups',?,REPEAT('a',64),?,1,'{}',2,SHA2('{}',256),
			 UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,'kubernetes','single-node','k8s-single-node','k8s','mysql',
			 REPEAT('b',64),'fixture-v1',REPEAT('c',64),'fixture-v1','dr-ready-external','','isolated')`,
			id, origin, strconv.FormatInt(userID, 10), "d-http-"+id, "d-http-"+id); err != nil {
			t.Fatal(err)
		}
	}
	seedBackup(ownBackup, installation)
	seedBackup(secondBackup, installation)
	seedBackup(foreignBackup, foreign)
	const drill = "sdr_00000000-0000-4000-8000-000000000091"
	if _, err := db.ExecContext(ctx, `INSERT INTO system_restore_drills
		(public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
		 config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
		 source_artifact_type,source_public_id,target_profile,restore_target_config_ref,restore_target_config_hash,cleanup_policy)
		 VALUES(?,?,'admin',?,'POST /system-restore-drills','d-http-read-drill-91',REPEAT('a',64),'d-http-read-drill-91',
		 1,'{}',2,SHA2('{}',256),UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,
		 'backup',?,'single-node','isolated-target',REPEAT('d',64),'delete-on-success')`, drill, installation, strconv.FormatInt(userID, 10), ownBackup); err != nil {
		t.Fatal(err)
	}
	const preflight = "spf_00000000-0000-4000-8000-000000000091"
	if _, err := db.ExecContext(ctx, `INSERT INTO system_backup_preflights
		(public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
		 config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
		 source_artifact_type,source_public_id,target_profile,restore_target_config_ref,restore_target_config_hash,artifact_compatibility)
		 VALUES(?,?,'admin',?,'POST /system-backup-preflights','d-http-read-preflight-91',REPEAT('a',64),'d-http-read-preflight-91',
		 1,'{}',2,SHA2('{}',256),UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,
		 'backup',?,'single-node','isolated-target',REPEAT('d',64),'supported')`, preflight, installation, strconv.FormatInt(userID, 10), ownBackup); err != nil {
		t.Fatal(err)
	}
	const verification = "sav_00000000-0000-4000-8000-000000000091"
	if _, err := db.ExecContext(ctx, `INSERT INTO system_backup_artifact_verifications
		(public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
		 config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
		 verification_scope,source_artifact_type,source_public_id,artifact_state_before,artifact_state_after,
		 unusable_reason_before,unusable_reason_after)
		 VALUES(?,?,'admin',?,'POST /system-backup-artifact-verifications','d-http-read-verify-91',REPEAT('a',64),'d-http-read-verify-91',
		 1,'{}',2,SHA2('{}',256),UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,
		 'health','backup',?,'staging','staging','not_committed','not_committed')`, verification, installation, strconv.FormatInt(userID, 10), ownBackup); err != nil {
		t.Fatal(err)
	}
	const operation = "sop_00000000-0000-4000-8000-000000000091"
	if _, err := db.ExecContext(ctx, `INSERT INTO system_backup_operations
		(public_id,origin_installation_id,operation_type,target_type,target_public_id,actor_type,actor_id,endpoint,
		 idempotency_key,request_hash,external_action_public_ids_canonical_json,external_action_public_ids_size_bytes,
		 external_action_public_ids_sha256,status,next_reconcile_at,deadline_at)
		 VALUES(?,?,'control_metadata_gc','system',?,'system','system:controller','DHTTPRead',?,REPEAT('a',64),
		 '[]',2,SHA2('[]',256),'pending',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 1 HOUR)`,
		operation, installation, installation, "d-http-operation"); err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerBackupReadLive(router.Group("/api/v1/admin"), live)
	request := func(path, bearer string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(http.MethodGet, path, nil)
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	backup := request("/api/v1/admin/system-backups?limit=1", token)
	var firstPage struct {
		Items []struct {
			PublicID string `json:"public_id"`
		} `json:"items"`
		NextCursor *string `json:"next_cursor"`
	}
	if backup.Code != http.StatusOK || backup.Header().Get("X-System-Backup-Data-Source") != "live" ||
		json.Unmarshal(backup.Body.Bytes(), &firstPage) != nil || len(firstPage.Items) != 1 ||
		firstPage.Items[0].PublicID != secondBackup || firstPage.NextCursor == nil ||
		strings.Contains(backup.Body.String(), foreignBackup) {
		t.Fatalf("live backup first page invalid: status=%d body=%s", backup.Code, backup.Body.String())
	}
	seedBackup(laterBackup, installation)
	continued := request("/api/v1/admin/system-backups?limit=1&cursor="+url.QueryEscape(*firstPage.NextCursor), token)
	if continued.Code != http.StatusOK || continued.Header().Get("X-System-Backup-Data-Source") != "live" ||
		!strings.Contains(continued.Body.String(), ownBackup) || strings.Contains(continued.Body.String(), laterBackup) ||
		strings.Contains(continued.Body.String(), foreignBackup) {
		t.Fatalf("live backup continuation invalid: status=%d body=%s", continued.Code, continued.Body.String())
	}
	for _, row := range []struct{ path, id string }{
		{"/api/v1/admin/system-restore-drills?status=pending", drill},
		{"/api/v1/admin/system-backup-preflights?status=pending", preflight},
		{"/api/v1/admin/system-backup-artifact-verifications?status=pending", verification},
	} {
		w := request(row.path, token)
		if w.Code != http.StatusOK || w.Header().Get("X-System-Backup-Data-Source") != "live" || !strings.Contains(w.Body.String(), row.id) {
			t.Fatalf("live task HTTP read invalid: %s status=%d body=%s", row.path, w.Code, w.Body.String())
		}
	}
	for _, path := range []string{"/api/v1/admin/system-backup-operations", "/api/v1/admin/system-backup-operations/" + operation} {
		w := request(path, token)
		if w.Code != http.StatusOK || w.Header().Get("X-System-Backup-Data-Source") != "live" || !strings.Contains(w.Body.String(), operation) {
			t.Fatalf("live operation HTTP read invalid: %s status=%d body=%s", path, w.Code, w.Body.String())
		}
	}
	if w := request("/api/v1/admin/system-backups", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("missing access token status=%d", w.Code)
	}
	if w := request("/api/v1/admin/system-backups?limit=0", token); w.Code != http.StatusBadRequest {
		t.Fatalf("invalid limit status=%d", w.Code)
	}
	if w := request("/api/v1/admin/system-backup-config", token); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("config without canonical column status=%d", w.Code)
	}
	for _, path := range []string{
		"/api/v1/admin/system-backup-config/versions",
		"/api/v1/admin/system-backup-config/versions/1",
	} {
		if w := request(path, token); w.Code != http.StatusServiceUnavailable {
			t.Fatalf("config without canonical column: %s status=%d", path, w.Code)
		}
	}
	if _, err := db.ExecContext(ctx, "UPDATE system_backup_admin_sessions SET revoked=TRUE WHERE origin_installation_id=? AND session_sha256=?", installation, hash(token)); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{
		"/api/v1/admin/system-backups", "/api/v1/admin/system-restore-drills",
		"/api/v1/admin/system-backup-preflights", "/api/v1/admin/system-backup-artifact-verifications",
		"/api/v1/admin/system-backup-operations", "/api/v1/admin/system-backup-operations/" + operation,
		"/api/v1/admin/system-backup-config", "/api/v1/admin/system-backup-config/versions",
		"/api/v1/admin/system-backup-config/versions/1",
	} {
		w := request(path, token)
		if w.Code != http.StatusForbidden || strings.Contains(w.Body.String(), ownBackup) || strings.Contains(w.Body.String(), operation) {
			t.Fatalf("revoked HTTP read invalid: %s status=%d body=%s", path, w.Code, w.Body.String())
		}
	}
	t.Log("PASS four task HTTP lists, stable continuation, operation read, 200/400/401/403/503, installation isolation, revocation, source marker")
}
