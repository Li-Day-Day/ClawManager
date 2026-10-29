package runtimecustody

import (
	"bytes"
	"clawreef/internal/systembackup/staging"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestOriginalGatewayCustodyAuthenticatesGenerationAndRetries(t *testing.T) {
	dir := t.TempDir()
	key := bytes.Repeat([]byte{31}, 32)
	keyFile := filepath.Join(dir, "key")
	if e := os.WriteFile(keyFile, key, 0600); e != nil {
		t.Fatal(e)
	}
	store := Store{Directory: dir, KeyFile: keyFile, Installation: "installation"}
	raw := []byte(`{"instance_id":7,"user_id":2,"generation":3,"workspace_path":"/workspace/2/7","environment":{"SECRET":"original-value"}}`)
	if e := store.Save(context.Background(), raw); e != nil {
		t.Fatal(e)
	}
	files, e := filepath.Glob(filepath.Join(dir, "*.enc"))
	if e != nil || len(files) != 1 {
		t.Fatal("missing encrypted receipt")
	}
	sealed, e := os.ReadFile(files[0])
	if e != nil || bytes.Contains(sealed, []byte("original-value")) {
		t.Fatal("plaintext persisted")
	}
	if e := store.Save(context.Background(), raw); e != nil {
		t.Fatal("idempotent retry", e)
	}
	after, _ := os.ReadFile(files[0])
	if !bytes.Equal(sealed, after) {
		t.Fatal("receipt overwritten")
	}
	id := Identity{InstanceID: 7, UserID: 2, Generation: 3, WorkspacePath: "/workspace/2/7"}
	for _, fault := range []string{"", "generation", "installation", "key", "truncated"} {
		t.Run(fault, func(t *testing.T) {
			bnd := Binding("installation", id, digest(raw))
			secret := append([]byte(nil), key...)
			cipher := sealed
			switch fault {
			case "generation":
				bnd.Attempt = "4"
			case "installation":
				bnd.BackupID = "other"
			case "key":
				secret[0] ^= 1
			case "truncated":
				cipher = cipher[:len(cipher)-1]
			}
			var out bytes.Buffer
			e := staging.Open(context.Background(), bytes.NewReader(cipher), &out, secret, bnd, 7<<20)
			if (e == nil) != (fault == "") {
				t.Fatal("authentication boundary", e)
			}
			if fault == "" && !bytes.Equal(out.Bytes(), raw) {
				t.Fatal("original bytes changed")
			}
		})
	}
	if e = os.WriteFile(files[0], []byte("damaged"), 0600); e != nil { // sealed files are read-only on Unix
		if os.Chmod(files[0], 0600) != nil {
			t.Fatal(e)
		}
		if e = os.WriteFile(files[0], []byte("damaged"), 0600); e != nil {
			t.Fatal(e)
		}
	}
	if store.Save(context.Background(), raw) == nil {
		t.Fatal("damaged existing receipt accepted")
	}
}
