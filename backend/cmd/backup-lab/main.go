// backup-lab is a synthetic, fixed-endpoint Docker data-plane exercise. It is
// deliberately separate from controller admission and cannot certify K8s or
// runtime-agent stop proofs. No production connection arguments are accepted.
package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"io"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"clawreef/internal/systembackup/artifact"
	"clawreef/internal/systembackup/domain"
	"clawreef/internal/systembackup/staging"
	"clawreef/internal/systembackup/worker"
	"clawreef/internal/systembackup/workspace"
	"golang.org/x/crypto/bcrypt"
)

const databaseName = "cm_source_backup_lab"

var errLab = errors.New("isolated backup lab prerequisite or verification failed")

type config struct {
	Version, ID, DatabasePassword, AdminPassword, UserPassword string
	BootstrapPassword, RestorePassword, VerifyPassword         string
	Suite                                                      string
	Wrapping, Signer, Public                                   []byte
}
type evidence struct {
	DatabaseMAC string
	Files       map[string]map[string]string
}
type report struct {
	ID                                                                                                        string `json:"id"`
	Users, Instances, Tables, Rows, Files                                                                     int
	DatabaseTLS, SourceReadOnly, DatabaseUnchanged, SourceIndependent, PasswordHashesVerified, TamperRejected bool
	KubernetesControllerVerified, RuntimeAgentLifecycleVerified                                               bool
	WorkBuddyIdentityMigrationVerified                                                                        bool
	Scope                                                                                                     string
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func writeJSON(path string, v any) error {
	b, e := json.MarshalIndent(v, "", "  ")
	if e != nil {
		return e
	}
	return os.WriteFile(path, b, 0600)
}
func readJSON(path string, v any) error {
	b, e := os.ReadFile(path)
	if e != nil {
		return e
	}
	defer clear(b)
	return json.Unmarshal(b, v)
}
func main() {
	f := flag.NewFlagSet("backup-lab", flag.ExitOnError)
	root := f.String("root", "", "new local lab directory or /lab inside isolated container")
	action := f.String("action", "", "prepare, capture, verify, matrix-capture, matrix-restore, mixed-restore, mixed-verify, identity-restore, identity-verify, probe-workbuddy-wine, capture-workbuddy-wine or restore-workbuddy-wine")
	suite := f.String("suite", "openclaw", "prepare fixture: openclaw, workbuddy, mixed or workbuddy-identity")
	f.Parse(os.Args[1:])
	var e error
	if f.NArg() != 0 || !filepath.IsAbs(*root) {
		e = errLab
	} else {
		switch *action {
		case "prepare":
			e = prepare(*root, *suite)
		case "capture", "verify", "mixed-restore", "mixed-verify", "identity-restore", "identity-verify":
			if runtime.GOOS != "linux" || filepath.Clean(*root) != "/lab" {
				e = errLab
			} else {
				e = run(*root, *action)
			}
		case "probe-workbuddy-wine":
			if runtime.GOOS != "linux" || filepath.Clean(*root) != "/lab" {
				e = errLab
			} else {
				e = probeWorkBuddyWine(*root)
			}
		case "capture-workbuddy-wine", "restore-workbuddy-wine":
			if runtime.GOOS != "linux" || filepath.Clean(*root) != "/lab" {
				e = errLab
			} else {
				e = runWine(*root, *action)
			}
		case "matrix-capture", "matrix-restore":
			if runtime.GOOS != "linux" || filepath.Clean(*root) != "/lab" {
				e = errLab
			} else {
				e = runMatrixWorkspace(*root, *action)
			}
		default:
			e = errLab
		}
	}
	if e != nil {
		fmt.Fprintln(os.Stderr, "backup lab failed:", e)
		os.Exit(1)
	}
}

// A negative compatibility probe, not an exclusion policy or restore adapter.
// Use an actual freshly initialized Wine prefix in a disposable Linux tmpfs.
func probeWorkBuddyWine(root string) error {
	const source = "/source/workbuddy-wine"
	var colonNames, absoluteLinks []string
	if e := filepath.WalkDir(source, func(path string, d os.DirEntry, e error) error {
		if e != nil {
			return e
		}
		rel, e := filepath.Rel(source, path)
		if e != nil {
			return e
		}
		if strings.Contains(d.Name(), ":") {
			colonNames = append(colonNames, rel)
		}
		if d.Type()&os.ModeSymlink != 0 {
			link, e := os.Readlink(path)
			if e != nil {
				return e
			}
			if filepath.IsAbs(link) {
				absoluteLinks = append(absoluteLinks, rel)
			}
		}
		return nil
	}); e != nil {
		return e
	}
	if len(colonNames) == 0 || len(absoluteLinks) == 0 {
		return errLab
	}
	src, e := os.OpenRoot(source)
	if e != nil {
		return e
	}
	defer src.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	_, e = workspace.Archive(ctx, src, io.Discard, workspace.Limits{MaxFiles: 100000, MaxBytes: 4 << 30})
	if !errors.Is(e, workspace.ErrArchive) {
		return fmt.Errorf("Wine layout rejection not observed: %w", errLab)
	}
	r := map[string]any{"actual_wine_prefix_initialized": true, "archive_rejected": true, "colon_paths": colonNames, "absolute_link_paths": absoluteLinks, "full_workbuddy_backup_ready": false, "note": "Generic archive correctly rejects Wine; run the separate opt-in workbuddy-lite-wine.v1 round-trip test. This negative probe does not certify the adapter."}
	if e = writeJSON(filepath.Join(root, "workbuddy-wine-result.json"), r); e != nil {
		return e
	}
	return json.NewEncoder(os.Stdout).Encode(r)
}
func suiteModes(suite string) []string {
	if suite == "mixed" {
		return mixedModes
	}
	if suite == "workbuddy" || suite == "workbuddy-identity" {
		return []string{"workbuddy-a", "workbuddy-b"}
	}
	return []string{"lite", "pro"}
}
func prepare(root, suite string) error {
	if suite != "openclaw" && suite != "workbuddy" && suite != "mixed" && suite != "workbuddy-identity" {
		return errLab
	}
	if _, e := os.Stat(root); !os.IsNotExist(e) {
		return errLab
	}
	if e := os.MkdirAll(root, 0700); e != nil {
		return e
	}
	if suite == "workbuddy-identity" {
		if e := writeJSON(filepath.Join(root, "workbuddy-uid-contract.json"), domain.WorkBuddyUIDSchema()); e != nil {
			return e
		}
	}
	for _, d := range []string{"tls", "init", "credentials", "staging", "artifacts", "verification", "source/lite", "source/pro", "bin"} {
		if e := os.MkdirAll(filepath.Join(root, d), 0700); e != nil {
			return e
		}
	}
	public, private, e := ed25519.GenerateKey(rand.Reader)
	if e != nil {
		return e
	}
	c := config{Version: "isolated-backup-lab.v1", ID: "lab-" + randomHex(8), DatabasePassword: randomHex(24), AdminPassword: randomHex(24), UserPassword: randomHex(24), Wrapping: make([]byte, 32), Signer: private, Public: public}
	c.Suite = suite
	if suite == "mixed" || suite == "workbuddy-identity" {
		c.BootstrapPassword = randomHex(24)
		c.RestorePassword = randomHex(24)
		c.VerifyPassword = randomHex(24)
	}
	if _, e = rand.Read(c.Wrapping); e != nil {
		return e
	}
	if e = writeJSON(filepath.Join(root, "credentials/lab.json"), c); e != nil {
		return e
	}
	rootPassword := randomHex(24)
	if e = os.WriteFile(filepath.Join(root, "credentials/mysql-root"), []byte(rootPassword), 0600); e != nil {
		return e
	}
	if e = os.WriteFile(filepath.Join(root, "credentials/root.cnf"), []byte("[client]\nuser=root\npassword="+rootPassword+"\n"), 0600); e != nil {
		return e
	}
	if e = certificates(filepath.Join(root, "tls")); e != nil {
		return e
	}
	adminHash, e := bcrypt.GenerateFromPassword([]byte(c.AdminPassword), bcrypt.DefaultCost)
	if e != nil {
		return e
	}
	userHash, e := bcrypt.GenerateFromPassword([]byte(c.UserPassword), bcrypt.DefaultCost)
	if e != nil {
		return e
	}
	sql := `CREATE DATABASE cm_source_backup_lab;
USE cm_source_backup_lab;
CREATE TABLE users (id BIGINT PRIMARY KEY,username VARCHAR(64) NOT NULL,password_hash VARCHAR(255) NOT NULL,role VARCHAR(16) NOT NULL,is_active TINYINT NOT NULL) ENGINE=InnoDB;
CREATE TABLE instances (id BIGINT PRIMARY KEY,user_id BIGINT NOT NULL,type VARCHAR(32) NOT NULL,runtime_type VARCHAR(32) NOT NULL,instance_mode VARCHAR(16) NOT NULL,runtime_variant VARCHAR(16) NOT NULL,os_type VARCHAR(16) NOT NULL,status VARCHAR(16) NOT NULL,workspace_path VARCHAR(255) NOT NULL,access_token TEXT NULL,agent_bootstrap_token TEXT NULL,pod_name VARCHAR(128) NULL,FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB;
CREATE TABLE user_quotas (id BIGINT PRIMARY KEY,user_id BIGINT NOT NULL,max_cpu_cores DECIMAL(30,19) NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB;
CREATE TABLE instance_desired_state (id BIGINT PRIMARY KEY,instance_id BIGINT NOT NULL,desired_power_state VARCHAR(16) NOT NULL,desired_runtime_action VARCHAR(32) NULL,FOREIGN KEY(instance_id) REFERENCES instances(id)) ENGINE=InnoDB;
CREATE TABLE backup_schedules (id BIGINT PRIMARY KEY,instance_id BIGINT NOT NULL,cron_expression VARCHAR(64) NOT NULL,is_active TINYINT NOT NULL,FOREIGN KEY(instance_id) REFERENCES instances(id)) ENGINE=InnoDB;
INSERT INTO users VALUES(1,'admin','` + string(adminHash) + `','admin',1),(4,'lab-user','` + string(userHash) + `','user',1);
INSERT INTO instances VALUES(7,4,'openclaw','gateway','lite','linux','linux','stopped','/source/lite','synthetic-token','synthetic-bootstrap',NULL),(8,4,'openclaw','container','pro','linux','linux','stopped','/source/pro','synthetic-token','synthetic-bootstrap',NULL);
INSERT INTO user_quotas VALUES(12,4,0.1250000000000000001);
INSERT INTO instance_desired_state VALUES(2,7,'stopped',NULL),(3,8,'stopped',NULL);
INSERT INTO backup_schedules VALUES(9,7,'0 * * * *',0),(10,8,'0 * * * *',0);
CREATE USER 'lab_capture'@'%' IDENTIFIED BY '` + c.DatabasePassword + `' REQUIRE SSL;
GRANT SELECT ON cm_source_backup_lab.* TO 'lab_capture'@'%';
`
	if suite == "workbuddy" {
		sql = strings.ReplaceAll(sql, "'openclaw','gateway','lite'", "'workbuddy','gateway','lite'")
		sql = strings.ReplaceAll(sql, "'openclaw','container','pro'", "'workbuddy','gateway','lite'")
		sql = strings.ReplaceAll(sql, "'/source/lite'", "'/source/workbuddy-a'")
		sql = strings.ReplaceAll(sql, "'/source/pro'", "'/source/workbuddy-b'")
		// No guessed workbuddy_linux_identities schema is installed. This test
		// captures rows, but does not authorize identity normalization/import.
		sql += "ALTER TABLE instances ADD workbuddy_storage_identity VARCHAR(64);\nUPDATE instances SET workbuddy_storage_identity=CONCAT('synthetic-storage-',id);\n"
	}
	if suite == "mixed" || suite == "workbuddy-identity" {
		sql, e = prepareMixed(root, c, sql, adminHash, userHash)
		if e != nil {
			return e
		}
	}
	if e = os.WriteFile(filepath.Join(root, "init/001-fixture.sql"), []byte(sql), 0600); e != nil {
		return e
	}
	for _, mode := range suiteModes(suite) {
		base := filepath.Join(root, "source", mode)
		if suite == "workbuddy" || suite == "mixed" || suite == "workbuddy-identity" {
			if e = os.MkdirAll(base, 0700); e != nil {
				return e
			}
			continue
		}
		for path, data := range map[string]string{"workspace/skills/lab/SKILL.md": "# Synthetic backup test skill\nNo external commands.\n", "agents/main/sessions/backup-lab.jsonl": "{\"type\":\"message\",\"message\":{\"role\":\"user\",\"content\":\"synthetic conversation\"}}\n", "backup-fixtures/tasks.json": "{\"enabled\":false,\"prompt\":\"synthetic task\"}", "backup-fixtures/model.json": "{\"model\":\"synthetic-model\",\"apiKey\":\"synthetic-not-a-real-key\"}"} {
			full := filepath.Join(base, filepath.FromSlash(path))
			if e = os.MkdirAll(filepath.Dir(full), 0700); e != nil {
				return e
			}
			if e = os.WriteFile(full, []byte(data), 0600); e != nil {
				return e
			}
		}
	}
	fmt.Println("prepared synthetic lab", c.ID)
	return nil
}
func certificates(dir string) error {
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		return e
	}
	ca := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "ClawManager isolated backup lab CA"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(7 * 24 * time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature}
	der, e := x509.CreateCertificate(rand.Reader, ca, ca, &key.PublicKey, key)
	if e != nil {
		return e
	}
	parsed, e := x509.ParseCertificate(der)
	if e != nil {
		return e
	}
	if e = os.WriteFile(filepath.Join(dir, "ca.pem"), pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0644); e != nil {
		return e
	}
	serverKey, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		return e
	}
	server := &x509.Certificate{SerialNumber: big.NewInt(2), Subject: pkix.Name{CommonName: "mysql"}, DNSNames: []string{"mysql"}, NotBefore: ca.NotBefore, NotAfter: ca.NotAfter, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment}
	der, e = x509.CreateCertificate(rand.Reader, server, parsed, &serverKey.PublicKey, key)
	if e != nil {
		return e
	}
	if e = os.WriteFile(filepath.Join(dir, "server.pem"), pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0644); e != nil {
		return e
	}
	return os.WriteFile(filepath.Join(dir, "server-key.pem"), pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(serverKey)}), 0600)
}
func mac(key, data []byte) string {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}
func fileMACs(root string, key []byte) (map[string]string, error) {
	out := map[string]string{}
	e := filepath.WalkDir(root, func(path string, d os.DirEntry, e error) error {
		if e != nil {
			return e
		}
		if d.IsDir() {
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			link, err := os.Readlink(path)
			if err != nil {
				return err
			}
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}
			out[filepath.ToSlash(rel)] = "symlink:" + mac(key, []byte(link))
			return nil
		}
		if !d.Type().IsRegular() {
			return errLab
		}
		f, e := os.Open(path)
		if e != nil {
			return e
		}
		h := hmac.New(sha256.New, key)
		_, e = io.Copy(h, f)
		f.Close()
		if e != nil {
			return e
		}
		rel, e := filepath.Rel(root, path)
		if e != nil {
			return e
		}
		out[filepath.ToSlash(rel)] = hex.EncodeToString(h.Sum(nil))
		return nil
	})
	return out, e
}
func run(root, action string) error {
	var c config
	if e := readJSON(filepath.Join(root, "credentials/lab.json"), &c); e != nil {
		return e
	}
	if c.Version != "isolated-backup-lab.v1" || (c.Suite != "" && c.Suite != "openclaw" && c.Suite != "workbuddy" && c.Suite != "mixed" && c.Suite != "workbuddy-identity") || !strings.HasPrefix(c.ID, "lab-") || len(c.Wrapping) != 32 || len(c.Public) != ed25519.PublicKeySize || (action == "capture" && len(c.Signer) != 64) {
		return errLab
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	archive, e := os.OpenRoot(filepath.Join(root, "artifacts"))
	if e != nil {
		return e
	}
	defer archive.Close()
	keys := artifact.SecretKeys{"lab-wrap": c.Wrapping}
	d := artifact.Directory{Root: archive, Keys: keys, VerifyKeys: map[string]ed25519.PublicKey{"lab-sign": c.Public}, MaxCiphertextBytes: 5 << 30, MaxPlaintextBytes: 5 << 30, Authorize: func(ctx context.Context, id, action string) error {
		if ctx.Err() != nil || id != c.ID || (action != "publish" && action != "read") {
			return errLab
		}
		return nil
	}}
	if action == "mixed-restore" || action == "mixed-verify" {
		return runMixed(ctx, root, action, c, d)
	}
	if action == "identity-restore" || action == "identity-verify" {
		return runIdentity(ctx, root, action, c, d)
	}
	if action == "capture" {
		stage, e := os.OpenRoot(filepath.Join(root, "staging"))
		if e != nil {
			return e
		}
		defer stage.Close()
		return capture(ctx, root, c, stage, d, keys)
	}
	return verify(ctx, root, c, d)
}
func capture(ctx context.Context, root string, c config, stage *os.Root, d artifact.Directory, keys artifact.SecretKeys) error {
	var policies map[string]worker.RuntimePolicy
	if c.Suite == "mixed" {
		var e error
		policies, e = mixedPolicies(root)
		if e != nil {
			return e
		}
	}
	if c.Suite == "workbuddy-identity" {
		var e error
		policies, e = identityPolicies(root)
		if e != nil {
			return e
		}
	}
	ca, e := os.ReadFile(filepath.Join(root, "tls/ca.pem"))
	if e != nil {
		return e
	}
	spec := worker.DatabaseSpec{Address: "mysql:3306", Name: databaseName, ServerUUID: "isolated-discovery", TLSServerName: "mysql", RootCA: ca, MaxRows: 1000, MaxMemoryBytes: 16 << 20}
	db, e := worker.OpenDatabase(&spec, &worker.DatabaseCredential{Username: "lab_capture", Password: []byte(c.DatabasePassword)})
	if e != nil {
		return e
	}
	defer db.Close()
	if e = db.QueryRowContext(ctx, "SELECT @@server_uuid").Scan(&spec.ServerUUID); e != nil {
		return e
	}
	check := func(ctx context.Context, _ string, r worker.Request) error {
		var name, uuid string
		var stopped bool
		if db.QueryRowContext(ctx, "SELECT DATABASE(), @@server_uuid, @@GLOBAL.super_read_only").Scan(&name, &uuid, &stopped) != nil || name != databaseName || uuid != spec.ServerUUID || !stopped || r.Binding.BackupID != c.ID || r.Operation != "capture-database" {
			return errLab
		}
		return nil
	}
	before, e := domain.CaptureSource(ctx, db, domain.Limits{MaxRows: 1000, MaxBytes: 16 << 20}, databaseName, spec.ServerUUID)
	if e != nil {
		return e
	}
	expected := evidence{Files: map[string]map[string]string{}}
	raw, e := json.Marshal(before)
	if e != nil {
		return e
	}
	expected.DatabaseMAC = mac(c.Wrapping, raw)
	modes := suiteModes(c.Suite)
	users := 2
	if c.Suite == "mixed" || c.Suite == "workbuddy-identity" {
		users = 4
	}
	b := artifact.Bundle{Version: artifact.Version, ID: c.ID, Purpose: "functional_test", Scope: []string{"users", "instances"}, PolicyVersion: "lab-v1", Users: users, Instances: len(modes)}
	ids := []string{"database"}
	for i := range modes {
		ids = append(ids, fmt.Sprintf("instance-%d", 7+i))
	}
	for i, id := range ids {
		binding := staging.Binding{BackupID: c.ID, Attempt: "1", Path: id, PartIndex: uint32(i), EnvelopeID: "lab-" + id}
		// A fixed, non-secret context digest binds these synthetic fixture inputs.
		h := sha256.Sum256([]byte(c.ID + "/synthetic-source"))
		binding.CaptureContextHash = hex.EncodeToString(h[:])
		dek := make([]byte, 32)
		if _, e = rand.Read(dek); e != nil {
			return e
		}
		r := worker.Request{Version: worker.Version, Binding: binding, Deadline: time.Now().Add(2 * time.Minute), ArtifactName: id + ".enc", MaxArchiveBytes: 16 << 20, MaxCompressedBytes: 16 << 20}
		var result worker.Result
		if i == 0 {
			r.Operation = "capture-database"
			r.Database = &spec
			result, e = worker.RunDatabase(ctx, r, worker.DatabaseEnvironment{Database: db, Staging: stage, Key: dek, Check: check})
		} else {
			mode := modes[i-1]
			sourcePath := "/source/" + mode
			files, err := fileMACs(sourcePath, c.Wrapping)
			if err != nil {
				return err
			}
			expected.Files[id] = files
			source, err := os.OpenRoot(sourcePath)
			if err != nil {
				return err
			}
			if c.Suite == "workbuddy-identity" {
				want, err := domain.WorkBuddyUIDForInstance(before, fmt.Sprint(i+6))
				r.WorkBuddyIdentity = &want
				if err == nil {
					err = domain.VerifyWorkBuddyUIDWorkspace(source, want)
				}
				if err != nil {
					source.Close()
					return err
				}
			}
			r.Operation = "capture-workspace"
			r.MaxFiles = 10000
			r.MaxFileBytes = 8 << 20
			if c.Suite == "workbuddy" {
				r.MaxArchiveBytes, r.MaxCompressedBytes, r.MaxFileBytes = 256<<20, 256<<20, 256<<20
			}
			if c.Suite == "mixed" || c.Suite == "workbuddy-identity" {
				policy := policies[id]
				binding.CaptureContextHash = policyHash(policy)
				r.Binding = binding
				r.RuntimePolicy = &policy
				r.MaxFiles = 100000
				r.MaxArchiveBytes = 5 << 30
				r.MaxCompressedBytes = 4 << 30
				r.MaxFileBytes = 4 << 30
				r.Deadline = time.Now().Add(5 * time.Minute)
			}
			result, e = worker.Run(ctx, r, worker.Environment{Workspace: source, Staging: stage, Key: dek, Check: func(ctx context.Context, _ string, r worker.Request) error {
				if ctx.Err() != nil || r.Binding.BackupID != c.ID || r.Operation != "capture-workspace" {
					return errLab
				}
				return nil
			}})
			source.Close()
			after, err := fileMACs(sourcePath, c.Wrapping)
			left, _ := json.Marshal(files)
			right, _ := json.Marshal(after)
			if err != nil || !bytes.Equal(left, right) {
				return errLab
			}
		}
		if e != nil {
			return fmt.Errorf("%s capture: %w", id, e)
		}
		wrapped, e := keys.Wrap(ctx, binding, "lab-wrap", dek)
		clear(dek)
		if e != nil {
			return e
		}
		b.Parts = append(b.Parts, artifact.Part{ID: id, Receipt: result.Receipt, Binding: binding, Key: wrapped})
	}
	after, e := domain.CaptureSource(ctx, db, domain.Limits{MaxRows: 1000, MaxBytes: 16 << 20}, databaseName, spec.ServerUUID)
	if e != nil {
		return e
	}
	raw, _ = json.Marshal(after)
	if mac(c.Wrapping, raw) != expected.DatabaseMAC {
		return errLab
	}
	if e = d.Publish(ctx, b, "lab-sign", c.Signer, func(p artifact.Part) (io.ReadCloser, error) { return stage.Open(p.Receipt.Name) }); e != nil {
		return e
	}
	if e = writeJSON(filepath.Join(root, "expected.json"), expected); e != nil {
		return e
	}
	fmt.Printf("captured and signed %s users=%d instances=%d\n", c.ID, b.Users, b.Instances)
	return nil
}
func verify(ctx context.Context, root string, c config, d artifact.Directory) error {
	var expected evidence
	if e := readJSON(filepath.Join(root, "expected.json"), &expected); e != nil {
		return e
	}
	b, e := d.Read(ctx, c.ID)
	if e != nil {
		return e
	}
	r := report{ID: c.ID, Users: b.Users, Instances: b.Instances, DatabaseTLS: true, SourceReadOnly: true, DatabaseUnchanged: true, SourceIndependent: true, Scope: "real MySQL + OpenClaw Lite/Pro files; data-plane backup only; no K8s/controller lifecycle certification"}
	if c.Suite == "workbuddy" {
		r.Scope = "real MySQL + WorkBuddy Lite homes; data-plane backup only; no identity migration, K8s or runtime-agent lifecycle certification"
	}
	for _, part := range b.Parts {
		key, e := d.Keys.Unwrap(ctx, part.Binding, part.Key)
		if e != nil {
			return e
		}
		f, e := d.Root.Open(part.Receipt.Name)
		if e != nil {
			return e
		}
		var plain bytes.Buffer
		e = staging.ConsumeCompressed(ctx, f, key, part.Binding, 256<<20, 256<<20, func(src io.Reader) error { _, err := io.Copy(&plain, src); return err })
		f.Close()
		clear(key)
		if e != nil {
			return e
		}
		if part.ID == "database" {
			snapshot, e := domain.Decode(&plain, domain.Limits{MaxRows: 1000, MaxBytes: 16 << 20})
			if e != nil {
				return e
			}
			raw, _ := json.Marshal(snapshot)
			if mac(c.Wrapping, raw) != expected.DatabaseMAC {
				return errLab
			}
			r.Tables = len(snapshot.Tables)
			logins := 0
			for _, table := range snapshot.Tables {
				r.Rows += len(table.Rows)
				if table.Name == "users" {
					for _, row := range table.Rows {
						password := c.UserPassword
						if row["username"].String() == "admin" {
							password = c.AdminPassword
						}
						if bcrypt.CompareHashAndPassword(row["password_hash"].Bytes, []byte(password)) != nil {
							return errLab
						}
						logins++
					}
				}
			}
			if logins != 2 {
				return errLab
			}
			r.PasswordHashesVerified = true
		} else {
			dir := filepath.Join(root, "verification", part.ID)
			if e = os.Mkdir(dir, 0700); e != nil {
				return e
			}
			target, e := os.OpenRoot(dir)
			if e != nil {
				return e
			}
			_, e = workspace.Restore(ctx, target, &plain, workspace.Limits{MaxFiles: 10000, MaxBytes: 256 << 20}, c.Suite == "workbuddy")
			target.Close()
			if e != nil {
				return e
			}
			files, e := fileMACs(dir, c.Wrapping)
			if e != nil {
				return e
			}
			a, _ := json.Marshal(files)
			b, _ := json.Marshal(expected.Files[part.ID])
			if !bytes.Equal(a, b) {
				return errLab
			}
			r.Files += len(files)
		}
		clear(plain.Bytes())
	}
	// Corrupt a disposable copy, never the published read-only package.
	tamperDir := filepath.Join(root, "verification", "tampered-package")
	if e = os.Mkdir(tamperDir, 0700); e != nil {
		return e
	}
	tamperRoot, e := os.OpenRoot(tamperDir)
	if e != nil {
		return e
	}
	defer tamperRoot.Close()
	names := []string{c.ID + ".bundle.json", c.ID + ".committed"}
	for _, p := range b.Parts {
		names = append(names, p.Receipt.Name)
	}
	for _, name := range names {
		data, err := d.Root.ReadFile(name)
		if err != nil {
			return err
		}
		if e = tamperRoot.WriteFile(name, data, 0600); e != nil {
			return e
		}
	}
	tampered := d
	tampered.Root = tamperRoot
	if _, e = tampered.Read(ctx, c.ID); e != nil {
		return e
	}
	part := b.Parts[0]
	original, e := tamperRoot.ReadFile(part.Receipt.Name)
	if e != nil || len(original) == 0 {
		return errLab
	}
	corrupt := bytes.Clone(original)
	corrupt[len(corrupt)-1] ^= 1
	if e = tamperRoot.WriteFile(part.Receipt.Name, corrupt, 0600); e != nil {
		return e
	}
	_, tamperErr := tampered.Read(ctx, c.ID)
	if tamperErr == nil {
		return errLab
	}
	r.TamperRejected = true
	if _, e = d.Read(ctx, c.ID); e != nil {
		return e
	}
	if e = writeJSON(filepath.Join(root, "result.json"), r); e != nil {
		return e
	}
	return json.NewEncoder(os.Stdout).Encode(r)
}
