package main

import (
	"net/http"
	"strings"
	"testing"
)

func TestPublicRecoveryHealthDoesNotAdvertiseCapture(t *testing.T) {
	s := &controllerStatus{}
	s.leading.Store(true)
	s.setDependenciesReady()
	for _, forward := range []bool{true, false} {
		s.setPublicReady(forward, 7)
		code, body := requestHealth(t, healthHandler(fixedPinger{}, s), "/readyz")
		mode := "disabled"
		if forward {
			mode = "enabled"
		}
		if code != http.StatusOK || !strings.Contains(body, "config="+mode+" effective="+mode+" config_version=7") {
			t.Fatalf("forward=%v: %d %s", forward, code, body)
		}
	}
	s.setDependencyFailure("standby")
	code, _ := requestHealth(t, healthHandler(fixedPinger{}, s), "/readyz")
	if code == http.StatusOK {
		t.Fatal("standby recovery advertised ready dependencies")
	}
}
