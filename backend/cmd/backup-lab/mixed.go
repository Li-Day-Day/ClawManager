package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"time"

	"clawreef/internal/systembackup/artifact"
	"clawreef/internal/systembackup/domain"
	"clawreef/internal/systembackup/staging"
	"clawreef/internal/systembackup/worker"
	"golang.org/x/crypto/bcrypt"
)

var mixedModes = []string{"openclaw-lite", "openclaw-pro", "hermes-lite", "hermes-pro", "opencode-lite", "opencode-pro", "deepseek-harness-lite", "deepseek-harness-pro"}

const mixedTarget = "cm_drill_backup_lab"

func mixedPolicies(root string) (map[string]worker.RuntimePolicy, error) {
	var cases []matrixCase
	if e := readJSON(filepath.Join(root, "matrix-cases.json"), &cases); e != nil {
		return nil, e
	}
	if len(cases) != len(mixedModes) {
		return nil, errLab
	}
	policies := map[string]worker.RuntimePolicy{}
	for i, m := range cases {
		p := matrixPolicy(m)
		if m.Name != mixedModes[i] || m.Name != m.Type+"-"+m.Mode || p.Validate() != nil {
			return nil, errLab
		}
		policies[fmt.Sprintf("instance-%d", i+7)] = p
	}
	return policies, nil
}

// Target DDL is assembled only from this harness's fixed fixture statements.
// It is never read from an archive or a source database.
func prepareMixed(root string, c config, fixture string, adminHash, userHash []byte) (string, error) {
	var ddl strings.Builder
	for _, line := range strings.Split(fixture, "\n") {
		if strings.HasPrefix(line, "CREATE TABLE ") {
			ddl.WriteString(line + "\n")
		}
	}
	if ddl.Len() == 0 {
		return "", errLab
	}
	var source strings.Builder
	source.WriteString("CREATE DATABASE " + databaseName + ";\nUSE " + databaseName + ";\n" + ddl.String())
	fmt.Fprintf(&source, "INSERT INTO users VALUES(1,'admin','%s','admin',1),(4,'lab-alice','%s','user',1),(5,'lab-bob','%s','user',1),(6,'lab-disabled','%s','user',0);\n", adminHash, userHash, userHash, userHash)
	source.WriteString("INSERT INTO user_quotas VALUES(12,4,0.1250000000000000001),(13,5,99.9999999999999999999),(14,6,0.0000000000000000001);\n")
	for i, name := range suiteModes(c.Suite) {
		split := strings.LastIndex(name, "-")
		typ, mode := name[:split], name[split+1:]
		if c.Suite == "workbuddy-identity" {
			typ = "workbuddy"
			mode = "lite"
		}
		backend := "gateway"
		if mode == "pro" {
			backend = "desktop"
		}
		id, owner := i+7, 4+i%3
		fmt.Fprintf(&source, "INSERT INTO instances VALUES(%d,%d,'%s','%s','%s','linux','linux','running','/source/%s','fake-access-%d','fake-bootstrap-%d','synthetic-old-pod');\n", id, owner, typ, backend, mode, name, id, id)
		fmt.Fprintf(&source, "INSERT INTO instance_desired_state VALUES(%d,%d,'running','restart');\nINSERT INTO backup_schedules VALUES(%d,%d,'0 * * * *',1);\n", id, id, id, id)
	}
	if c.Suite == "workbuddy-identity" {
		source.WriteString(identityLabDDL)
		source.WriteString("INSERT INTO workbuddy_linux_identities VALUES(7,4,21000,'2020-01-01 00:00:00.000000'),(8,5,21001,'2020-01-01 00:00:01.000000'),(987,998,21010,'2020-01-01 00:00:02.000000'),(988,4,21011,'2020-01-01 00:00:03.000000');\nINSERT INTO workbuddy_linux_identity_allocator VALUES(1,23000);\n")
	}
	fmt.Fprintf(&source, "CREATE USER 'lab_capture'@'%%' IDENTIFIED BY '%s' REQUIRE SSL;\nGRANT SELECT ON %s.* TO 'lab_capture'@'%%';\n", c.DatabasePassword, databaseName)
	bootstrap, e := bcrypt.GenerateFromPassword([]byte(c.BootstrapPassword), bcrypt.DefaultCost)
	if e != nil {
		return "", e
	}
	target := "CREATE DATABASE " + mixedTarget + ";\nUSE " + mixedTarget + ";\n" + ddl.String() + fmt.Sprintf("INSERT INTO users VALUES(999,'admin','%s','admin',1);\nINSERT INTO user_quotas VALUES(999,999,1);\n", bootstrap)
	if c.Suite == "workbuddy-identity" {
		target += identityLabDDL + "INSERT INTO workbuddy_linux_identity_allocator VALUES(1,10000);\n"
	}
	target += fmt.Sprintf("CREATE USER 'lab_restore'@'%%' IDENTIFIED BY '%s' REQUIRE SSL;\nGRANT SELECT,INSERT,DELETE ON %s.* TO 'lab_restore'@'%%';\nCREATE USER 'lab_verify'@'%%' IDENTIFIED BY '%s' REQUIRE SSL;\nGRANT SELECT ON %s.* TO 'lab_verify'@'%%';\n", c.RestorePassword, mixedTarget, c.VerifyPassword, mixedTarget)
	if c.Suite == "workbuddy-identity" {
		target += "GRANT UPDATE ON " + mixedTarget + ".workbuddy_linux_identity_allocator TO 'lab_restore'@'%';\n"
	}
	if e = os.Mkdir(filepath.Join(root, "target-init"), 0700); e != nil {
		return "", e
	}
	if e = os.WriteFile(filepath.Join(root, "target-init/001-fixture.sql"), []byte(target), 0600); e != nil {
		return "", e
	}
	verify := c
	verify.Signer = nil
	verify.RestorePassword = ""
	verify.DatabasePassword = ""
	if e = os.Mkdir(filepath.Join(root, "verify-credentials"), 0700); e != nil {
		return "", e
	}
	if e = writeJSON(filepath.Join(root, "verify-credentials/lab.json"), verify); e != nil {
		return "", e
	}
	return source.String(), nil
}

func mixedSnapshot(ctx context.Context, c config, d artifact.Directory) (artifact.Bundle, domain.Snapshot, error) {
	b, e := d.Read(ctx, c.ID)
	if e != nil {
		return b, domain.Snapshot{}, e
	}
	if b.Users != 4 || b.Instances != len(suiteModes(c.Suite)) {
		return b, domain.Snapshot{}, errLab
	}
	for _, part := range b.Parts {
		if part.ID == "database" {
			key, e := d.Keys.Unwrap(ctx, part.Binding, part.Key)
			if e != nil {
				return b, domain.Snapshot{}, e
			}
			defer clear(key)
			f, e := d.Root.Open(part.Receipt.Name)
			if e != nil {
				return b, domain.Snapshot{}, e
			}
			defer f.Close()
			var snapshot domain.Snapshot
			e = staging.ConsumeCompressed(ctx, f, key, part.Binding, 16<<20, 16<<20, func(src io.Reader) error {
				var err error
				snapshot, err = domain.Decode(src, domain.Limits{MaxRows: 1000, MaxBytes: 16 << 20})
				return err
			})
			return b, snapshot, e
		}
	}
	return b, domain.Snapshot{}, errLab
}

func mixedPlan(ctx context.Context, db *sql.DB, s domain.Snapshot, suite string) (domain.RestorePlan, domain.Policy, error) {
	p := domain.Policy{Placements: map[string]domain.Placement{}}
	if suite == "workbuddy-identity" {
		p.WorkBuddy = domain.WorkBuddyUIDSchema()
	}
	for i := range suiteModes(suite) {
		id := strconv.Itoa(i + 7)
		p.Placements[id] = domain.Placement{Workspace: "/restored/instance-" + id, MountPath: "/restored/instance-" + id, Namespace: "synthetic-backup-lab"}
	}
	tx, e := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if e != nil {
		return domain.RestorePlan{}, p, e
	}
	defer tx.Rollback()
	catalog, e := domain.Catalog(ctx, tx)
	if e != nil {
		return domain.RestorePlan{}, p, e
	}
	plan, e := domain.Normalize(ctx, s, catalog, p)
	return plan, p, e
}

func runMixed(ctx context.Context, root, action string, c config, d artifact.Directory) error {
	if (c.Suite != "mixed" && c.Suite != "workbuddy-identity") || (action == "mixed-restore" && c.RestorePassword == "") || c.VerifyPassword == "" || c.BootstrapPassword == "" {
		return errLab
	}
	b, snapshot, e := mixedSnapshot(ctx, c, d)
	if e != nil {
		return e
	}
	policies, e := mixedPolicies(root)
	if c.Suite == "workbuddy-identity" {
		policies, e = identityPolicies(root)
	}
	if e != nil {
		return e
	}
	for _, part := range b.Parts {
		if part.ID != "database" {
			p, ok := policies[part.ID]
			if !ok || policyHash(p) != part.Binding.CaptureContextHash {
				return errLab
			}
		}
	}
	var expected evidence
	if e = readJSON(filepath.Join(root, "expected.json"), &expected); e != nil {
		return e
	}
	raw, e := json.Marshal(snapshot)
	if e != nil || mac(c.Wrapping, raw) != expected.DatabaseMAC {
		return errLab
	}
	var identity struct{ ID, TargetUUID, SourceUUID string }
	if e = readJSON(filepath.Join(root, "target-identity.json"), &identity); e != nil {
		return e
	}
	if identity.ID != c.ID || identity.TargetUUID == "" || identity.SourceUUID == "" || identity.TargetUUID == identity.SourceUUID {
		return errLab
	}
	ca, e := os.ReadFile(filepath.Join(root, "tls/ca.pem"))
	if e != nil {
		return e
	}
	spec := worker.DatabaseSpec{Address: "mysql:3306", Name: mixedTarget, ServerUUID: identity.TargetUUID, TLSServerName: "mysql", RootCA: ca}
	credential := worker.DatabaseCredential{Username: "lab_restore", Password: []byte(c.RestorePassword)}
	if action == "mixed-verify" {
		credential = worker.DatabaseCredential{Username: "lab_verify", Password: []byte(c.VerifyPassword)}
	}
	db, e := worker.OpenDatabase(&spec, &credential)
	if e != nil {
		return e
	}
	defer db.Close()
	target := domain.DrillTarget{Database: mixedTarget, ServerUUID: identity.TargetUUID, CheckIsolation: func(ctx context.Context) error {
		var now struct{ ID, TargetUUID, SourceUUID string }
		if e := readJSON(filepath.Join(root, "target-identity.json"), &now); e != nil || now != identity {
			return errLab
		}
		return ctx.Err()
	}}
	plan, policy, e := mixedPlan(ctx, db, snapshot, c.Suite)
	if e != nil {
		return e
	}
	if action == "mixed-restore" {
		if c.Suite == "workbuddy-identity" {
			if e = identityNegativeChecks(ctx, db, target, snapshot, policy); e != nil {
				return e
			}
		} else {
			// Missing WorkBuddy identity material must reject before touching the
			// bootstrap admin. This is an explicit negative case, not an adapter.
			var negative domain.Snapshot
			if json.Unmarshal(raw, &negative) != nil {
				return errLab
			}
			for i := range negative.Tables {
				if negative.Tables[i].Name == "instances" {
					negative.Tables[i].Rows[0]["type"] = domain.Text("workbuddy")
				}
			}
			if _, e = domain.RestoreDrill(ctx, db, target, negative, policy); !errors.Is(e, domain.ErrSchema) {
				return fmt.Errorf("WorkBuddy missing-schema rejection: %w", errLab)
			}
			var n int
			if db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE id=999 AND username='admin'").Scan(&n) != nil || n != 1 {
				return errLab
			}
		}
		if _, e = domain.RestoreDrill(ctx, db, target, snapshot, policy); e != nil {
			return fmt.Errorf("mixed database restore: %w", e)
		}
		if _, e = domain.RestoreDrill(ctx, db, target, snapshot, policy); !errors.Is(e, domain.ErrNotEmpty) {
			return fmt.Errorf("nonempty-target rejection: %w", errLab)
		}
		files := 0
		for _, part := range b.Parts {
			if part.ID == "database" {
				continue
			}
			key, e := d.Keys.Unwrap(ctx, part.Binding, part.Key)
			if e != nil {
				return e
			}
			path := filepath.Join("/restored", part.ID)
			if e = os.Mkdir(path, 0700); e != nil {
				clear(key)
				return e
			}
			dst, e := os.OpenRoot(path)
			if e != nil {
				clear(key)
				return e
			}
			p := policies[part.ID]
			r := worker.Request{Version: worker.Version, Operation: "restore-workspace", Binding: part.Binding, Receipt: part.Receipt, Deadline: time.Now().Add(5 * time.Minute), MaxFiles: 100000, MaxFileBytes: 4 << 30, MaxArchiveBytes: 5 << 30, MaxCompressedBytes: 4 << 30, PolicyVersion: p.Version, Files: p.Files, RuntimePolicy: &p}
			if c.Suite == "workbuddy-identity" {
				want, err := domain.WorkBuddyUIDForInstance(plan.Data, strings.TrimPrefix(part.ID, "instance-"))
				if err != nil {
					dst.Close()
					clear(key)
					return err
				}
				r.WorkBuddyIdentity = &want
			}
			_, e = worker.Run(ctx, r, worker.Environment{Workspace: dst, Staging: d.Root, Key: key, PreserveOwner: true, Check: func(ctx context.Context, _ string, r worker.Request) error {
				if r.Binding.BackupID != c.ID {
					return errLab
				}
				return target.CheckIsolation(ctx)
			}})
			dst.Close()
			clear(key)
			if e != nil {
				return fmt.Errorf("%s restore: %w", part.ID, e)
			}
			if c.Suite == "workbuddy-identity" {
				if e = verifyIdentityPath(plan.Data, part.ID, path); e != nil {
					return e
				}
			}
			actual, e := fileMACs(path, c.Wrapping)
			if e != nil || !reflect.DeepEqual(actual, expected.Files[part.ID]) {
				return errLab
			}
			files += len(actual)
		}
		if c.Suite == "workbuddy-identity" {
			if e = identityAllocationProbe(ctx, db); e != nil {
				return e
			}
		}
		return writeJSON(filepath.Join(root, "mixed-restore-result.json"), map[string]any{"users": plan.Users, "instances": plan.Instances, "files": files, "bootstrap_admin_replaced": true, "negative_cases_passed": true, "nonempty_target_rejected": true, "source_independent": true, "all_restored_instances_stopped": true, "all_schedules_disabled": true, "kubernetes_verified": false, "workbuddy_identity_adapter": c.Suite == "workbuddy-identity"})
	}
	if e = domain.VerifyDrill(ctx, db, target, plan); e != nil {
		return fmt.Errorf("independent SELECT-only verification: %w", e)
	}
	rows, e := db.QueryContext(ctx, "SELECT username,password_hash,is_active FROM users ORDER BY id")
	if e != nil {
		return e
	}
	logins := 0
	for rows.Next() {
		var name, hash string
		var active int
		if rows.Scan(&name, &hash, &active) != nil {
			rows.Close()
			return errLab
		}
		password := c.UserPassword
		if name == "admin" {
			password = c.AdminPassword
			if bcrypt.CompareHashAndPassword([]byte(hash), []byte(c.BootstrapPassword)) == nil {
				rows.Close()
				return errLab
			}
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil || (name == "lab-disabled" && active != 0) {
			rows.Close()
			return errLab
		}
		logins++
	}
	if e = rows.Err(); e != nil {
		rows.Close()
		return e
	}
	rows.Close()
	if logins != 4 {
		return errLab
	}
	for _, part := range b.Parts {
		if part.ID == "database" {
			continue
		}
		actual, e := fileMACs(filepath.Join("/restored", part.ID), c.Wrapping)
		if e != nil || !reflect.DeepEqual(actual, expected.Files[part.ID]) {
			return errLab
		}
		if c.Suite == "workbuddy-identity" {
			if e = verifyIdentityPath(plan.Data, part.ID, filepath.Join("/restored", part.ID)); e != nil {
				return e
			}
		}
	}
	// Explicit behavioral checks supplement VerifyDrill's complete row equality.
	var unsafe int
	if db.QueryRowContext(ctx, "SELECT (SELECT COUNT(*) FROM instances WHERE status<>'stopped' OR access_token IS NOT NULL OR agent_bootstrap_token IS NOT NULL OR pod_name IS NOT NULL)+(SELECT COUNT(*) FROM instance_desired_state WHERE desired_power_state<>'stopped' OR desired_runtime_action IS NOT NULL)+(SELECT COUNT(*) FROM backup_schedules WHERE is_active<>0)").Scan(&unsafe) != nil || unsafe != 0 {
		return errLab
	}
	return writeJSON(filepath.Join(root, "mixed-verify-result.json"), map[string]any{"users": plan.Users, "instances": plan.Instances, "independent_select_only_verifier": true, "all_normalized_rows_equal": true, "password_hashes_verified": logins, "old_bootstrap_password_rejected": true, "disabled_user_preserved": true, "exact_decimal_quotas_and_owner_foreign_keys_verified": true, "tasks_preserved_but_disabled": true, "credentials_and_runtime_handles_cleared": true, "workspace_file_macs_equal": true, "workbuddy_identity_adapter": c.Suite == "workbuddy-identity", "kubernetes_verified": false, "runtime_agent_lifecycle_verified": false})
}
