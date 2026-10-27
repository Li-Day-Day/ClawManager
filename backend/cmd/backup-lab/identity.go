package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"clawreef/internal/systembackup/artifact"
	"clawreef/internal/systembackup/domain"
	"clawreef/internal/systembackup/worker"
	"clawreef/internal/systembackup/workspace"
)

// These fixed statements reproduce the read-only observed DDL; no source SQL
// is executed. All rows, including deleted instance/user reservations, are fake.
const identityLabDDL = `
ALTER TABLE instances ADD workbuddy_storage_identity VARCHAR(512) NULL;
CREATE TABLE workbuddy_linux_identities (instance_id int NOT NULL, user_id int NOT NULL, linux_uid int NOT NULL, created_at datetime(6) NOT NULL, PRIMARY KEY(instance_id), UNIQUE KEY linux_uid(linux_uid)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE workbuddy_linux_identity_allocator (id int NOT NULL, next_uid int NOT NULL, PRIMARY KEY(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`

func identityPolicies(root string) (map[string]worker.RuntimePolicy, error) {
	var m matrixCase
	if e := readJSON(filepath.Join(root, "case.json"), &m); e != nil {
		return nil, e
	}
	if m.Name != "workbuddy-lite" || m.Type != "workbuddy" || m.Mode != "lite" {
		return nil, errLab
	}
	p := matrixPolicy(m)
	p.Version = "synthetic-workbuddy-identity.v1"
	p.WorkspaceLayout = workspace.WorkBuddyInstanceWineV1
	p.Files[0].Path = "home/.backup-lab-fixtures/policy.json"
	if p.Validate() != nil {
		return nil, errLab
	}
	return map[string]worker.RuntimePolicy{"instance-7": p, "instance-8": p}, nil
}

func runIdentity(ctx context.Context, root, action string, c config, d artifact.Directory) error {
	if c.Suite != "workbuddy-identity" {
		return errLab
	}
	return runMixed(ctx, root, strings.Replace(action, "identity-", "mixed-", 1), c, d)
}

func verifyIdentityPath(s domain.Snapshot, part, path string) error {
	want, e := domain.WorkBuddyUIDForInstance(s, strings.TrimPrefix(part, "instance-"))
	if e != nil {
		return e
	}
	r, e := os.OpenRoot(path)
	if e != nil {
		return e
	}
	defer r.Close()
	return domain.VerifyWorkBuddyUIDWorkspace(r, want)
}

func identityNegativeChecks(ctx context.Context, db *sql.DB, target domain.DrillTarget, s domain.Snapshot, p domain.Policy) error {
	if e := domain.PreflightRestoreDrill(ctx, db, target, s, p); e != nil {
		return fmt.Errorf("read-only restore preflight: %w", e)
	}
	raw, e := json.Marshal(s)
	if e != nil {
		return e
	}
	defer clear(raw)
	var bad domain.Snapshot
	if json.Unmarshal(raw, &bad) != nil {
		return errLab
	}
	for i := range bad.Tables {
		if bad.Tables[i].Name == "workbuddy_linux_identity_allocator" {
			bad.Tables[i].Rows[0]["next_uid"] = domain.Text("21011")
		}
	}
	if e = domain.PreflightRestoreDrill(ctx, db, target, bad, p); !errors.Is(e, domain.ErrData) {
		return fmt.Errorf("preflight accepted regressed allocator: %w", errLab)
	}
	if _, e = domain.RestoreDrill(ctx, db, target, bad, p); !errors.Is(e, domain.ErrData) {
		return fmt.Errorf("regressed allocator was not rejected: %w", errLab)
	}
	fail := errors.New("synthetic evidence sink failure")
	called := false
	if _, e = domain.RestoreDrillWithEvidence(ctx, db, target, s, p, func(context.Context, domain.RestorePlan) error { called = true; return fail }); e == nil || !called {
		return fmt.Errorf("failed evidence did not rollback: %w", errLab)
	}
	var n int
	if db.QueryRowContext(ctx, "SELECT (SELECT COUNT(*) FROM users WHERE id=999 AND username='admin')+(SELECT COUNT(*) FROM workbuddy_linux_identity_allocator WHERE id=1 AND next_uid=10000)-(SELECT COUNT(*) FROM workbuddy_linux_identities)").Scan(&n) != nil || n != 2 {
		return fmt.Errorf("bootstrap/allocator rollback: %w", errLab)
	}
	return nil
}

// Exercise the observed allocator contract in a disposable target transaction.
// This is a rollback-only collision probe, not the production allocator code.
func identityAllocationProbe(ctx context.Context, db *sql.DB) error {
	tx, e := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var next int
	if tx.QueryRowContext(ctx, "SELECT next_uid FROM workbuddy_linux_identity_allocator WHERE id=1 FOR UPDATE").Scan(&next) != nil || next != 23000 {
		return errLab
	}
	if _, e = tx.ExecContext(ctx, "INSERT INTO workbuddy_linux_identities VALUES(2000000000,4,?,'2020-01-02 00:00:00.000000')", next); e != nil {
		return e
	}
	if _, e = tx.ExecContext(ctx, "UPDATE workbuddy_linux_identity_allocator SET next_uid=? WHERE id=1", next+1); e != nil {
		return e
	}
	if _, e = tx.ExecContext(ctx, "INSERT INTO workbuddy_linux_identities VALUES(2000000001,4,21010,'2020-01-02 00:00:00.000000')"); e == nil {
		return fmt.Errorf("historical UID reused: %w", errLab)
	}
	return tx.Rollback()
}
