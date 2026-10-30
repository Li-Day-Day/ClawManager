package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"

	"clawreef/internal/config"
	"clawreef/internal/services"
)

func newRuntimeAgentClient(cfg config.RuntimePoolConfig) (services.RuntimeAgentClient, error) {
	if cfg.AgentCAFile == "" && cfg.AgentCASHA256 == "" {
		return services.NewRuntimeAgentClient(cfg.AgentControlToken), nil
	}
	if !filepath.IsAbs(cfg.AgentCAFile) || filepath.Clean(cfg.AgentCAFile) != cfg.AgentCAFile || len(cfg.AgentCASHA256) != 64 {
		return nil, errors.New("runtime Agent CA path and SHA256 must be pinned together")
	}
	f, err := os.Open(cfg.AgentCAFile)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() || st.Size() > 1<<20 {
		return nil, errors.New("invalid runtime Agent CA file")
	}
	ca, err := io.ReadAll(io.LimitReader(f, (1<<20)+1))
	if err != nil || len(ca) > 1<<20 {
		return nil, errors.New("runtime Agent CA file is unreadable or too large")
	}
	digest := sha256.Sum256(ca)
	if hex.EncodeToString(digest[:]) != cfg.AgentCASHA256 {
		return nil, errors.New("runtime Agent CA SHA256 mismatch")
	}
	return services.NewRuntimeAgentClientWithPinnedCA(cfg.AgentControlToken, ca)
}
