package handlers

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"clawreef/internal/systembackup/control"
	"github.com/gin-gonic/gin"
)

type backupTaskFixture struct {
	created, canceled int
	version           int64
}

func (s *backupTaskFixture) Create(_ context.Context, actor int, key string, r control.Request, _ time.Duration) (control.Task, error) {
	if actor != 7 || key != "retry-key" {
		return control.Task{}, control.ErrInvalid
	}
	s.created++
	return control.Task{ID: "sb-1", Request: r, Status: "pending", RowVersion: 1, CanCancel: true}, nil
}
func (s *backupTaskFixture) List(context.Context, int) ([]control.Task, error) {
	return []control.Task{}, nil
}
func (s *backupTaskFixture) Get(context.Context, string) (control.Task, error) {
	return control.Task{}, control.ErrNotFound
}
func (s *backupTaskFixture) Cancel(_ context.Context, _ string, v int64) (control.Task, error) {
	if v != s.version {
		return control.Task{}, control.ErrConflict
	}
	s.canceled++
	return control.Task{ID: "sb-1", Status: "canceling", RowVersion: v + 1}, nil
}
func (s *backupTaskFixture) Profiles(context.Context) ([]control.Profile, error) {
	return []control.Profile{}, nil
}
func TestBackupAPIRejectsProductionUnknownFieldsAndTrailingJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	good := `{"kind":"backup","profile":"fixture","purpose":"functional_test"}`
	for _, body := range []string{good, `{"kind":"restore","profile":"fixture","purpose":"functional_test"}`, strings.Replace(good, "functional_test", "acceptance", 1), strings.Replace(good, "}", `,"password":"private"}`, 1), good + good} {
		s := &backupTaskFixture{}
		h := SystemBackupHandler{Store: s}
		r := gin.New()
		r.Use(func(c *gin.Context) { c.Set("userID", 7) })
		r.POST("/tasks", h.Create)
		req := httptest.NewRequest("POST", "/tasks", strings.NewReader(body))
		req.Header.Set("Idempotency-Key", "retry-key")
		out := httptest.NewRecorder()
		r.ServeHTTP(out, req)
		if body == good {
			if out.Code != 202 || s.created != 1 {
				t.Fatal(out.Code, out.Body.String())
			}
		} else if out.Code != 400 || s.created != 0 {
			t.Fatal("invalid task admitted", out.Code)
		}
		if strings.Contains(out.Body.String(), "private") {
			t.Fatal("error leaked input")
		}
	}
}
func TestBackupAPICancelRequiresCurrentVersion(t *testing.T) {
	for _, version := range []string{"", "1", "2"} {
		s := &backupTaskFixture{version: 2}
		h := SystemBackupHandler{Store: s}
		r := gin.New()
		r.POST("/tasks/:id/cancel", h.Cancel)
		req := httptest.NewRequest("POST", "/tasks/sb-1/cancel", nil)
		req.Header.Set("If-Match", version)
		out := httptest.NewRecorder()
		r.ServeHTTP(out, req)
		want := map[string]int{"": 400, "1": 409, "2": 202}[version]
		if out.Code != want {
			t.Fatal(version, out.Code)
		}
	}
}
func TestBackupAPINoConfigurationCannotStartWork(t *testing.T) {
	h := SystemBackupHandler{}
	r := gin.New()
	r.GET("/profiles", h.Profiles)
	r.POST("/tasks", h.Create)
	out := httptest.NewRecorder()
	r.ServeHTTP(out, httptest.NewRequest("GET", "/profiles", nil))
	if out.Code != 200 || !strings.Contains(out.Body.String(), "control_database_not_configured") {
		t.Fatal(out.Body.String())
	}
	out = httptest.NewRecorder()
	r.ServeHTTP(out, httptest.NewRequest("POST", "/tasks", strings.NewReader(`{}`)))
	if out.Code != 503 {
		t.Fatal("unconfigured execution admitted")
	}
}
