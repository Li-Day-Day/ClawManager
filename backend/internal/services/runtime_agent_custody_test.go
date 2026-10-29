package services

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestRuntimeAgentCreatePersistsOriginalBeforeDispatch(t *testing.T) {
	dir := t.TempDir()
	key := filepath.Join(dir, "key")
	if os.WriteFile(key, make([]byte, 32), 0600) != nil {
		t.Fatal("key setup")
	}
	t.Setenv("RUNTIME_CREATE_RECEIPT_DIR", dir)
	t.Setenv("RUNTIME_CREATE_RECEIPT_KEY_FILE", key)
	t.Setenv("RUNTIME_CREATE_RECEIPT_INSTALLATION_ID", "installation")
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		files, _ := filepath.Glob(filepath.Join(dir, "*.enc"))
		if len(files) != 1 {
			t.Error("POST preceded durable custody")
		}
		var got RuntimeAgentCreateGatewayRequest
		if json.NewDecoder(r.Body).Decode(&got) != nil || got.Generation != 4 || got.Environment["SECRET"] != "original" {
			t.Error("dispatch changed original")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"gateway_id":"gw-7-4","port":18789,"status":"running"}`))
	}))
	defer server.Close()
	client := NewRuntimeAgentClient("test")
	req := RuntimeAgentCreateGatewayRequest{InstanceID: 7, UserID: 2, Generation: 4, WorkspacePath: "/workspace/2/7", Environment: map[string]string{"SECRET": "original"}}
	if _, e := client.CreateGateway(context.Background(), server.URL, req); e != nil {
		t.Fatal(e)
	}
	if calls != 1 {
		t.Fatal("create did not dispatch")
	}
	t.Setenv("RUNTIME_CREATE_RECEIPT_KEY_FILE", filepath.Join(dir, "missing"))
	if _, e := NewRuntimeAgentClient("test").CreateGateway(context.Background(), server.URL, req); e == nil || calls != 1 {
		t.Fatal("custody failure still dispatched")
	}
}
