package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"time"

	"clawreef/internal/systembackup/artifact"
	"clawreef/internal/systembackup/domain"
	"clawreef/internal/systembackup/scope"
	"clawreef/internal/systembackup/staging"
	"clawreef/internal/systembackup/worker"
	"clawreef/internal/systembackup/workspace"
)

type wineCapture struct {
	Request worker.Request
	Key     artifact.WrappedKey
	Files   map[string]string
}
type signedWineCapture struct {
	Capture   wineCapture
	Signature []byte
}

func winePolicy() worker.RuntimePolicy {
	return worker.RuntimePolicy{Version: "workbuddy-5.3.14-wine-lab.v1", Image: "172.16.0.158:5000/workbuddy-lite@sha256:5d5aa912f211949e0e3a52884533b8c9685697890d629ce93868b8fdf5acde71", Runtime: scope.Runtime{Type: "workbuddy", Mode: "lite", Backend: "gateway", Variant: "linux", OS: "linux"}, WorkspaceLayout: workspace.WorkBuddyWineV1, Files: []worker.FileRule{{Path: "backup-lab-policy.json", Format: "json", Required: true, Fields: []domain.JSONRule{{Path: []string{"enabled"}, Action: "preserve", Required: true}}}}}
}

// Only fixed paths mounted by the isolated runner are used. Restore does not
// open a source database, source volume or network, and never starts an Agent.
func runWine(root, action string) error {
	var c config
	if e := readJSON(filepath.Join(root, "credentials/lab.json"), &c); e != nil {
		return e
	}
	if c.Version != "isolated-backup-lab.v1" || c.Suite != "workbuddy" || len(c.Wrapping) != 32 || len(c.Public) != ed25519.PublicKeySize || len(c.Signer) != ed25519.PrivateKeySize {
		return errLab
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	stagePath := filepath.Join(root, "wine-staging")
	if action == "capture-workbuddy-wine" {
		if e := os.Mkdir(stagePath, 0700); e != nil {
			return e
		}
	}
	stage, e := os.OpenRoot(stagePath)
	if e != nil {
		return e
	}
	defer stage.Close()
	policy := winePolicy()
	keys := artifact.SecretKeys{"lab-wrap": c.Wrapping}
	var signed signedWineCapture
	check := func(ctx context.Context, _ string, r worker.Request) error {
		if ctx.Err() != nil || r.Binding.BackupID != c.ID || r.Binding.Path != "workbuddy-wine" {
			return errLab
		}
		return nil
	}
	if action == "capture-workbuddy-wine" {
		src, e := os.OpenRoot("/source/workbuddy-wine")
		if e != nil {
			return e
		}
		defer src.Close()
		if _, e = workspace.Archive(ctx, src, io.Discard, workspace.Limits{MaxFiles: 100000, MaxBytes: 4 << 30}); !errors.Is(e, workspace.ErrArchive) {
			return fmt.Errorf("generic archive should reject this Wine layout: %w", errLab)
		}
		files, e := fileMACs(src.Name(), c.Wrapping)
		if e != nil {
			return e
		}
		policyBytes, _ := json.Marshal(policy)
		hash := sha256.Sum256(policyBytes)
		r := worker.Request{Version: worker.Version, Operation: "capture-workspace", Binding: staging.Binding{BackupID: c.ID, Attempt: "1", Path: "workbuddy-wine", EnvelopeID: "wine-lab", CaptureContextHash: hex.EncodeToString(hash[:])}, Deadline: time.Now().Add(9 * time.Minute), ArtifactName: "wine.enc", MaxFiles: 100000, MaxFileBytes: 4 << 30, MaxArchiveBytes: 5 << 30, MaxCompressedBytes: 4 << 30, RuntimePolicy: &policy}
		key := make([]byte, 32)
		if _, e = rand.Read(key); e != nil {
			return e
		}
		defer clear(key)
		result, e := worker.Run(ctx, r, worker.Environment{Workspace: src, Staging: stage, Key: key, Check: check})
		if e != nil {
			return e
		}
		after, e := fileMACs(src.Name(), c.Wrapping)
		if e != nil || !reflect.DeepEqual(files, after) {
			return errLab
		}
		r.Receipt = result.Receipt
		wrapped, e := keys.Wrap(ctx, r.Binding, "lab-wrap", key)
		if e != nil {
			return e
		}
		signed.Capture = wineCapture{Request: r, Key: wrapped, Files: files}
		raw, e := json.Marshal(signed.Capture)
		if e != nil {
			return e
		}
		signed.Signature = ed25519.Sign(c.Signer, raw)
		if e = writeJSON(filepath.Join(root, "wine-capture.json"), signed); e != nil {
			return e
		}
		fmt.Printf("Wine capture: entries=%d plaintext_bytes=%d ciphertext_bytes=%d\n", result.Files, result.Bytes, result.Receipt.Size)
		return nil
	}
	if e = readJSON(filepath.Join(root, "wine-capture.json"), &signed); e != nil {
		return e
	}
	raw, e := json.Marshal(signed.Capture)
	if e != nil || !ed25519.Verify(c.Public, raw, signed.Signature) {
		return errLab
	}
	r := signed.Capture.Request
	if r.RuntimePolicy == nil || !reflect.DeepEqual(*r.RuntimePolicy, policy) || r.Binding.BackupID != c.ID || r.Binding.Path != "workbuddy-wine" {
		return errLab
	}
	key, e := keys.Unwrap(ctx, r.Binding, signed.Capture.Key)
	if e != nil {
		return e
	}
	defer clear(key)
	dst, e := os.OpenRoot("/target")
	if e != nil {
		return e
	}
	defer dst.Close()
	r.Operation = "restore-workspace"
	r.ArtifactName = ""
	r.Files = policy.Files
	r.PolicyVersion = policy.Version
	r.Deadline = time.Now().Add(9 * time.Minute)
	result, e := worker.Run(ctx, r, worker.Environment{Workspace: dst, Staging: stage, Key: key, PreserveOwner: true, Check: check})
	if e != nil {
		return e
	}
	files, e := fileMACs(dst.Name(), c.Wrapping)
	if e != nil || !reflect.DeepEqual(files, signed.Capture.Files) {
		return fmt.Errorf("Wine restored file mismatch: %w", errLab)
	}
	report := map[string]any{"wine_layout_roundtrip_verified": true, "signature_verified": true, "all_file_contents_and_links_verified": true, "generic_layout_still_rejected": true, "quarantined": result.Quarantined, "entries": result.Files, "bytes": result.Bytes, "identity_table_migration_verified": false, "runtime_agent_lifecycle_verified": false, "kubernetes_verified": false, "full_workbuddy_migration_verified": false}
	if e = writeJSON(filepath.Join(root, "workbuddy-wine-result.json"), report); e != nil {
		return e
	}
	return json.NewEncoder(os.Stdout).Encode(report)
}
