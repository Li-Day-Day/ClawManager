package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOfflineDiagnosticsAndMaterialsNeedNoRuntime(t *testing.T) {
	var out bytes.Buffer
	if e := run(context.Background(), []string{"--materials-template"}, &out); e != nil || !strings.Contains(out.String(), `"production_secrets_required": false`) {
		t.Fatal(e, out.String())
	}
	p := filepath.Join(t.TempDir(), "config.json")
	if e := os.WriteFile(p, []byte(`{"Owner":"canary"}`), 0600); e != nil {
		t.Fatal(e)
	}
	out.Reset()
	if e := run(context.Background(), []string{"--config", p, "--diagnose"}, &out); e == nil || !strings.Contains(out.String(), `"structure_valid": false`) || strings.Contains(out.String(), "canary") {
		t.Fatal(e, out.String())
	}
	out.Reset()
	if e := run(context.Background(), []string{"--config", p, "--materials-template"}, &out); e == nil {
		t.Fatal("ambiguous command")
	}
}
