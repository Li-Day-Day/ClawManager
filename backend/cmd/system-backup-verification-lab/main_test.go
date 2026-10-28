package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	a "clawreef/internal/systembackupbusinessa"
)

func testLab(t *testing.T) *lab {
	t.Helper()
	// The successful synthetic lab uses an explicit historical capability
	// snapshot, not fabricated approvals for newly registered unsupported tables.
	raw, err := os.ReadFile("../../internal/systembackupbusinessa/testdata/schema-registry-historical-15.json")
	if err != nil {
		t.Fatal(err)
	}
	l, err := newLab(raw)
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func TestLabRejectsExpandedCanonicalWithoutNewACapability(t *testing.T) {
	raw, err := os.ReadFile("../../../contracts/system-backup/v12/schema-registry.json")
	if err != nil {
		t.Fatal(err)
	}
	if l, err := newLab(raw); err == nil || l != nil {
		t.Fatal("synthetic lab approvals admitted unsupported current A tables")
	}
}
func call(l *lab, method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "http://127.0.0.1:19031/verification-lab"+path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:3333"
	r.Header.Set("Origin", "http://127.0.0.1:19032")
	r.Header.Set("X-Verification-Lab", "1")
	w := httptest.NewRecorder()
	l.ServeHTTP(w, r)
	return w
}
func waitRun(t *testing.T, l *lab) object {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		w := call(l, "GET", "/tasks", "")
		var result struct {
			Items []object `json:"items"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &result)
		if len(result.Items) > 0 && result.Items[0]["status"] != "running" {
			return result.Items[0]
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("verification did not settle")
	return nil
}
func TestRealAVerifierWorkflowAndReport(t *testing.T) {
	for _, scenario := range []string{"match", "mismatch", "missing-proof"} {
		t.Run(scenario, func(t *testing.T) {
			l := testLab(t)
			if w := call(l, "POST", "/execute", `{"id":"missing"}`); w.Code != 409 {
				t.Fatal(w.Code)
			}
			w := call(l, "POST", "/prepare", `{"scenario":"`+scenario+`"}`)
			if w.Code != 200 {
				t.Fatal(w.Body.String())
			}
			var input prepared
			_ = json.Unmarshal(w.Body.Bytes(), &input)
			body := `{"id":"` + input.ID + `"}`
			if w = call(l, "POST", "/execute", body); w.Code != 202 {
				t.Fatal(w.Body.String())
			}
			if w = call(l, "POST", "/execute", body); w.Code != 409 {
				t.Fatalf("input reused: %d", w.Code)
			}
			task := waitRun(t, l)
			want := "succeeded"
			if scenario != "match" {
				want = "failed"
			}
			if task["status"] != want {
				t.Fatal(task)
			}
			w = call(l, "GET", "/tasks/"+task["public_id"].(string), "")
			var detail object
			_ = json.Unmarshal(w.Body.Bytes(), &detail)
			if detail["usable_after"] != false || detail["decision_reason"] != "verification_inconclusive" {
				t.Fatal("snapshot test claimed artifact health")
			}
			summary := detail["verifier_summary"].(map[string]any)
			if scenario == "match" && summary["passed"] != float64(20) {
				t.Fatal(summary)
			}
			if scenario == "mismatch" && summary["failed"] != float64(1) {
				t.Fatal(summary)
			}
			if scenario == "missing-proof" && (task["failure_category"] != "evidence_incomplete" || summary["passed"] != float64(0)) {
				t.Fatal(task, summary)
			}
			ref := summary["report_evidence"].(map[string]any)
			w = call(l, "GET", "/reports/"+ref["public_id"].(string), "")
			if w.Code != 200 || digest(w.Body.Bytes()) != ref["sha256"] || w.Header().Get("ETag") != `"`+ref["sha256"].(string)+`"` || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("report integrity")
			}
			if w = call(l, "POST", "/reset", `{}`); w.Code != 200 {
				t.Fatal(w.Code)
			}
			if w = call(l, "GET", "/reports/"+ref["public_id"].(string), ""); w.Code != 404 {
				t.Fatal("reset retained report")
			}
			if w = call(l, "POST", "/execute", body); w.Code != 409 {
				t.Fatal("reset retained prepared input")
			}
		})
	}
}
func TestResetRejectsLateResultAndReleasesRun(t *testing.T) {
	l := testLab(t)
	entered, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	l.verify = func(ctx context.Context, s *a.CaptureScope, source, dump a.CaptureEvidence, p a.CaptureProofVerifier) (a.CategoryChecks, error) {
		close(entered)
		<-release
		defer close(finished)
		return a.VerifyBackupSnapshot(ctx, s, source, dump, p)
	}
	w := call(l, "POST", "/prepare", `{"scenario":"match"}`)
	var input prepared
	_ = json.Unmarshal(w.Body.Bytes(), &input)
	call(l, "POST", "/execute", `{"id":"`+input.ID+`"}`)
	<-entered
	if w = call(l, "POST", "/prepare", `{"scenario":"match"}`); w.Code != 409 {
		t.Fatal("active input replaced")
	}
	call(l, "POST", "/reset", `{}`)
	close(release)
	<-finished
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.runs) != 0 || l.cancel != nil || l.prepared != nil {
		t.Fatal("late completion resurrected reset state")
	}
}
func TestLocalBoundaryAndInvalidRequests(t *testing.T) {
	l := testLab(t)
	for _, modify := range []func(*httptest.ResponseRecorder){
		func(w *httptest.ResponseRecorder) {
			r := httptest.NewRequest("POST", "http://evil.example/verification-lab/reset", nil)
			r.RemoteAddr = "127.0.0.1:1234"
			l.ServeHTTP(w, r)
		},
		func(w *httptest.ResponseRecorder) {
			r := httptest.NewRequest("POST", "http://127.0.0.1:19031/verification-lab/reset", nil)
			r.RemoteAddr = "127.0.0.1:1234"
			r.Header.Set("Origin", "https://evil.example")
			l.ServeHTTP(w, r)
		},
		func(w *httptest.ResponseRecorder) {
			r := httptest.NewRequest("POST", "http://127.0.0.1:19031/verification-lab/reset", nil)
			r.RemoteAddr = "127.0.0.1:1234"
			l.ServeHTTP(w, r)
		},
	} {
		w := httptest.NewRecorder()
		modify(w)
		if w.Code != 403 {
			t.Fatal(w.Code)
		}
	}
	for _, body := range []string{`{"scenario":"unknown"}`, `{"scenario":"match","extra":true}`, strings.Repeat("x", 2048)} {
		if w := call(l, "POST", "/prepare", body); w.Code != 400 {
			t.Fatal(w.Code)
		}
	}
	if w := call(l, "GET", "/state?secret=1", ""); w.Code != 400 {
		t.Fatal(w.Code)
	}
	if w := call(l, "GET", "/../production", ""); w.Code != 404 {
		t.Fatal(w.Code)
	}
}
