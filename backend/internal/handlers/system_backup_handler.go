package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"clawreef/internal/systembackup/control"
	"github.com/gin-gonic/gin"
)

type BackupTaskStore interface {
	Create(context.Context, int, string, control.Request, time.Duration) (control.Task, error)
	List(context.Context, int) ([]control.Task, error)
	Get(context.Context, string) (control.Task, error)
	Cancel(context.Context, string, int64) (control.Task, error)
	Profiles(context.Context) ([]control.Profile, error)
}
type SystemBackupHandler struct{ Store BackupTaskStore }

type BackupCatalogStore interface {
	CatalogPage(context.Context, string, string, int) (control.CatalogView, error)
	CatalogDetail(context.Context, string, string, string) (control.CatalogItem, error)
	Report(context.Context, string) (control.TaskReport, error)
}

func (h SystemBackupHandler) Catalog(c *gin.Context) {
	if !h.available(c) {
		return
	}
	s, ok := h.Store.(BackupCatalogStore)
	if !ok {
		backupError(c, control.ErrNotReady)
		return
	}
	limit := 50
	if value, ok := c.GetQuery("limit"); ok {
		var e error
		limit, e = strconv.Atoi(value)
		if e != nil {
			backupError(c, control.ErrInvalid)
			return
		}
	}
	v, e := s.CatalogPage(c.Request.Context(), c.Param("id"), c.Query("cursor"), limit)
	if e != nil {
		backupError(c, e)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": v})
}
func (h SystemBackupHandler) CatalogRecord(c *gin.Context) {
	if !h.available(c) {
		return
	}
	s, ok := h.Store.(BackupCatalogStore)
	if !ok {
		backupError(c, control.ErrNotReady)
		return
	}
	v, e := s.CatalogDetail(c.Request.Context(), c.Param("id"), c.Param("record"), c.Query("type"))
	if e != nil {
		backupError(c, e)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": v})
}
func (h SystemBackupHandler) Report(c *gin.Context) {
	if !h.available(c) {
		return
	}
	s, ok := h.Store.(BackupCatalogStore)
	if !ok {
		backupError(c, control.ErrNotReady)
		return
	}
	v, e := s.Report(c.Request.Context(), c.Param("id"))
	if e != nil {
		backupError(c, e)
		return
	}
	if c.Query("download") == "1" {
		c.Header("Content-Disposition", `attachment; filename="backup-report.json"`)
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.JSON(200, gin.H{"success": true, "data": v})
}

func backupError(c *gin.Context, e error) {
	code, status := "not_ready", http.StatusServiceUnavailable
	switch {
	case errors.Is(e, control.ErrInvalid):
		code, status = "invalid_request", 400
	case errors.Is(e, control.ErrConflict):
		code, status = "state_conflict", 409
	case errors.Is(e, control.ErrNotFound):
		code, status = "not_found", 404
	}
	c.JSON(status, gin.H{"success": false, "error": code})
}
func (h SystemBackupHandler) available(c *gin.Context) bool {
	c.Header("Cache-Control", "no-store")
	if h.Store == nil {
		backupError(c, control.ErrNotReady)
		return false
	}
	return true
}
func (h SystemBackupHandler) Profiles(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if h.Store == nil {
		c.JSON(200, gin.H{"success": true, "data": gin.H{"profiles": []control.Profile{}, "ready": false, "reasons": []string{"control_database_not_configured"}, "contract": control.Version, "production_restore": false}})
		return
	}
	p, e := h.Store.Profiles(c.Request.Context())
	if e != nil {
		backupError(c, e)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"profiles": p, "contract": control.Version, "production_restore": false}})
}
func (h SystemBackupHandler) List(c *gin.Context) {
	if !h.available(c) {
		return
	}
	items, e := h.Store.List(c.Request.Context(), 100)
	if e != nil {
		backupError(c, e)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"items": items}})
}
func (h SystemBackupHandler) Get(c *gin.Context) {
	if !h.available(c) {
		return
	}
	t, e := h.Store.Get(c.Request.Context(), c.Param("id"))
	if e != nil {
		backupError(c, e)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": t})
}
func (h SystemBackupHandler) Create(c *gin.Context) {
	if !h.available(c) {
		return
	}
	var r control.Request
	decoder := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 4096))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&r) != nil || r.Validate() != nil {
		backupError(c, control.ErrInvalid)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		backupError(c, control.ErrInvalid)
		return
	}
	actor := c.GetInt("userID")
	if actor <= 0 {
		c.AbortWithStatus(401)
		return
	}
	t, e := h.Store.Create(c.Request.Context(), actor, c.GetHeader("Idempotency-Key"), r, 2*time.Hour)
	if e != nil {
		backupError(c, e)
		return
	}
	c.Header("Location", "/api/v1/admin/system-backup/tasks/"+t.ID)
	c.JSON(202, gin.H{"success": true, "data": t})
}
func (h SystemBackupHandler) Cancel(c *gin.Context) {
	if !h.available(c) {
		return
	}
	version, e := strconv.ParseInt(c.GetHeader("If-Match"), 10, 64)
	if e != nil || version <= 0 {
		backupError(c, control.ErrInvalid)
		return
	}
	t, e := h.Store.Cancel(c.Request.Context(), c.Param("id"), version)
	if e != nil {
		backupError(c, e)
		return
	}
	c.JSON(202, gin.H{"success": true, "data": t})
}
