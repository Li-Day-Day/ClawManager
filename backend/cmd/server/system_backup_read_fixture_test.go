package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gin-gonic/gin"
)

func fixtureRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	registerBackupReadFixture(r.Group("/admin"), "fixture-test-secret")
	return r
}

func fixtureGet(t *testing.T, r *gin.Engine, path string, status int) map[string]any {
	t.Helper()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	if w.Code != status {
		t.Fatalf("%s: status %d, body %s", path, w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func TestBackupReadFixtureDefaultClosed(t *testing.T) {
	t.Setenv("SYSTEM_BACKUP_READ_FIXTURE", "0")
	body := fixtureGet(t, fixtureRouter(), "/admin/system-backups", 503)
	if body["code"] != "not_ready" {
		t.Fatalf("unexpected error: %v", body)
	}
}

func TestBackupReadFixturePaginationAndCursorBinding(t *testing.T) {
	t.Setenv("SYSTEM_BACKUP_READ_FIXTURE", "1")
	r := fixtureRouter()
	first := fixtureGet(t, r, "/admin/system-backups?limit=1", 200)
	if first["consistency"] != "stable_cutoff" || len(first["items"].([]any)) != 1 {
		t.Fatalf("unexpected first page: %v", first)
	}
	cursor := first["next_cursor"].(string)
	second := fixtureGet(t, r, "/admin/system-backups?limit=1&cursor="+url.QueryEscape(cursor), 200)
	if second["items"].([]any)[0].(map[string]any)["public_id"] == first["items"].([]any)[0].(map[string]any)["public_id"] {
		t.Fatal("page repeated a task")
	}
	for _, path := range []string{
		"/admin/system-backups?limit=2&cursor=" + url.QueryEscape(cursor),
		"/admin/system-backups?limit=1&status=succeeded&cursor=" + url.QueryEscape(cursor),
		"/admin/system-restore-drills?limit=1&cursor=" + url.QueryEscape(cursor),
		"/admin/system-backups?limit=1&cursor=" + url.QueryEscape(cursor+"x"),
		"/admin/system-backups?limit=501",
		"/admin/system-backups?unknown=1",
		"/admin/system-backups?status=succeeded&status=failed",
	} {
		body := fixtureGet(t, r, path, 400)
		if body["code"] != "validation_failed" {
			t.Fatalf("unexpected error: %v", body)
		}
	}
	filtered := fixtureGet(t, r, "/admin/system-backups?status=failed", 200)
	if filtered["consistency"] != "eventual" || len(filtered["items"].([]any)) != 0 {
		t.Fatalf("unexpected filter: %v", filtered)
	}
}

func TestBackupReadFixtureOverviewAndDetailErrors(t *testing.T) {
	t.Setenv("SYSTEM_BACKUP_READ_FIXTURE", "1")
	r := fixtureRouter()
	overview := fixtureGet(t, r, "/admin/system-backup-overview", 200)
	if overview["schema_version"] != "system-backup-overview.v1" || overview["effective_enabled"] != false {
		t.Fatalf("unexpected overview: %v", overview)
	}
	config := fixtureGet(t, r, "/admin/system-backup-config", 200)
	if config["schema_version"] != "system-backup-config.v1" || config["version"] != float64(4) {
		t.Fatalf("unexpected config: %v", config)
	}
	versions := fixtureGet(t, r, "/admin/system-backup-config/versions", 200)
	if len(versions["items"].([]any)) != 1 {
		t.Fatalf("unexpected versions: %v", versions)
	}
	if body := fixtureGet(t, r, "/admin/system-backup-catalog-records", 200); len(body["items"].([]any)) != 0 {
		t.Fatalf("unexpected catalog: %v", body)
	}
	if body := fixtureGet(t, r, "/admin/system-backups/sbk_00000000-0000-4000-8000-000000000001/events", 200); len(body["items"].([]any)) != 0 {
		t.Fatalf("unexpected events: %v", body)
	}
	if body := fixtureGet(t, r, "/admin/system-backups/sbk_00000000-0000-4000-8000-000000000001/logs?limit=1001", 400); body["code"] != "validation_failed" {
		t.Fatalf("unexpected logs error: %v", body)
	}
	if body := fixtureGet(t, r, "/admin/system-backups/sdr_00000000-0000-4000-8000-000000000001", 400); body["code"] != "validation_failed" {
		t.Fatalf("unexpected error: %v", body)
	}
	if body := fixtureGet(t, r, "/admin/system-backups/sbk_00000000-0000-4000-8000-000000000001", 200); body["schema_version"] != "system-backup-backup-detail.v1" {
		t.Fatalf("unexpected detail: %v", body)
	}
	for _, check := range []struct{ path, schema string }{
		{"/admin/system-restore-drills/sdr_00000000-0000-4000-8000-000000000001", "system-backup-drill-detail.v1"},
		{"/admin/system-backup-preflights/spf_00000000-0000-4000-8000-000000000001", "system-backup-preflight-detail.v1"},
		{"/admin/system-backup-artifact-verifications/sav_00000000-0000-4000-8000-000000000001", "system-backup-artifact-verification-detail.v1"},
	} {
		if body := fixtureGet(t, r, check.path, 200); body["schema_version"] != check.schema {
			t.Fatalf("unexpected detail: %v", body)
		}
	}
	if body := fixtureGet(t, r, "/admin/system-backups/sbk_99999999-9999-4999-8999-999999999999", 404); body["code"] != "not_found" {
		t.Fatalf("unexpected error: %v", body)
	}
}
