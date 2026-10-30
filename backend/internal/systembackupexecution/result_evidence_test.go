package systembackupexecution

import (
	d "clawreef/internal/systembackupdispatch"
	security "clawreef/internal/systembackupsecurity"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func resultEvidenceFixture() (d.Authority, d.JobBinding, []byte) {
	a := d.Authority{InstallationID: "installation_test", TaskPublicID: "sbk_11111111-1111-4111-8111-111111111111", TaskType: "backup", AttemptNo: 3, Phase: "capture", ConfigVersion: 1}
	j := d.JobBinding{JobUnitKey: "workspace", Namespace: "backup", Name: "worker", UID: "22222222-2222-4222-8222-222222222222", Generation: 7, RelayIdentityRef: "original", RelayIdentityVersion: "v2"}
	r := d.ModuleResult{SchemaVersion: "system-backup-part-result.v1", Part: "workspace", Category: "workspace", Status: "completed", Checkpoint: json.RawMessage(`{"original":"checkpoint"}`), Statistics: map[string]uint64{"files": 0, "bytes": 0, "rows": 0, "tables": 0, "sealed_bytes": 100}, Warnings: []d.Warning{}, EvidenceIDs: []string{}, FailureCategory: "none"}
	raw, _ := json.Marshal(r)
	return a, j, raw
}

func TestInlineResultProfileAndStableEvidenceBinding(t *testing.T) {
	a, j, raw := resultEvidenceFixture()
	if !inlineResultBody(raw) {
		t.Fatal("fixed report rejected")
	}
	ref := resultEvidenceRef(a, j, hash(raw))
	if ref != resultEvidenceRef(a, j, hash(raw)) {
		t.Fatal("unstable retry")
	}
	for _, fault := range []string{"attempt", "installation", "job", "part", "generation", "digest"} {
		aa, jj, digest := a, j, hash(raw)
		switch fault {
		case "attempt":
			aa.AttemptNo++
		case "installation":
			aa.InstallationID += "x"
		case "job":
			jj.UID += "x"
		case "part":
			jj.JobUnitKey += "x"
		case "generation":
			jj.Generation++
		case "digest":
			digest = strings.Repeat("f", 64)
		}
		if resultEvidenceRef(aa, jj, digest) == ref {
			t.Fatal("rebound evidence", fault)
		}
	}
	for _, bad := range [][]byte{append(append([]byte{}, raw...), ' '), []byte(strings.Replace(string(raw), `"warnings":[]`, `"warnings":null`, 1)), []byte(strings.Replace(string(raw), `"evidence_ids":[]`, `"evidence_ids":["sev_other"]`, 1)), []byte(strings.Replace(string(raw), `"files":0`, `"secret":0`, 1)), []byte(strings.Repeat(" ", 8193))} {
		if inlineResultBody(bad) {
			t.Fatal("unreviewed content accepted")
		}
	}
	m, err := completedWorkerRelay(a, j, ref)
	if err != nil || m.Sequence != "3" || m.Status != "completed" || m.ResultEvidence.PublicID != ref.PublicID {
		t.Fatal(m, err)
	}
	if _, err = completedWorkerRelay(a, j, d.EvidenceRef{PublicID: "sev_" + ref.SHA256, SHA256: ref.SHA256}); err == nil {
		t.Fatal("synthetic reference accepted")
	}
}

type resultRows struct {
	values []driver.Value
	read   bool
}

func (r *resultRows) Columns() []string {
	out := make([]string, len(r.values))
	for n := range out {
		out[n] = fmt.Sprint(n)
	}
	return out
}
func (r *resultRows) Close() error { return nil }
func (r *resultRows) Next(v []driver.Value) error {
	if r.read || r.values == nil {
		return io.EOF
	}
	r.read = true
	copy(v, r.values)
	return nil
}

type resultModel struct {
	now               time.Time
	a                 d.Authority
	raw               []byte
	existing          bool
	fault             string
	inserts, reserves int
}
type resultDriver struct{ m *resultModel }

func (drv resultDriver) Open(string) (driver.Conn, error) { return &resultConn{drv.m}, nil }

type resultConn struct{ m *resultModel }

func (c *resultConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("unexpected prepare")
}
func (c *resultConn) Close() error              { return nil }
func (c *resultConn) Begin() (driver.Tx, error) { return resultTx{}, nil }

type resultTx struct{}

func (resultTx) Commit() error   { return nil }
func (resultTx) Rollback() error { return nil }
func (c *resultConn) QueryContext(_ context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	m := c.m
	row := func(v ...driver.Value) (driver.Rows, error) { return &resultRows{values: v}, nil }
	switch {
	case strings.HasPrefix(q, "SELECT schema_version"):
		if !m.existing {
			return row()
		}
		owner, state, raw, expires := m.a.TaskPublicID, "inline", m.raw, m.now.Add(time.Hour)
		switch m.fault {
		case "owner":
			owner += "x"
		case "state":
			state = "pending"
		case "bytes":
			raw = []byte("changed")
		case "expired":
			expires = m.now
		}
		return row("system-backup-evidence.v1", "backup", owner, "diagnostic", state, raw, hash(m.raw), int64(len(m.raw)), "application/json", "none", "internal", "none", "healthy", expires)
	case q == "SELECT UTC_TIMESTAMP(6)":
		return row(m.now)
	case strings.HasPrefix(q, "SELECT control_metadata_capacity_bytes"):
		retention := int64(86400)
		if m.fault == "retention" {
			retention = 0
		}
		return row(int64(1<<30), retention)
	case q == "SELECT @@server_uuid,DATABASE(),UTC_TIMESTAMP(6)":
		return row("server", "database", m.now)
	case strings.HasPrefix(q, "SELECT sample_at,reserved_bytes"):
		return row(m.now, int64(0))
	}
	return nil, fmt.Errorf("unexpected query %s", q)
}
func (c *resultConn) ExecContext(_ context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	switch {
	case strings.HasPrefix(q, "INSERT IGNORE INTO system_backup_v2_metadata_reservations"):
		return driver.RowsAffected(1), nil
	case strings.HasPrefix(q, "UPDATE system_backup_v2_metadata_reservations"):
		c.m.reserves++
		return driver.RowsAffected(1), nil
	case strings.HasPrefix(q, "INSERT INTO system_backup_v2_evidence"):
		if c.m.fault == "insert" {
			return nil, errors.New("insert unavailable")
		}
		if len(args) != 7 || args[1].Value != c.m.a.TaskPublicID || string(args[2].Value.([]byte)) != string(c.m.raw) || args[3].Value != hash(c.m.raw) {
			return nil, errors.New("wrong original evidence")
		}
		c.m.inserts++
		return driver.RowsAffected(1), nil
	}
	return nil, fmt.Errorf("unexpected exec %s", q)
}

func TestRegisterInlineResultUsesOriginalBytesAndExactReplay(t *testing.T) {
	for _, mode := range []string{"new", "replay", "owner", "state", "bytes", "expired", "retention", "insert", "capacity"} {
		t.Run(mode, func(t *testing.T) {
			a, j, raw := resultEvidenceFixture()
			m := &resultModel{now: time.Now().UTC(), a: a, raw: raw, fault: mode, existing: mode == "replay" || mode == "owner" || mode == "state" || mode == "bytes" || mode == "expired"}
			name := fmt.Sprintf("result-evidence-%s-%d", mode, time.Now().UnixNano())
			sql.Register(name, resultDriver{m})
			db, err := sql.Open(name, "")
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			var owner PublicJobOwner
			owner.Gate.Records.CapacityReportFile = filepath.Join(t.TempDir(), "capacity.json")
			report := security.CapacityReport{ServerUUID: "server", Database: "database", ObservedAt: m.now, AvailableBytes: 4 << 30}
			if mode == "capacity" {
				report.AvailableBytes = 0
			}
			data, _ := json.Marshal(report)
			if err = os.WriteFile(owner.Gate.Records.CapacityReportFile, data, 0600); err != nil {
				t.Fatal(err)
			}
			tx, err := db.Begin()
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			err = owner.registerResult(context.Background(), tx, a, j, raw)
			if mode == "new" || mode == "replay" {
				if err != nil {
					t.Fatal(err)
				}
			} else if err == nil {
				t.Fatal("invalid registration accepted")
			}
			if mode == "new" && (m.inserts != 1 || m.reserves != 1) {
				t.Fatal("missing registration/capacity")
			}
			if mode == "replay" && (m.inserts != 0 || m.reserves != 0) {
				t.Fatal("replay minted another registration")
			}
		})
	}
}
