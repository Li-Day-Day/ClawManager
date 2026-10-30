package services

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"clawreef/internal/systembackup/flow"
	"clawreef/internal/systembackup/scope"
)

type backupGatewayFixture struct {
	mu                                        sync.Mutex
	states                                    map[string]*RuntimeAgentGatewayState
	creates, deletes, completed               int
	claimed, loseCreate, holdCreate, loseStop bool
	stopProof                                 bool
	blockPoint                                string
	writer                                    *BackupGatewayWriter
}

func newBackupGatewayFixture(t *testing.T, agent string, running bool) *backupGatewayFixture {
	t.Helper()
	f := &backupGatewayFixture{states: map[string]*RuntimeAgentGatewayState{}}
	if running {
		f.states["gw-7-3"] = &RuntimeAgentGatewayState{GatewayID: "gw-7-3", InstanceID: 7, Generation: 3, State: "running"}
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(out http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if r.Header.Get("X-ClawManager-Control-Token") != "fixture-control" {
			out.WriteHeader(403)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/v1/gateways/")
		switch r.Method {
		case http.MethodGet:
			state := f.states[id]
			if state == nil {
				out.WriteHeader(404)
				return
			}
			json.NewEncoder(out).Encode(state)
		case http.MethodDelete:
			if id != "gw-7-3" {
				t.Error("delete touched recovery generation")
			}
			f.deletes++
			delete(f.states, id)
			if f.loseStop {
				out.WriteHeader(504)
				out.Write([]byte("synthetic-private-error"))
				return
			}
			out.WriteHeader(204)
		case http.MethodPost:
			var req RuntimeAgentCreateGatewayRequest
			if json.NewDecoder(r.Body).Decode(&req) != nil {
				out.WriteHeader(400)
				return
			}
			if !f.claimed || req.Generation != 4 || req.InstanceID != 7 || req.AgentType != agent || req.Environment["TOKEN"] != "synthetic-secret" {
				t.Error("restart lacked durable dispatch or immutable material")
			}
			f.creates++
			if !f.holdCreate {
				f.states["gw-7-4"] = &RuntimeAgentGatewayState{GatewayID: "gw-7-4", InstanceID: 7, Generation: 4, State: "running"}
			}
			if f.loseCreate || f.holdCreate {
				out.WriteHeader(504)
				return
			}
			json.NewEncoder(out).Encode(RuntimeAgentCreateGatewayResponse{GatewayID: "gw-7-4", Port: 20007, Status: "running"})
		default:
			out.WriteHeader(405)
		}
	}))
	t.Cleanup(server.Close)
	agentClient := NewRuntimeAgentClientWithHTTPClient("fixture-control", server.Client()).(BackupGatewayAgent)
	w := &BackupGatewayWriter{Agent: agentClient, Source: BackupGatewaySource{Runtime: scope.Runtime{Type: agent, Mode: "lite", Backend: "gateway", Variant: "linux", OS: "linux"}, Endpoint: server.URL, PodUID: "runtime-pod-uid", Workspace: "/workspaces/fixture/user-4/instance-7", RestartRef: "encrypted-task-ref", InstanceID: 7, UserID: 4, Generation: 3, ResumeGeneration: 4, UID: 200007, GID: 200007, Port: 20007}, PollInterval: time.Millisecond}
	w.Guard = func(_ context.Context, p string, _ flow.State) error {
		f.mu.Lock()
		defer f.mu.Unlock()
		if f.blockPoint == p {
			return errors.New("fence lost")
		}
		return nil
	}
	w.LoadRestart = func(_ context.Context, ref string) (RuntimeAgentCreateGatewayRequest, error) {
		if ref != "encrypted-task-ref" {
			return RuntimeAgentCreateGatewayRequest{}, errors.New("unknown ref")
		}
		return RuntimeAgentCreateGatewayRequest{InstanceID: 7, UserID: 4, Generation: 4, AgentType: agent, WorkspacePath: w.Source.Workspace, UID: 200007, GID: 200007, GatewayPort: 20007, Environment: map[string]string{"TOKEN": "synthetic-secret"}}, nil
	}
	w.ClaimRestart = func(context.Context, flow.State) (bool, error) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if f.claimed {
			return false, nil
		}
		f.claimed = true
		return true, nil
	}
	w.CompleteRestart = func(_ context.Context, _ flow.State, id string, port int) error {
		f.mu.Lock()
		defer f.mu.Unlock()
		if id != "gw-7-4" || port != 20007 {
			return errors.New("identity")
		}
		f.completed++
		return nil
	}
	w.GatewayControl = func(_ context.Context, point string, _ flow.State) (bool, error) {
		f.mu.Lock()
		defer f.mu.Unlock()
		switch point {
		case "before-stop", "recovery-stop-old":
			if point == "recovery-stop-old" && f.claimed {
				return f.stopProof, nil
			}
			if f.states["gw-7-4"] != nil {
				return false, errors.New("successor already present")
			}
			if f.stopProof {
				return true, nil
			}
			old := f.states["gw-7-3"]
			if old == nil || old.InstanceID != 7 || old.Generation != 3 {
				return false, errors.New("no positive source identity")
			}
			f.deletes++
			delete(f.states, "gw-7-3")
			f.stopProof = true
			if f.loseStop {
				f.loseStop = false
				return false, errors.New("synthetic-private-error")
			}
			return true, nil
		case "check-stopped", "recovery-check-stopped":
			return f.stopProof && f.states["gw-7-4"] == nil, nil
		case "restart-dispatched":
			if !f.claimed || !f.stopProof {
				return false, errors.New("unreserved dispatch")
			}
			f.creates++
			if !f.holdCreate {
				f.states["gw-7-4"] = &RuntimeAgentGatewayState{GatewayID: "gw-7-4", InstanceID: 7, Generation: 4, State: "running"}
			}
			if f.loseCreate || f.holdCreate {
				return false, errors.New("uncertain dispatch")
			}
			return true, nil
		case "check-resumed":
			return f.states["gw-7-4"] != nil && f.stopProof && f.claimed, nil
		case "release-restart":
			return f.completed > 0, nil
		}
		return false, errors.New("unknown control point")
	}
	f.writer = w
	return f
}
func backupContext(t *testing.T) context.Context {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	t.Cleanup(cancel)
	return ctx
}
func TestBackupGatewayWriterRejectsPlaintextBeforeAgentRequest(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests++ }))
	t.Cleanup(server.Close)
	f := newBackupGatewayFixture(t, "openclaw", true)
	f.writer.Source.Endpoint = server.URL
	if _, err := f.writer.Observe(backupContext(t)); err == nil || requests != 0 {
		t.Fatal("plaintext Agent endpoint was contacted")
	}
}
func TestBackupGatewayWriterLinuxMatrixAndLateStop(t *testing.T) {
	for _, agent := range []string{"openclaw", "hermes", "opencode", "deepseek-harness", "workbuddy"} {
		t.Run(agent, func(t *testing.T) {
			f := newBackupGatewayFixture(t, agent, true)
			ctx := backupContext(t)
			s, err := f.writer.Observe(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(s.Checkpoint, "synthetic-secret") || strings.Contains(s.Checkpoint, "fixture-control") {
				t.Fatal("credentials in pause journal")
			}
			ack, err := f.writer.Pause(ctx, s)
			if err != nil || !ack.Stopped {
				t.Fatal(err)
			}
			if err = f.writer.CheckPaused(ctx, s); err != nil {
				t.Fatal(err)
			}
			if err = f.writer.Resume(ctx, s); err != nil {
				t.Fatal(err)
			}
			if err = f.writer.Agent.DeleteGateway(ctx, f.writer.Source.Endpoint, "gw-7-3"); err != nil {
				t.Fatal(err)
			}
			if err = f.writer.Resume(ctx, s); err != nil {
				t.Fatal("idempotent recovery failed", err)
			}
			f.mu.Lock()
			defer f.mu.Unlock()
			if f.creates != 1 || f.states["gw-7-4"] == nil || f.states["gw-7-4"].State != "running" || f.completed != 2 {
				t.Fatal("late stop or retry damaged recovery")
			}
		})
	}
}
func TestBackupGatewayWriterDoesNotTreatMissingRunningSourceAsStopped(t *testing.T) {
	f := newBackupGatewayFixture(t, "hermes", false)
	if _, err := f.writer.Observe(backupContext(t)); err == nil {
		t.Fatal("missing source became stop evidence")
	}
	if f.creates != 0 || f.deletes != 0 || f.completed != 0 {
		t.Fatal("missing source mutated")
	}
}
func TestBackupGatewayWriterLostStopAndCreateResponses(t *testing.T) {
	f := newBackupGatewayFixture(t, "openclaw", true)
	ctx := backupContext(t)
	s, err := f.writer.Observe(ctx)
	if err != nil {
		t.Fatal(err)
	}
	f.mu.Lock()
	f.loseStop = true
	f.loseCreate = true
	f.mu.Unlock()
	if _, err = f.writer.Pause(ctx, s); err == nil || strings.Contains(err.Error(), "synthetic-private") {
		t.Fatal("uncertain stop or sensitive error mishandled")
	}
	if err = f.writer.Resume(ctx, s); err != nil {
		t.Fatal("could not reconcile lost replies", err)
	}
	if f.creates != 1 || f.completed != 1 {
		t.Fatal("replayed restart")
	}
}
func TestBackupGatewayWriterUncertainCreateIsOnlyReconciled(t *testing.T) {
	f := newBackupGatewayFixture(t, "openclaw", true)
	ctx := backupContext(t)
	s, err := f.writer.Observe(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.writer.Pause(ctx, s); err != nil {
		t.Fatal(err)
	}
	f.mu.Lock()
	f.holdCreate = true
	f.mu.Unlock()
	for n := 0; n < 2; n++ {
		short, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
		if err = f.writer.Resume(short, s); err == nil {
			t.Fatal("unobserved restart reported success")
		}
		cancel()
	}
	f.mu.Lock()
	if f.creates != 1 {
		f.mu.Unlock()
		t.Fatal("uncertain create repeated")
	}
	f.states["gw-7-4"] = &RuntimeAgentGatewayState{GatewayID: "gw-7-4", InstanceID: 7, Generation: 4, State: "running"}
	f.mu.Unlock()
	// Reconstruct the adapter after a simulated controller restart; intent and
	// immutable restart ref survive outside the adapter's process-local state.
	rebuilt := *f.writer
	if err = rebuilt.Resume(ctx, s); err != nil {
		t.Fatal("takeover failed", err)
	}
}
func TestBackupGatewayWriterRejectsDriftAndMissingRecoveryDependencies(t *testing.T) {
	for _, mode := range []string{"guard", "restart-ref", "generation", "identity", "recovery-exists", "windows", "checkpoint", "no-deadline", "no-proof-callback"} {
		t.Run(mode, func(t *testing.T) {
			f := newBackupGatewayFixture(t, "workbuddy", true)
			ctx := backupContext(t)
			s, err := f.writer.Observe(ctx)
			if err != nil {
				t.Fatal(err)
			}
			switch mode {
			case "guard":
				f.mu.Lock()
				f.blockPoint = "before-stop"
				f.mu.Unlock()
			case "restart-ref":
				f.writer.LoadRestart = nil
			case "generation":
				f.writer.Source.ResumeGeneration = 3
			case "identity":
				f.mu.Lock()
				f.states["gw-7-3"].InstanceID = 9
				f.mu.Unlock()
			case "recovery-exists":
				f.mu.Lock()
				f.states["gw-7-4"] = &RuntimeAgentGatewayState{GatewayID: "gw-7-4", InstanceID: 7, Generation: 4, State: "running"}
				f.mu.Unlock()
			case "windows":
				f.writer.Source.Runtime.Variant = "windows"
			case "checkpoint":
				s.Checkpoint += " "
			case "no-proof-callback":
				f.writer.GatewayControl = nil
			case "no-deadline":
				ctx = context.Background()
			}
			if _, err = f.writer.Pause(ctx, s); err == nil {
				t.Fatal("unsafe stop accepted")
			}
			if f.deletes != 0 || f.creates != 0 {
				t.Fatal("mutated before identity/guard checks")
			}
		})
	}
}
