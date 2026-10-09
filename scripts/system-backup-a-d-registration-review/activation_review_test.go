package systembackupsecurity

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

// Exercise the public bootstrap boundary with every required registry/ref
// omitted in turn. A valid-looking hash cannot replace a missing input.
func TestAReviewBootstrapRequiresEveryRealInputSlot(t *testing.T) {
	for _, group := range []string{"registries", "references"} {
		var original map[string]json.RawMessage
		if err := json.Unmarshal(bootstrapFixture(t), &original); err != nil {
			t.Fatal(err)
		}
		var entries []json.RawMessage
		if err := json.Unmarshal(original[group], &entries); err != nil {
			t.Fatal(err)
		}
		for index, entry := range entries {
			var fields map[string]string
			if err := json.Unmarshal(entry, &fields); err != nil {
				t.Fatal(err)
			}
			name := fields["registry_kind"] + fields["purpose"]
			t.Run(group+"/"+name, func(t *testing.T) {
				svc, grant, _, state := bootstrapServiceFixture(t)
				remaining := append([]json.RawMessage(nil), entries[:index]...)
				remaining = append(remaining, entries[index+1:]...)
				original[group], _ = json.Marshal(remaining)
				raw, _ := json.Marshal(original)
				grant.ConfigSHA256 = registrationHash(string(raw))
				result, err := svc.Bootstrap(context.Background(), grant, raw)
				if err != ErrBootstrapConfig || result.OperationPublicID != "" || state.authorized != 0 || state.validated != 0 || len(state.committed) != 0 {
					t.Fatal("missing required input reached admission or writes", err)
				}
			})
		}
	}
}

func TestAReviewBootstrapRetryRechecksOfflineGrant(t *testing.T) {
	svc, grant, raw, state := bootstrapServiceFixture(t)
	state.commitUnknown = true
	if _, err := svc.Bootstrap(context.Background(), grant, raw); err != ErrRegistrationCommitUnknown {
		t.Fatal(err)
	}
	if state.op == "" || len(state.committed) != 6 {
		t.Fatal("fixture did not commit before losing acknowledgement")
	}
	state.commitUnknown = false
	state.denied = true
	if result, err := svc.Bootstrap(context.Background(), grant, raw); err != ErrRegistrationPermission || result.OperationPublicID != "" || len(state.committed) != 6 || state.authorized != 2 {
		t.Fatal("uncertain commit retry bypassed current offline authorization", err)
	}
}

func TestAReviewHTTPDoesNotTrustForwardedTLSOrExposeBootstrap(t *testing.T) {
	api := RegistrationAPI{}
	for _, path := range []string{ProviderRegistrationPath, ProviderObservationPath, strongAuthBase + "/enroll", strongAuthBase + "/confirm", strongAuthBase + "/proof"} {
		t.Run(path, func(t *testing.T) {
			r := httptest.NewRequest("POST", "http://example.test"+path, strings.NewReader(`{}`))
			r.Header.Set("X-Forwarded-Proto", "https")
			r.Header.Set("X-Forwarded-User", "user:1")
			w := httptest.NewRecorder()
			api.ServeHTTP(w, r)
			if w.Code != 426 {
				t.Fatal("plaintext reached API", w.Code)
			}
		})
	}
	for _, path := range []string{strongAuthBase + "/bootstrap", "/api/v1/admin/system-backup-config/bootstrap"} {
		r := httptest.NewRequest("POST", path, strings.NewReader(`{}`))
		r.TLS = &tls.ConnectionState{}
		w := httptest.NewRecorder()
		api.ServeHTTP(w, r)
		if w.Code != 404 {
			t.Fatal("offline bootstrap exposed on HTTPS", w.Code)
		}
	}
}
