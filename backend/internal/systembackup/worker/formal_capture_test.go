package worker

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"

	k "clawreef/internal/systembackupkms"
	w "clawreef/internal/systembackupwire"
)

type formalKeyFixture struct {
	request               w.KeyRequest
	calls, checks, failAt int
	endError              bool
	ended, failAfterUse   bool
	borrowed              []byte
}

func (f *formalKeyFixture) Recheck(context.Context) error {
	f.checks++
	if f.failAt == f.checks || (f.failAfterUse && f.ended) {
		return ErrNotReady
	}
	return nil
}
func (f *formalKeyFixture) recheckDuringUse(ctx context.Context) error { return f.Recheck(ctx) }
func (f *formalKeyFixture) WithDEK(ctx context.Context, consume func(context.Context, []byte) error) (w.WrappedKey, error) {
	f.calls++
	if f.calls != 1 {
		return w.WrappedKey{}, ErrNotReady
	}
	key := bytes.Repeat([]byte{9}, 32)
	f.borrowed = key
	defer clear(key)
	if e := consume(ctx, key); e != nil {
		return w.WrappedKey{}, e
	}
	f.ended = true
	if f.endError {
		return w.WrappedKey{}, k.ErrUnknown
	}
	return w.WrappedKey{Request: f.request, Algorithm: "provider-native", Ciphertext: []byte("opaque-provider-ciphertext")}, nil
}
func formalInvocationFixture(t *testing.T) (Invocation, FormalCaptureEnvironment, *formalKeyFixture) {
	t.Helper()
	i := keyInvocation(t)
	i.FormalCapture = &FormalCaptureSpec{Version: FormalCaptureVersion, ConfigSHA256: strings.Repeat("a", 64), EnvelopeName: "envelope.json", MaxFrames: 8}
	source, e := os.OpenRoot(i.WorkspacePath)
	if e != nil {
		t.Fatal(e)
	}
	store, e := os.OpenRoot(i.StagingPath)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { source.Close(); store.Close() })
	return i, FormalCaptureEnvironment{Workspace: source, Staging: store}, &formalKeyFixture{request: i.ProviderKey.Request}
}

func TestFormalWorkspaceCandidateUsesCFramingAndNeverLegacyComplete(t *testing.T) {
	i, env, key := formalInvocationFixture(t)
	result, e := runFormalCapture(context.Background(), i, key, env)
	if e != nil || result.Ciphertext.Size == 0 || result.Envelope.Size == 0 || key.calls != 1 || result.Files == 0 {
		t.Fatal("candidate failed", e)
	}
	data, _ := env.Staging.ReadFile(result.Ciphertext.Name)
	envelope, _ := env.Staging.ReadFile(result.Envelope.Name)
	if !bytes.HasPrefix(data, []byte("CMBKGC01")) || bytes.Contains(data, []byte("source-fixture-secret")) || bytes.Contains(envelope, []byte("source-fixture-secret")) || !bytes.Contains(envelope, []byte(`"schema_version":"system-backup-envelope.v1"`)) {
		t.Fatal("wrong framing or plaintext output")
	}
	if !bytes.Equal(key.borrowed, make([]byte, 32)) {
		t.Fatal("model callback key not cleared")
	}
	if _, e = runFormalCapture(context.Background(), i, key, env); e == nil || key.calls != 1 {
		t.Fatal("retried Generate/overwrote known candidate")
	}
	if _, e = env.Staging.Stat(".workspace.enc.partial"); !os.IsNotExist(e) {
		t.Fatal("owned partial retained")
	}
}
func TestFormalRevocationAndUnknownEndNeverReturnCandidateReceipt(t *testing.T) {
	for _, mode := range []string{"before-use", "end-unknown", "after-use", "missing-source", "no-spec"} {
		t.Run(mode, func(t *testing.T) {
			i, env, key := formalInvocationFixture(t)
			switch mode {
			case "before-use":
				key.failAt = 1
			case "end-unknown":
				key.endError = true
			case "after-use":
				key.failAfterUse = true
			case "missing-source":
				env.Workspace = nil
			case "no-spec":
				i.FormalCapture = nil
			}
			got, e := runFormalCapture(context.Background(), i, key, env)
			if e == nil || !reflect.DeepEqual(got, FormalCaptureResult{}) || strings.Contains(e.Error(), "private") {
				t.Fatal("failed authorization yielded partial result", e)
			}
			if mode == "end-unknown" && (!errors.Is(e, k.ErrUnknown) || FailureCode(e) != "provider_outcome_unknown") {
				t.Fatal("unknown key-end disguised", e)
			}
		})
	}
}

func TestFormalFailureCodesDiscardUntrustedErrors(t *testing.T) {
	e := formalFailure(errors.New("private credential path"))
	if strings.Contains(e.Error(), "private") || FailureCode(e) != "formal_capture_failed" {
		t.Fatal("raw error disclosed")
	}
}

func TestFormalMaterialsAreFrozenByOriginalInvocationAndNeverFallback(t *testing.T) {
	for _, mode := range []string{"valid", "wrong-sha", "wrong-mapping", "unknown-field", "duplicate-field", "missing-provider", "no-formal", "missing-permit"} {
		t.Run(mode, func(t *testing.T) {
			i, _, _ := formalInvocationFixture(t)
			m := FormalCaptureMaterials{Version: FormalCaptureVersion, KMS: k.Config{InstallationID: i.ProviderKey.Request.Context.InstallationID, Key: i.ProviderKey.Request.Key, Endpoint: i.ProviderKey.Endpoint, KeyName: i.ProviderKey.KeyName}}
			m.Permit = k.PermitMount{PermitPath: "/private/permit.json", CredentialDirectory: "/private/credentials", PermitSHA256: strings.Repeat("b", 64), PublicKey: bytes.Repeat([]byte{4}, 32)}
			if mode == "missing-permit" {
				m.Permit = k.PermitMount{}
			}
			if mode == "wrong-mapping" {
				m.KMS.Key.ProviderVersion = "99"
			}
			raw, _ := json.Marshal(m)
			if mode == "unknown-field" {
				raw = append([]byte(`{"unexpected":true,`), raw[1:]...)
			}
			if mode == "duplicate-field" {
				raw = append([]byte(`{"schema_version":"ignored",`), raw[1:]...)
			}
			h := sha256.Sum256(raw)
			i.FormalCapture.ConfigSHA256 = hex.EncodeToString(h[:])
			if mode == "wrong-sha" {
				i.FormalCapture.ConfigSHA256 = strings.Repeat("0", 64)
			}
			if mode == "missing-provider" {
				i.ProviderKey = nil
			}
			if mode == "no-formal" {
				i.FormalCapture = nil
			}
			path := t.TempDir() + "/materials.json"
			if e := os.WriteFile(path, raw, 0600); e != nil {
				t.Fatal(e)
			}
			_, e := LoadFormalCaptureMaterials(path, i)
			if (mode == "valid") != (e == nil) {
				t.Fatal("mapping pin/closed decode mismatch", mode, e)
			}
		})
	}
}
