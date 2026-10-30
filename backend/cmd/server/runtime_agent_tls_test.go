package main

import (
	"os"
	"path/filepath"
	"testing"

	"clawreef/internal/config"
)

func TestRuntimeAgentCAPinFailsClosed(t *testing.T) {
	file := filepath.Join(t.TempDir(), "ca.pem")
	if err := os.WriteFile(file, []byte("certificate"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, cfg := range []config.RuntimePoolConfig{
		{AgentCAFile: file},
		{AgentCASHA256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"},
		{AgentCAFile: file, AgentCASHA256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"},
	} {
		if _, err := newRuntimeAgentClient(cfg); err == nil {
			t.Fatal("partial or mismatched runtime Agent CA accepted")
		}
	}
}
