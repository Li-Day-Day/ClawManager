//go:build systembackup_mysql

package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	contract "clawreef/internal/systembackupcontract"
)

func drillHTTPHistoryCases() []string {
	return []string{"pending_no_attempt", "current_attempt_history", "catalog_import", "parallel_jobs", "parallel_phases", "single_job", "heartbeat_only",
		"summary_drift", "report_hash_drift", "report_wrong_owner", "report_before_attempt", "historical_preflight_before_retry", "shared_reference_strict_cutoff",
		"expired_evidence_history", "foreign_installation", "missing_task", "unknown_query", "missing_auth", "revoked_session"}
}

const drillHTTPInsertSQL = `INSERT INTO system_restore_drills
 (public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
 config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
 status,started_at,created_at,updated_at,heartbeat_at,source_artifact_type,source_public_id,
 target_profile,restore_target_config_ref,restore_target_config_hash,cleanup_policy,
 verifier_aggregate_status,verifier_warning,verifier_skipped,preflight_evidence_public_id,preflight_evidence_sha256,
 diff_evidence_public_id,diff_evidence_sha256,verifier_report_evidence_public_id,verifier_report_evidence_sha256,failure_message)
 VALUES(?,?,'admin',?,'POST /system-restore-drills',?,REPEAT('a',64),?,
 1,'{}',2,SHA2('{}',256),?,'restoring',?,?,?,?,'backup',?,
 'single-node','PRIVATE_DRILL_TARGET_REF',REPEAT('d',64),'delete-on-success','warning',1,1,?,?,?,?,?,?,?)`

func drillHTTPInsertArgs(id, installation, actor, source, preflight, diff, report, digest, private string, at time.Time) []any {
	return []any{id, installation, actor, "d-drill-http-" + id, "d-drill-http-" + id, at.Add(time.Hour),
		at, at, at.Add(50 * time.Second), at.Add(49 * time.Second), source, preflight, digest, diff, digest, report, digest, private}
}

func TestDDrillDetailHTTPSeed(t *testing.T) {
	cases := drillHTTPHistoryCases()
	seen := map[string]bool{}
	for _, name := range cases {
		if name == "" || seen[name] {
			t.Fatal("duplicate/empty drill history case")
		}
		seen[name] = true
	}
	args := drillHTTPInsertArgs("sdr_fixture", "installation_fixture", "1", "sbk_fixture", "sev_p", "sev_d", "sev_r", strings.Repeat("a", 64), "private", time.Now())
	if len(cases) != 19 || cases[len(cases)-1] != "revoked_session" || strings.Count(drillHTTPInsertSQL, "?") != len(args) {
		t.Fatal("drill history fixture scope or parameter binding differs")
	}
	t.Run("foreign_installation_fk_fixture", func(t *testing.T) {
		fixture := &drillHTTPForeignSeedDB{}
		db := sql.OpenDB(fixture)
		defer db.Close()
		request := func(path, bearer string) *httptest.ResponseRecorder {
			if fixture.origin != "installation_foreign" || fixture.checks != 3 || fixture.attempts != 2 || fixture.evidence != 3 || !strings.HasSuffix(path, fixture.id) || bearer != "fixture-token" {
				t.Fatal("foreign fixture did not reach HTTP with a complete foreign history")
			}
			fixture.requests++
			response := httptest.NewRecorder()
			response.Header().Set("Cache-Control", "no-store")
			response.WriteHeader(http.StatusNotFound)
			return response
		}
		testDDrillDetailHTTPHistoryCases(t, db, context.Background(), request, "fixture-token", "installation_own", "installation_foreign", "1", "sbk_fixture", []string{"foreign_installation"})
		if fixture.requests != 1 {
			t.Fatal("foreign fixture did not reach HTTP exactly once")
		}
	})
	t.Log("PASS drill-history-http-seed synthetic_cases=19 actual_mysql=not_run actual_provider=no production_approval=no")
}

// Minimal local storage model for the seed's regression. In particular, it
// rejects rekeying a drill after its checks reference the composite parent key.
// It does not stand in for the real MySQL/HTTP nineteen-case profile.
type drillHTTPForeignSeedDB struct {
	id, origin                           string
	checks, attempts, evidence, requests int
}

func (d *drillHTTPForeignSeedDB) Connect(context.Context) (driver.Conn, error) { return d, nil }
func (d *drillHTTPForeignSeedDB) Driver() driver.Driver                        { return d }
func (d *drillHTTPForeignSeedDB) Open(string) (driver.Conn, error)             { return d, nil }
func (d *drillHTTPForeignSeedDB) Close() error                                 { return nil }
func (d *drillHTTPForeignSeedDB) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("unexpected prepared fixture statement")
}
func (d *drillHTTPForeignSeedDB) Begin() (driver.Tx, error) {
	return nil, errors.New("unexpected fixture transaction")
}
func (d *drillHTTPForeignSeedDB) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	switch {
	case strings.HasPrefix(query, "INSERT INTO system_restore_drills"):
		d.id, d.origin = args[0].Value.(string), args[1].Value.(string)
	case strings.HasPrefix(query, "INSERT INTO system_backup_attempts"):
		d.attempts++
	case strings.HasPrefix(query, "INSERT INTO system_backup_evidence"):
		d.evidence++
	case strings.HasPrefix(query, "INSERT INTO system_backup_check_results"):
		if args[0].Value != d.origin || args[1].Value != d.id {
			return nil, errors.New("composite drill/check foreign key mismatch")
		}
		d.checks++
	case strings.HasPrefix(query, "UPDATE system_restore_drills SET origin_installation_id="):
		if d.checks > 0 {
			return nil, errors.New("referenced drill parent key cannot change")
		}
		d.origin = args[0].Value.(string)
	default:
		return nil, errors.New("unexpected foreign fixture SQL")
	}
	return driver.RowsAffected(1), nil
}
func (d *drillHTTPForeignSeedDB) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if query == "SELECT UTC_TIMESTAMP(6)" {
		return &drillHTTPForeignSeedRows{values: []driver.Value{time.Date(2026, 10, 26, 0, 0, 0, 0, time.UTC)}}, nil
	}
	if strings.HasPrefix(query, "SELECT d.origin_installation_id,") && len(args) == 1 && args[0].Value == d.id {
		return &drillHTTPForeignSeedRows{values: []driver.Value{d.origin, int64(d.checks)}}, nil
	}
	return nil, errors.New("unexpected foreign fixture query")
}

type drillHTTPForeignSeedRows struct{ values []driver.Value }

func (r *drillHTTPForeignSeedRows) Columns() []string { return make([]string, len(r.values)) }
func (r *drillHTTPForeignSeedRows) Close() error      { return nil }
func (r *drillHTTPForeignSeedRows) Next(values []driver.Value) error {
	if r.values == nil {
		return io.EOF
	}
	copy(values, r.values)
	r.values = nil
	return nil
}

// The parent has checked the exact isolated namespace UID/server, real
// migration fixture and A SQL login/read pins. These persisted synthetic facts
// exercise the real HTTP/SQL path, not B cleanup or current provider health.
func testDDrillDetailHTTPHistoryMySQL(t *testing.T, db *sql.DB, ctx context.Context,
	request func(string, string) *httptest.ResponseRecorder, token, installation, foreign, actor, source string) {
	t.Helper()
	testDDrillDetailHTTPHistoryCases(t, db, ctx, request, token, installation, foreign, actor, source, drillHTTPHistoryCases())
	if !t.Failed() {
		t.Log("PASS drill-history-http-mysql synthetic_cases=19 actual_provider=no production_approval=no")
	}
}

func testDDrillDetailHTTPHistoryCases(t *testing.T, db *sql.DB, ctx context.Context,
	request func(string, string) *httptest.ResponseRecorder, token, installation, foreign, actor, source string, cases []string) {
	t.Helper()
	const private = "PRIVATE_HTTP_DRILL_HISTORY_SENTINEL"
	payload := []byte(`{"synthetic_private_fixture":"` + private + `"}`)
	sum := sha256.Sum256(payload)
	digest := hex.EncodeToString(sum[:])
	var now time.Time
	if db.QueryRowContext(ctx, "SELECT UTC_TIMESTAMP(6)").Scan(&now) != nil {
		t.Fatal("drill SQL time unavailable")
	}
	at := now.Add(-time.Minute).UTC()
	for index, name := range cases {
		t.Run("drill_history_"+name, func(t *testing.T) {
			// Choose the owner before inserting either side of the composite
			// drill/check FK. Moving only the parent later is rejected by MySQL.
			origin := installation
			if name == "foreign_installation" {
				origin = foreign
			}
			id := fmt.Sprintf("sdr_00000000-0000-4000-8000-%012d", 700+index)
			refs := []string{fmt.Sprintf("sev_00000000-0000-4000-8000-%012d", 6000+3*index), fmt.Sprintf("sev_00000000-0000-4000-8000-%012d", 6001+3*index), fmt.Sprintf("sev_00000000-0000-4000-8000-%012d", 6002+3*index)}
			exec := func(query string, args ...any) {
				t.Helper()
				if _, err := db.ExecContext(ctx, query, args...); err != nil {
					t.Fatal("isolated drill fixture SQL failed (details redacted)")
				}
			}
			exec(drillHTTPInsertSQL, drillHTTPInsertArgs(id, origin, actor, source, refs[0], refs[1], refs[2], digest, private, at)...)
			for attempt := 1; attempt <= 2; attempt++ {
				exec(`INSERT INTO system_backup_attempts(target_type,target_public_id,attempt_no,phase,status,started_at,created_at,updated_at)
 VALUES('drill',?,?,'restore','running',?,?,?)`, id, attempt, at.Add(time.Duration(attempt)*time.Second), at.Add(time.Duration(attempt)*time.Second), at.Add(50*time.Second))
			}
			for _, ref := range refs {
				exec(`INSERT INTO system_backup_evidence(public_id,owner_target_type,owner_target_public_id,evidence_type,storage_state,inline_payload,
 content_checksum,content_size_bytes,media_type,encryption,redaction_classification,observed_health,expires_at,created_at,updated_at)
 VALUES(?,'drill',?,'verifier_report','inline',?,?,?,'application/json','none','internal','unknown',?,?,?)`, ref, id, payload, digest, len(payload), at.Add(time.Hour), at.Add(3*time.Second), at.Add(50*time.Second))
			}
			for _, check := range []struct {
				number       int
				code, status string
				second       int
			}{{1, "resources.old_failure", "failed", 40}, {2, "resources.current_warning", "warning", 4}, {2, "resources.current_skip", "skipped", 5}} {
				var skip, warning, class any
				failure := "none"
				switch check.status {
				case "failed":
					class, failure = "integrity", "checksum_mismatch"
				case "warning":
					warning = "fixture_warning"
				case "skipped":
					skip = "optional"
				}
				exec(`INSERT INTO system_backup_check_results(origin_installation_id,target_type,target_public_id,attempt_no,category,mode,check_code,status,skip_reason,
 expected_canonical_json,expected_size_bytes,expected_sha256,actual_canonical_json,actual_size_bytes,actual_sha256,
 evidence_public_id,evidence_sha256,warning_code,check_classification,failure_category,checked_at,created_at)
 VALUES(?,'drill',?,?,'resources','restore_validate',?,?,?, ?,?,SHA2(?,256),?,?,SHA2(?,256),?,?,?,?,?,?,?)`,
					origin, id, check.number, check.code, check.status, skip, payload, len(payload), payload, payload, len(payload), payload, refs[2], digest, warning, class, failure, at.Add(time.Duration(check.second)*time.Second), at.Add(time.Duration(check.second)*time.Second))
			}
			job := func(unit string, attempt, generation int, second *int) {
				var progress, progressHash any
				sequence := 0
				if second != nil {
					progress = at.Add(time.Duration(*second) * time.Second)
					progressHash = strings.Repeat("e", 64)
					sequence = 1
				}
				uid := fmt.Sprintf("00000000-0000-4000-8000-%012d", 9000+100*index+10*attempt+generation)
				exec(`INSERT INTO system_backup_job_observations(origin_installation_id,target_type,target_public_id,attempt_no,phase,job_unit_key,job_uid,job_generation,
 relay_identity_ref,relay_identity_version,relay_identity_bound_at,relay_identity_expires_at,last_accepted_sequence,last_accepted_body_sha256,last_observed_status,last_observed_at,
 progress_sequence,progress_digest_sha256,last_business_progress_at,created_at,updated_at)
 VALUES(?,'drill',?,?,'restore',?,?,?,'fixture-relay','fixture-v1',?,?,1,REPEAT('f',64),'running',?,?,?,?,?,?)`,
					origin, id, attempt, unit, uid, generation, at.Add(3*time.Second), at.Add(time.Hour), at.Add(45*time.Second), sequence, progressHash, progress, at.Add(time.Duration(attempt)*time.Second), at.Add(50*time.Second))
			}
			want := http.StatusOK
			path, bearer := "/api/v1/admin/system-restore-drills/"+id, token
			switch name {
			case "pending_no_attempt":
				exec("DELETE FROM system_backup_check_results WHERE target_public_id=?", id)
				exec("DELETE FROM system_backup_attempts WHERE target_public_id=?", id)
				exec(`UPDATE system_restore_drills SET status='pending',started_at=NULL,verifier_aggregate_status='skipped',verifier_warning=0,verifier_skipped=0,
 preflight_evidence_public_id=NULL,preflight_evidence_sha256=NULL,diff_evidence_public_id=NULL,diff_evidence_sha256=NULL,verifier_report_evidence_public_id=NULL,verifier_report_evidence_sha256=NULL WHERE public_id=?`, id)
			case "catalog_import":
				exec("UPDATE system_restore_drills SET source_artifact_type='catalog_import',source_public_id='sci_00000000-0000-4000-8000-000000000701' WHERE public_id=?", id)
			case "parallel_jobs":
				old, a, b := 44, 6, 7
				job("old", 1, 9, &old)
				job("mysql", 2, 3, &a)
				job("object", 2, 4, &b)
			case "parallel_phases":
				exec(`INSERT INTO system_backup_attempts(target_type,target_public_id,attempt_no,phase,status,started_at,created_at,updated_at) VALUES('drill',?,2,'normalize','running',?,?,?)`, id, at.Add(3*time.Second), at.Add(3*time.Second), at.Add(50*time.Second))
				a := 6
				job("mysql", 2, 3, &a)
			case "single_job":
				a := 6
				job("mysql", 2, 3, &a)
			case "heartbeat_only":
				exec("DELETE FROM system_backup_check_results WHERE target_public_id=? AND attempt_no=2", id)
				exec("UPDATE system_restore_drills SET verifier_aggregate_status='skipped',verifier_warning=0,verifier_skipped=0 WHERE public_id=?", id)
				job("mysql", 2, 3, nil)
			case "summary_drift":
				want = http.StatusServiceUnavailable
				exec("UPDATE system_restore_drills SET verifier_warning=2 WHERE public_id=?", id)
			case "report_hash_drift":
				want = http.StatusServiceUnavailable
				exec("UPDATE system_restore_drills SET preflight_evidence_sha256=REPEAT('e',64) WHERE public_id=?", id)
			case "report_wrong_owner":
				want = http.StatusServiceUnavailable
				exec("UPDATE system_backup_evidence SET owner_target_public_id='sdr_00000000-0000-4000-8000-000000000099' WHERE public_id=?", refs[0])
			case "report_before_attempt":
				want = http.StatusServiceUnavailable
				exec("UPDATE system_backup_evidence SET created_at=? WHERE public_id=?", at.Add(time.Second), refs[2])
			case "historical_preflight_before_retry":
				for _, ref := range refs[:2] {
					exec("UPDATE system_backup_evidence SET created_at=? WHERE public_id=?", at.Add(time.Second), ref)
				}
			case "shared_reference_strict_cutoff":
				want = http.StatusServiceUnavailable
				exec("UPDATE system_restore_drills SET verifier_report_evidence_public_id=preflight_evidence_public_id WHERE public_id=?", id)
				exec("UPDATE system_backup_evidence SET created_at=? WHERE public_id=?", at.Add(time.Second), refs[0])
			case "expired_evidence_history":
				exec("UPDATE system_backup_evidence SET expires_at=?,observed_health='degraded' WHERE owner_target_public_id=?", at.Add(10*time.Second), id)
			case "foreign_installation":
				want = http.StatusNotFound
				var storedOrigin string
				var matchingChecks int
				if err := db.QueryRowContext(ctx, `SELECT d.origin_installation_id,
 (SELECT COUNT(*) FROM system_backup_check_results c WHERE c.origin_installation_id=d.origin_installation_id AND c.target_type='drill' AND c.target_public_id=d.public_id)
 FROM system_restore_drills d WHERE d.public_id=?`, id).Scan(&storedOrigin, &matchingChecks); err != nil || storedOrigin != foreign || matchingChecks != 3 {
					t.Fatal("foreign drill fixture owner/check bindings differ")
				}
			case "missing_task":
				want = http.StatusNotFound
				path = "/api/v1/admin/system-restore-drills/sdr_00000000-0000-4000-8000-000000000999"
			case "unknown_query":
				want = http.StatusBadRequest
				path += "?ignored=1"
			case "missing_auth":
				want = http.StatusUnauthorized
				bearer = ""
			case "revoked_session":
				want = http.StatusForbidden
				h := sha256.Sum256([]byte(token))
				exec("UPDATE system_backup_admin_sessions SET revoked=TRUE WHERE origin_installation_id=? AND session_sha256=?", installation, hex.EncodeToString(h[:]))
			}
			response := request(path, bearer)
			body := response.Body.String()
			if response.Code != want || response.Header().Get("Cache-Control") != "no-store" || strings.Contains(body, private) || strings.Contains(body, "PRIVATE_DRILL_TARGET_REF") || strings.Contains(body, "expected_canonical_json") {
				t.Fatalf("drill history response mismatch case=%s status=%d want=%d", name, response.Code, want)
			}
			if want != http.StatusOK {
				if response.Header().Get("X-System-Backup-Data-Source") != "" || strings.Contains(body, id) || strings.Contains(body, source) {
					t.Fatal("failed drill response leaked partial history")
				}
				return
			}
			var dto contract.DrillDetailResource
			if json.Unmarshal(response.Body.Bytes(), &dto) != nil || dto.SchemaVersion != "system-backup-drill-detail.v1" || dto.Task.PublicID != id || dto.Task.OriginInstallationID != installation ||
				dto.Task.FailureMessage != nil || dto.TargetProfile != "single-node" || dto.CleanupPolicy != "delete-on-success" || dto.CleanupStatus != "not_started" || dto.AcceptanceEligible ||
				response.Header().Get("X-System-Backup-Data-Source") != "live" || response.Header().Get("X-System-Backup-Origin-Installation-ID") != installation || response.Header().Get("X-System-Backup-Task-Row-Version") != strconv.FormatInt(dto.Task.RowVersion, 10) {
				t.Fatal("drill DTO identity/headers/history invalid")
			}
			if name == "pending_no_attempt" {
				if dto.Execution.CurrentAttemptNumber != nil || dto.Execution.CurrentPhase != nil || dto.Execution.JobGeneration != nil || dto.Execution.LastBusinessProgressAt != nil || dto.PreflightEvidence != nil || dto.DiffEvidence != nil || dto.VerifierSummary.ReportEvidence != nil || dto.VerifierSummary.AggregateStatus != "skipped" {
					t.Fatal("pending drill fabricated execution or reports")
				}
				return
			}
			if dto.Execution.CurrentAttemptNumber == nil || *dto.Execution.CurrentAttemptNumber != 2 || dto.PreflightEvidence == nil || dto.DiffEvidence == nil || dto.VerifierSummary.ReportEvidence == nil || dto.VerifierSummary.ReportEvidence.PublicID != refs[2] {
				t.Fatal("lost current attempt or registered references")
			}
			if (name == "parallel_phases") != (dto.Execution.CurrentPhase == nil) || dto.Execution.CurrentPhase != nil && *dto.Execution.CurrentPhase != "restore" {
				t.Fatal("phase ambiguity lost")
			}
			if name == "single_job" || name == "heartbeat_only" {
				if dto.Execution.JobGeneration == nil || *dto.Execution.JobGeneration != 3 {
					t.Fatal("singular generation lost")
				}
			} else if dto.Execution.JobGeneration != nil {
				t.Fatal("ambiguous generation fabricated")
			}
			if name == "heartbeat_only" {
				if dto.Execution.LastBusinessProgressAt != nil || dto.VerifierSummary.AggregateStatus != "skipped" || dto.VerifierSummary.Warning != 0 || dto.VerifierSummary.Skipped != 0 {
					t.Fatal("heartbeat/old checks became current progress")
				}
			} else {
				seconds := 5
				if name == "single_job" || name == "parallel_phases" {
					seconds = 6
				}
				if name == "parallel_jobs" {
					seconds = 7
				}
				if dto.Execution.LastBusinessProgressAt == nil || *dto.Execution.LastBusinessProgressAt != at.Add(time.Duration(seconds)*time.Second).Format(time.RFC3339Nano) || dto.VerifierSummary.AggregateStatus != "warning" || dto.VerifierSummary.Warning != 1 || dto.VerifierSummary.Skipped != 1 || dto.VerifierSummary.Passed != 0 || dto.VerifierSummary.Failed != 0 {
					t.Fatal("historical checks/jobs polluted current summary")
				}
			}
			if name == "catalog_import" {
				if dto.Source.SourceArtifactType != "catalog_import" {
					t.Fatal("source type changed")
				}
			} else if dto.Source.SourcePublicID != source {
				t.Fatal("source ID changed")
			}
		})
	}
}
