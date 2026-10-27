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

// Runs after TestDConfigCanonicalCandidateMySQL in the same disposable,
// UID-pinned namespace. That probe installs the candidate column and seeds
// versions 1 (missing bytes) and 2 (valid bytes) for this HTTP path.
func TestDAdminReadConfigHTTPMySQL(t *testing.T) {
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
	cfg.ParseTime, cfg.Loc = true, time.UTC
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
	if err := db.QueryRowContext(ctx, "SELECT run_namespace,namespace_uid,server_uuid FROM d_invariant_run_marker WHERE id=1").
		Scan(&gotRun, &gotUID, &pinnedUUID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, "SELECT @@server_uuid").Scan(&actualUUID); err != nil {
		t.Fatal(err)
	}
	if gotRun != run || gotUID != uid || pinnedUUID != actualUUID {
		t.Fatal("config HTTP probe is outside pinned run-owned MySQL")
	}
	const installation = "installation_d_config_candidate"
	var activeVersion, userID int64
	var snapshot []byte
	var configHash, storedRBACHash, storedRBACVersion, passwordHash string
	if err := db.QueryRowContext(ctx, `SELECT s.active_config_version,c.canonical_config_json,c.config_sha256,
    c.rbac_bindings_registry_version,c.rbac_bindings_registry_sha256
    FROM system_backup_installation_state AS s JOIN system_backup_configs AS c
      ON c.origin_installation_id=s.origin_installation_id AND c.version=s.active_config_version
    WHERE s.origin_installation_id=?`, installation).
		Scan(&activeVersion, &snapshot, &configHash, &storedRBACVersion, &storedRBACHash); err != nil {
		t.Fatal("candidate config row missing", err)
	}
	if activeVersion != 2 || len(snapshot) < 1000 || storedRBACVersion != "read-v1" {
		t.Fatal("candidate config probe did not seed expected active version")
	}
	if err := db.QueryRowContext(ctx, "SELECT id,password_hash FROM users WHERE role='admin' AND is_active=TRUE ORDER BY id LIMIT 1").
		Scan(&userID, &passwordHash); err != nil {
		t.Fatal(err)
	}
	hash := func(data []byte) string {
		sum := sha256.Sum256(data)
		return hex.EncodeToString(sum[:])
	}
	if hash(snapshot) != configHash {
		t.Fatal("candidate config hash mismatch")
	}
	actor := strconv.FormatInt(userID, 10)
	rbac := []byte(`{"schema_version":"system-backup-registration-rbac.draft.v1","version":"read-v1","installation_id":"` + installation + `","bindings":[{"actor_id":"` + actor + `","subject":"user:` + actor + `","role":"viewer"}]}`)
	if hash(rbac) != storedRBACHash {
		t.Fatal("candidate RBAC source mismatch")
	}
	root := t.TempDir()
	rbacPath := filepath.Join(root, "rbac_bindings", "read-v1", storedRBACHash+".json")
	if err := os.MkdirAll(filepath.Dir(rbacPath), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(rbacPath, rbac, 0600); err != nil {
		t.Fatal(err)
	}
	secret := []byte(strings.Repeat("s", 32))
	now := time.Now().UTC()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID, "token_type": "access", "jti": "d-config-http-candidate",
		"iat": now.Add(-time.Minute).Unix(), "exp": now.Add(5 * time.Minute).Unix(),
	}).SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO system_backup_admin_sessions
    (origin_installation_id,session_sha256,user_id,subject,credential_hash,expires_at,revoked)
    VALUES(?,?,?,?,?,UTC_TIMESTAMP(6)+INTERVAL 5 MINUTE,FALSE)`,
		installation, hash([]byte(token)), userID, "user:"+actor, hash([]byte(passwordHash))); err != nil {
		t.Fatal(err)
	}
	pins, err := json.Marshal(systembackupsecurity.SystemBackupReadPins{
		InstallationID: installation, ConfigVersion: 2, RBACVersion: "read-v1",
		RBACSHA256: storedRBACHash, RegistryDirectory: root,
	})
	if err != nil {
		t.Fatal(err)
	}
	pinsPath := filepath.Join(root, "read-pins.json")
	if err := os.WriteFile(pinsPath, pins, 0600); err != nil {
		t.Fatal(err)
	}
	sessions, err := systembackupsecurity.NewSQLLoginSessions(db,
		systembackupsecurity.DatabaseIdentity{ServerUUID: actualUUID, Database: cfg.DBName}, installation, secret)
	if err != nil {
		t.Fatal(err)
	}
	env := map[string]string{
		"SYSTEM_BACKUP_READ_LIVE_ENABLED": "true", "SYSTEM_BACKUP_READ_PINS_PATH": pinsPath,
		"SYSTEM_BACKUP_READ_PINS_SHA256":    hash(pins),
		"SYSTEM_BACKUP_READ_CURSOR_KEY_HEX": hex.EncodeToString([]byte(strings.Repeat("c", 32))),
	}
	live, err := loadLiveBackupRead(db, sessions, func(key string) string { return env[key] })
	if err != nil {
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
	const base = "/api/v1/admin/system-backup-config"
	if w := request(base, token); w.Code != http.StatusOK ||
		w.Header().Get("X-System-Backup-Data-Source") != "live" ||
		!strings.Contains(w.Body.String(), `"version":2`) ||
		!strings.Contains(w.Body.String(), `"origin_installation_id":"`+installation+`"`) {
		t.Fatalf("active config HTTP read invalid: status=%d body=%s", w.Code, w.Body.String())
	}
	for _, path := range []string{base + "/versions/1", base + "/versions?limit=1"} {
		if w := request(path, token); w.Code != http.StatusServiceUnavailable || w.Header().Get("X-System-Backup-Data-Source") != "" {
			t.Fatalf("old version without canonical bytes leaked: %s status=%d", path, w.Code)
		}
	}
	// Simulate an independently verified exact-original backfill in this
	// disposable fixture. The production backfill writer remains gated.
	if _, err := db.ExecContext(ctx, `UPDATE system_backup_configs AS old_row
    JOIN system_backup_configs AS new_row
      ON new_row.origin_installation_id=old_row.origin_installation_id AND new_row.version=2
    SET old_row.canonical_config_json=new_row.canonical_config_json
    WHERE old_row.origin_installation_id=? AND old_row.version=1
      AND old_row.config_sha256=new_row.config_sha256
      AND old_row.config_size_bytes=new_row.config_size_bytes`, installation); err != nil {
		t.Fatal(err)
	}
	if w := request(base+"/versions/1", token); w.Code != http.StatusOK ||
		!strings.Contains(w.Body.String(), `"version":1`) ||
		!strings.Contains(w.Body.String(), `"active":false`) {
		t.Fatalf("historical config HTTP read invalid: status=%d body=%s", w.Code, w.Body.String())
	}
	first := request(base+"/versions?limit=1", token)
	var page struct {
		Items []struct {
			Version int64 `json:"version"`
		} `json:"items"`
		NextCursor  *string `json:"next_cursor"`
		Consistency string  `json:"consistency"`
	}
	if first.Code != http.StatusOK || json.Unmarshal(first.Body.Bytes(), &page) != nil ||
		len(page.Items) != 1 || page.Items[0].Version != 2 || page.NextCursor == nil ||
		page.Consistency != "stable_cutoff" {
		t.Fatalf("config first page invalid: status=%d body=%s", first.Code, first.Body.String())
	}
	second := request(base+"/versions?limit=1&cursor="+url.QueryEscape(*page.NextCursor), token)
	if second.Code != http.StatusOK || !strings.Contains(second.Body.String(), `"version":1`) ||
		strings.Contains(second.Body.String(), `"version":2`) {
		t.Fatalf("config continuation invalid: status=%d body=%s", second.Code, second.Body.String())
	}
	if w := request(base+"/versions?limit=1&cursor="+url.QueryEscape(*page.NextCursor+"x"), token); w.Code != http.StatusBadRequest {
		t.Fatalf("tampered config cursor status=%d", w.Code)
	}
	if w := request(base+"/versions/01", token); w.Code != http.StatusBadRequest {
		t.Fatalf("noncanonical version status=%d", w.Code)
	}
	if w := request(base, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("missing token status=%d", w.Code)
	}
	if _, err := db.ExecContext(ctx, "UPDATE system_backup_admin_sessions SET revoked=TRUE WHERE origin_installation_id=? AND session_sha256=?",
		installation, hash([]byte(token))); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{base, base + "/versions", base + "/versions/1"} {
		if w := request(path, token); w.Code != http.StatusForbidden || w.Header().Get("X-System-Backup-Data-Source") != "" {
			t.Fatalf("revoked config HTTP read invalid: %s status=%d", path, w.Code)
		}
	}
	t.Log("PASS config HTTP active/history/pages, old-row fail closed, 200/400/401/403/503, revocation")
}
