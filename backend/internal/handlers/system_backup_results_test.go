package handlers

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"clawreef/internal/systembackup/control"
	"github.com/gin-gonic/gin"
)

type backupResultsFixture struct {
	backupTaskFixture
	calls int
}

func (s *backupResultsFixture) CatalogPage(_ context.Context, id, cursor string, limit int) (control.CatalogView, error) {
	s.calls++
	if limit < 1 || limit > 100 {
		return control.CatalogView{}, control.ErrInvalid
	}
	return control.CatalogView{ScanID: id, Complete: true, Items: []control.CatalogItem{}}, nil
}
func (s *backupResultsFixture) CatalogDetail(context.Context, string, string, string) (control.CatalogItem, error) {
	return control.CatalogItem{}, control.ErrNotFound
}
func (s *backupResultsFixture) Report(_ context.Context, id string) (control.TaskReport, error) {
	return control.TaskReport{Version: "backup-report.v1", TaskID: id, Kind: "catalog_import", Status: "succeeded", Verified: true}, nil
}
func TestBackupResultsRoutesAreReadOnlyAndNoStore(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := &backupResultsFixture{}
	h := SystemBackupHandler{Store: store}
	r := gin.New()
	r.GET("/tasks/:id/catalog", h.Catalog)
	r.GET("/tasks/:id/catalog/:record", h.CatalogRecord)
	r.GET("/tasks/:id/report", h.Report)
	for _, v := range []struct {
		url  string
		code int
	}{{"/tasks/sb-1/catalog?limit=50", 200}, {"/tasks/sb-1/catalog?limit=bad", 400}, {"/tasks/sb-1/catalog?limit=101", 400}, {"/tasks/sb-1/catalog/missing?type=artifact_registered", 404}, {"/tasks/sb-1/report?download=1", 200}} {
		out := httptest.NewRecorder()
		r.ServeHTTP(out, httptest.NewRequest("GET", v.url, nil))
		if out.Code != v.code || out.Header().Get("Cache-Control") != "no-store" {
			t.Fatal(v, out.Code, out.Body.String())
		}
		if strings.Contains(v.url, "download") && (!strings.Contains(out.Header().Get("Content-Disposition"), "attachment") || !strings.Contains(out.Body.String(), `"restore_authorized":false`)) {
			t.Fatal(out.Body.String())
		}
	}
	if store.created != 0 || store.canceled != 0 {
		t.Fatal("read endpoint mutated task")
	}
}
