package systembackupobserver

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"encoding/hex"
	"errors"
	"io"
	"strings"
	"sync/atomic"
	"testing"
)

func grants() []string {
	result := []string{"GRANT USAGE ON *.* TO `observer`@`localhost`"}
	for _, table := range requiredTables {
		result = append(result, "GRANT SELECT ON `fixture`.`"+table+"` TO `observer`@`localhost`")
	}
	return result
}

func TestSelectOnlyGrants(t *testing.T) {
	if ValidateGrants("fixture", grants()) != nil {
		t.Fatal("exact SELECT inventory rejected")
	}
	for _, grant := range []string{"GRANT SELECT ON `fixture`.* TO `observer`@`localhost`", "GRANT ALL PRIVILEGES ON *.* TO `observer`@`localhost`", "GRANT SELECT, UPDATE ON `fixture`.`system_backup_v2_backups` TO `observer`@`localhost`", "GRANT `reader_role`@`%` TO `observer`@`localhost`", "GRANT SELECT ON `fixture`.`users` TO `observer`@`localhost`", "GRANT SELECT ON `other`.`system_backup_v2_backups` TO `observer`@`localhost`", "GRANT SELECT ON `fixture`.`system_backup_v2_backups` TO `observer`@`localhost` WITH GRANT OPTION"} {
		t.Run(grant, func(t *testing.T) {
			if ValidateGrants("fixture", append(grants(), grant)) == nil {
				t.Fatal("unsafe grant accepted")
			}
		})
	}
	if ValidateGrants("fixture", grants()[:len(grants())-1]) == nil {
		t.Fatal("missing table accepted")
	}
}

type fixture struct {
	begin, rollback, commit, queries   int
	readonly                           bool
	isolation                          driver.IsolationLevel
	claims                             int64
	badSnapshot, foreign, queryFailure bool
	lastArgs                           []driver.NamedValue
}
type fixtureDriver struct{ state *fixture }
type fixtureConn struct{ state *fixture }
type fixtureTx struct{ state *fixture }
type fixtureRows struct {
	values [][]driver.Value
	n      int
}

func (d fixtureDriver) Open(string) (driver.Conn, error) { return &fixtureConn{d.state}, nil }
func (c *fixtureConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare forbidden")
}
func (c *fixtureConn) Close() error              { return nil }
func (c *fixtureConn) Begin() (driver.Tx, error) { return nil, errors.New("legacy begin forbidden") }
func (c *fixtureConn) BeginTx(_ context.Context, o driver.TxOptions) (driver.Tx, error) {
	c.state.begin++
	c.state.readonly = o.ReadOnly
	c.state.isolation = o.Isolation
	return fixtureTx{c.state}, nil
}
func (tx fixtureTx) Commit() error   { tx.state.commit++; return nil }
func (tx fixtureTx) Rollback() error { tx.state.rollback++; return nil }
func (r *fixtureRows) Columns() []string {
	n := 0
	if len(r.values) > 0 {
		n = len(r.values[0])
	}
	return make([]string, n)
}
func (r *fixtureRows) Close() error { return nil }
func (r *fixtureRows) Next(out []driver.Value) error {
	if r.n == len(r.values) {
		return io.EOF
	}
	copy(out, r.values[r.n])
	r.n++
	return nil
}
func (c *fixtureConn) QueryContext(_ context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	s := c.state
	s.queries++
	s.lastArgs = args
	row := func(values ...driver.Value) (driver.Rows, error) {
		return &fixtureRows{values: [][]driver.Value{values}}, nil
	}
	if s.queryFailure && s.begin > 0 {
		return nil, errors.New("PRIVATE SQL CREDENTIAL")
	}
	switch {
	case q == "SELECT @@server_uuid,DATABASE(),CURRENT_USER(),CURRENT_ROLE()":
		server := "11111111-2222-4333-8444-555555555555"
		if s.foreign {
			server = "foreign"
		}
		return row(server, "fixture", "observer@localhost", "NONE")
	case q == "SHOW GRANTS":
		var values [][]driver.Value
		for _, g := range grants() {
			values = append(values, []driver.Value{g})
		}
		return &fixtureRows{values: values}, nil
	case strings.HasPrefix(q, "SELECT config_version,"):
		if len(args) != 2 || args[0].Value != "installation_fixture" || args[1].Value != "sbk_11111111-2222-4333-8444-555555555555" {
			return nil, errors.New("unscoped task query")
		}
		hash := strings.Repeat("a", 64)
		actual := hash
		if s.badSnapshot {
			actual = strings.Repeat("b", 64)
		}
		return row(int64(4), "admin", "7", "createSystemBackup", "same-request-key-1", "succeeded", "none", false, false, hash, actual, int64(2), int64(2), hash, nil, nil)
	case strings.HasPrefix(q, "SELECT COUNT(*) FROM system_backup_v2_backups WHERE origin_installation_id="):
		if strings.Contains(q, "actor_type=?") {
			if len(args) != 5 {
				return nil, errors.New("tuple count unscoped")
			}
		} else if len(args) != 3 || args[0].Value != "installation_fixture" || args[1].Value != "createSystemBackup" || args[2].Value != "same-request-key-1" {
			return nil, errors.New("installation key count unscoped")
		}
		return row(int64(1))
	case strings.HasPrefix(q, "SELECT COALESCE(SUM(event_type="):
		return row(int64(1), s.claims)
	case strings.HasPrefix(q, "SELECT COUNT(DISTINCT a.attempt_no)"):
		return row(int64(1))
	case strings.HasPrefix(q, "SELECT COUNT(*),COALESCE(SUM(last_accepted_sequence>0)"):
		return row(int64(2), int64(2))
	case strings.HasPrefix(q, "SELECT COUNT(*),COALESCE(SUM(j.last_accepted_sequence>0"):
		if len(args) != 5 || args[0].Value != "installation_fixture" || args[1].Value != "backup" || args[2].Value != fixtureRequest().PublicID || args[3].Value != "backup" || args[4].Value != fixtureRequest().PublicID || !strings.Contains(q, "MAX(a.attempt_no)") || !strings.Contains(q, "last_observed_status='completed'") || !strings.Contains(q, "a2.status='sealed'") {
			return nil, errors.New("latest capture query not scoped")
		}
		return row(int64(1), int64(1))
	}
	return nil, errors.New("unexpected query " + q)
}

var fixtureNumber atomic.Uint64

func openFixture(t *testing.T, s *fixture) *sql.DB {
	t.Helper()
	name := "observer_fixture_" + strings.Repeat("x", int(fixtureNumber.Add(1)))
	sql.Register(name, fixtureDriver{s})
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}
func fixturePins() Pins {
	return Pins{InstallationID: "installation_fixture", ServerUUID: "11111111-2222-4333-8444-555555555555", Database: "fixture", User: "observer", Host: "localhost"}
}
func fixtureRequest() Request {
	sum := sha256.Sum256([]byte("same-request-key-1"))
	return Request{Kind: "backup", PublicID: "sbk_11111111-2222-4333-8444-555555555555", ConfigVersion: 4, ActorID: "7", IdempotencyKeySHA256: hex.EncodeToString(sum[:])}
}

func TestObserverRejectsTupleDrift(t *testing.T) {
	for _, change := range []func(*Request){func(r *Request) { r.ActorID = "8" }, func(r *Request) { r.IdempotencyKeySHA256 = strings.Repeat("c", 64) }} {
		state := &fixture{claims: 1}
		request := fixtureRequest()
		change(&request)
		_, err := Observe(context.Background(), openFixture(t, state), fixturePins(), request)
		if err != ErrUnavailable || state.rollback != 1 {
			t.Fatal("tuple drift accepted", err)
		}
	}
}

func TestObserverIndependentReadOnlySnapshot(t *testing.T) {
	state := &fixture{claims: 2}
	value, err := Observe(context.Background(), openFixture(t, state), fixturePins(), fixtureRequest())
	if err != nil {
		t.Fatal(err)
	}
	if !state.readonly || state.isolation != driver.IsolationLevel(sql.LevelRepeatableRead) || state.begin != 1 || state.rollback != 1 || state.commit != 0 {
		t.Fatalf("transaction boundary %#v", state)
	}
	if value.ClaimCount == nil || *value.ClaimCount != 2 || value.TaskCount != 1 || value.InstallationKeyCount != 1 || value.EnqueueCount != 1 || value.AttemptCount != 1 || value.JobCount != 2 || value.LatestCaptureJobCount != 1 || value.LatestCaptureCompletedRelayCount != 1 || value.CurrentClaimObserved || value.Scheduled || !value.SnapshotRolledBack {
		t.Fatalf("durable receipts not preserved %#v", value)
	}
}
func TestAbsentClaimHistoryIsUnknownDespiteAttempts(t *testing.T) {
	value, err := Observe(context.Background(), openFixture(t, &fixture{}), fixturePins(), fixtureRequest())
	if err != nil {
		t.Fatal(err)
	}
	if value.ClaimCount != nil || value.ClaimHistory != "unavailable" || value.AttemptCount != 1 {
		t.Fatalf("invented claim count %#v", value)
	}
}
func TestObserverRejectsForeignDatabaseBeforeSnapshot(t *testing.T) {
	state := &fixture{foreign: true}
	_, err := Observe(context.Background(), openFixture(t, state), fixturePins(), fixtureRequest())
	if err != ErrUnavailable || state.begin != 0 {
		t.Fatalf("foreign database admitted %#v %v", state, err)
	}
}
func TestObserverRejectsDifferentOrWildcardAccountHost(t *testing.T) {
	for _, host := range []string{"%", "", "otherhost"} {
		state := &fixture{}
		pins := fixturePins()
		pins.Host = host
		_, err := Observe(context.Background(), openFixture(t, state), pins, fixtureRequest())
		if err != ErrUnavailable || state.begin != 0 {
			t.Fatalf("wrong account host admitted: %q", host)
		}
	}
}
func TestObserverRollbackOnDriftOrSQLFailure(t *testing.T) {
	for _, state := range []*fixture{{badSnapshot: true}, {queryFailure: true}} {
		_, err := Observe(context.Background(), openFixture(t, state), fixturePins(), fixtureRequest())
		if err != ErrUnavailable || state.rollback != 1 || state.commit != 0 {
			t.Fatalf("unsafe/error leak %#v %v", state, err)
		}
	}
}
func TestObserverRejectsInvalidRequestBeforeSQL(t *testing.T) {
	for _, request := range []Request{{Kind: "backup", PublicID: "system_backup_v2_backups; DROP TABLE users", ConfigVersion: 1}, {Kind: "preflight", PublicID: fixtureRequest().PublicID, ConfigVersion: 1}, {Kind: "backup", PublicID: fixtureRequest().PublicID, ConfigVersion: 0}} {
		state := &fixture{}
		_, err := Observe(context.Background(), openFixture(t, state), fixturePins(), request)
		if err != ErrUnavailable || state.queries != 0 {
			t.Fatal("invalid request touched SQL")
		}
	}
}
