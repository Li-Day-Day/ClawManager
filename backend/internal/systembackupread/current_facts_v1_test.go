package systembackupread

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"testing"
	"time"
)

type currentConnector struct {
	driver.Connector
	now time.Time
}

func (c currentConnector) Connect(ctx context.Context) (driver.Conn, error) {
	v, e := c.Connector.Connect(ctx)
	return currentConn{v, c.now}, e
}

type currentConn struct {
	driver.Conn
	now time.Time
}

func (c currentConn) BeginTx(ctx context.Context, o driver.TxOptions) (driver.Tx, error) {
	return c.Conn.(driver.ConnBeginTx).BeginTx(ctx, o)
}
func (c currentConn) QueryContext(ctx context.Context, q string, a []driver.NamedValue) (driver.Rows, error) {
	if q == "SELECT UTC_TIMESTAMP(6)" {
		return &pageRows{columns: []string{"now"}, values: [][]driver.Value{{c.now}}}, nil
	}
	return c.Conn.(driver.QueryerContext).QueryContext(ctx, q, a)
}

type currentAdapter struct {
	now      time.Time
	fault    string
	retained CurrentFactsRow
	q        CurrentFactsSQL
}

func (c *currentAdapter) Backup(ctx context.Context, q CurrentFactsSQL, s TaskCheckEvidenceControlSnapshot) (BackupCurrentFacts, error) {
	c.q = q
	c.retained = q.QueryRow("SELECT UTC_TIMESTAMP(6)")
	h := s.checks.detail.execution.task
	b, _ := s.checks.detail.Backup()
	f := BackupCurrentFacts{CurrentFactsIdentity: CurrentFactsIdentity{CurrentFactsVersion, h.InstallationID, h.PublicID, h.RowVersion, c.now.Add(-time.Second), c.now.Add(time.Second)}, Checksums: b.Checksums, RegistrationID: b.RegistrationID.String, RegistrationSHA: b.RegistrationSHA.String, UnusableReason: b.UnusableReason}
	switch c.fault {
	case "installation":
		f.InstallationID = "wrong"
	case "version":
		f.RowVersion++
	case "expired":
		f.ValidUntil = c.now
	case "future":
		f.ObservedAt = c.now
	case "schema":
		f.SchemaVersion = "old"
	case "hash":
		f.Checksums.Manifest = sql.NullString{String: "wrong", Valid: true}
	case "acceptance":
		f.AcceptanceReady = true
	}
	return f, nil
}
func (*currentAdapter) Preflight(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) (PreflightCurrentFacts, error) {
	return PreflightCurrentFacts{}, ErrUnavailable
}

var _ CurrentTaskFacts = (*currentAdapter)(nil)

func TestCurrentFactsV1TransactionBoundaries(t *testing.T) {
	for _, fault := range []string{"", "installation", "version", "expired", "future", "schema", "hash", "acceptance", "revoked", "commit"} {
		t.Run(fault, func(t *testing.T) {
			f := newUnstartedDetailFixture(BackupTask)
			now := time.Now().UTC()
			c := &currentAdapter{now: now, fault: fault}
			if fault == "revoked" {
				f.finalErr = ErrDenied
			}
			if fault == "commit" {
				f.commitErr = ErrUnavailable
			}
			db := sql.OpenDB(currentConnector{verificationDetailConnector{f}, now})
			defer db.Close()
			r, e := NewReader(db, f)
			if e != nil {
				t.Fatal(e)
			}
			out, e := r.ReadBackupDetailCurrentV1(context.Background(), f.rows[0][1].(string), c)
			if fault == "" {
				if e != nil || out.Task.PublicID == "" || f.rechecks != 1 || f.commits != 1 {
					t.Fatal(out, e)
				}
			} else if e == nil || out.Task.PublicID != "" {
				t.Fatal("failed boundary returned detail", out, e)
			}
			var n time.Time
			if c.retained != nil && c.retained.Scan(&n) == nil {
				t.Fatal("retained row escaped callback")
			}
			if c.q != nil && c.q.QueryRow("SELECT UTC_TIMESTAMP(6)").Scan(&n) == nil {
				t.Fatal("retained capability escaped callback")
			}
		})
	}
}
func TestManifestV1OriginalBytesIdentityDigest(t *testing.T) {
	raw := []byte("{\n \"schema_version\":\"system-backup.v1\",\"origin_installation_id\":\"installation_test\",\"backup_public_id\":\"sbk_test\"}")
	var s TaskCheckEvidenceControlSnapshot
	s.checks.detail.execution.task = TaskHeader{InstallationID: "installation_test", PublicID: "sbk_test", Status: "succeeded"}
	s.checks.detail.backup = &BackupDetailControl{CommittedAt: sql.NullTime{Time: time.Now(), Valid: true}, Checksums: DetailChecksums{Manifest: sql.NullString{String: fmt.Sprintf("%x", sha256.Sum256(raw)), Valid: true}}}
	if validateManifestBytes(raw, s) != nil {
		t.Fatal("valid original bytes rejected")
	}
	if validateManifestBytes(append(raw, ' '), s) == nil {
		t.Fatal("changed bytes accepted")
	}
	s.checks.detail.execution.task.InstallationID = "other"
	if validateManifestBytes(raw, s) == nil {
		t.Fatal("cross installation accepted")
	}
}
