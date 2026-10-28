package systembackupread

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	contract "clawreef/internal/systembackupcontract"
)

// CurrentTaskFacts is an owner adapter, not an admission bypass. Implementations
// must use current authoritative B/C/A facts; a saved usability/validity hint is
// insufficient. SQL contributions use the original authorized snapshot below.
// A missing adapter rejects the whole detail; there is no permissive default.
type CurrentTaskFacts interface {
	Backup(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) (BackupCurrentFacts, error)
	Preflight(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) (PreflightCurrentFacts, error)
}

// CurrentFactsSQL has no transaction-control or write methods. The request-bound
// capability is closed before final read authorization; retaining it cannot
// append a second snapshot after the response has been built.
type CurrentFactsSQL interface {
	QueryRow(string, ...any) CurrentFactsRow
}
type CurrentFactsRow interface{ Scan(...any) error }

// Binding identifies the exact task version and the authoritative observation's
// original validity interval. The builder checks it against the database clock;
// it does not manufacture a provider TTL or extend a stale observation.
type CurrentFactsBinding struct {
	InstallationID, PublicID string
	TaskRowVersion           uint64
	ObservedAt, ValidUntil   time.Time
}

type BackupCurrentFacts struct {
	Binding                               CurrentFactsBinding
	ArtifactState, ArtifactUnusableReason string
	ArtifactUsable, AcceptanceReady       bool
	Checksums                             DetailChecksums
	RegistrationID, RegistrationSHA       sql.NullString
	VerifierReport                        DetailEvidenceControl
	// The adapter must apply its approved redaction policy before supplying
	// reason text. Raw manual_hold_reason is never selected by this builder.
	RedactedManualHoldReason, ManualHoldActor sql.NullString
}

type PreflightCurrentFacts struct {
	Binding                                     CurrentFactsBinding
	ArtifactCompatibility, ReportValidityReason string
}

// ManifestReader is C's schema-validating immutable artifact reader, not the A
// encrypted-evidence Manifest reader. It must use the exact artifact locator,
// version and read authority bound to this snapshot and the original context.
// ReadBackupManifest independently checks the original bytes and task binding.
type ManifestReader interface {
	Read(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) ([]byte, error)
}

// This is a transport memory ceiling, not a replacement for C's manifest schema.
const MaxBackupManifestBytes = 8 << 20
const backupManifestBindingSQL = "SELECT row_version,status,artifact_state,manifest_checksum FROM system_backups WHERE origin_installation_id=? AND public_id=?"

func (r *Reader) ReadBackupManifest(ctx context.Context, id string, facts CurrentTaskFacts, source ManifestReader) ([]byte, error) {
	if nilCurrentFacts(facts) || nilManifestReader(source) {
		return nil, ErrUnavailable
	}
	return readTaskCheckEvidenceControlInTransaction(ctx, r, BackupTask, id,
		func(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot) ([]byte, error) {
			b, ok := s.checks.detail.Backup()
			h := s.checks.detail.execution.task
			if !ok || b.ArtifactState != "committed" || !b.Checksums.Manifest.Valid {
				return nil, ErrUnavailable
			}
			cap := newCurrentFactsSQL(ctx, q)
			defer cap.close()
			f, err := facts.Backup(ctx, cap, s)
			if err != nil || f.ArtifactState != b.ArtifactState || !f.ArtifactUsable || f.ArtifactUnusableReason != "none" ||
				!b.ArtifactUsable || f.Checksums != b.Checksums || f.RegistrationID != b.RegistrationID || f.RegistrationSHA != b.RegistrationSHA ||
				!currentFactsBindingValid(ctx, q, f.Binding, h) {
				return nil, ErrUnavailable
			}
			raw, err := source.Read(ctx, cap, s)
			if err != nil || len(raw) < 2 || len(raw) > MaxBackupManifestBytes {
				return nil, ErrUnavailable
			}
			// Freeze original bytes before closing capabilities. No owner callback
			// runs after this point, including a second validity or download call.
			raw = append([]byte(nil), raw...)
			if !cap.close() {
				return nil, ErrUnavailable
			}
			trimmed := strings.TrimSpace(string(raw))
			if !utf8.Valid(raw) || len(trimmed) < 2 || trimmed[0] != '{' || !json.Valid(raw) {
				return nil, ErrUnavailable
			}
			var identity struct {
				SchemaVersion  string `json:"schema_version"`
				InstallationID string `json:"origin_installation_id"`
				BackupID       string `json:"backup_public_id"`
			}
			if json.Unmarshal(raw, &identity) != nil || identity.SchemaVersion != "system-backup.v1" || identity.InstallationID != h.InstallationID || identity.BackupID != h.PublicID {
				return nil, ErrUnavailable
			}
			digest := sha256.Sum256(raw)
			if hex.EncodeToString(digest[:]) != b.Checksums.Manifest.String {
				return nil, ErrUnavailable
			}
			var version uint64
			var status, state, checksum string
			if q.QueryRowContext(ctx, backupManifestBindingSQL, h.InstallationID, h.PublicID).Scan(&version, &status, &state, &checksum) != nil ||
				version != h.RowVersion || status != h.Status || state != "committed" || checksum != b.Checksums.Manifest.String ||
				!currentFactsBindingValid(ctx, q, f.Binding, h) {
				return nil, ErrUnavailable
			}
			return raw, nil
		})
}

func nilManifestReader(source ManifestReader) bool {
	if source == nil {
		return true
	}
	v := reflect.ValueOf(source)
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
		return v.IsNil()
	}
	return false
}

func (r *Reader) ReadBackupDetail(ctx context.Context, id string, facts CurrentTaskFacts) (contract.BackupDetailResource, error) {
	if nilCurrentFacts(facts) {
		return contract.BackupDetailResource{}, ErrUnavailable
	}
	return readTaskCheckEvidenceControlInTransaction(ctx, r, BackupTask, id,
		func(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot) (contract.BackupDetailResource, error) {
			cap := newCurrentFactsSQL(ctx, q)
			defer cap.close()
			current, err := facts.Backup(ctx, cap, s)
			if err != nil || !cap.close() {
				return contract.BackupDetailResource{}, ErrUnavailable
			}
			return buildBackupDetail(ctx, q, s, current)
		})
}

func (r *Reader) ReadPreflightDetail(ctx context.Context, id string, facts CurrentTaskFacts) (contract.PreflightDetailResource, error) {
	if nilCurrentFacts(facts) {
		return contract.PreflightDetailResource{}, ErrUnavailable
	}
	return readTaskCheckEvidenceControlInTransaction(ctx, r, PreflightTask, id,
		func(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot) (contract.PreflightDetailResource, error) {
			cap := newCurrentFactsSQL(ctx, q)
			defer cap.close()
			current, err := facts.Preflight(ctx, cap, s)
			if err != nil || !cap.close() {
				return contract.PreflightDetailResource{}, ErrUnavailable
			}
			return buildPreflightDetail(ctx, q, s, current)
		})
}

func nilCurrentFacts(facts CurrentTaskFacts) bool {
	if facts == nil {
		return true
	}
	v := reflect.ValueOf(facts)
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
		return v.IsNil()
	}
	return false
}

const backupTaskTimesSQL = "SELECT row_version,heartbeat_at,next_reconcile_at,started_at,finished_at FROM system_backups WHERE origin_installation_id=? AND public_id=?"
const preflightTaskTimesSQL = "SELECT row_version,heartbeat_at,next_reconcile_at,started_at,finished_at FROM system_backup_preflights WHERE origin_installation_id=? AND public_id=?"
const currentFactsClockSQL = "SELECT UTC_TIMESTAMP(6)"

func detailTask(ctx context.Context, q detailReadSQL, header TaskHeader) (contract.Task, error) {
	base, err := ProjectTask(header)
	if err != nil {
		return contract.Task{}, ErrUnavailable
	}
	query := map[TaskKind]string{BackupTask: backupTaskTimesSQL, PreflightTask: preflightTaskTimesSQL}[header.Kind]
	if query == "" {
		return contract.Task{}, ErrUnavailable
	}
	var version uint64
	var heartbeat, reconcile, started, finished sql.NullTime
	if q.QueryRowContext(ctx, query, header.InstallationID, header.PublicID).Scan(&version, &heartbeat, &reconcile, &started, &finished) != nil || version != header.RowVersion {
		return contract.Task{}, ErrUnavailable
	}
	for _, value := range []sql.NullTime{heartbeat, reconcile, started, finished} {
		if value.Valid && (value.Time.IsZero() || value.Time.Year() < 1 || value.Time.Year() > 9999) {
			return contract.Task{}, ErrUnavailable
		}
	}
	terminal := header.Status == "succeeded" || header.Status == "failed" || header.Status == "canceled"
	if (header.Status == "pending") == started.Valid || terminal != finished.Valid ||
		started.Valid && started.Time.Before(header.CreatedAt) || finished.Valid && finished.Time.Before(started.Time) {
		return contract.Task{}, ErrUnavailable
	}
	return contract.Task{
		SchemaVersion: base.SchemaVersion, PublicID: base.PublicID, OriginInstallationID: base.OriginInstallationID,
		TaskType: string(base.TaskType), ActorType: base.ActorType, ActorID: base.ActorID, Endpoint: base.Endpoint,
		IdempotencyKey: base.IdempotencyKey, RequestHash: base.RequestHash, RequestID: base.RequestID, RetryOfPublicID: base.RetryOfPublicID,
		Status: base.Status, PendingReason: base.PendingReason, AttentionReason: base.AttentionReason, CanCancel: base.CanCancel,
		ConfigVersion: int64(base.ConfigVersion), Retryable: base.Retryable, FailureCategory: base.FailureCategory,
		RowVersion: int64(base.RowVersion), DeadlineAt: base.DeadlineAt, CreatedAt: base.CreatedAt, UpdatedAt: base.UpdatedAt,
		HeartbeatAt: verificationTime(heartbeat), NextReconcileAt: verificationTime(reconcile), StartedAt: verificationTime(started), FinishedAt: verificationTime(finished),
		FailureMessage: nil,
	}, nil
}

func currentFactsBindingValid(ctx context.Context, q detailReadSQL, b CurrentFactsBinding, h TaskHeader) bool {
	var now time.Time
	return b.InstallationID == h.InstallationID && b.PublicID == h.PublicID && b.TaskRowVersion == h.RowVersion &&
		!b.ObservedAt.IsZero() && b.ValidUntil.After(b.ObservedAt) &&
		q.QueryRowContext(ctx, currentFactsClockSQL).Scan(&now) == nil && !now.IsZero() &&
		!b.ObservedAt.After(now) && now.Before(b.ValidUntil) && ctx.Err() == nil
}

func buildBackupDetail(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot, f BackupCurrentFacts) (contract.BackupDetailResource, error) {
	var zero contract.BackupDetailResource
	d := s.checks.detail
	b, ok := d.Backup()
	h := d.execution.task
	if !ok || h.Kind != BackupTask || !b.Consistency.Valid || !validBackupDetailControl(b) ||
		f.ArtifactState != b.ArtifactState || f.Checksums != b.Checksums || f.RegistrationID != b.RegistrationID || f.RegistrationSHA != b.RegistrationSHA {
		return zero, ErrUnavailable
	}
	// Current health may revoke saved usability. It cannot grant usability to
	// a staging, deleted, unregistered or otherwise uncommitted artifact.
	if !statusSet("none", "not_committed", "finalization_pending", "deleting", "delete_failed", "deleted", "corrupt", "provider_unavailable", "credential_unavailable", "kek_unavailable", "evidence_unavailable", "verification_inconclusive")[f.ArtifactUnusableReason] ||
		!validDetailObservedArtifact(sql.NullString{String: f.ArtifactState, Valid: true}, f.ArtifactUsable, f.ArtifactUnusableReason) ||
		f.ArtifactUsable && (!b.ArtifactUsable || b.ArtifactState != "committed") ||
		f.AcceptanceReady && (!f.ArtifactUsable || !b.Eligibility.Eligible || h.Status != "succeeded" || !b.RegistrationID.Valid || !b.Checksums.Acceptance.Valid) {
		return zero, ErrUnavailable
	}
	if b.ManualHold {
		if !safeDetailText(f.RedactedManualHoldReason, 512) || !safeDetailText(f.ManualHoldActor, 128) {
			return zero, ErrUnavailable
		}
	} else if f.RedactedManualHoldReason.Valid || f.ManualHoldActor.Valid {
		return zero, ErrUnavailable
	}
	task, err := detailTask(ctx, q, h)
	if err != nil {
		return zero, err
	}
	execution, summary, attempt, cutoff, err := detailExecutionSummary(d.execution, s.checks.checks)
	if err != nil {
		return zero, err
	}
	if err = bindDetailReports(ctx, q, h, attempt, cutoff, []DetailEvidenceControl{f.VerifierReport}); err != nil {
		return zero, err
	}
	summary.ReportEvidence = verificationEvidence(f.VerifierReport)
	var bytes *int64
	if b.Bytes.Valid {
		if b.Bytes.V > 9007199254740991 {
			return zero, ErrUnavailable
		}
		n := int64(b.Bytes.V)
		bytes = &n
	}
	if !currentFactsBindingValid(ctx, q, f.Binding, h) {
		return zero, ErrUnavailable
	}
	return contract.BackupDetailResource{
		SchemaVersion: "system-backup-backup-detail.v1", Task: task, Execution: execution,
		TaskPurpose: b.Purpose, SourceOrchestrator: b.Orchestrator, SourceProfile: b.Profile, Matrix: b.Matrix, DatasourceTopology: b.Topology, Runner: b.Runner,
		RequestedParts: append([]string{}, b.RequestedParts...), ArtifactState: f.ArtifactState, ArtifactUsable: f.ArtifactUsable, ArtifactUnusableReason: f.ArtifactUnusableReason,
		ArtifactCommittedAt: verificationTime(b.CommittedAt), AcceptanceReady: f.AcceptanceReady, AcceptanceEligible: b.Eligibility.Eligible,
		EligibilityReasonCodes: append([]string{}, b.Eligibility.Reasons...), EligibilityDecisionHash: verificationString(b.Eligibility.DecisionSHA),
		TargetClass: b.TargetClass, TargetRisks: append([]string{}, b.TargetRisks...), TargetFailureDomainID: b.FailureDomain, Consistency: b.Consistency.String,
		Checksums: detailChecksumDTO(b.Checksums), ArtifactRegistrationID: verificationString(b.RegistrationID), ArtifactRegistrationHash: verificationString(b.RegistrationSHA),
		VerifierSummary: summary, ManualHold: b.ManualHold, ManualHoldReason: verificationString(f.RedactedManualHoldReason), ManualHoldActor: verificationString(f.ManualHoldActor),
		ManualHoldAt: verificationTime(b.ManualHoldAt), PromotionHold: b.PromotionHold, Bytes: bytes, PruneGuardVersion: int64(b.PruneGuardVersion),
	}, nil
}

func buildPreflightDetail(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot, f PreflightCurrentFacts) (contract.PreflightDetailResource, error) {
	var zero contract.PreflightDetailResource
	d := s.checks.detail
	p, ok := d.Preflight()
	h := d.execution.task
	if !ok || h.Kind != PreflightTask || !statusSet("supported", "compatible_with_warnings", "unsupported")[f.ArtifactCompatibility] ||
		!statusSet("pending", "valid", "functional_test_only", "source_changed", "dependency_unhealthy", "report_expired", "evidence_unavailable", "incomplete")[f.ReportValidityReason] {
		return zero, ErrUnavailable
	}
	task, err := detailTask(ctx, q, h)
	if err != nil {
		return zero, err
	}
	execution, summary, attempt, cutoff, err := detailExecutionSummary(d.execution, s.checks.checks)
	if err != nil || p.Verifier.AggregateStatus != summary.AggregateStatus || p.Verifier.Passed != uint64(summary.Passed) || p.Verifier.Warning != uint64(summary.Warning) || p.Verifier.Failed != uint64(summary.Failed) || p.Verifier.Skipped != uint64(summary.Skipped) {
		return zero, ErrUnavailable
	}
	if f.ReportValidityReason == "valid" && (h.Status != "succeeded" || p.Mode != "production_readonly" || !p.Report.PublicID.Valid || summary.Failed != 0 || f.ArtifactCompatibility == "unsupported") ||
		p.Mode == "functional_test" && f.ReportValidityReason == "valid" ||
		p.ValidityReason != "valid" && f.ReportValidityReason == "valid" {
		return zero, ErrUnavailable
	}
	if err = bindDetailReports(ctx, q, h, attempt, cutoff, []DetailEvidenceControl{p.Report, p.Diff, p.Verifier.Report}); err != nil {
		return zero, err
	}
	summary.ReportEvidence = verificationEvidence(p.Verifier.Report)
	if !currentFactsBindingValid(ctx, q, f.Binding, h) {
		return zero, ErrUnavailable
	}
	return contract.PreflightDetailResource{
		SchemaVersion: "system-backup-preflight-detail.v1", Task: task, Execution: execution,
		Source: contract.SourceArtifactReference{SourceArtifactType: p.Source.Type, SourcePublicID: p.Source.PublicID}, SourceChecksums: detailChecksumDTO(p.Source.Checksums),
		PreflightMode: p.Mode, TargetProfile: p.TargetProfile, RestoreTargetConfigHash: p.TargetConfigSHA,
		ArtifactCompatibility: f.ArtifactCompatibility, ReportEvidence: verificationEvidence(p.Report), DiffEvidence: verificationEvidence(p.Diff),
		ReportValidityReason: f.ReportValidityReason, VerifierSummary: summary,
	}, nil
}

func detailChecksumDTO(c DetailChecksums) contract.NullableArtifactChecksumSet {
	return contract.NullableArtifactChecksumSet{Manifest: verificationString(c.Manifest), Index: verificationString(c.Index), Marker: verificationString(c.Marker), Acceptance: verificationString(c.Acceptance), Catalog: verificationString(c.Catalog)}
}

// A singular phase/generation is emitted only if the latest attempt has exactly
// one phase/job. No invented capture/publish ordering or heartbeat progress.
func detailExecutionSummary(s TaskExecutionSnapshot, checks []TaskCheckControl) (contract.ExecutionProjection, contract.VerifierSummary, uint64, time.Time, error) {
	var e contract.ExecutionProjection
	v := contract.VerifierSummary{AggregateStatus: "skipped"}
	var current uint64
	var cutoff, progress time.Time
	for _, a := range s.attempts {
		if a.Number > current {
			current = a.Number
		}
	}
	if current == 0 {
		return e, v, 0, cutoff, nil
	}
	n := int64(current)
	e.CurrentAttemptNumber = &n
	var phases, jobs int
	for _, a := range s.attempts {
		if a.Number != current {
			continue
		}
		if !validTaskPhase(s.task.Kind, a.Phase) || !validExecutionNumber(a.Number) {
			return e, v, 0, cutoff, ErrUnavailable
		}
		phases++
		phase := a.Phase
		e.CurrentPhase = &phase
		if a.CreatedAt.After(cutoff) {
			cutoff = a.CreatedAt
		}
	}
	for _, j := range s.jobs {
		if j.AttemptNumber != current {
			continue
		}
		jobs++
		generation := int64(j.Generation)
		e.JobGeneration = &generation
		if j.BusinessProgressAt.Valid && j.BusinessProgressAt.Time.After(progress) {
			progress = j.BusinessProgressAt.Time
		}
	}
	if phases != 1 {
		e.CurrentPhase = nil
	}
	if phases != 1 || jobs != 1 {
		e.JobGeneration = nil
	}
	for _, c := range checks {
		if c.AttemptNumber != current {
			continue
		}
		if c.CheckedAt.After(progress) {
			progress = c.CheckedAt
		}
		switch c.Status {
		case "passed":
			v.Passed++
		case "warning":
			v.Warning++
		case "failed":
			v.Failed++
		case "skipped":
			v.Skipped++
		default:
			return e, v, 0, cutoff, ErrUnavailable
		}
	}
	switch {
	case v.Failed > 0:
		v.AggregateStatus = "failed"
	case v.Warning > 0:
		v.AggregateStatus = "warning"
	case v.Passed > 0:
		v.AggregateStatus = "passed"
	}
	if !progress.IsZero() {
		e.LastBusinessProgressAt = verificationTime(sql.NullTime{Time: progress, Valid: true})
	}
	return e, v, current, cutoff, nil
}

func bindDetailReports(ctx context.Context, q detailReadSQL, h TaskHeader, attempt uint64, cutoff time.Time, refs []DetailEvidenceControl) error {
	bound := map[string]string{}
	for _, ref := range refs {
		if !validDetailEvidence(ref) {
			return ErrUnavailable
		}
		if !ref.PublicID.Valid {
			continue
		}
		if attempt == 0 || cutoff.IsZero() {
			return ErrUnavailable
		}
		id, digest := ref.PublicID.String, ref.SHA256.String
		if old, ok := bound[id]; ok {
			if old != digest {
				return ErrUnavailable
			}
			continue
		}
		var schema, kind, owner, hash string
		var created time.Time
		if q.QueryRowContext(ctx, verificationReportReferenceSQL, id).Scan(&schema, &kind, &owner, &hash, &created) != nil ||
			schema != "system-backup-evidence.v1" || kind != string(h.Kind) || owner != h.PublicID || hash != digest || created.IsZero() || created.Before(cutoff) {
			return ErrUnavailable
		}
		bound[id] = digest
	}
	return nil
}

func safeDetailText(v sql.NullString, limit int) bool {
	return v.Valid && utf8.ValidString(v.String) && len(v.String) > 0 && len(v.String) <= limit && strings.IndexFunc(v.String, func(r rune) bool { return r < 32 || r == 127 }) < 0
}

type currentFactsSQL struct {
	mu           sync.Mutex
	ctx          context.Context
	q            detailReadSQL
	open, failed bool
	rows         map[*sql.Rows]bool
}

func newCurrentFactsSQL(ctx context.Context, q detailReadSQL) *currentFactsSQL {
	return &currentFactsSQL{ctx: ctx, q: q, open: true, rows: map[*sql.Rows]bool{}}
}
func (c *currentFactsSQL) close() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.open = false
	for rows := range c.rows {
		if rows.Close() != nil {
			c.failed = true
		}
		delete(c.rows, rows)
	}
	return !c.failed
}

type currentFactsRow struct {
	c    *currentFactsSQL
	rows *sql.Rows
	err  error
}

func (c *currentFactsSQL) QueryRow(query string, args ...any) CurrentFactsRow {
	c.mu.Lock()
	defer c.mu.Unlock()
	upper := strings.ToUpper(strings.TrimSpace(query))
	if !c.open || c.failed || c.ctx.Err() != nil || !strings.HasPrefix(upper, "SELECT ") || strings.ContainsAny(query, ";\x00") ||
		strings.Contains(upper, " INTO ") || strings.Contains(upper, "FOR UPDATE") || strings.Contains(upper, "LOCK IN SHARE MODE") {
		c.failed = true
		return currentFactsRow{c: c, err: ErrUnavailable}
	}
	rows, err := c.q.QueryContext(c.ctx, query, args...)
	if err != nil {
		c.failed = true
		return currentFactsRow{c: c, err: ErrUnavailable}
	}
	c.rows[rows] = true
	return currentFactsRow{c: c, rows: rows}
}
func (r currentFactsRow) Scan(values ...any) error {
	c := r.c
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.open || r.err != nil || !c.rows[r.rows] {
		c.failed = true
		return ErrUnavailable
	}
	defer func() {
		if r.rows.Close() != nil {
			c.failed = true
		}
		delete(c.rows, r.rows)
	}()
	if !r.rows.Next() {
		if r.rows.Err() != nil {
			c.failed = true
			return ErrUnavailable
		}
		return sql.ErrNoRows
	}
	if err := r.rows.Scan(values...); err != nil {
		c.failed = true
		return ErrUnavailable
	}
	if r.rows.Next() || r.rows.Err() != nil {
		c.failed = true
		return ErrUnavailable
	}
	if c.ctx.Err() != nil {
		c.failed = true
		return errors.New("current task facts unavailable")
	}
	return nil
}
