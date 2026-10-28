package middleware

import (
	"clawreef/internal/systembackup/mutation"
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
)

type BackupMutationGate interface {
	Enter(context.Context, string) (func() error, error)
}

// All business requests are conservatively counted, including GET handlers
// that establish streams or update last-seen state. Already-open asynchronous
// work needs its own service permit; this middleware does not certify coverage.
func SystemBackupGate(gate BackupMutationGate) gin.HandlerFunc {
	return func(c *gin.Context) {
		if gate == nil || backupControlRoute(c.Request.Method, c.FullPath()) {
			c.Next()
			return
		}
		ctx := c.Request.Context()
		var release func() error
		var e error
		if contextual, ok := gate.(mutation.ContextGate); ok {
			ctx, release, e = contextual.EnterContext(ctx, "api-request")
		} else {
			release, e = gate.Enter(ctx, "api-request")
		}
		if e != nil {
			c.Header("Retry-After", "5")
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"success": false, "error": "backup_maintenance"})
			return
		}
		defer release()
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

// Exact registered method+route, not an admin prefix. This only bypasses the
// BUSINESS write gate; existing JWT/session/RBAC/action/MFA/final guards still
// run. A route added to the contract must receive an explicit policy decision.
func backupControlRoute(method, route string) bool {
	if method == http.MethodGet {
		switch route {
		case "/health", "/healthz", "/readyz",
			"/api/v1/admin/system-backup-overview", "/api/v1/admin/system-backup-config", "/api/v1/admin/system-backup-config/versions", "/api/v1/admin/system-backup-config/versions/:version",
			"/api/v1/admin/system-backups", "/api/v1/admin/system-backups/:id", "/api/v1/admin/system-backups/:id/events", "/api/v1/admin/system-backups/:id/logs", "/api/v1/admin/system-backups/:id/manifest", "/api/v1/admin/system-backups/:id/staging-resources",
			"/api/v1/admin/system-backup-preflights", "/api/v1/admin/system-backup-preflights/:id", "/api/v1/admin/system-backup-preflights/:id/events", "/api/v1/admin/system-backup-preflights/:id/logs", "/api/v1/admin/system-backup-preflights/:id/restore-diff",
			"/api/v1/admin/system-restore-drills", "/api/v1/admin/system-restore-drills/:id", "/api/v1/admin/system-restore-drills/:id/events", "/api/v1/admin/system-restore-drills/:id/logs", "/api/v1/admin/system-restore-drills/:id/resources",
			"/api/v1/admin/system-backup-artifact-verifications", "/api/v1/admin/system-backup-artifact-verifications/:id", "/api/v1/admin/system-backup-artifact-verifications/:id/events", "/api/v1/admin/system-backup-artifact-verifications/:id/logs",
			"/api/v1/admin/system-backup-evidence/:id", "/api/v1/admin/system-backup-operations", "/api/v1/admin/system-backup-operations/:id",
			"/api/v1/admin/system-backup-catalog-scans", "/api/v1/admin/system-backup-catalog-scans/:id", "/api/v1/admin/system-backup-catalog-records", "/api/v1/admin/system-backup-catalog-records/:id", "/api/v1/admin/system-backup-catalog-imports", "/api/v1/admin/system-backup-catalog-imports/:id",
			"/api/v1/admin/system-backup-prune-runs", "/api/v1/admin/system-backup-prune-runs/:id", "/api/v1/admin/system-backup-prune-runs/:id/items", "/api/v1/admin/system-backup-prune-runs/:id/events", "/api/v1/admin/system-backup-promotions":
			return true
		}
	}
	if method == http.MethodPost {
		switch route {
		case "/api/v1/auth/logout",
			"/api/v1/admin/system-backups/:id/cancel", "/api/v1/admin/system-backup-preflights/:id/cancel", "/api/v1/admin/system-restore-drills/:id/cancel", "/api/v1/admin/system-backup-artifact-verifications/:id/cancel",
			"/api/v1/admin/system-backups/:id/resolve-finalization", "/api/v1/admin/system-backups/:id/cleanup-staging", "/api/v1/admin/system-backups/:id/staging-resources/:resource_id/resolve-ownership",
			"/api/v1/admin/system-restore-drills/:id/cleanup", "/api/v1/admin/system-restore-drills/:id/resources/:resource_id/resolve-ownership":
			return true
		}
	}
	return false
}
