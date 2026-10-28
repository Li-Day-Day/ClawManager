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

func TestPrivateControllerRequiresSeparateExplicitLab(t *testing.T) {
	for _, tc := range []struct {
		explicit    bool
		name, value string
		allowed     bool
	}{
		{false, "", "", false}, {true, "", "", true},
		{true, "SYSTEM_BACKUP_ENABLED", "true", false},
		{true, "SYSTEM_BACKUP_ENABLED", "false", false},
		{true, "SYSTEM_BACKUP_ORIGIN_INSTALLATION_ID", "installation_public", false},
	} {
		err := validateLabExecution(tc.explicit, func(key string) string {
			if key == tc.name {
				return tc.value
			}
			return ""
		})
		if (err == nil) != tc.allowed {
			t.Fatalf("explicit=%v key=%s err=%v", tc.explicit, tc.name, err)
		}
	}
}
