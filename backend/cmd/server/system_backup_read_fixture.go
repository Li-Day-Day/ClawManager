package main

import (
	"crypto/hmac"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"

	"clawreef/internal/middleware"
	"github.com/gin-gonic/gin"
)

//go:embed system_backup_read_fixture_data.json
var backupReadFixtureData []byte

//go:embed system_backup_read_control_fixture_data.json
var backupReadControlFixtureData []byte

type fixtureExamples struct {
	Shared         map[string]any            `json:"shared"`
	TaskTemplates  map[string]map[string]any `json:"task_templates"`
	ResourceFields map[string]map[string]any `json:"resource_fields"`
}

type fixtureControlExamples struct {
	ConfigUpdateRequest struct {
		Config map[string]any `json:"config"`
	} `json:"config_update_request"`
	ConfigResourceMetadata map[string]any `json:"config_resource_metadata"`
}

// The fixture is opt-in. It exercises the Admin read wire contract without
// presenting synthetic backup records as installation state.
type backupReadFixture struct {
	key []byte
}

type fixtureCursor struct {
	Resource string `json:"resource"`
	Limit    int    `json:"limit"`
	Filter   string `json:"filter"`
	Offset   int    `json:"offset"`
}

var fixturePublicID = regexp.MustCompile(`^(sbk|sdr|spf|sav)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func registerBackupReadFixture(admin *gin.RouterGroup, secret string) {
	f := backupReadFixture{key: []byte(secret)}
	admin.GET("/system-backup-overview", f.overview)
	admin.GET("/system-backup-config", f.config)
	for _, path := range []string{
		"/system-backup-config/versions", "/system-backup-catalog-scans", "/system-backup-catalog-records",
		"/system-backup-catalog-imports", "/system-backup-prune-runs", "/system-backup-operations", "/system-backup-promotions",
	} {
		admin.GET(path, f.emptyList)
	}
	admin.GET("/system-backup-config/versions/:version", f.configVersion)
	for _, route := range []struct{ path, kind string }{
		{"/system-backups", "backup"},
		{"/system-restore-drills", "drill"},
		{"/system-backup-preflights", "preflight"},
		{"/system-backup-artifact-verifications", "artifact_verify"},
	} {
		kind := route.kind
		admin.GET(route.path, func(c *gin.Context) { f.list(c, kind) })
		admin.GET(route.path+"/:id", func(c *gin.Context) { f.detail(c, kind) })
		admin.GET(route.path+"/:id/events", func(c *gin.Context) { f.childList(c, kind, 500) })
		admin.GET(route.path+"/:id/logs", func(c *gin.Context) { f.childList(c, kind, 1000) })
	}
	admin.GET("/system-backups/:id/manifest", f.manifest)
}

func fixtureError(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{"code": code, "message": message, "details": gin.H{}, "request_id": middleware.SystemBackupRequestID(c)})
}

func (f backupReadFixture) enabled(c *gin.Context) bool {
	c.Header("Cache-Control", "no-store")
	if os.Getenv("SYSTEM_BACKUP_READ_FIXTURE") != "1" {
		fixtureError(c, http.StatusServiceUnavailable, "not_ready", "System backup read data is not available")
		return false
	}
	c.Header("X-System-Backup-Data-Source", "fixture")
	return true
}

func (f backupReadFixture) overview(c *gin.Context) {
	if !f.enabled(c) {
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"schema_version": "system-backup-overview.v1", "origin_installation_id": "installation_fixture",
		"config_version": 4, "effective_enabled": false, "monitoring_armed": false,
		"monitoring_armed_reason": "none", "matrix": "k8s-cluster", "backup_recovery_readiness": false,
		"baseline_present": false, "controller_health": "unknown", "database_health": "unknown",
		"artifact_target_health": "unknown", "evidence_store_health": "unknown", "catalog_health": "unknown",
		"source_writer_state": "unknown", "active_task_count": 0, "active_operation_count": 0,
		"finalization_unknown_count": 0, "cleanup_backlog_count": 0, "ownership_resolution_backlog_count": 0,
		"shortage_failure_domains": []any{}, "observed_at": "2026-09-30T00:00:00Z",
	})
}

func fixtureConfigResource() gin.H {
	var examples fixtureControlExamples
	if err := json.Unmarshal(backupReadControlFixtureData, &examples); err != nil {
		panic(err)
	}
	resource := gin.H{}
	for key, value := range examples.ConfigResourceMetadata {
		resource[key] = value
	}
	resource["origin_installation_id"] = "installation_fixture"
	resource["config"] = examples.ConfigUpdateRequest.Config
	return resource
}

func (f backupReadFixture) config(c *gin.Context) {
	if !f.enabled(c) {
		return
	}
	c.JSON(200, fixtureConfigResource())
}

func (f backupReadFixture) configVersion(c *gin.Context) {
	if !f.enabled(c) {
		return
	}
	version, err := strconv.Atoi(c.Param("version"))
	if err != nil || version < 1 {
		fixtureError(c, 400, "validation_failed", "Invalid version")
		return
	}
	if version != 4 {
		fixtureError(c, 404, "not_found", "Config version not found")
		return
	}
	c.JSON(200, fixtureConfigResource())
}

func (f backupReadFixture) emptyList(c *gin.Context) {
	if !f.enabled(c) {
		return
	}
	for name, values := range c.Request.URL.Query() {
		if name != "limit" || len(values) != 1 {
			fixtureError(c, 400, "validation_failed", "Invalid list query")
			return
		}
	}
	if raw := c.Query("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 500 {
			fixtureError(c, 400, "validation_failed", "Invalid limit")
			return
		}
	}
	items := []any{}
	if strings.HasSuffix(c.FullPath(), "/system-backup-config/versions") {
		items = append(items, fixtureConfigResource())
	}
	c.JSON(200, gin.H{"items": items, "next_cursor": nil, "consistency": "stable_cutoff"})
}

func fixtureTasks(kind string) []gin.H {
	var examples fixtureExamples
	if err := json.Unmarshal(backupReadFixtureData, &examples); err != nil {
		panic(err)
	}
	templateName := kind
	if kind == "artifact_verify" {
		templateName = "artifact_verification"
	}
	ids := map[string]string{"backup": "sbk", "drill": "sdr", "preflight": "spf", "artifact_verify": "sav"}
	items := make([]gin.H, 3)
	for i := range items {
		id := ids[kind] + "_00000000-0000-4000-8000-00000000000" + strconv.Itoa(3-i)
		item := gin.H{}
		for key, value := range examples.TaskTemplates[templateName] {
			item[key] = value
		}
		item["public_id"] = id
		item["origin_installation_id"] = "installation_fixture"
		item["idempotency_key"] = "fixture-" + id
		item["request_id"] = "fixture-" + id
		items[i] = item
	}
	return items
}

func (f backupReadFixture) list(c *gin.Context, kind string) {
	if !f.enabled(c) {
		return
	}
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 500 {
			fixtureError(c, 400, "validation_failed", "Invalid limit")
			return
		}
		limit = parsed
	}
	if len(c.Request.URL.RawQuery) > 8192 {
		fixtureError(c, 400, "validation_failed", "Invalid query")
		return
	}
	for name := range c.Request.URL.Query() {
		if name != "limit" && name != "cursor" && name != "status" {
			fixtureError(c, 400, "validation_failed", "Unknown filter")
			return
		}
		if len(c.Request.URL.Query()[name]) != 1 {
			fixtureError(c, 400, "validation_failed", "Repeated query parameter")
			return
		}
	}
	filter := c.Query("status")
	if filter != "" && filter != "succeeded" && filter != "failed" && filter != "pending" && filter != "running" && filter != "canceled" {
		fixtureError(c, 400, "validation_failed", "Invalid status filter")
		return
	}
	items := fixtureTasks(kind)
	if filter != "" && filter != "succeeded" {
		items = []gin.H{}
	}
	offset := 0
	if raw := c.Query("cursor"); raw != "" {
		if len(raw) > 4096 {
			fixtureError(c, 400, "validation_failed", "Invalid cursor")
			return
		}
		cursor, ok := f.decodeCursor(raw)
		if !ok || cursor.Resource != kind || cursor.Limit != limit || cursor.Filter != filter || cursor.Offset < 0 || cursor.Offset >= len(items) {
			fixtureError(c, 400, "validation_failed", "Invalid cursor")
			return
		}
		offset = cursor.Offset
	}
	end := offset + limit
	if end > len(items) {
		end = len(items)
	}
	var next any
	if end < len(items) {
		next = f.encodeCursor(fixtureCursor{kind, limit, filter, end})
	}
	consistency := "stable_cutoff"
	if filter != "" {
		consistency = "eventual"
	}
	c.JSON(200, gin.H{"items": items[offset:end], "next_cursor": next, "consistency": consistency})
}

func (f backupReadFixture) detail(c *gin.Context, kind string) {
	if !f.enabled(c) {
		return
	}
	id := c.Param("id")
	prefix := map[string]string{"backup": "sbk_", "drill": "sdr_", "preflight": "spf_", "artifact_verify": "sav_"}[kind]
	if !fixturePublicID.MatchString(id) || !strings.HasPrefix(id, prefix) {
		fixtureError(c, 400, "validation_failed", "Invalid resource ID")
		return
	}
	var task gin.H
	for _, item := range fixtureTasks(kind) {
		if item["public_id"] == id {
			task = item
			break
		}
	}
	if task == nil {
		fixtureError(c, 404, "not_found", "Resource not found")
		return
	}
	var examples fixtureExamples
	if err := json.Unmarshal(backupReadFixtureData, &examples); err != nil {
		panic(err)
	}
	resourceName := map[string]string{"backup": "BackupDetailResource", "drill": "DrillDetailResource", "preflight": "PreflightDetailResource", "artifact_verify": "ArtifactVerificationDetailResource"}[kind]
	detail := gin.H{}
	for key, value := range examples.ResourceFields[resourceName] {
		detail[key] = value
	}
	detail["task"] = task
	detail["execution"] = examples.Shared["execution"]
	detail["verifier_summary"] = examples.Shared["verifier_summary"]
	switch kind {
	case "backup":
		detail["checksums"] = examples.Shared["checksums"]
	case "drill", "preflight":
		detail["source_checksums"] = examples.Shared["checksums"]
	case "artifact_verify":
		detail["observed_checksums"] = examples.Shared["checksums"]
	}
	if source, ok := detail["source"].(map[string]any); ok {
		source["source_public_id"] = fixtureTasks("backup")[0]["public_id"]
	}
	c.JSON(200, detail)
}

func fixtureTaskByID(kind, id string) gin.H {
	for _, item := range fixtureTasks(kind) {
		if item["public_id"] == id {
			return item
		}
	}
	return nil
}

func fixtureValidTaskID(kind, id string) bool {
	prefix := map[string]string{"backup": "sbk_", "drill": "sdr_", "preflight": "spf_", "artifact_verify": "sav_"}[kind]
	return fixturePublicID.MatchString(id) && strings.HasPrefix(id, prefix)
}

func (f backupReadFixture) childList(c *gin.Context, kind string, maxLimit int) {
	if !f.enabled(c) {
		return
	}
	if !fixtureValidTaskID(kind, c.Param("id")) {
		fixtureError(c, 400, "validation_failed", "Invalid resource ID")
		return
	}
	if fixtureTaskByID(kind, c.Param("id")) == nil {
		fixtureError(c, 404, "not_found", "Resource not found")
		return
	}
	for name, values := range c.Request.URL.Query() {
		if name != "limit" || len(values) != 1 {
			fixtureError(c, 400, "validation_failed", "Invalid list query")
			return
		}
	}
	if raw := c.Query("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > maxLimit {
			fixtureError(c, 400, "validation_failed", "Invalid limit")
			return
		}
	}
	c.JSON(200, gin.H{"items": []any{}, "next_cursor": nil, "consistency": "stable_cutoff"})
}

func (f backupReadFixture) manifest(c *gin.Context) {
	if !f.enabled(c) {
		return
	}
	if !fixtureValidTaskID("backup", c.Param("id")) {
		fixtureError(c, 400, "validation_failed", "Invalid resource ID")
		return
	}
	if fixtureTaskByID("backup", c.Param("id")) == nil {
		fixtureError(c, 404, "not_found", "Resource not found")
		return
	}
	fixtureError(c, 503, "not_ready", "Manifest fixture is not available")
}

func (f backupReadFixture) encodeCursor(cursor fixtureCursor) string {
	payload, _ := json.Marshal(cursor)
	sig := hmac.New(sha256.New, f.key)
	sig.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig.Sum(nil))
}

func (f backupReadFixture) decodeCursor(raw string) (fixtureCursor, bool) {
	var cursor fixtureCursor
	parts := strings.Split(raw, ".")
	if len(parts) != 2 {
		return cursor, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return cursor, false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return cursor, false
	}
	mac := hmac.New(sha256.New, f.key)
	mac.Write(payload)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return cursor, false
	}
	if json.Unmarshal(payload, &cursor) != nil {
		return cursor, false
	}
	return cursor, true
}
