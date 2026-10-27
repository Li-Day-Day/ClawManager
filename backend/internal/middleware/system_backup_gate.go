package middleware

import (
	"context"
	"net/http"
	"strings"

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
		p := c.Request.URL.Path
		if gate == nil || p == "/health" || p == "/healthz" || p == "/readyz" || p == "/api/v1/admin/system-backup" || strings.HasPrefix(p, "/api/v1/admin/system-backup/") {
			c.Next()
			return
		}
		release, e := gate.Enter(c.Request.Context(), "api-request")
		if e != nil {
			c.Header("Retry-After", "5")
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"success": false, "error": "backup_maintenance"})
			return
		}
		defer release()
		c.Next()
	}
}
