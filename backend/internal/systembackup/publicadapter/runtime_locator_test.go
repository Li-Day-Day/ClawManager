package publicadapter

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"clawreef/internal/services"
	d "clawreef/internal/systembackupdispatch"
)

func TestRuntimeLocatorKeepsRawSourceInventoryAndCustodyCompatibility(t *testing.T) {
	ports, deps := writerTestDeps(t)
	source := writerTestSource()
	source.Namespace, source.Pod = "", ""
	deps.Agent = services.NewRuntimeAgentClient("synthetic").(services.BackupGatewayAgent)
	deps.Callbacks.LoadGateway = func(context.Context, d.Authority, string, string) (services.RuntimeAgentCreateGatewayRequest, error) {
		return services.RuntimeAgentCreateGatewayRequest{}, nil
	}
	spec := RuntimeWriterSpec{Source: source, Kind: "gateway", UID: "pod-uid", Endpoint: "http://10.1.2.3:8080", RestartRef: "encrypted-original", ResumeGeneration: 8, UIDNumber: 200007, GIDNumber: 200007, Port: 20000,
		Runtime: RuntimeLocator{Version: "runtime-locator.v2", Namespace: "backup", Pod: "actual-pod", Deployment: "runtime", RuntimePodID: 6, GatewayPID: 123, AgentEpoch: strings.Repeat("a", 32)}}
	spec.Backup = RuntimeGatewayBackup{Protocol: services.RuntimeBackupProtocol, OperationID: strings.Repeat("b", 32), RestartSHA256: strings.Repeat("c", 64)}
	builder, err := NewRuntimeWriterBuilder([]RuntimeWriterSpec{spec}, deps)
	if err != nil {
		t.Fatal(err)
	}
	inv := writerTestInventory(source)
	if writers, err := builder(context.Background(), ports.in, inv, nil); err != nil || len(writers) != 2 {
		t.Fatal("raw source not accepted alongside independent locator", err)
	}
	inv.Instances[0].Namespace = "backup"
	if _, err := builder(context.Background(), ports.in, inv, nil); err == nil {
		t.Fatal("rewritten source accepted as original")
	}
	for _, mutate := range []func(*RuntimeWriterSpec){
		func(s *RuntimeWriterSpec) { s.Runtime.Version = "unknown" },
		func(s *RuntimeWriterSpec) { s.Source.Namespace = "other" },
		func(s *RuntimeWriterSpec) { s.Source.Pod = "old-pod" },
		func(s *RuntimeWriterSpec) { s.Runtime.RegisteredPodUID = "different" },
		func(s *RuntimeWriterSpec) { s.Runtime.GatewayPID = 0 },
		func(s *RuntimeWriterSpec) { s.Runtime.RuntimePodID = 0 },
	} {
		changed := spec
		mutate(&changed)
		if _, err := NewRuntimeWriterBuilder([]RuntimeWriterSpec{changed}, deps); err == nil {
			t.Fatal("conflicting source/locator accepted")
		}
	}
	raw, _ := json.Marshal(spec)
	var roundtrip RuntimeWriterSpec
	if json.Unmarshal(raw, &roundtrip) != nil || roundtrip != spec {
		t.Fatal("custody locator changed on readback")
	}
	spec.Runtime = RuntimeLocator{}
	spec.Source = writerTestSource()
	raw, _ = json.Marshal(spec)
	if strings.Contains(string(raw), `"Runtime":`) {
		t.Fatal("zero locator changed historical custody serialization")
	}
	if _, err := NewRuntimeWriterBuilder([]RuntimeWriterSpec{spec}, deps); err == nil {
		t.Fatal("legacy custody admitted without native protocol")
	}
}
