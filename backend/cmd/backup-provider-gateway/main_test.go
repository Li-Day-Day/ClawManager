package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clawreef/internal/systembackup/host"
	"clawreef/internal/systembackup/recovery"
)

func TestGatewayCommandOfflineOnlyUntilNativeAdapterRegistered(t *testing.T) {
	r := recovery.Reference{ID: "fixture", Version: "v1", SHA256: strings.Repeat("a", 64)}
	c := host.ProviderGatewayConfig{Listen: "127.0.0.1:8443", TLS: host.TLSFiles{CA: "/missing/ca", Certificate: "/missing/cert", Key: "/missing/key"}, Server: recovery.GatewayServerConfig{Identity: r, Location: recovery.Locator{Provider: "s3", Bucket: "isolated", Prefix: "root", FailureDomain: "test"}, DiscoveryMode: "known_record_only", Clients: map[string][]string{strings.Repeat("b", 64): {"capabilities", "open", "observe"}}, TimeoutMS: 30000}, BackendModule: r, BackendConfig: host.PinnedFile{Path: "/missing/backend", Reference: r}}
	b, _ := json.Marshal(c)
	path := filepath.Join(t.TempDir(), "config.json")
	if os.WriteFile(path, b, 0600) != nil {
		t.Fatal("fixture write")
	}
	var out bytes.Buffer
	if e := run(context.Background(), []string{"--config", path, "--check-config"}, &out); e != nil || !strings.Contains(out.String(), "no connections opened") {
		t.Fatal(out.String(), e)
	}
	if e := run(context.Background(), []string{"--config", path}, &out); e == nil {
		t.Fatal("missing native implementation started")
	}
}
