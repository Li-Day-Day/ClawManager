package systembackupkms

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A matching configuration and request must still name an exact registry
// version. A mismatch-only test would miss a mutable alias on both sides.
func TestExactRegistryVersionAtKEKBoundary(t *testing.T) {
	s := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("construction must not contact provider")
	}))
	defer s.Close()
	r := resolverFunc(func(context.Context, Access) (Grant, error) {
		t.Error("invalid mapping reached credential resolver")
		return Grant{}, ErrPermission
	})
	for _, version := range []string{"latest", "current", "default", "", "version with spaces", "v/1", strings.Repeat("v", 129)} {
		t.Run(version, func(t *testing.T) {
			c := testConfig(s)
			c.Key.RegistryVersion = version
			request := testRequest()
			request.Key = c.Key
			if _, err := TransitContext(request); !errors.Is(err, ErrBinding) {
				t.Fatalf("invalid registry version produced provider context: %v", err)
			}
			if g, err := NewCaptureGenerator(c, r); !errors.Is(err, ErrBinding) {
				if g != nil {
					g.Close()
				}
				t.Fatalf("capture accepted invalid registry version: %v", err)
			}
			if u, err := NewRecoveryUnwrapper(c, r); !errors.Is(err, ErrBinding) {
				if u != nil {
					u.Close()
				}
				t.Fatalf("recovery accepted invalid registry version: %v", err)
			}
		})
	}
	for _, version := range []string{"registry-r17", "r:2026.10-29", strings.Repeat("v", 128)} {
		c := testConfig(s)
		c.Key.RegistryVersion = version
		request := testRequest()
		request.Key = c.Key
		if _, err := TransitContext(request); err != nil {
			t.Fatal(err)
		}
		g, err := NewCaptureGenerator(c, r)
		if err != nil {
			t.Fatal(err)
		}
		g.Close()
		u, err := NewRecoveryUnwrapper(c, r)
		if err != nil {
			t.Fatal(err)
		}
		u.Close()
		if c.Key.ProviderVersion != "3" {
			t.Fatal("registry version changed provider version")
		}
	}
}
