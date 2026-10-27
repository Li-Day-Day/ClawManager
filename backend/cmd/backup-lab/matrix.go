package main

// This harness tests the real worker on disposable native Agent homes. Its
// synthetic policy is deliberately NOT a production release-policy attestation.
import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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

type matrixCase struct {
	Name, Type, Mode, Image string
	UID                     int
}

func matrixPolicy(m matrixCase) worker.RuntimePolicy {
	backend := "gateway"
	if m.Mode == "pro" {
		backend = "desktop"
	}
	p := worker.RuntimePolicy{Version: "synthetic-matrix-marker.v1", Image: m.Image, Runtime: scope.Runtime{Type: m.Type, Mode: m.Mode, Backend: backend, Variant: "linux", OS: "linux"}, Files: []worker.FileRule{{Path: ".backup-lab-fixtures/policy.json", Format: "json", Required: true, Fields: []domain.JSONRule{{Path: []string{"enabled"}, Action: "preserve", Required: true}}}}}
	if m.Type == "deepseek-harness" {
		p.WorkspaceLayout = workspace.DeepSeekHarnessV1
	}
	return p
}

func policyHash(p worker.RuntimePolicy) string {
	b, _ := json.Marshal(p)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func runMatrixWorkspace(root, action string) error {
	var c config
	var m matrixCase
	if e := readJSON(filepath.Join(root, "credentials/lab.json"), &c); e != nil {
		return e
	}
	if e := readJSON(filepath.Join(root, "case.json"), &m); e != nil {
		return e
	}
	if c.Version != "isolated-backup-lab.v1" || len(c.Wrapping) != 32 || len(c.Public) != ed25519.PublicKeySize || len(c.Signer) != ed25519.PrivateKeySize || m.Name != m.Type+"-"+m.Mode {
		return errLab
	}
	policy := matrixPolicy(m)
	if policy.Validate() != nil {
		return errLab
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	stagePath := filepath.Join(root, "matrix-staging")
	if action == "matrix-capture" {
		if e := os.Mkdir(stagePath, 0700); e != nil {
			return e
		}
	}
	stage, e := os.OpenRoot(stagePath)
	if e != nil {
		return e
	}
	defer stage.Close()
	keys := artifact.SecretKeys{"lab-wrap": c.Wrapping}
	var signed signedWineCapture
	check := func(ctx context.Context, _ string, r worker.Request) error {
		if ctx.Err() != nil || r.Binding.BackupID != c.ID || r.Binding.Path != m.Name {
			return errLab
		}
		return nil
	}
	if action == "matrix-capture" {
		src, e := os.OpenRoot("/source")
		if e != nil {
			return e
		}
		defer src.Close()
		files, e := fileMACs(src.Name(), c.Wrapping)
		if e != nil {
			return e
		}
		p, _ := json.Marshal(policy)
		hash := sha256.Sum256(p)
		r := worker.Request{Version: worker.Version, Operation: "capture-workspace", Binding: staging.Binding{BackupID: c.ID, Attempt: "1", Path: m.Name, EnvelopeID: "matrix-lab", CaptureContextHash: hex.EncodeToString(hash[:])}, Deadline: time.Now().Add(9 * time.Minute), ArtifactName: "workspace.enc", MaxFiles: 100000, MaxFileBytes: 4 << 30, MaxArchiveBytes: 5 << 30, MaxCompressedBytes: 4 << 30, RuntimePolicy: &policy}
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
		if e = writeJSON(filepath.Join(root, "matrix-capture.json"), signed); e != nil {
			return e
		}
		fmt.Printf("%s capture: entries=%d bytes=%d\n", m.Name, result.Files, result.Bytes)
		return nil
	}
	if e = readJSON(filepath.Join(root, "matrix-capture.json"), &signed); e != nil {
		return e
	}
	raw, e := json.Marshal(signed.Capture)
	if e != nil || !ed25519.Verify(c.Public, raw, signed.Signature) {
		return errLab
	}
	r := signed.Capture.Request
	if r.RuntimePolicy == nil || !reflect.DeepEqual(*r.RuntimePolicy, policy) || check(ctx, "", r) != nil {
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
		return fmt.Errorf("matrix file mismatch: %w", errLab)
	}
	return writeJSON(filepath.Join(root, "workspace-result.json"), map[string]any{"case": m.Name, "image": m.Image, "entries": result.Files, "bytes": result.Bytes, "signed_encrypted_worker_roundtrip": true, "source_independent": true, "all_file_contents_and_links_verified": true, "quarantined": result.Quarantined, "production_release_policy_verified": false, "kubernetes_verified": false, "runtime_agent_lifecycle_verified": false, "workbuddy_identity_migration_verified": false})
}
