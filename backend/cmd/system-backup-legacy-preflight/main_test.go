package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestLegacyPreflightRejectsUnsafeDSNBeforeConnection(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "dsn")
	if err := os.WriteFile(file, []byte("root:secret@tcp(127.0.0.1:3306)/cm_import_00000000000000000000000000000000?multiStatements=true"), 0600); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := run(context.Background(), file, filepath.Join(dir, "missing-inventory"), &output); err == nil || output.Len() != 0 {
		t.Fatal("unsafe DSN reached preflight")
	}
	if _, err := privateFile(dir, 16384); err == nil {
		t.Fatal("directory accepted as private input")
	}
}
