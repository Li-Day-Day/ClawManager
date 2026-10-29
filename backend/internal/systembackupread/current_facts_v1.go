package systembackupread

import (
	contract "clawreef/internal/systembackupcontract"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
	"time"
	"unicode/utf8"
)

const CurrentFactsVersion = "system-backup-current-facts.v1"

// CurrentFactsSQL is a callback-scoped capability, not a connection. Only
// reviewed versioned read SQL may be supplied by trusted C adapters.
type CurrentFactsSQL interface {
	QueryRow(string, ...any) CurrentFactsRow
}
type CurrentFactsRow interface{ Scan(...any) error }
type CurrentTaskFacts interface {
	Backup(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) (BackupCurrentFacts, error)
	Preflight(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) (PreflightCurrentFacts, error)
}
type ManifestReader interface {
	Read(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) ([]byte, error)
}
type CurrentFactsIdentity struct {
	SchemaVersion, InstallationID, TaskPublicID string
	RowVersion                                  uint64
	ObservedAt, ValidUntil                      time.Time
}
type BackupCurrentFacts struct {
	CurrentFactsIdentity
	Checksums                       DetailChecksums
	RegistrationID, RegistrationSHA string
	ArtifactUsable, AcceptanceReady bool
	UnusableReason                  string
}
type PreflightCurrentFacts struct {
	CurrentFactsIdentity
	Compatibility, ValidityReason string
}

type currentFactsQuery struct {
	mu     sync.Mutex
	ctx    context.Context
	q      detailReadSQL
	closed bool
}
type currentFactsRow struct {
	owner *currentFactsQuery
	query string
	args  []any
	used  bool
}

func (q *currentFactsQuery) QueryRow(s string, a ...any) CurrentFactsRow {
	return &currentFactsRow{owner: q, query: s, args: append([]any(nil), a...)}
}
func (r *currentFactsRow) Scan(a ...any) error {
	q := r.owner
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed || r.used || q.ctx.Err() != nil {
		return ErrUnavailable
	}
	r.used = true
	return q.q.QueryRowContext(q.ctx, r.query, r.args...).Scan(a...)
}
func (q *currentFactsQuery) close() { q.mu.Lock(); defer q.mu.Unlock(); q.closed = true }
func missingCurrent(v any) bool {
	if v == nil {
		return true
	}
	r := reflect.ValueOf(v)
	return r.Kind() == reflect.Pointer && r.IsNil()
}
func validateCurrent(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot, f CurrentFactsIdentity) error {
	h := s.checks.detail.execution.task
	var now time.Time
	if f.SchemaVersion != CurrentFactsVersion || f.InstallationID != h.InstallationID || f.TaskPublicID != h.PublicID || f.RowVersion != h.RowVersion || q.QueryRowContext(ctx, "SELECT UTC_TIMESTAMP(6)").Scan(&now) != nil || !now.After(f.ObservedAt) || !now.Before(f.ValidUntil) {
		return ErrUnavailable
	}
	return nil
}
func backupCurrent(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot, c CurrentTaskFacts) (BackupCurrentFacts, error) {
	var z BackupCurrentFacts
	if missingCurrent(c) {
		return z, ErrUnavailable
	}
	capability := &currentFactsQuery{ctx: ctx, q: q}
	f, e := c.Backup(ctx, capability, s)
	capability.close()
	if e != nil {
		return z, e
	}
	b, ok := s.checks.detail.Backup()
	if !validDetailObservedArtifact(sql.NullString{String: b.ArtifactState, Valid: true}, f.ArtifactUsable, f.UnusableReason) {
		return z, ErrUnavailable
	}
	if !ok || validateCurrent(ctx, q, s, f.CurrentFactsIdentity) != nil || f.Checksums != b.Checksums || f.RegistrationID != b.RegistrationID.String || f.RegistrationSHA != b.RegistrationSHA.String || (f.AcceptanceReady && (!f.ArtifactUsable || !b.Eligibility.Eligible || s.checks.detail.execution.task.Status != "succeeded" || !b.RegistrationID.Valid || !b.Checksums.Acceptance.Valid)) {
		return z, ErrUnavailable
	}
	return f, nil
}

// Explicit V1 entry points avoid silently changing the persisted-detail API.
func (r *Reader) ReadBackupDetailCurrentV1(ctx context.Context, id string, c CurrentTaskFacts) (contract.BackupDetailResource, error) {
	return readTaskCheckEvidenceControlInTransaction(ctx, r, BackupTask, id, func(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot) (contract.BackupDetailResource, error) {
		f, e := backupCurrent(ctx, q, s, c)
		if e != nil {
			return contract.BackupDetailResource{}, e
		}
		out, e := buildBackupDetail(ctx, q, s)
		if e != nil {
			return out, e
		}
		out.ArtifactUsable = f.ArtifactUsable
		out.ArtifactUnusableReason = f.UnusableReason
		out.AcceptanceReady = f.AcceptanceReady
		return out, validateCurrent(ctx, q, s, f.CurrentFactsIdentity)
	})
}
func (r *Reader) ReadPreflightDetailCurrentV1(ctx context.Context, id string, c CurrentTaskFacts) (contract.PreflightDetailResource, error) {
	return readTaskCheckEvidenceControlInTransaction(ctx, r, PreflightTask, id, func(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot) (contract.PreflightDetailResource, error) {
		var z contract.PreflightDetailResource
		if missingCurrent(c) {
			return z, ErrUnavailable
		}
		cap := &currentFactsQuery{ctx: ctx, q: q}
		f, e := c.Preflight(ctx, cap, s)
		cap.close()
		if e != nil {
			return z, e
		}
		if validateCurrent(ctx, q, s, f.CurrentFactsIdentity) != nil {
			return z, ErrUnavailable
		}
		out, e := buildPreflightDetail(ctx, q, s)
		if e != nil {
			return z, e
		}
		if !statusSet("supported", "compatible_with_warnings", "unsupported")[f.Compatibility] || !statusSet("pending", "valid", "functional_test_only", "source_changed", "dependency_unhealthy", "report_expired", "evidence_unavailable", "incomplete")[f.ValidityReason] {
			return z, ErrUnavailable
		}
		if f.ValidityReason == "valid" && (out.Task.Status != "succeeded" || out.PreflightMode != "production_readonly" || out.ReportEvidence == nil || out.VerifierSummary.Failed > 0) {
			return z, ErrUnavailable
		}
		out.ArtifactCompatibility = f.Compatibility
		out.ReportValidityReason = f.ValidityReason
		return out, validateCurrent(ctx, q, s, f.CurrentFactsIdentity)
	})
}
func validateManifestBytes(raw []byte, s TaskCheckEvidenceControlSnapshot) error {
	b, ok := s.checks.detail.Backup()
	h := s.checks.detail.execution.task
	var m struct {
		Schema       string `json:"schema_version"`
		Installation string `json:"origin_installation_id"`
		ID           string `json:"backup_public_id"`
	}
	if !ok || h.Status != "succeeded" || !b.CommittedAt.Valid || !b.Checksums.Manifest.Valid || len(raw) == 0 || len(raw) > 8<<20 || !utf8.Valid(raw) || json.Unmarshal(raw, &m) != nil || m.Schema != "system-backup.v1" || m.Installation != h.InstallationID || m.ID != h.PublicID || fmt.Sprintf("%x", sha256.Sum256(raw)) != b.Checksums.Manifest.String {
		return ErrUnavailable
	}
	return nil
}

// C validates closed schema, immutable locator/version and original read rights.
// D additionally checks identity/digest and returns the exact original bytes.
func (r *Reader) ReadBackupManifestCurrentV1(ctx context.Context, id string, c CurrentTaskFacts, m ManifestReader) ([]byte, error) {
	return readTaskCheckEvidenceControlInTransaction(ctx, r, BackupTask, id, func(ctx context.Context, q detailReadSQL, s TaskCheckEvidenceControlSnapshot) ([]byte, error) {
		f, e := backupCurrent(ctx, q, s, c)
		if e != nil || missingCurrent(m) {
			return nil, ErrUnavailable
		}
		cap := &currentFactsQuery{ctx: ctx, q: q}
		raw, e := m.Read(ctx, cap, s)
		cap.close()
		raw = append([]byte(nil), raw...)
		if e != nil || validateManifestBytes(raw, s) != nil || validateCurrent(ctx, q, s, f.CurrentFactsIdentity) != nil {
			return nil, ErrUnavailable
		}
		return raw, nil
	})
}
