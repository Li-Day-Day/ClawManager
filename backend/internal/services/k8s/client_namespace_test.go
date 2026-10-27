package k8s

import "testing"

func TestGetSystemNamespaceIsIdempotent(t *testing.T) {
	tests := map[string]string{
		"":                              "system",
		"clawmanager":                   "clawmanager-system",
		"clawmanager-zhanghui08":        "clawmanager-zhanghui08-system",
		"clawmanager-zhanghui08-system": "clawmanager-zhanghui08-system",
	}
	for namespace, expected := range tests {
		client := &Client{Namespace: namespace}
		if got := client.GetSystemNamespace(); got != expected {
			t.Errorf("GetSystemNamespace() for %q = %q, want %q", namespace, got, expected)
		}
	}
}
