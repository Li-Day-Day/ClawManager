// This executable experiment tests Go database/sql ownership only. Its fake
// driver models session-duration backup locks and mysql v1.9.0's non-resetting
// ResetSession. It does NOT contact MySQL or prove DDL blocking/privileges.
package freezesession_test

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"sync"
	"testing"
	"time"
)

const lockSQL = "LOCK INSTANCE FOR BACKUP"
const unlockSQL = "UNLOCK INSTANCE"
const stateSQL = "SELECT model_session"

var errUnknown = errors.New("model commit response lost")

type pool struct {
	mu                   sync.Mutex
	next, closed, resets int64
	rolled               chan struct{}
}
type session struct {
	p                                 *pool
	id                                int64
	locked, active, committed, closed bool
	commitErr                         error
}
type modelDriver struct{}

func (modelDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("no DSN or network in this experiment")
}
func (p *pool) Driver() driver.Driver { return modelDriver{} }
func (p *pool) Connect(context.Context) (driver.Conn, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.next++
	return &session{p: p, id: p.next}, nil
}
func (s *session) Prepare(string) (driver.Stmt, error) { return nil, errors.New("no prepare") }
func (s *session) Begin() (driver.Tx, error)           { return nil, errors.New("explicit RR BeginTx required") }
func (s *session) BeginTx(ctx context.Context, o driver.TxOptions) (driver.Tx, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	s.p.mu.Lock()
	defer s.p.mu.Unlock()
	if s.active || s.closed || o.Isolation != driver.IsolationLevel(sql.LevelRepeatableRead) || o.ReadOnly {
		return nil, errors.New("invalid model transaction")
	}
	s.active = true
	return &transaction{s}, nil
}
func (s *session) Close() error {
	s.p.mu.Lock()
	defer s.p.mu.Unlock()
	if !s.closed {
		s.closed = true
		s.locked = false
		s.active = false
		s.p.closed++
	}
	return nil
}
func (s *session) ResetSession(context.Context) error {
	s.p.mu.Lock()
	defer s.p.mu.Unlock()
	s.p.resets++
	if s.closed {
		return driver.ErrBadConn
	}
	return nil
}
func (s *session) IsValid() bool { s.p.mu.Lock(); defer s.p.mu.Unlock(); return !s.closed }
func (s *session) ExecContext(ctx context.Context, q string, a []driver.NamedValue) (driver.Result, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	s.p.mu.Lock()
	defer s.p.mu.Unlock()
	if len(a) != 0 || s.closed {
		return nil, errors.New("invalid model query")
	}
	switch q {
	case lockSQL:
		s.locked = true
	case unlockSQL:
		s.locked = false
	default:
		return nil, errors.New("unmodeled SQL")
	}
	return driver.RowsAffected(0), nil
}

type modelRows struct {
	values []driver.Value
	done   bool
}

func (*modelRows) Columns() []string { return []string{"id", "locked", "active", "committed"} }
func (*modelRows) Close() error      { return nil }
func (r *modelRows) Next(out []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	copy(out, r.values)
	return nil
}
func (s *session) QueryContext(ctx context.Context, q string, a []driver.NamedValue) (driver.Rows, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	s.p.mu.Lock()
	defer s.p.mu.Unlock()
	if q != stateSQL || len(a) != 0 || s.closed {
		return nil, errors.New("unmodeled query")
	}
	return &modelRows{values: []driver.Value{s.id, s.locked, s.active, s.committed}}, nil
}

type transaction struct{ s *session }

func (t *transaction) Commit() error {
	t.s.p.mu.Lock()
	defer t.s.p.mu.Unlock()
	t.s.active = false
	t.s.committed = true
	return t.s.commitErr
}
func (t *transaction) Rollback() error {
	t.s.p.mu.Lock()
	defer t.s.p.mu.Unlock()
	t.s.active = false
	select {
	case t.s.p.rolled <- struct{}{}:
	default:
	}
	return nil
}
func setup(t *testing.T) (*sql.DB, *pool) {
	t.Helper()
	p := &pool{rolled: make(chan struct{}, 1)}
	db := sql.OpenDB(p)
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	t.Cleanup(func() {
		if e := db.Close(); e != nil {
			t.Error(e)
		}
	})
	return db, p
}

type queryRow interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}
type snapshot struct {
	id                        int64
	locked, active, committed bool
}

func state(t *testing.T, q queryRow) snapshot {
	t.Helper()
	var s snapshot
	if e := q.QueryRowContext(context.Background(), stateSQL).Scan(&s.id, &s.locked, &s.active, &s.committed); e != nil {
		t.Fatal(e)
	}
	return s
}
func begin(t *testing.T, q interface {
	BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
}, ctx context.Context) *sql.Tx {
	t.Helper()
	tx, e := q.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead})
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { tx.Rollback() })
	return tx
}
func exec(t *testing.T, q interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}, text string) {
	t.Helper()
	if _, e := q.ExecContext(context.Background(), text); e != nil {
		t.Fatal(e)
	}
}
func own(t *testing.T, db *sql.DB) *sql.Conn {
	t.Helper()
	c, e := db.Conn(context.Background())
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { c.Close() })
	return c
}
func discard(t *testing.T, c *sql.Conn) {
	t.Helper()
	if e := c.Raw(func(any) error { return driver.ErrBadConn }); !errors.Is(e, driver.ErrBadConn) {
		t.Fatal("discard did not surface ErrBadConn", e)
	}
}

func TestTxOnlyCommitReturnsLockedSessionToPool(t *testing.T) {
	db, p := setup(t)
	tx := begin(t, db, context.Background())
	exec(t, tx, lockSQL)
	before := state(t, tx)
	if e := tx.Commit(); e != nil {
		t.Fatal(e)
	}
	if _, e := tx.ExecContext(context.Background(), unlockSQL); !errors.Is(e, sql.ErrTxDone) {
		t.Fatal("post-commit Tx was usable", e)
	}
	after := state(t, db)
	if after.id != before.id || !after.locked || after.active || !after.committed || p.resets == 0 {
		t.Fatal("expected session lock to survive commit and pool reset", before, after, p.resets)
	}
	exec(t, db, unlockSQL) // Controlled single-client model cleanup only.
	t.Log("MODEL tx_only_pool_reused_locked_session=yes post_commit_tx_unlock=ErrTxDone")
}
func TestDedicatedConnSpansCommitAndUnlock(t *testing.T) {
	db, _ := setup(t)
	c := own(t, db)
	tx := begin(t, c, context.Background())
	exec(t, tx, lockSQL)
	before := state(t, tx)
	if e := tx.Commit(); e != nil {
		t.Fatal(e)
	}
	if got := state(t, c); got.id != before.id || !got.locked || got.active {
		t.Fatal("dedicated connection lost commit ownership", got)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	other, e := db.Conn(ctx)
	if other != nil {
		other.Close()
	}
	if !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal("session returned to pool before explicit close", e)
	}
	exec(t, c, unlockSQL)
	if e = c.Close(); e != nil {
		t.Fatal(e)
	}
	after := state(t, db)
	if after.id != before.id || after.locked || after.active || !after.committed {
		t.Fatal("session not safely reusable after unlock", after)
	}
	t.Log("MODEL owned_conn_reserved_through_commit=yes unlock_before_pool_return=yes")
}
func TestRollbackDoesNotReleaseSessionLock(t *testing.T) {
	db, _ := setup(t)
	c := own(t, db)
	tx := begin(t, c, context.Background())
	exec(t, tx, lockSQL)
	if e := tx.Rollback(); e != nil {
		t.Fatal(e)
	}
	after := state(t, c)
	if !after.locked || after.active || after.committed {
		t.Fatal("rollback confused with session unlock", after)
	}
	exec(t, c, unlockSQL)
	t.Log("MODEL rollback_retains_explicit_session_lock=yes")
}
func TestConnCloseAloneReturnsLockedSession(t *testing.T) {
	db, p := setup(t)
	c := own(t, db)
	exec(t, c, lockSQL)
	before := state(t, c)
	if e := c.Close(); e != nil {
		t.Fatal(e)
	}
	again := own(t, db)
	after := state(t, again)
	if after.id != before.id || !after.locked {
		t.Fatal("Close unexpectedly disconnected/reset model session", after)
	}
	discard(t, again)
	fresh := state(t, db)
	if fresh.id == after.id || fresh.locked || p.closed != 1 {
		t.Fatal("discard failed to force physical close", fresh, p.closed)
	}
	t.Log("MODEL conn_close_is_pool_return=yes raw_ErrBadConn_discards_session=yes")
}
func TestUnknownCommitDiscardsWithoutClaimingRollback(t *testing.T) {
	db, p := setup(t)
	c := own(t, db)
	if e := c.Raw(func(raw any) error { raw.(*session).commitErr = errUnknown; return nil }); e != nil {
		t.Fatal(e)
	}
	tx := begin(t, c, context.Background())
	exec(t, tx, lockSQL)
	if e := tx.Commit(); !errors.Is(e, errUnknown) {
		t.Fatal("lost ambiguous response", e)
	}
	if e := tx.Rollback(); !errors.Is(e, sql.ErrTxDone) {
		t.Fatal("unknown commit still had rollback capability", e)
	}
	after := state(t, c)
	if !after.locked || !after.committed || after.active {
		t.Fatal("model must retain the possible-commit branch", after)
	}
	discard(t, c)
	fresh := state(t, db)
	if fresh.id == after.id || fresh.locked || p.closed != 1 {
		t.Fatal("ambiguous session reused", fresh)
	}
	t.Log("MODEL unknown_commit_may_have_committed=yes no_rollback_claim=yes physical_discard=yes")
}
func TestCanceledTxCanRetainSessionUntilDiscard(t *testing.T) {
	db, p := setup(t)
	c := own(t, db)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tx := begin(t, c, ctx)
	exec(t, tx, lockSQL)
	cancel()
	select {
	case <-p.rolled:
	case <-time.After(5 * time.Second):
		t.Fatal("Go did not roll back canceled transaction")
	}
	if _, e := tx.ExecContext(context.Background(), unlockSQL); !errors.Is(e, sql.ErrTxDone) {
		t.Fatal("canceled Tx unexpectedly usable", e)
	}
	after := state(t, c)
	if !after.locked || after.active {
		t.Fatal("unexpected canceled session state", after)
	}
	discard(t, c)
	fresh := state(t, db)
	if fresh.id == after.id || fresh.locked {
		t.Fatal("canceled explicit lock leaked to next borrower", fresh)
	}
	t.Log("MODEL canceled_tx_rollback_does_not_unlock_session=yes physical_discard=yes")
}
