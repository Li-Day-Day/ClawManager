package worker

import (
	"bytes"
	"clawreef/internal/systembackup/relaywire"
	"clawreef/internal/systembackup/staging"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestControlRelayUsesOriginalTLSAndExactRetryBytes(t *testing.T) {
	r, env, _ := fixture(t)
	i := Invocation{Request: r, WorkspacePath: env.Workspace.Name(), StagingPath: env.Staging.Name()}
	var bodies [][]byte
	var mu sync.Mutex
	controlCalls := 0
	h := ControlHandler{Authorizer: authorizeFunc(func(_ context.Context, _ string, q ControlRequest) (Lease, error) {
		mu.Lock()
		controlCalls++
		mu.Unlock()
		m := &relaywire.RelayMessage{SchemaVersion: relaywire.RelayVersion, InstallationID: "installation", TaskPublicID: r.Binding.BackupID, TaskType: "backup", AttemptNo: r.Binding.Attempt, Phase: "capture", JobUnitKey: r.Binding.Path, Namespace: "backup", JobName: "worker", JobUID: "uid", JobGeneration: "1", RelayIdentityRef: "ref", RelayIdentityVersion: "v1", Sequence: "1", Status: "ready"}
		l := Lease{InvocationSHA256: q.InvocationSHA256, ExpiresAt: r.Deadline, Relay: m}
		if q.Action == "acquire" {
			m.Sequence = "2"
			m.Status = "running"
			l.DEK = make([]byte, 32)
		}
		if q.Action == "complete" {
			m.Sequence, m.Status = "3", "completed"
			m.ResultEvidence = &relaywire.RelayEvidence{PublicID: "sev_33333333-3333-4333-8333-333333333333", SHA256: strings.Repeat("d", 64)}
		}
		return l, nil
	})}
	client, _ := mutualTLSFixture(t, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "/relay" {
			h.ServeHTTP(w, req)
			return
		}
		if req.TLS == nil || len(req.TLS.VerifiedChains) == 0 || req.Header.Get("Authorization") != "Bearer synthetic-pod-token" {
			t.Error("relay lost original workload authentication")
			w.WriteHeader(403)
			return
		}
		raw, _ := io.ReadAll(req.Body)
		mu.Lock()
		defer mu.Unlock()
		bodies = append(bodies, raw)
		if len(bodies) == 1 || len(bodies) == 4 {
			w.WriteHeader(503)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"decision":"replay"}`)
	}))
	token := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(token, []byte("synthetic-pod-token"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := client.WithWorkloadToken(token); err != nil {
		t.Fatal(err)
	}
	if err := client.Ready(context.Background(), i); !errors.Is(err, ErrNotReady) {
		t.Fatal("lost retry classification", err)
	}
	if err := client.Ready(context.Background(), i); err != nil {
		t.Fatal(err)
	}
	l, err := client.Acquire(context.Background(), i)
	defer l.Clear()
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Complete(context.Background(), i, Result{Receipt: staging.Receipt{Name: r.ArtifactName, Size: 100, SHA256: strings.Repeat("d", 64)}}); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if controlCalls != 5 || len(bodies) != 5 || !bytes.Equal(bodies[0], bodies[1]) || !bytes.Equal(bodies[3], bodies[4]) {
		t.Fatal("retry changed bytes or bypassed original authorization")
	}
	var m relaywire.RelayMessage
	if json.Unmarshal(bodies[2], &m) != nil || m.Sequence != "2" || m.Status != "running" {
		t.Fatal("missing running observation")
	}
	if json.Unmarshal(bodies[4], &m) != nil || m.Sequence != "3" || m.Status != "completed" || m.ResultEvidence == nil {
		t.Fatal("missing registered completion")
	}
}

func TestLeaseRelayRejectsForeignBindingAndTerminalEvidence(t *testing.T) {
	r, _, _ := fixture(t)
	q := ControlRequest{Invocation: Invocation{Request: r}, Action: "ready"}
	m := relaywire.RelayMessage{SchemaVersion: relaywire.RelayVersion, InstallationID: "i", TaskPublicID: r.Binding.BackupID, TaskType: "backup", AttemptNo: r.Binding.Attempt, Phase: "capture", JobUnitKey: r.Binding.Path, Namespace: "n", JobName: "j", JobUID: "u", JobGeneration: "1", RelayIdentityRef: "r", RelayIdentityVersion: "v", Sequence: "1", Status: "ready"}
	if !validLeaseRelay(&m, q) {
		t.Fatal("valid template rejected")
	}
	for _, fault := range []string{"task", "attempt", "part", "sequence", "terminal", "action"} {
		bad, request := m, q
		switch fault {
		case "task":
			bad.TaskPublicID = "other"
		case "attempt":
			bad.AttemptNo = "999"
		case "part":
			bad.JobUnitKey = "other"
		case "sequence":
			bad.Sequence = "2"
		case "terminal":
			bad.ResultEvidence = &relaywire.RelayEvidence{}
		case "action":
			request.Action = "complete"
		}
		if validLeaseRelay(&bad, request) {
			t.Fatal("accepted", fault)
		}
	}
}
