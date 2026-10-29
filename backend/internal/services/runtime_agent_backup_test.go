package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestNativeBackupWireDigestMatchesAgentFieldOrder(t *testing.T) {
	restart := RuntimeAgentCreateGatewayRequest{PodUID: "pod-uid", SecurityProfile: "isolated", InstanceID: 7, UserID: 2, AgentType: "openclaw", WorkspacePath: "/workspaces/user-2/instance-7", GatewayPort: 20000, PortRange: RuntimeAgentPortRange{Start: 20000, End: 20002}, UID: 1001, GID: 1001, CPUCores: 1.5, MemoryMB: 1024, DiskQuotaMB: 4096, Generation: 9, RequestID: "resume-7", Environment: map[string]string{"B": "two", "A": "one"}}
	// Agent gateway.BackupRestartDigest hashes json.Marshal(CreateGatewayRequest).
	// Its wire struct places PodUID/SecurityProfile first, then the original
	// create fields, RequestID, UpgradeID, Environment and Env.
	want := []byte(`{"pod_uid":"pod-uid","security_profile":"isolated","instance_id":7,"user_id":2,"agent_type":"openclaw","workspace_path":"/workspaces/user-2/instance-7","gateway_port":20000,"port_range":{"start":20000,"end":20002},"uid":1001,"gid":1001,"cpu_cores":1.5,"memory_mb":1024,"disk_quota_mb":4096,"generation":9,"request_id":"resume-7","environment":{"A":"one","B":"two"}}`)
	digest, err := RuntimeBackupRestartDigest(restart)
	if err != nil {
		t.Fatal(err)
	}
	h := sha256.Sum256(want)
	if digest != hex.EncodeToString(h[:]) {
		t.Fatal("native restart digest differs from Agent wire bytes")
	}
	req := backupClientTestRequest()
	got, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	wantRequest := []byte(`{"protocol":"isolated-backup.v1","namespace":"tenant-system","pod_uid":"pod-uid","agent_epoch":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","operation_id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","runtime_type":"openclaw","instance_id":7,"user_id":2,"generation":5,"gateway_id":"gw-7-5","gateway_port":20000,"expected_pid":123,"resume_generation":9,"restart_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}`)
	if !bytes.Equal(got, wantRequest) {
		t.Fatalf("native request bytes differ: %s", got)
	}
}

func backupClientTestRequest() RuntimeBackupRequest {
	return RuntimeBackupRequest{Protocol: RuntimeBackupProtocol, Namespace: "tenant-system", PodUID: "pod-uid", AgentEpoch: strings.Repeat("a", 32), OperationID: strings.Repeat("b", 32), RuntimeType: "openclaw", InstanceID: 7, UserID: 2, Generation: 5, GatewayID: "gw-7-5", GatewayPort: 20000, ExpectedPID: 123, ResumeGeneration: 9, RestartSHA256: strings.Repeat("c", 64)}
}

func TestNativeBackupClientRequiresExactAuthenticatedReceipt(t *testing.T) {
	req := backupClientTestRequest()
	state := "stopped"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-ClawManager-Control-Token") != "control" {
			w.WriteHeader(401)
			return
		}
		if r.URL.Path == "/v1/backup/capabilities" {
			json.NewEncoder(w).Encode(RuntimeBackupCapabilities{Protocol: RuntimeBackupProtocol, Namespace: req.Namespace, PodUID: req.PodUID, AgentEpoch: req.AgentEpoch, GatewayPort: req.GatewayPort, Slot: "slot-0", Scope: RuntimeBackupStopScope, Supported: true, DurableReservation: true})
			return
		}
		if r.URL.Path == "/v1/backup/state" && state == "missing" {
			w.WriteHeader(404)
			return
		}
		if r.URL.Path == "/v1/backup/state" && state == "pending" {
			w.WriteHeader(202)
			w.Write([]byte(`{"state":"resuming"}`))
			return
		}
		got := req
		if state == "wrong-pod" {
			got.PodUID = "other-pod"
		}
		if state == "wrong-scope" {
			got.RestartSHA256 = strings.Repeat("d", 64)
		}
		json.NewEncoder(w).Encode(RuntimeBackupReceipt{Request: got, State: "stopped", Scope: RuntimeBackupStopScope, ConfirmedAt: time.Now().UTC()})
	}))
	defer server.Close()
	client := NewRuntimeAgentClient("control").(RuntimeAgentBackupClient)
	if _, err := client.BackupCapabilities(context.Background(), server.URL, req.GatewayPort); err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"stopped", "missing", "pending", "wrong-pod", "wrong-scope"} {
		state = mode
		result, err := client.BackupControl(context.Background(), server.URL, "state", req, nil)
		if mode == "stopped" && (err != nil || result.Pending || len(result.Raw) == 0 || result.Receipt.State != "stopped") {
			t.Fatal("positive raw receipt lost", err)
		}
		if mode == "pending" && (err != nil || !result.Pending || len(result.Raw) != 0) {
			t.Fatal("pending became stop proof", err)
		}
		if (mode == "missing" || strings.HasPrefix(mode, "wrong")) && err == nil {
			t.Fatal("unconfirmed response accepted", mode)
		}
	}
}

func TestNativeBackupClientRejectsRedirectAndModifiedRestart(t *testing.T) {
	req := backupClientTestRequest()
	var reached int
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached++
		w.Header().Set("Location", "http://example.invalid/collect")
		w.WriteHeader(307)
	}))
	defer redirect.Close()
	client := NewRuntimeAgentClient("control").(RuntimeAgentBackupClient)
	if _, err := client.BackupCapabilities(context.Background(), redirect.URL, req.GatewayPort); err == nil || reached != 1 {
		t.Fatal("redirect was followed or accepted")
	}
	restart := RuntimeAgentCreateGatewayRequest{InstanceID: 7, UserID: 2, Generation: 9, PodUID: req.PodUID, AgentType: "openclaw", GatewayPort: 20000, PortRange: RuntimeAgentPortRange{Start: 20000, End: 20002}, UID: 1001, GID: 1001, WorkspacePath: "/workspaces/openclaw/user-2/instance-7"}
	if _, err := client.BackupControl(context.Background(), redirect.URL, "resume", req, &restart); err == nil || reached != 1 {
		t.Fatal("modified restart sent to Agent")
	}
}
