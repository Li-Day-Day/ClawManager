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
		bypass := path == "/health"
		if bypass && out.Code != 204 || !bypass && out.Code != 503 {
			t.Fatal(path, out.Code)
		}
		if !bypass && out.Header().Get("Retry-After") != "5" {
			t.Fatal("missing retry hint")
		}
	}
}

func TestBackupControlRoutesKeepAuthorizationAndRejectBroadExceptions(t *testing.T) {
	for _, tc := range []struct {
		method, route, path string
		allow               bool
	}{
		{"GET", "/api/v1/admin/system-backups/:id", "/api/v1/admin/system-backups/sbk-test", true},
		{"POST", "/api/v1/admin/system-backups/:id/cancel", "/api/v1/admin/system-backups/sbk-test/cancel", true},
		{"POST", "/api/v1/admin/system-backups/:id/cleanup-staging", "/api/v1/admin/system-backups/sbk-test/cleanup-staging", true},
		{"POST", "/api/v1/admin/system-backups", "/api/v1/admin/system-backups", false},
		{"GET", "/api/v1/admin/users", "/api/v1/admin/users", false},
		{"GET", "/api/v1/admin/system-backups/:id/unreviewed", "/api/v1/admin/system-backups/sbk-test/unreviewed", false},
		{"DELETE", "/api/v1/admin/system-backups/:id", "/api/v1/admin/system-backups/sbk-test", false},
	} {
		t.Run(tc.method+tc.route, func(t *testing.T) {
			gate := &gateFixture{closed: true}
			r := gin.New()
			r.Use(SystemBackupGate(gate))
			// Reaching the operation must still enforce its original authority.
			r.Handle(tc.method, tc.route, func(c *gin.Context) { c.AbortWithStatus(403) })
			out := httptest.NewRecorder()
			r.ServeHTTP(out, httptest.NewRequest(tc.method, tc.path, nil))
			want := 503
			if tc.allow {
				want = 403
			}
			if out.Code != want {
				t.Fatalf("got %d want %d", out.Code, want)
			}
		})
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
