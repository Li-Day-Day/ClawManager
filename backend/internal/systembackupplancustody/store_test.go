package systembackupplancustody

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	dispatch "clawreef/internal/systembackupdispatch"
)

const innerVersion = "system-backup-b-plan.v1"

func digest(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

type fixtureRunner struct{ dispatch.Runner }

func (fixtureRunner) Prepare(context.Context, dispatch.Input, dispatch.Ports) (dispatch.Plan, error) {
	b := []byte(`{"private":"task-specific material must remain encrypted"}`)
	return dispatch.Plan{SchemaVersion: innerVersion, CanonicalJSON: b, SHA256: digest(b)}, nil
}

type fixturePorts struct{ dispatch.Ports }

func fixture(t *testing.T) (string, *os.Root, []byte, dispatch.Input, dispatch.Plan) {
	t.Helper()
	dir := t.TempDir()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { root.Close() })
	in := dispatch.Input{
		Authority: dispatch.Authority{
			InstallationID: "installation_test", TaskPublicID: "sbk_11111111-1111-4111-8111-111111111111", TaskType: "backup", RequestID: "request-1",
			ConfigVersion: 1, ConfigSHA256: digest([]byte(`{}`)), AttemptNo: 1, Phase: "capture", ClaimOwner: "controller-1", ClaimRowVersion: 1,
			DeadlineAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		},
		ConfigSnapshot: []byte(`{}`), ProfileID: "linux", ProfileRevision: "v1",
		Backup: &dispatch.BackupSpec{SourceOrchestrator: "kubernetes", SourceProfile: "cluster", MatrixKey: "k8s-cluster", DatasourceTopology: "in_cluster", Runner: "k8s", TaskPurpose: "functional_test", RequestedParts: []string{"mysql"}},
	}
	runner, err := dispatch.BindTaskRunner(fixtureRunner{}, innerVersion)
	if err != nil {
		t.Fatal(err)
	}
	plan, err := runner.Prepare(context.Background(), in, fixturePorts{})
	if err != nil {
		t.Fatal(err)
	}
	return dir, root, bytes.Repeat([]byte{7}, 32), in, plan
}

func TestPlanCustodyRoundTripAndTakeover(t *testing.T) {
	dir, root, key, in, plan := fixture(t)
	r, err := Save(context.Background(), root, "plan.enc", key, in, plan, innerVersion)
	if err != nil {
		t.Fatal(err)
	}
	stored, err := os.ReadFile(filepath.Join(dir, r.File.Name))
	if err != nil || bytes.Contains(stored, plan.CanonicalJSON) || bytes.Contains(stored, []byte("private")) {
		t.Fatal("plaintext persisted", err)
	}
	in.Authority.ClaimOwner = "replacement-controller"
	in.Authority.ClaimRowVersion++
	got, err := Load(context.Background(), root, key, in, r, innerVersion)
	if err != nil || !bytes.Equal(got.CanonicalJSON, plan.CanonicalJSON) || got.SHA256 != plan.SHA256 {
		t.Fatal("exact plan not recovered", err)
	}
	clear(got.CanonicalJSON)
	if !bytes.Equal(key, bytes.Repeat([]byte{7}, 32)) {
		t.Fatal("borrowed key changed")
	}
	if _, err = Save(context.Background(), root, "plan.enc", key, in, plan, innerVersion); err == nil {
		t.Fatal("overwrote plan")
	}
	current, err := os.ReadFile(filepath.Join(dir, r.File.Name))
	if err != nil || !bytes.Equal(current, stored) {
		t.Fatal("existing ciphertext changed", err)
	}
	files, _ := os.ReadDir(dir)
	if len(files) != 1 {
		t.Fatal("partial files remain")
	}
}

func TestPlanCustodyRejectsTamperAndScopeChanges(t *testing.T) {
	for _, mode := range []string{"key", "installation", "task", "attempt", "config", "profile", "parts", "version", "digest", "ciphertext", "truncated", "trailing", "size", "path", "canceled"} {
		t.Run(mode, func(t *testing.T) {
			dir, root, key, in, plan := fixture(t)
			r, err := Save(context.Background(), root, "plan.enc", key, in, plan, innerVersion)
			if err != nil {
				t.Fatal(err)
			}
			ctx := context.Background()
			version := innerVersion
			switch mode {
			case "key":
				key[0]++
			case "installation":
				in.Authority.InstallationID = "installation_other"
			case "task":
				in.Authority.TaskPublicID = "spf_22222222-2222-4222-8222-222222222222"
			case "attempt":
				in.Authority.AttemptNo++
			case "config":
				in.Authority.ConfigVersion++
			case "profile":
				in.ProfileRevision = "v2"
			case "parts":
				in.Backup.RequestedParts = []string{"redis"}
			case "version":
				version = "other-plan.v1"
			case "digest":
				r.PlanSHA256 = strings.Repeat("a", 64)
			case "size":
				r.File.Size = maxSealedBytes + 1
			case "path":
				r.File.Name = "../plan.enc"
			case "canceled":
				var cancel context.CancelFunc
				ctx, cancel = context.WithCancel(ctx)
				cancel()
			case "ciphertext", "truncated", "trailing":
				path := filepath.Join(dir, r.File.Name)
				b, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				if mode == "truncated" {
					b = b[:len(b)-1]
				} else if mode == "trailing" {
					b = append(b, 1)
				} else {
					b[len(b)-1] ^= 1
				}
				if err := os.Chmod(path, 0600); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, b, 0600); err != nil {
					t.Fatal(err)
				}
				// Even a matching replacement journal checksum cannot bypass AEAD.
				r.File.SHA256, r.File.Size = digest(b), int64(len(b))
			}
			got, err := Load(ctx, root, key, in, r, version)
			if err != ErrCustody || len(got.CanonicalJSON) != 0 {
				t.Fatal("invalid plan released", err)
			}
		})
	}
}

func TestPlanCustodyInvalidSaveDoesNotWrite(t *testing.T) {
	for _, mode := range []string{"hash", "task", "key", "nil_context", "typed_nil_context", "oversize"} {
		t.Run(mode, func(t *testing.T) {
			dir, root, key, in, plan := fixture(t)
			ctx := context.Background()
			switch mode {
			case "hash":
				plan.SHA256 = strings.Repeat("a", 64)
			case "task":
				in.Authority.AttemptNo++
			case "key":
				key = key[:31]
			case "nil_context":
				ctx = nil
			case "typed_nil_context":
				ctx = (*nilContext)(nil)
			case "oversize":
				plan.CanonicalJSON = make([]byte, maxPlanBytes+1)
			}
			if _, err := Save(ctx, root, "plan.enc", key, in, plan, innerVersion); err != ErrCustody {
				t.Fatal(err)
			}
			files, err := os.ReadDir(dir)
			if err != nil || len(files) != 0 {
				t.Fatal("invalid save wrote files", err)
			}
		})
	}
}

type nilContext struct{ context.Context }
