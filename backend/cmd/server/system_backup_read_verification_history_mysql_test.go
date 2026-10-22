//go:build systembackup_mysql

package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	contract "clawreef/internal/systembackupcontract"
)

// The parent has authenticated the UID/server marker, full migration fixture,
// real SQL session and deployment-pinned read scope before calling this probe.
// These synthetic historical records do not prove actual provider verification.
func testDVerificationDetailHTTPHistoryMySQL(t *testing.T, db *sql.DB, ctx context.Context,
	request func(string, string) *httptest.ResponseRecorder, token, installation, actor, source string) {
	t.Helper()
	const private = "PRIVATE_HTTP_VERIFICATION_HISTORY_SENTINEL"
	payload := []byte("{\"synthetic_private_fixture\":\"" + private + "\"}")
	digest := sha256.Sum256(payload)
	evidenceHash := hex.EncodeToString(digest[:])
	var dbNow time.Time
	if err := db.QueryRowContext(ctx, "SELECT UTC_TIMESTAMP(6)").Scan(&dbNow); err != nil {
		t.Fatal(err)
	}
	at := dbNow.Add(-time.Minute).UTC()
	cases := []string{"current_attempt_history", "catalog_import_null_state", "parallel_jobs", "single_job", "heartbeat_only",
		"summary_drift", "report_hash_drift", "report_wrong_owner", "report_before_current_attempt", "check_hash_drift",
		"check_missing_attempt", "health_cannot_restore", "noncommitted_cannot_be_usable", "full_restore_false_to_true",
		"shared_report_reference", "expired_evidence_is_historical"}
	for index, name := range cases {
		t.Run("verification_history_"+name, func(t *testing.T) {
			id := fmt.Sprintf("sav_00000000-0000-4000-8000-%012d", 500+index)
			health := fmt.Sprintf("sev_00000000-0000-4000-8000-%012d", 3000+2*index)
			report := fmt.Sprintf("sev_00000000-0000-4000-8000-%012d", 3001+2*index)
			exec := func(query string, args ...any) {
				t.Helper()
				if _, err := db.ExecContext(ctx, query, args...); err != nil {
					t.Fatal("isolated history fixture SQL failed", err)
				}
			}
			exec(`INSERT INTO system_backup_artifact_verifications
    (public_id,origin_installation_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,
     config_version,config_snapshot_json,config_snapshot_size_bytes,config_snapshot_sha256,deadline_at,
     status,started_at,created_at,updated_at,heartbeat_at,verification_scope,source_artifact_type,source_public_id,
     artifact_state_before,artifact_state_after,unusable_reason_before,unusable_reason_after,decision_reason,
     observed_manifest_checksum,observed_index_checksum,verifier_aggregate_status,verifier_warning,verifier_skipped,
     health_report_evidence_public_id,health_report_evidence_sha256,verifier_report_evidence_public_id,verifier_report_evidence_sha256,
     failure_message)
    VALUES(?,?,'admin',?,'POST /system-backup-artifact-verifications',?,REPEAT('a',64),?,
     1,'{}',2,SHA2('{}',256),?,'running',?,?,?,?, 'full','backup',?,
     'committed','committed','provider_unavailable','provider_unavailable','unchanged',
     REPEAT('a',64),REPEAT('b',64),'warning',1,1,?,?,?,?,?)`,
				id, installation, actor, "d-http-history-"+id, "d-http-history-"+id, at.Add(time.Hour),
				at, at, at.Add(50*time.Second), at.Add(49*time.Second), source, health, evidenceHash, report, evidenceHash, private)
			for attempt := 1; attempt <= 2; attempt++ {
				exec(`INSERT INTO system_backup_attempts
     (target_type,target_public_id,attempt_no,phase,status,started_at,created_at,updated_at)
     VALUES('artifact_verify',?,?,'verify','running',?,?,?)`, id, attempt, at.Add(time.Duration(attempt)*time.Second), at.Add(time.Duration(attempt)*time.Second), at.Add(50*time.Second))
			}
			for _, ref := range []string{health, report} {
				exec(`INSERT INTO system_backup_evidence
     (public_id,owner_target_type,owner_target_public_id,evidence_type,storage_state,inline_payload,
      content_checksum,content_size_bytes,media_type,encryption,redaction_classification,observed_health,
      expires_at,created_at,updated_at)
     VALUES(?,'artifact_verify',?,'verifier_report','inline',?,?,?,'application/json','none','internal','unknown',?,?,?)`,
					ref, id, payload, evidenceHash, len(payload), at.Add(time.Hour), at.Add(3*time.Second), at.Add(50*time.Second))
			}
			// The historical failure is later than the current checks: neither row
			// ordering nor maximum timestamp may choose the current attempt.
			for _, check := range []struct {
				number       int
				code, status string
				second       int
			}{
				{1, "artifact.old_failure", "failed", 40}, {2, "artifact.current_warning", "warning", 4}, {2, "artifact.current_skip", "skipped", 5},
			} {
				var skip, warning, classification any
				failure := "none"
				switch check.status {
				case "failed":
					classification, failure = "integrity", "checksum_mismatch"
				case "warning":
					warning = "fixture_warning"
				case "skipped":
					skip = "optional"
				}
				exec(`INSERT INTO system_backup_check_results
     (origin_installation_id,target_type,target_public_id,attempt_no,category,mode,check_code,status,skip_reason,
      expected_canonical_json,expected_size_bytes,expected_sha256,actual_canonical_json,actual_size_bytes,actual_sha256,
      evidence_public_id,evidence_sha256,warning_code,check_classification,failure_category,checked_at,created_at)
     VALUES(?,'artifact_verify',?,?,'artifact','artifact_full',?,?,?, ?,?,SHA2(?,256),?,?,SHA2(?,256),?,?,?,?,?,?,?)`,
					installation, id, check.number, check.code, check.status, skip, payload, len(payload), payload, payload, len(payload), payload,
					report, evidenceHash, warning, classification, failure, at.Add(time.Duration(check.second)*time.Second), at.Add(time.Duration(check.second)*time.Second))
			}
			job := func(unit string, attempt, generation int, second *int) {
				t.Helper()
				uid := fmt.Sprintf("00000000-0000-4000-8000-%012d", 5000+100*index+10*attempt+generation)
				var progress any
				if second != nil {
					progress = at.Add(time.Duration(*second) * time.Second)
				}
				sequence := 0
				var progressHash any
				if second != nil {
					sequence, progressHash = 1, strings.Repeat("e", 64)
				}
				exec(`INSERT INTO system_backup_job_observations
     (origin_installation_id,target_type,target_public_id,attempt_no,phase,job_unit_key,job_uid,job_generation,
      relay_identity_ref,relay_identity_version,relay_identity_bound_at,relay_identity_expires_at,
      last_accepted_sequence,last_accepted_body_sha256,last_observed_status,last_observed_at,
      progress_sequence,progress_digest_sha256,last_business_progress_at,created_at,updated_at)
     VALUES(?,'artifact_verify',?,?,'verify',?,?,?,'fixture-relay-ref','fixture-v1',?,?,1,REPEAT('f',64),'running',?,?,?,?,?,?)`,
					installation, id, attempt, unit, uid, generation, at.Add(3*time.Second), at.Add(time.Hour), at.Add(45*time.Second),
					sequence, progressHash, progress, at.Add(time.Duration(attempt)*time.Second), at.Add(50*time.Second))
			}
			wantStatus := http.StatusOK
			switch name {
			case "catalog_import_null_state":
				exec(`UPDATE system_backup_artifact_verifications SET source_artifact_type='catalog_import',source_public_id='sci_00000000-0000-4000-8000-000000000501',artifact_state_before=NULL,artifact_state_after=NULL,unusable_reason_before='verification_pending',unusable_reason_after='verification_pending' WHERE public_id=?`, id)
			case "parallel_jobs":
				old, first, second := 44, 6, 7
				job("old", 1, 9, &old)
				job("mysql", 2, 3, &first)
				job("object", 2, 4, &second)
			case "single_job":
				second := 6
				job("mysql", 2, 3, &second)
			case "heartbeat_only":
				exec("DELETE FROM system_backup_check_results WHERE target_public_id=? AND attempt_no=2", id)
				exec("UPDATE system_backup_artifact_verifications SET verifier_aggregate_status='skipped',verifier_warning=0,verifier_skipped=0 WHERE public_id=?", id)
				job("mysql", 2, 3, nil)
			case "summary_drift":
				wantStatus = http.StatusServiceUnavailable
				exec("UPDATE system_backup_artifact_verifications SET verifier_warning=2 WHERE public_id=?", id)
			case "report_hash_drift":
				wantStatus = http.StatusServiceUnavailable
				exec("UPDATE system_backup_artifact_verifications SET health_report_evidence_sha256=REPEAT('e',64) WHERE public_id=?", id)
			case "report_wrong_owner":
				wantStatus = http.StatusServiceUnavailable
				exec("UPDATE system_backup_evidence SET owner_target_public_id='sav_00000000-0000-4000-8000-000000000099' WHERE public_id=?", health)
			case "report_before_current_attempt":
				wantStatus = http.StatusServiceUnavailable
				exec("UPDATE system_backup_evidence SET created_at=? WHERE public_id=?", at.Add(time.Second), health)
			case "check_hash_drift":
				wantStatus = http.StatusServiceUnavailable
				exec("UPDATE system_backup_check_results SET evidence_sha256=REPEAT('e',64) WHERE target_public_id=? AND attempt_no=2", id)
			case "check_missing_attempt":
				wantStatus = http.StatusServiceUnavailable
				exec("UPDATE system_backup_check_results SET attempt_no=99 WHERE target_public_id=? AND attempt_no=2", id)
			case "health_cannot_restore":
				wantStatus = http.StatusServiceUnavailable
				exec("UPDATE system_backup_artifact_verifications SET verification_scope='health',usable_after=TRUE,unusable_reason_after='none' WHERE public_id=?", id)
				exec("UPDATE system_backup_check_results SET mode='artifact_health' WHERE target_public_id=?", id)
			case "noncommitted_cannot_be_usable":
				wantStatus = http.StatusServiceUnavailable
				exec("UPDATE system_backup_artifact_verifications SET artifact_state_after='deleted',usable_after=TRUE,unusable_reason_after='none' WHERE public_id=?", id)
			case "full_restore_false_to_true":
				exec("UPDATE system_backup_artifact_verifications SET usable_after=TRUE,unusable_reason_after='none',decision_reason='restored_usable' WHERE public_id=?", id)
			case "shared_report_reference":
				exec("UPDATE system_backup_artifact_verifications SET health_report_evidence_public_id=verifier_report_evidence_public_id,health_report_evidence_sha256=verifier_report_evidence_sha256 WHERE public_id=?", id)
			case "expired_evidence_is_historical":
				exec("UPDATE system_backup_evidence SET expires_at=?,observed_health='degraded' WHERE owner_target_public_id=?", at.Add(10*time.Second), id)
			}
			response := request("/api/v1/admin/system-backup-artifact-verifications/"+id, token)
			body := response.Body.String()
			if response.Code != wantStatus || response.Header().Get("Cache-Control") != "no-store" || strings.Contains(body, private) || strings.Contains(body, "expected_canonical_json") {
				t.Fatalf("history HTTP result/redaction mismatch case=%s status=%d expected=%d", name, response.Code, wantStatus)
			}
			if wantStatus != http.StatusOK {
				if response.Header().Get("X-System-Backup-Data-Source") != "" || strings.Contains(body, id) || !strings.Contains(body, `"code":"not_ready"`) {
					t.Fatal("inconsistent detail leaked partial task or live source marker")
				}
				return
			}
			var dto contract.ArtifactVerificationDetailResource
			if json.Unmarshal(response.Body.Bytes(), &dto) != nil || dto.SchemaVersion != "system-backup-artifact-verification-detail.v1" || dto.Task.PublicID != id || dto.Task.FailureMessage != nil || dto.Task.HeartbeatAt == nil ||
				response.Header().Get("X-System-Backup-Data-Source") != "live" || response.Header().Get("X-System-Backup-Origin-Installation-ID") != installation ||
				dto.Execution.CurrentAttemptNumber == nil || *dto.Execution.CurrentAttemptNumber != 2 || dto.Execution.CurrentPhase == nil || *dto.Execution.CurrentPhase != "verify" ||
				dto.HealthReportEvidence == nil || dto.VerifierSummary.ReportEvidence == nil || dto.VerifierSummary.ReportEvidence.PublicID != report {
				t.Fatal("lost authorized historical detail/attempt/report binding")
			}
			if dto.VerifierSummary.Failed != 0 || dto.VerifierSummary.Passed != 0 {
				t.Fatal("historical failed checks polluted current summary")
			}
			wantProgress := at.Add(5 * time.Second).Format(time.RFC3339Nano)
			if name == "heartbeat_only" {
				if dto.Execution.LastBusinessProgressAt != nil || dto.VerifierSummary.AggregateStatus != "skipped" || dto.VerifierSummary.Warning != 0 || dto.VerifierSummary.Skipped != 0 {
					t.Fatal("heartbeat or old check became business progress")
				}
			} else {
				if name == "parallel_jobs" {
					wantProgress = at.Add(7 * time.Second).Format(time.RFC3339Nano)
				}
				if name == "single_job" {
					wantProgress = at.Add(6 * time.Second).Format(time.RFC3339Nano)
				}
				if dto.Execution.LastBusinessProgressAt == nil || *dto.Execution.LastBusinessProgressAt != wantProgress || dto.VerifierSummary.AggregateStatus != "warning" || dto.VerifierSummary.Warning != 1 || dto.VerifierSummary.Skipped != 1 {
					t.Fatal("wrong current-check summary or business progress")
				}
			}
			if name == "single_job" || name == "heartbeat_only" {
				if dto.Execution.JobGeneration == nil || *dto.Execution.JobGeneration != 3 {
					t.Fatal("lost singular Job generation")
				}
			} else if dto.Execution.JobGeneration != nil {
				t.Fatal("invented a generation for no Job or parallel units")
			}
			if name == "catalog_import_null_state" {
				if dto.Source.SourceArtifactType != "catalog_import" || dto.ArtifactStateBefore != nil || dto.ArtifactStateAfter != nil {
					t.Fatal("catalog import gained local backup state")
				}
			} else if dto.Source.SourcePublicID != source || dto.ArtifactStateBefore == nil || *dto.ArtifactStateBefore != "committed" {
				t.Fatal("history source/observation changed")
			}
			if name == "full_restore_false_to_true" && (dto.UsableBefore || !dto.UsableAfter || dto.DecisionReason != "restored_usable") {
				t.Fatal("lost full false-to-true observation")
			}
			if name == "shared_report_reference" && dto.HealthReportEvidence.PublicID != report {
				t.Fatal("lost shared owner-bound report reference")
			}
		})
	}
	if !t.Failed() {
		t.Log("PASS d-verification-detail-http-history synthetic_cases=16 actual_provider=no production_approval=no")
	}
}
