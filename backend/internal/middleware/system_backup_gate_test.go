package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

type gateFixture struct {
	closed            bool
	entered, released int
}

func (g *gateFixture) Enter(context.Context, string) (func() error, error) {
	g.entered++
	if g.closed {
		return nil, errors.New("private SQL detail")
	}
	return func() error { g.released++; return nil }, nil
}
func TestBackupGateBlocksBusinessGETAndAllowsCancel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, path := range []string{"/api/v1/instances", "/api/v1/admin/system-backupevil/tasks", "/api/v1/admin/system-backup/tasks/t/cancel", "/health"} {
		gate := &gateFixture{closed: true}
		r := gin.New()
		r.Use(SystemBackupGate(gate))
		r.Any(path, func(c *gin.Context) { c.Status(204) })
		out := httptest.NewRecorder()
		r.ServeHTTP(out, httptest.NewRequest(http.MethodGet, path, nil))
		bypass := path == "/health" || path == "/api/v1/admin/system-backup/tasks/t/cancel"
		if bypass && out.Code != 204 || !bypass && out.Code != 503 {
			t.Fatal(path, out.Code)
		}
		if !bypass && out.Header().Get("Retry-After") != "5" {
			t.Fatal("missing retry hint")
		}
	}
}
func TestBackupGateTracksWholeHandlerAndReleases(t *testing.T) {
	gate := &gateFixture{}
	r := gin.New()
	r.Use(SystemBackupGate(gate))
	r.GET("/workspace", func(c *gin.Context) {
		if gate.entered != 1 || gate.released != 0 {
			t.Fatal("permit released too early")
		}
		c.Status(204)
	})
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/workspace", nil))
	if gate.released != 1 {
		t.Fatal("permit leaked")
	}
}
