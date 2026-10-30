package staging

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"strings"
	"testing"
)

func observationFixture(t *testing.T) (*os.Root, *os.Root, SealScope, Receipt, []byte) {
	t.Helper()
	source, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { source.Close() })
	parent, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { parent.Close() })
	custody, err := OpenSealCustody(parent)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { custody.Close() })
	key := bytes.Repeat([]byte{7}, 32)
	b := binding()
	scope := SealScope{Installation: "installation_test", Task: b.BackupID, Phase: "capture", Unit: "workspace", Namespace: "backup", JobName: "job", JobUID: "original-job-uid", Attempt: 1, Generation: 2, ConfigVersion: 3, ConfigSHA256: strings.Repeat("a", 64), InvocationSHA256: strings.Repeat("b", 64), Binding: b}
	original, err := SealFile(context.Background(), source, "original.enc", key, b, func(w io.Writer) error { _, e := w.Write(bytes.Repeat([]byte("source-data"), 100)); return e })
	if err != nil {
		t.Fatal(err)
	}
	return source, custody, scope, original, key
}

func TestObservedSealPinsPrivateBytesAndSurvivesRetry(t *testing.T) {
	source, custody, scope, original, key := observationFixture(t)
	observed, err := ObserveFile(context.Background(), source, custody, scope, original, key, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	if observed.Receipt().Name == original.Name || observed.Receipt().SHA256 != original.SHA256 || observed.Reference() == "" {
		t.Fatal("worker reference reused")
	}
	source.Chmod(original.Name, 0600)
	if err = source.WriteFile(original.Name, []byte("worker rewrote its file"), 0600); err != nil {
		t.Fatal(err)
	}
	next, err := ObserveFile(context.Background(), source, custody, scope, original, key, 1<<20)
	if err != nil || next != observed {
		t.Fatal("source mutation changed seal", err)
	}
	if err = source.Remove(original.Name); err != nil {
		t.Fatal(err)
	}
	// Reopen custody like a new controller process: no in-memory observation
	// cache or surviving worker file may be needed to resolve this version.
	name := custody.Name()
	custody.Close()
	custody, err = os.OpenRoot(name)
	if err != nil {
		t.Fatal(err)
	}
	defer custody.Close()
	next, err = ObserveFile(context.Background(), source, custody, scope, original, key, 1<<20)
	if err != nil || next != observed {
		t.Fatal("retry needs mutable source", err)
	}
	f, _, err := OpenObserved(context.Background(), custody, scope, original)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err = Open(context.Background(), f, io.Discard, key, scope.Binding, 1<<20); err != nil {
		t.Fatal(err)
	}
	for _, fault := range []string{"job", "attempt", "invocation", "generation", "config"} {
		changed := scope
		switch fault {
		case "job":
			changed.JobUID += "replacement"
		case "attempt":
			changed.Attempt++
		case "invocation":
			changed.InvocationSHA256 = strings.Repeat("c", 64)
		case "generation":
			changed.Generation++
		case "config":
			changed.ConfigVersion++
		}
		if f, _, err := OpenObserved(context.Background(), custody, changed, original); err == nil {
			f.Close()
			t.Fatal("foreign scope reused original seal", fault)
		}
	}
	entries, err := os.ReadDir(custody.Name())
	if err != nil || len(entries) != 1 {
		t.Fatal("partial artifact retained", entries, err)
	}
}

func TestObservedSealRejectsTamperWrongKeyAndCancellation(t *testing.T) {
	for _, mode := range []string{"key", "binding", "digest", "oversize", "cancel", "tamper", "symlink"} {
		t.Run(mode, func(t *testing.T) {
			source, custody, scope, original, key := observationFixture(t)
			ctx := context.Background()
			max := int64(1 << 20)
			switch mode {
			case "key":
				key[0]++
			case "binding":
				scope.Binding.EnvelopeID += "other"
			case "digest":
				original.SHA256 = strings.Repeat("f", 64)
			case "oversize":
				max = 1
			case "cancel":
				var cancel context.CancelFunc
				ctx, cancel = context.WithCancel(ctx)
				cancel()
			case "tamper":
				observed, err := ObserveFile(ctx, source, custody, scope, original, key, max)
				if err != nil {
					t.Fatal(err)
				}
				custody.Chmod(observed.Receipt().Name, 0600)
				raw, _ := custody.ReadFile(observed.Receipt().Name)
				raw[len(raw)-1] ^= 1
				if err = custody.WriteFile(observed.Receipt().Name, raw, 0600); err != nil {
					t.Fatal(err)
				}
			case "symlink":
				source.Chmod(original.Name, 0600)
				raw, _ := source.ReadFile(original.Name)
				if err := source.WriteFile("target.enc", raw, 0600); err != nil {
					t.Fatal(err)
				}
				source.Remove(original.Name)
				if err := source.Symlink("target.enc", original.Name); err != nil {
					t.Skip("symlink unavailable", err)
				}
			}
			if _, err := ObserveFile(ctx, source, custody, scope, original, key, max); err == nil {
				t.Fatal("invalid seal accepted", mode)
			}
			if mode != "tamper" {
				entries, _ := os.ReadDir(custody.Name())
				if len(entries) != 0 {
					t.Fatal("failed observation published bytes", entries)
				}
			}
		})
	}
}

func TestObservedSealRejectsDigestValidButInvalidAEAD(t *testing.T) {
	source, custody, scope, original, key := observationFixture(t)
	raw, _ := source.ReadFile(original.Name)
	raw[len(raw)-1] ^= 1
	sum := sha256.Sum256(raw)
	original.SHA256 = hex.EncodeToString(sum[:])
	source.Chmod(original.Name, 0600)
	if err := source.WriteFile(original.Name, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := ObserveFile(context.Background(), source, custody, scope, original, key, 1<<20); err == nil {
		t.Fatal("hash-only evidence accepted")
	}
	entries, _ := os.ReadDir(custody.Name())
	if len(entries) != 0 {
		t.Fatal("invalid AEAD published")
	}
}
