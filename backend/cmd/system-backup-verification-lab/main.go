// Command system-backup-verification-lab runs A's real snapshot verifier on
// isolated synthetic inputs. It has no database, provider or production routes.
package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	a "clawreef/internal/systembackupbusinessa"
)

const installation = "installation_local_verification_lab"

type object = map[string]any
type prepared struct {
	ID       string            `json:"id"`
	Scenario string            `json:"scenario"`
	Source   a.CaptureEvidence `json:"-"`
	Dump     a.CaptureEvidence `json:"-"`
}
type run struct {
	Detail object
	Checks []a.Check
	Report []byte
}
type lab struct {
	mu       sync.Mutex
	scope    *a.CaptureScope
	prepared *prepared
	runs     []*run
	epoch    int
	cancel   context.CancelFunc
	verify   func(context.Context, *a.CaptureScope, a.CaptureEvidence, a.CaptureEvidence, a.CaptureProofVerifier) (a.CategoryChecks, error)
}

func digest(raw []byte) string { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }
func id(prefix string) string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic(err)
	}
	raw[6] = raw[6]&15 | 64
	raw[8] = raw[8]&63 | 128
	return fmt.Sprintf("%s_%x-%x-%x-%x-%x", prefix, raw[:4], raw[4:6], raw[6:8], raw[8:10], raw[10:])
}

// Lab-only gate fixture. These synthetic approvals never leave this process
// and cannot activate any installation. The canonical registry is never edited.
func newLab(registry []byte) (*lab, error) {
	var doc object
	if err := json.Unmarshal(registry, &doc); err != nil {
		return nil, err
	}
	objects, ok := doc["objects"].([]any)
	if !ok {
		return nil, errors.New("registry objects missing")
	}
	doc["contract_status"] = "frozen"
	doc["schema_hash"] = object{"algorithm": "sha256-information-schema-canonical-v1", "status": "observed", "hash": digest([]byte("synthetic-lab-schema")), "evidence": object{"public_id": "sev_lab_schema", "sha256": digest([]byte("synthetic-lab-schema-evidence"))}}
	doc["summary"] = object{"object_count": len(objects), "policy_recorded": len(objects), "policy_pending": 0, "cross_review_pending": 0}
	for _, item := range objects {
		entry, ok := item.(map[string]any)
		if !ok {
			return nil, errors.New("invalid registry object")
		}
		entry["decision_status"] = "frozen"
		entry["approved_cross_reviewers"] = entry["required_cross_reviewers"]
	}
	raw, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}
	scope, err := a.NewPinnedCaptureScope(raw, digest(raw))
	if err != nil {
		return nil, err
	}
	return &lab{scope: scope, verify: a.VerifyBackupSnapshot}, nil
}

// This checks the exact in-memory fixture, not a B capture certificate.
// Reports explicitly exclude provider/certificate/restore acceptance.
type fixtureProof struct{ source, dump a.CaptureEvidence }

func (p fixtureProof) VerifyCapture(ctx context.Context, source, dump a.CaptureEvidence) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	left, _ := json.Marshal([]a.CaptureEvidence{source, dump})
	right, _ := json.Marshal([]a.CaptureEvidence{p.source, p.dump})
	if string(left) != string(right) {
		return errors.New("lab input binding mismatch")
	}
	return nil
}

func (l *lab) prepare(scenario string) *prepared {
	source := a.CaptureEvidence{RegistrySHA256: l.scope.RegistrySHA256(), SchemaSHA256: l.scope.SchemaSHA256(),
		CheckpointHash: digest([]byte("lab-checkpoint")), CaptureContextHash: digest([]byte("lab-capture-context")),
		EvidenceRef: id("sev"), Snapshot: a.SourceSnapshot{CostAggregateSHA256: digest([]byte("lab-empty-cost-aggregate"))}}
	for _, table := range l.scope.Tables() {
		source.Snapshot.Tables = append(source.Snapshot.Tables, a.TableCount{Table: table, Rows: 2})
	}
	dump := source
	dump.EvidenceRef = id("sev")
	dump.Snapshot.Tables = append([]a.TableCount(nil), source.Snapshot.Tables...)
	if scenario == "mismatch" {
		dump.Snapshot.Tables[0].Rows++
	}
	return &prepared{ID: id("input"), Scenario: scenario, Source: source, Dump: dump}
}

func taskOf(r *run) object { return r.Detail["task"].(map[string]any) }
func (l *lab) start(input *prepared) *run {
	now := time.Now().UTC()
	stamp := now.Format(time.RFC3339Nano)
	task := object{"schema_version": "system-backup-task.v1", "public_id": id("sav"), "origin_installation_id": installation,
		"task_type": "artifact_verify", "actor_type": "admin", "actor_id": "local-lab", "endpoint": "localVerificationLab",
		"idempotency_key": input.ID, "request_hash": digest([]byte(input.ID)), "request_id": input.ID, "retry_of_public_id": nil,
		"status": "running", "pending_reason": "none", "attention_reason": "none", "can_cancel": false, "config_version": 1,
		"retryable": false, "failure_category": "none", "failure_message": nil, "heartbeat_at": stamp, "row_version": 1,
		"next_reconcile_at": nil, "deadline_at": now.Add(time.Minute).Format(time.RFC3339Nano), "started_at": stamp,
		"finished_at": nil, "created_at": stamp, "updated_at": stamp}
	r := &run{Checks: []a.Check{}, Detail: object{"schema_version": "system-backup-artifact-verification-detail.v1", "task": task,
		"execution":          object{"current_attempt_number": 1, "current_phase": "verify", "job_generation": nil, "last_business_progress_at": stamp},
		"verification_scope": "full", "source": object{"source_artifact_type": "backup", "source_public_id": id("sbk")},
		"observed_checksums":     object{"manifest": nil, "index": nil, "marker": nil, "acceptance": nil, "catalog": nil},
		"health_report_evidence": nil, "artifact_state_before": "committed", "artifact_state_after": "committed",
		"usable_before": false, "usable_after": false, "unusable_reason_before": "verification_pending", "unusable_reason_after": "verification_pending",
		"decision_reason": "verification_inconclusive", "verifier_summary": object{"aggregate_status": "skipped", "passed": 0, "warning": 0, "failed": 0, "skipped": 0, "report_evidence": nil}}}
	l.runs = append([]*run{r}, l.runs...)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	l.cancel = cancel
	epoch := l.epoch
	go func() {
		defer cancel()
		var proof a.CaptureProofVerifier = fixtureProof{input.Source, input.Dump}
		if input.Scenario == "missing-proof" {
			proof = nil
		}
		checks, err := l.verify(ctx, l.scope, input.Source, input.Dump, proof)
		l.mu.Lock()
		defer l.mu.Unlock()
		if epoch != l.epoch {
			return
		}
		l.cancel = nil
		r.Checks = append(append([]a.Check{}, checks.Users...), checks.AIGateway...)
		passed, failed := 0, 0
		for _, check := range r.Checks {
			if check.Status == "passed" {
				passed++
			}
			if check.Status == "failed" {
				failed++
			}
		}
		status, aggregate, category := "succeeded", "passed", "none"
		if err != nil || failed > 0 {
			status, aggregate, category = "failed", "failed", "validation_failed"
			if known, ok := a.KnownVerificationFailureCategory(err); ok {
				category = known
			}
		}
		finished := time.Now().UTC().Format(time.RFC3339Nano)
		task["status"], task["failure_category"], task["finished_at"], task["updated_at"], task["row_version"] = status, category, finished, finished, 2
		r.Detail["execution"].(map[string]any)["last_business_progress_at"] = finished
		// Counts describe snapshot integrity only, never artifact usability.
		report := object{"schema_version": "local-a-verification-report.v1", "task_public_id": task["public_id"], "scenario": input.Scenario,
			"data_source": "synthetic-input-real-A-verifier", "verifier": "systembackupbusinessa.VerifyBackupSnapshot", "status": status,
			"failure_category": category, "checks": r.Checks, "registry_sha256": l.scope.RegistrySHA256(), "finished_at": finished,
			"limitations": []string{"synthetic registry approvals and capture proof", "no database or provider accessed", "not restore, artifact usability or production acceptance"}}
		r.Report, _ = json.MarshalIndent(report, "", "  ")
		r.Detail["verifier_summary"] = object{"aggregate_status": aggregate, "passed": passed, "failed": failed, "warning": 0, "skipped": 0,
			"report_evidence": object{"public_id": id("sev"), "sha256": digest(r.Report)}}
	}()
	return r
}

func reply(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func reject(w http.ResponseWriter, status int, code string) { reply(w, status, object{"code": code}) }

func (l *lab) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Protect the unauthenticated local lab from non-loopback clients, DNS
	// rebinding and cross-site mutations. Vite proxies only this isolated path.
	host, _, err := net.SplitHostPort(r.Host)
	peer, _, peerErr := net.SplitHostPort(r.RemoteAddr)
	if err != nil || peerErr != nil || host != "127.0.0.1" || !net.ParseIP(peer).IsLoopback() {
		reject(w, 403, "loopback_required")
		return
	}
	origin := r.Header.Get("Origin")
	if origin != "" && origin != "http://127.0.0.1:19032" && origin != "http://"+r.Host {
		reject(w, 403, "origin_rejected")
		return
	}
	if r.Method != "GET" && (origin == "" || r.Header.Get("X-Verification-Lab") != "1") {
		reject(w, 403, "lab_request_required")
		return
	}
	if r.URL.RawQuery != "" {
		reject(w, 400, "unexpected_query")
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	path := strings.TrimPrefix(r.URL.Path, "/verification-lab")
	switch {
	case r.Method == "GET" && path == "/state":
		reply(w, 200, object{"prepared": l.prepared, "running": l.cancel != nil, "run_count": len(l.runs)})
	case r.Method == "POST" && path == "/prepare":
		if l.cancel != nil {
			reject(w, 409, "run_active")
			return
		}
		var input struct {
			Scenario string `json:"scenario"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&input) != nil || (input.Scenario != "match" && input.Scenario != "mismatch" && input.Scenario != "missing-proof") {
			reject(w, 400, "invalid_scenario")
			return
		}
		l.prepared = l.prepare(input.Scenario)
		reply(w, 200, l.prepared)
	case r.Method == "POST" && path == "/execute":
		var input struct {
			ID string `json:"id"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&input) != nil {
			reject(w, 400, "invalid_input")
			return
		}
		if l.cancel != nil || l.prepared == nil || input.ID != l.prepared.ID || len(l.runs) >= 20 {
			reject(w, 409, "prepare_required_or_run_active")
			return
		}
		item := l.start(l.prepared)
		l.prepared = nil
		reply(w, 202, item.Detail)
	case r.Method == "POST" && path == "/reset":
		l.epoch++
		if l.cancel != nil {
			l.cancel()
			l.cancel = nil
		}
		l.prepared = nil
		l.runs = nil
		reply(w, 200, object{"reset": true})
	case r.Method == "GET" && path == "/tasks":
		items := []object{}
		for _, item := range l.runs {
			items = append(items, taskOf(item))
		}
		reply(w, 200, object{"items": items, "next_cursor": nil, "consistency": "stable_cutoff"})
	case r.Method == "GET" && strings.HasPrefix(path, "/tasks/"):
		for _, item := range l.runs {
			if path == "/tasks/"+taskOf(item)["public_id"].(string) {
				reply(w, 200, item.Detail)
				return
			}
			if path == "/tasks/"+taskOf(item)["public_id"].(string)+"/checks" {
				reply(w, 200, item.Checks)
				return
			}
		}
		reject(w, 404, "not_found")
	case r.Method == "GET" && strings.HasPrefix(path, "/reports/"):
		for _, item := range l.runs {
			ref, _ := item.Detail["verifier_summary"].(map[string]any)["report_evidence"].(map[string]any)
			if ref != nil && path == "/reports/"+ref["public_id"].(string) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Content-Disposition", "attachment; filename="+ref["public_id"].(string)+".json")
				w.Header().Set("ETag", `"`+digest(item.Report)+`"`)
				w.Header().Set("Content-Length", fmt.Sprint(len(item.Report)))
				_, _ = w.Write(item.Report)
				return
			}
		}
		reject(w, 404, "not_found")
	default:
		reject(w, 404, "not_found")
	}
}

func main() {
	registry := flag.String("registry", "../contracts/system-backup/v12/schema-registry.json", "canonical registry (read only; synthetic lab approvals applied in memory)")
	flag.Parse()
	raw, err := os.ReadFile(*registry)
	if err != nil {
		log.Fatal(err)
	}
	l, err := newLab(raw)
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{Addr: "127.0.0.1:19031", Handler: l, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second}
	log.Print("Local A verification lab: http://127.0.0.1:19031 (synthetic data; no production acceptance)")
	log.Fatal(server.ListenAndServe())
}
