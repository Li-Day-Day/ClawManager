package systembackupcontroller

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clawreef/internal/systembackup/staging"
	d "clawreef/internal/systembackupdispatch"
)

func TestTaskCaptureKeyBindingAndRevocation(t *testing.T) {
	dir := t.TempDir()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	root := bytes.Repeat([]byte{7}, 32)
	g := ExecutionGrant{Version: "system-backup-execution-grant.v1", InstallationID: "installation_" + strings.Repeat("a", 32), ControllerOwner: "controller-a", DatabaseAccount: "backup_controller@localhost", ServerUUID: "server", Database: "backup", ConfigVersion: 1, ConfigSHA256: strings.Repeat("b", 64), ProfileSHA256: strings.Repeat("c", 64), NotBefore: time.Now().Add(-time.Minute), ExpiresAt: time.Now().Add(time.Hour), Actions: []string{"capture"}, RecordKeys: []ExecutionRecordKey{{Ref: "record-v1", SHA256: recordHash(root)}}, CaptureKeys: []ExecutionRecordKey{{Ref: "capture-v1", SHA256: recordHash(root)}}}
	body, _ := json.Marshal(g)
	raw, _ := json.Marshal(executionGrantEnvelope{Payload: base64.StdEncoding.EncodeToString(body), Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(private, body))})
	path := filepath.Join(dir, "grant.json")
	for name, data := range map[string][]byte{"grant.json": raw, "capture-v1": root} {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	p, err := NewPinnedExecutionIdentity(path, recordHash(raw), dir, public)
	if err != nil {
		t.Fatal(err)
	}
	a := d.Authority{InstallationID: g.InstallationID, ClaimOwner: g.ControllerOwner, ConfigVersion: 1, ConfigSHA256: g.ConfigSHA256, TaskPublicID: "task-one", TaskType: "backup", Phase: "capture", AttemptNo: 1, DeadlineAt: time.Now().Add(time.Minute)}
	b := staging.Binding{BackupID: a.TaskPublicID, Attempt: "1", Path: "workspace", CaptureContextHash: strings.Repeat("d", 64), EnvelopeID: "envelope-one"}
	key, err := p.DeriveTaskCaptureKey(context.Background(), a, b)
	if err != nil {
		t.Fatal(err)
	}
	defer clear(key)
	original, _ := json.Marshal(b)
	legacy, err := p.DeriveCaptureKey(context.Background(), a, original)
	defer clear(legacy)
	if err != nil || !bytes.Equal(key, legacy) {
		t.Fatal("saved staging derivation changed")
	}
	for _, field := range []string{"task", "attempt", "noncanonical-attempt", "context", "envelope", "path"} {
		t.Run(field, func(t *testing.T) {
			bad := b
			switch field {
			case "task":
				bad.BackupID = "other"
			case "attempt":
				bad.Attempt = "2"
			case "noncanonical-attempt":
				bad.Attempt = "01"
			case "context":
				bad.CaptureContextHash = "invalid"
			case "envelope":
				bad.EnvelopeID = ""
			case "path":
				bad.Path = ""
			}
			if k, e := p.DeriveTaskCaptureKey(context.Background(), a, bad); e == nil || len(k) != 0 {
				t.Fatal("invalid binding authorized")
			}
		})
	}
	for _, field := range []string{"deadline", "phase", "type", "zero-attempt", "installation", "config-version"} {
		t.Run(field, func(t *testing.T) {
			bad := a
			switch field {
			case "deadline":
				bad.DeadlineAt = time.Now().Add(-time.Second)
			case "phase":
				bad.Phase = "recover"
			case "type":
				bad.TaskType = "preflight"
			case "zero-attempt":
				bad.AttemptNo = 0
			case "installation":
				bad.InstallationID = "installation_other"
			case "config-version":
				bad.ConfigVersion++
			}
			if _, e := p.DeriveTaskCaptureKey(context.Background(), bad, b); e == nil {
				t.Fatal("invalid authority authorized")
			}
		})
	}
	changed := b
	changed.EnvelopeID = "envelope-two"
	other, err := p.DeriveTaskCaptureKey(context.Background(), a, changed)
	defer clear(other)
	if err != nil || bytes.Equal(key, other) {
		t.Fatal("envelopes share key")
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := p.DeriveTaskCaptureKey(canceled, a, b); err == nil {
		t.Fatal("canceled call authorized")
	}
	if err := os.WriteFile(filepath.Join(dir, "capture-v1"), bytes.Repeat([]byte{8}, 32), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := p.DeriveTaskCaptureKey(context.Background(), a, b); err == nil {
		t.Fatal("wrong key bytes authorized")
	}
	if err := os.WriteFile(filepath.Join(dir, "capture-v1"), root, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err := p.DeriveTaskCaptureKey(context.Background(), a, b); err == nil {
		t.Fatal("revoked grant authorized")
	}
	p.grant.WorkerIssuerSHA256 = strings.Repeat("a", 64)
	if err := p.AuthorizeWorkerIssuer(context.Background(), nil, a, p.grant.WorkerIssuerSHA256); err == nil {
		t.Fatal("nil transaction authorized")
	}
	for _, mode := range []string{"recovery-only", "expired", "missing-key-version"} {
		t.Run(mode, func(t *testing.T) {
			changed := g
			switch mode {
			case "recovery-only":
				changed.Actions = []string{"recover"}
			case "expired":
				changed.NotBefore = time.Now().Add(-2 * time.Hour)
				changed.ExpiresAt = time.Now().Add(-time.Minute)
			case "missing-key-version":
				changed.CaptureKeys = []ExecutionRecordKey{{Ref: "capture-v2", SHA256: recordHash(root)}}
			}
			body, _ := json.Marshal(changed)
			raw, _ := json.Marshal(executionGrantEnvelope{Payload: base64.StdEncoding.EncodeToString(body), Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(private, body))})
			if err := os.WriteFile(path, raw, 0600); err != nil {
				t.Fatal(err)
			}
			identity, err := NewPinnedExecutionIdentity(path, recordHash(raw), dir, public)
			if err != nil {
				t.Fatal(err)
			}
			if key, err := identity.DeriveTaskCaptureKey(context.Background(), a, b); err == nil || len(key) != 0 {
				t.Fatal("invalid signed grant authorized capture")
			}
		})
	}
}
