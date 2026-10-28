package systembackupread

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

type firstDetailFixture struct {
	*checkEvidenceFixture
	times           []driver.Value
	now             time.Time
	reports         map[string][]driver.Value
	clockError      bool
	factsQueries    int
	manifestBinding []driver.Value
}

func newFirstDetailFixture(kind TaskKind) *firstDetailFixture {
	f := &firstDetailFixture{checkEvidenceFixture: newCheckEvidenceFixture(kind), reports: map[string][]driver.Value{}}
	at := f.rows[0][20].(time.Time)
	status := "running"
	if kind == BackupTask {
		status = "validating"
		f.values["consistency"] = "strong"
	}
	f.rows[0][11], f.values["status"] = status, status
	f.values["verifier_aggregate_status"], f.values["verifier_warning"], f.values["verifier_skipped"] = "warning", int64(1), int64(1)
	f.times = []driver.Value{int64(1), at.Add(5 * time.Second), at.Add(time.Minute), at, nil}
	f.now = at.Add(10 * time.Second)
	return f
}

type firstDetailConnector struct{ f *firstDetailFixture }

func (c firstDetailConnector) Driver() driver.Driver { return pageDriver{} }
func (c firstDetailConnector) Connect(ctx context.Context) (driver.Conn, error) {
	base, err := (checkEvidenceConnector{c.f.checkEvidenceFixture}).Connect(ctx)
	if err != nil {
		return nil, err
	}
	return &firstDetailConn{Conn: base, f: c.f}, nil
}

type firstDetailConn struct {
	driver.Conn
	f *firstDetailFixture
}

func (c *firstDetailConn) BeginTx(ctx context.Context, o driver.TxOptions) (driver.Tx, error) {
	return c.Conn.(driver.ConnBeginTx).BeginTx(ctx, o)
}
func (c *firstDetailConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	f := c.f
	if query != backupTaskTimesSQL && query != preflightTaskTimesSQL && query != currentFactsClockSQL && query != verificationReportReferenceSQL && query != backupManifestBindingSQL && query != "SELECT current_facts" {
		return c.Conn.(driver.QueryerContext).QueryContext(ctx, query, args)
	}
	if f.rechecks != 0 || f.commits != 0 {
		return nil, errors.New("escaped original snapshot")
	}
	switch query {
	case backupTaskTimesSQL, preflightTaskTimesSQL:
		if len(args) != 2 || args[0].Value != "installation_test" || args[1].Value != f.rows[0][1] {
			return nil, errors.New("unscoped times")
		}
		return &pageRows{columns: []string{"version", "heartbeat", "reconcile", "start", "finish"}, values: [][]driver.Value{f.times}}, nil
	case currentFactsClockSQL:
		if f.clockError {
			return nil, errors.New("clock unavailable")
		}
		return &pageRows{columns: []string{"now"}, values: [][]driver.Value{{f.now}}}, nil
	case "SELECT current_facts":
		f.factsQueries++
		return &pageRows{columns: []string{"fact"}, values: [][]driver.Value{{"current"}}}, nil
	case backupManifestBindingSQL:
		if len(args) != 2 || args[0].Value != "installation_test" || args[1].Value != f.rows[0][1] {
			return nil, errors.New("unscoped manifest")
		}
		binding := f.manifestBinding
		if binding == nil {
			binding = []driver.Value{f.values["row_version"], f.values["status"], f.values["artifact_state"], f.values["manifest_checksum"]}
		}
		return &pageRows{columns: []string{"version", "status", "state", "hash"}, values: [][]driver.Value{binding}}, nil
	default:
		rows := [][]driver.Value{}
		if len(args) == 1 {
			if row := f.reports[args[0].Value.(string)]; row != nil {
				rows = append(rows, row)
			}
		}
		return &pageRows{columns: []string{"schema", "kind", "owner", "hash", "created"}, values: rows}, nil
	}
}

type firstManifestSource struct {
	read func(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) ([]byte, error)
}

func (s *firstManifestSource) Read(ctx context.Context, q CurrentFactsSQL, snapshot TaskCheckEvidenceControlSnapshot) ([]byte, error) {
	return s.read(ctx, q, snapshot)
}
func firstManifestFixture() (*firstDetailFixture, []byte) {
	f := newFirstDetailFixture(BackupTask)
	raw := []byte("{\n  \"schema_version\":\"system-backup.v1\",\"origin_installation_id\":\"installation_test\",\"backup_public_id\":\"" + f.rows[0][1].(string) + "\"\n}\n")
	f.values["artifact_state"], f.values["artifact_usable"], f.values["artifact_unusable_reason"] = "committed", true, "none"
	f.values["artifact_committed_at"] = f.now.Add(-time.Second)
	for _, name := range []string{"index_checksum", "marker_checksum"} {
		f.values[name] = strings.Repeat("b", 64)
	}
	digest := sha256.Sum256(raw)
	f.values["manifest_checksum"] = hex.EncodeToString(digest[:])
	return f, raw
}

func TestBackupManifestReturnsOnlyOriginalChecksumBoundBytes(t *testing.T) {
	f, raw := firstManifestFixture()
	sourceRaw := append([]byte(nil), raw...)
	var retained CurrentFactsSQL
	source := &firstManifestSource{read: func(_ context.Context, q CurrentFactsSQL, s TaskCheckEvidenceControlSnapshot) ([]byte, error) {
		if f.commits != 0 || f.rechecks != 0 || s.Checks().Detail().Execution().Task().InstallationID != "installation_test" {
			t.Fatal("source outside original read scope")
		}
		retained = q
		return sourceRaw, nil
	}}
	got, err := firstDetailReader(t, f).ReadBackupManifest(context.Background(), f.rows[0][1].(string), firstFacts(f), source)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(raw) || f.commits != 1 || f.rechecks != 1 {
		t.Fatal("reencoded or independently authorized manifest")
	}
	sourceRaw[0] = 'X'
	if got[0] != '{' {
		t.Fatal("mutable provider bytes escaped")
	}
	var ignored string
	if retained.QueryRow("SELECT current_facts").Scan(&ignored) == nil || f.factsQueries != 1 {
		t.Fatal("retained owner SQL capability remained usable")
	}
}

func TestBackupManifestRejectsUnboundBytesAndExpiredRead(t *testing.T) {
	for _, fault := range []string{"nil_reader", "typed_nil", "nil_facts", "not_committed", "unusable", "checksum", "schema", "installation", "task", "array", "empty", "invalid_json", "utf8", "oversize", "read_error", "expired_during_read", "version", "status", "binding_checksum", "revoked", "commit"} {
		t.Run(fault, func(t *testing.T) {
			f, raw := firstManifestFixture()
			facts := firstFacts(f)
			switch fault {
			case "not_committed":
				f.values["artifact_state"], f.values["artifact_usable"], f.values["artifact_unusable_reason"] = "staging", false, "not_committed"
				f.values["artifact_committed_at"] = nil
			case "unusable":
				f.values["artifact_usable"], f.values["artifact_unusable_reason"] = false, "provider_unavailable"
			case "schema":
				raw = []byte(strings.ReplaceAll(string(raw), "system-backup.v1", "system-backup.other"))
			case "installation":
				raw = []byte(strings.ReplaceAll(string(raw), "installation_test", "installation_foreign"))
			case "task":
				raw = []byte(strings.ReplaceAll(string(raw), f.rows[0][1].(string), "sbk_00000000-0000-4000-8000-000000000099"))
			case "array":
				raw = []byte(`[]`)
			case "empty":
				raw = []byte(`{}`)
			case "invalid_json":
				raw = []byte(`{"schema_version":`)
			case "utf8":
				raw = []byte{'{', '"', 'x', '"', ':', '"', 255, '"', '}'}
			case "oversize":
				raw = make([]byte, MaxBackupManifestBytes+1)
			case "version":
				f.manifestBinding = []driver.Value{int64(2), f.values["status"], "committed", f.values["manifest_checksum"]}
			case "status":
				f.manifestBinding = []driver.Value{int64(1), "succeeded", "committed", f.values["manifest_checksum"]}
			case "binding_checksum":
				f.manifestBinding = []driver.Value{int64(1), f.values["status"], "committed", strings.Repeat("c", 64)}
			case "revoked":
				f.finalErr = ErrDenied
			case "commit":
				f.commitErr = errors.New("commit")
			}
			if fault != "checksum" && f.manifestBinding == nil {
				digest := sha256.Sum256(raw)
				f.values["manifest_checksum"] = hex.EncodeToString(digest[:])
			}
			if fault == "checksum" {
				raw = append(raw, ' ')
			}
			source := &firstManifestSource{read: func(_ context.Context, _ CurrentFactsSQL, _ TaskCheckEvidenceControlSnapshot) ([]byte, error) {
				if fault == "read_error" {
					return nil, errors.New("provider")
				}
				if fault == "expired_during_read" {
					f.now = f.now.Add(time.Minute)
				}
				return raw, nil
			}}
			var reader ManifestReader = source
			var owner CurrentTaskFacts = facts
			if fault == "nil_reader" {
				reader = nil
			}
			if fault == "typed_nil" {
				reader = (*firstManifestSource)(nil)
			}
			if fault == "nil_facts" {
				owner = nil
			}
			got, err := firstDetailReader(t, f).ReadBackupManifest(context.Background(), f.rows[0][1].(string), owner, reader)
			if err == nil || len(got) != 0 || fault != "commit" && f.commits != 0 {
				t.Fatal("unverified manifest escaped")
			}
		})
	}
}
func firstDetailReader(t *testing.T, f *firstDetailFixture) *Reader {
	t.Helper()
	db := sql.OpenDB(firstDetailConnector{f})
	t.Cleanup(func() { db.Close() })
	r, err := NewReader(db, f)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

type firstDetailFacts struct {
	backup    func(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) (BackupCurrentFacts, error)
	preflight func(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) (PreflightCurrentFacts, error)
}

func (f *firstDetailFacts) Backup(ctx context.Context, q CurrentFactsSQL, s TaskCheckEvidenceControlSnapshot) (BackupCurrentFacts, error) {
	return f.backup(ctx, q, s)
}
func (f *firstDetailFacts) Preflight(ctx context.Context, q CurrentFactsSQL, s TaskCheckEvidenceControlSnapshot) (PreflightCurrentFacts, error) {
	return f.preflight(ctx, q, s)
}
func firstFacts(f *firstDetailFixture) *firstDetailFacts {
	binding := func(s TaskCheckEvidenceControlSnapshot) CurrentFactsBinding {
		h := s.Checks().Detail().Execution().Task()
		return CurrentFactsBinding{InstallationID: h.InstallationID, PublicID: h.PublicID, TaskRowVersion: h.RowVersion, ObservedAt: f.now.Add(-time.Second), ValidUntil: f.now.Add(time.Minute)}
	}
	return &firstDetailFacts{
		backup: func(_ context.Context, q CurrentFactsSQL, s TaskCheckEvidenceControlSnapshot) (BackupCurrentFacts, error) {
			var value string
			if q.QueryRow("SELECT current_facts").Scan(&value) != nil || value != "current" {
				return BackupCurrentFacts{}, ErrUnavailable
			}
			b, _ := s.Checks().Detail().Backup()
			return BackupCurrentFacts{Binding: binding(s), ArtifactState: b.ArtifactState, ArtifactUsable: b.ArtifactUsable, ArtifactUnusableReason: b.UnusableReason, Checksums: b.Checksums, RegistrationID: b.RegistrationID, RegistrationSHA: b.RegistrationSHA}, nil
		},
		preflight: func(_ context.Context, q CurrentFactsSQL, s TaskCheckEvidenceControlSnapshot) (PreflightCurrentFacts, error) {
			var value string
			if q.QueryRow("SELECT current_facts").Scan(&value) != nil || value != "current" {
				return PreflightCurrentFacts{}, ErrUnavailable
			}
			p, _ := s.Checks().Detail().Preflight()
			return PreflightCurrentFacts{Binding: binding(s), ArtifactCompatibility: p.Compatibility, ReportValidityReason: p.ValidityReason}, nil
		},
	}
}

func TestBackupPreflightCompleteDetailOriginalSnapshot(t *testing.T) {
	for _, kind := range []TaskKind{BackupTask, PreflightTask} {
		t.Run(string(kind), func(t *testing.T) {
			f := newFirstDetailFixture(kind)
			r := firstDetailReader(t, f)
			facts := firstFacts(f)
			var raw []byte
			var err error
			if kind == BackupTask {
				v, e := r.ReadBackupDetail(context.Background(), f.rows[0][1].(string), facts)
				err = e
				if e == nil && (v.SchemaVersion != "system-backup-backup-detail.v1" || v.Consistency != "strong" || v.ArtifactUsable || v.AcceptanceReady || len(v.RequestedParts) != 6 || v.VerifierSummary.Warning != 1 || v.VerifierSummary.Skipped != 1 || v.Task.StartedAt == nil || v.Task.FailureMessage != nil || v.Execution.CurrentAttemptNumber == nil || *v.Execution.CurrentAttemptNumber != 2) {
					t.Fatal("incomplete backup projection")
				}
				raw, _ = json.Marshal(v)
			} else {
				v, e := r.ReadPreflightDetail(context.Background(), f.rows[0][1].(string), facts)
				err = e
				if e == nil && (v.SchemaVersion != "system-backup-preflight-detail.v1" || v.ReportValidityReason != "pending" || v.TargetProfile != "cluster" || v.ReportEvidence != nil || v.VerifierSummary.Warning != 1 || v.VerifierSummary.Skipped != 1 || v.Task.StartedAt == nil || v.Execution.CurrentAttemptNumber == nil || *v.Execution.CurrentAttemptNumber != 2) {
					t.Fatal("incomplete preflight projection")
				}
				raw, _ = json.Marshal(v)
			}
			if err != nil {
				t.Fatal(err)
			}
			if f.rechecks != 1 || f.commits != 1 || f.factsQueries != 1 || f.options.Isolation != driver.IsolationLevel(sql.LevelRepeatableRead) {
				t.Fatal("escaped original authorization snapshot")
			}
			if strings.Contains(string(raw), "PRIVATE") || strings.Contains(string(raw), "config_snapshot") || strings.Contains(string(raw), "expected_json") {
				t.Fatal("private source leaked")
			}
		})
	}
}

func TestBackupDetailRejectsIncompleteCurrentFacts(t *testing.T) {
	for _, fault := range []string{"nil", "typed_nil", "wrong_installation", "wrong_task", "wrong_version", "future", "expired", "clock", "state", "checksum", "registration", "uncommitted_usable", "acceptance", "hold", "consistency", "times", "report_owner", "report_hash", "report_attempt", "revocation", "commit", "write_attempt", "retained_row"} {
		t.Run(fault, func(t *testing.T) {
			f := newFirstDetailFixture(BackupTask)
			facts := firstFacts(f)
			base := facts.backup
			facts.backup = func(ctx context.Context, q CurrentFactsSQL, s TaskCheckEvidenceControlSnapshot) (BackupCurrentFacts, error) {
				v, e := base(ctx, q, s)
				if e != nil {
					return v, e
				}
				switch fault {
				case "wrong_installation":
					v.Binding.InstallationID = "installation_other"
				case "wrong_task":
					v.Binding.PublicID = "sbk_00000000-0000-4000-8000-000000000099"
				case "wrong_version":
					v.Binding.TaskRowVersion++
				case "future":
					v.Binding.ObservedAt = f.now.Add(time.Second)
				case "expired":
					v.Binding.ValidUntil = f.now
				case "state":
					v.ArtifactState = "committed"
				case "checksum":
					v.Checksums.Manifest = sql.NullString{String: strings.Repeat("a", 64), Valid: true}
				case "registration":
					v.RegistrationID = sql.NullString{String: "other", Valid: true}
				case "uncommitted_usable":
					v.ArtifactUsable = true
					v.ArtifactUnusableReason = "none"
				case "acceptance":
					v.AcceptanceReady = true
				case "hold":
					v.RedactedManualHoldReason = sql.NullString{String: "private", Valid: true}
				case "report_owner", "report_hash", "report_attempt":
					id := "sev_00000000-0000-4000-8000-000000000040"
					hash := strings.Repeat("d", 64)
					v.VerifierReport = DetailEvidenceControl{PublicID: sql.NullString{String: id, Valid: true}, SHA256: sql.NullString{String: hash, Valid: true}}
					owner, gotHash, at := s.Checks().Detail().Execution().Task().PublicID, hash, f.now
					if fault == "report_owner" {
						owner = "other"
					}
					if fault == "report_hash" {
						gotHash = strings.Repeat("e", 64)
					}
					if fault == "report_attempt" {
						at = f.rows[0][20].(time.Time).Add(-time.Second)
					}
					f.reports[id] = []driver.Value{"system-backup-evidence.v1", "backup", owner, gotHash, at}
				case "write_attempt":
					var ignored string
					_ = q.QueryRow("UPDATE system_backups SET status='succeeded'").Scan(&ignored)
				case "retained_row":
					row := q.QueryRow("SELECT current_facts")
					cap := q.(*currentFactsSQL)
					cap.close()
					var ignored string
					_ = row.Scan(&ignored)
				}
				return v, nil
			}
			switch fault {
			case "clock":
				f.clockError = true
			case "consistency":
				f.values["consistency"] = nil
			case "times":
				f.times[0] = int64(2)
			case "revocation":
				f.finalErr = ErrDenied
			case "commit":
				f.commitErr = errors.New("commit")
			}
			var owner CurrentTaskFacts = facts
			if fault == "nil" {
				owner = nil
			}
			if fault == "typed_nil" {
				owner = (*firstDetailFacts)(nil)
			}
			_, err := firstDetailReader(t, f).ReadBackupDetail(context.Background(), f.rows[0][1].(string), owner)
			if err == nil {
				t.Fatal("incomplete fact returned complete detail")
			}
			if fault != "commit" && f.commits != 0 {
				t.Fatal("committed invalid detail")
			}
		})
	}
}

func TestPreflightDetailRejectsUnboundValidReport(t *testing.T) {
	for _, fault := range []string{"wrong_installation", "future", "expired", "invented_valid", "functional_valid", "unknown_validity", "unknown_compatibility", "aggregate", "report_owner", "report_hash", "report_old", "revocation"} {
		t.Run(fault, func(t *testing.T) {
			f := newFirstDetailFixture(PreflightTask)
			facts := firstFacts(f)
			base := facts.preflight
			facts.preflight = func(ctx context.Context, q CurrentFactsSQL, s TaskCheckEvidenceControlSnapshot) (PreflightCurrentFacts, error) {
				v, e := base(ctx, q, s)
				switch fault {
				case "wrong_installation":
					v.Binding.InstallationID = "installation_foreign"
				case "future":
					v.Binding.ObservedAt = f.now.Add(time.Second)
				case "expired":
					v.Binding.ValidUntil = f.now
				case "invented_valid", "functional_valid":
					v.ReportValidityReason = "valid"
				case "unknown_validity":
					v.ReportValidityReason = "other"
				case "unknown_compatibility":
					v.ArtifactCompatibility = "other"
				}
				return v, e
			}
			switch fault {
			case "functional_valid":
				f.values["preflight_mode"] = "functional_test"
			case "aggregate":
				f.values["verifier_warning"] = int64(9)
			case "revocation":
				f.finalErr = ErrDenied
			case "report_owner", "report_hash", "report_old":
				id := "sev_00000000-0000-4000-8000-000000000040"
				hash := strings.Repeat("d", 64)
				f.values["report_evidence_public_id"], f.values["report_evidence_sha256"] = id, hash
				owner, gotHash, at := f.rows[0][1].(string), hash, f.now
				if fault == "report_owner" {
					owner = "other"
				}
				if fault == "report_hash" {
					gotHash = strings.Repeat("e", 64)
				}
				if fault == "report_old" {
					at = f.rows[0][20].(time.Time).Add(-time.Second)
				}
				f.reports[id] = []driver.Value{"system-backup-evidence.v1", "preflight", owner, gotHash, at}
			}
			_, err := firstDetailReader(t, f).ReadPreflightDetail(context.Background(), f.rows[0][1].(string), facts)
			if err == nil || f.commits != 0 {
				t.Fatal("invalid report accepted")
			}
		})
	}
}
