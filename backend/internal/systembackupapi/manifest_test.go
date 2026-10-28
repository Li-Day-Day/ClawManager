package systembackupapi

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	read "clawreef/internal/systembackupread"
)

type manifestModel struct {
	taskModel
	data []byte
	err  error
}

func (m *manifestModel) ReadManifest(*http.Request, string) ([]byte, error) { return m.data, m.err }

func TestTaskManifestPreservesOriginalBytesAndChecksum(t *testing.T) {
	data := []byte("{\n  \"schema_version\":\"test-only-manifest\"\n}\n")
	h := NewHandler(&manifestModel{data: data})
	w := httptest.NewRecorder()
	h.Manifest(w, httptest.NewRequest("GET", "/", nil), "sbk_00000000-0000-4000-8000-000000000001", "request_test")
	digest := sha256.Sum256(data)
	if w.Code != 200 || w.Body.String() != string(data) || w.Header().Get("X-System-Backup-Manifest-SHA256") != hex.EncodeToString(digest[:]) || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("manifest bytes/hash changed")
	}
	for _, model := range []*manifestModel{{data: []byte("invalid")}, {err: &Error{"permission_denied"}}, {err: errors.New("PRIVATE provider detail")}} {
		w = httptest.NewRecorder()
		NewHandler(model).Manifest(w, httptest.NewRequest("GET", "/", nil), "sbk_00000000-0000-4000-8000-000000000001", "request_test")
		if w.Code == 200 || strings.Contains(w.Body.String(), "PRIVATE") {
			t.Fatal("invalid/private manifest escaped")
		}
	}
}

func TestExpiredTaskSummaryRequiresFinalAuthorityAndNeverCommits(t *testing.T) {
	for _, deny := range []bool{false, true} {
		state := &submissionDB{}
		db := sql.OpenDB(submissionConnector{state})
		app := &SQLApplication{db: db}
		plan := submissionPlan(func(TaskWriteSQL, TaskSubmissionIdentity) (read.TaskHeader, error) {
			return read.TaskHeader{}, &ExpiredTaskError{"spf_00000000-0000-4000-8000-000000000001", "succeeded", "none"}
		})
		_, err := app.submit(context.Background(), submissionScope{state: state, deny: deny}, plan, read.PreflightTask, "createSystemBackupPreflight", "model-key-123456789")
		var result *Error
		if !errors.As(err, &result) || result.Code != map[bool]string{false: "idempotency_expired", true: "permission_denied"}[deny] || state.commits != 0 || state.writes != 0 || state.rollbacks != 1 {
			t.Fatal("retired result escaped authority or committed")
		}
		db.Close()
	}
}
