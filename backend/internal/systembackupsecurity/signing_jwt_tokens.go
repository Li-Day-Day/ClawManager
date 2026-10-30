package systembackupsecurity

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
)

// SigningJWTMount is trusted deployment composition, never artifact or HTTP
// input. Each purpose has its own provider key, role, policy and projected JWT.
type SigningJWTMount struct {
	Binding                          TransitSigningBinding
	AuthMount, Role, Policy, JWTFile string
	CAPEM                            []byte
	CASHA256                         string
}

type signingJWTClient struct {
	mount  SigningJWTMount
	client *http.Client
}
type JWTSigningTokenSource struct{ clients map[string]signingJWTClient }

func NewJWTSigningTokenSource(mounts []SigningJWTMount) (*JWTSigningTokenSource, error) {
	if len(mounts) != 3 {
		return nil, ErrRegistrationUnavailable
	}
	s := &JWTSigningTokenSource{clients: make(map[string]signingJWTClient, 3)}
	roles, policies, files, keys := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
	installation := mounts[0].Binding.InstallationID
	for _, m := range mounts {
		if !artifactSigningPurpose(m.Binding.Purpose) || m.Binding.InstallationID != installation || !providerBoundedString(installation) ||
			!providerBoundedString(m.Binding.KeyID) || !providerBoundedString(m.Binding.KeyVersion) || s.clients[m.Binding.Purpose].client != nil ||
			!exactSigningEndpoint(m.Binding.Endpoint) || !safeTransitName(m.Binding.KeyName) || !canonicalProviderVersion(m.Binding.ProviderVersion) ||
			!safeTransitName(m.AuthMount) || !safeTransitName(m.Role) || !safeTransitName(m.Policy) ||
			strings.EqualFold(m.Policy, "root") || strings.EqualFold(m.Policy, "default") || !filepath.IsAbs(m.JWTFile) ||
			roles[m.AuthMount+"/"+m.Role] || policies[m.Policy] || files[m.JWTFile] || keys[m.Binding.Endpoint+"/"+m.Binding.KeyName] || len(m.CAPEM) == 0 || len(m.CAPEM) > 65536 || !signingDigest.MatchString(m.CASHA256) {
			s.Close()
			return nil, ErrRegistrationUnavailable
		}
		h := sha256.Sum256(m.CAPEM)
		if hex.EncodeToString(h[:]) != m.CASHA256 {
			s.Close()
			return nil, ErrRegistrationUnavailable
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(m.CAPEM) {
			s.Close()
			return nil, ErrRegistrationUnavailable
		}
		transport := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12, RootCAs: pool}, TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: 10 * time.Second, MaxResponseHeaderBytes: 16384, DisableCompression: true}
		client := &http.Client{Transport: transport, Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		m.CAPEM = nil
		s.clients[m.Binding.Purpose] = signingJWTClient{mount: m, client: client}
		roles[m.AuthMount+"/"+m.Role], policies[m.Policy], files[m.JWTFile], keys[m.Binding.Endpoint+"/"+m.Binding.KeyName] = true, true, true, true
	}
	return s, nil
}

func (s *JWTSigningTokenSource) Close() {
	if s != nil {
		for _, c := range s.clients {
			c.client.CloseIdleConnections()
		}
	}
}

func readSigningJWT(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, ErrRegistrationUnavailable
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > 16384 || (runtime.GOOS == "linux" && info.Mode().Perm()&0077 != 0) {
		return nil, ErrRegistrationUnavailable
	}
	b, err := io.ReadAll(io.LimitReader(f, 16385))
	if err != nil || len(b) < 16 || len(b) > 16384 {
		clearSigningToken(b)
		return nil, ErrRegistrationUnavailable
	}
	for _, v := range b {
		if v < 33 || v > 126 {
			clearSigningToken(b)
			return nil, ErrRegistrationUnavailable
		}
	}
	return b, nil
}

func (s *JWTSigningTokenSource) ResolveSigningToken(ctx context.Context, use OriginalSigningUse) (SigningToken, error) {
	fail := func() (SigningToken, error) { return SigningToken{}, ErrRegistrationUnavailable }
	now := time.Now()
	if s == nil || ctx == nil || ctx.Err() != nil || use.NotBefore.IsZero() || use.ExpiresAt.IsZero() ||
		now.Before(use.NotBefore) || !now.Before(use.ExpiresAt) || !providerBoundedString(use.Workload.Namespace) ||
		!providerBoundedString(use.Workload.PodUID) || !providerBoundedString(use.Workload.ServiceAccountUID) {
		return fail()
	}
	c, ok := s.clients[use.Request.Binding.Purpose]
	if !ok || c.mount.Binding != use.Request.Binding || c.client == nil || use.Recheck == nil || use.Recheck(ctx, use.Request) != nil {
		return fail()
	}
	jwt, err := readSigningJWT(c.mount.JWTFile)
	if err != nil {
		return fail()
	}
	defer clearSigningToken(jwt)
	jwtHash := sha256.Sum256(jwt)
	callCtx, cancel := context.WithDeadline(ctx, use.ExpiresAt)
	defer cancel()
	if callCtx.Err() != nil {
		return fail()
	}
	body, _ := json.Marshal(struct {
		Role string `json:"role"`
		JWT  string `json:"jwt"`
	}{c.mount.Role, string(jwt)})
	defer clearSigningToken(body)
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, c.mount.Binding.Endpoint+"/v1/auth/"+c.mount.AuthMount+"/login", bytes.NewReader(body))
	if err != nil {
		return fail()
	}
	req.Header.Set("Content-Type", "application/json")
	started := time.Now()
	response, err := c.client.Do(req)
	if err != nil {
		return fail()
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || response.Header.Get("Content-Encoding") != "" {
		return fail()
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 65537))
	defer clearSigningToken(raw)
	if err != nil || len(raw) > 65536 || callCtx.Err() != nil {
		return fail()
	}
	token, ttl, err := parseSigningJWTLogin(raw, c.mount, use.Workload)
	if err != nil {
		return fail()
	}
	expires := started.Add(ttl)
	if !time.Now().Before(expires) || expires.After(use.ExpiresAt) {
		clearSigningToken(token)
		return fail()
	}
	recheck := func(checkCtx context.Context, request TransitSigningRequest) error {
		if checkCtx == nil || checkCtx.Err() != nil || request != use.Request || !time.Now().Before(expires) {
			return ErrRegistrationUnavailable
		}
		current, e := readSigningJWT(c.mount.JWTFile)
		defer clearSigningToken(current)
		if e != nil || sha256.Sum256(current) != jwtHash {
			return ErrRegistrationUnavailable
		}
		return nil
	}
	if recheck(ctx, use.Request) != nil || use.Recheck(ctx, use.Request) != nil {
		clearSigningToken(token)
		return fail()
	}
	return SigningToken{Request: use.Request, Secret: token, NotBefore: started, ExpiresAt: expires, Recheck: recheck}, nil
}

func parseSigningJWTLogin(raw []byte, m SigningJWTMount, w SigningWorkloadIdentity) ([]byte, time.Duration, error) {
	fail := func() ([]byte, time.Duration, error) { return nil, 0, ErrRegistrationUnavailable }
	if _, err := jsoncanonicalizer.Transform(raw); err != nil {
		return fail()
	}
	var root map[string]json.RawMessage
	if json.Unmarshal(raw, &root) != nil || root == nil {
		return fail()
	}
	for _, field := range []string{"errors", "wrap_info"} {
		v := bytes.TrimSpace(root[field])
		if len(v) > 0 && !bytes.Equal(v, []byte("null")) && !(field == "errors" && bytes.Equal(v, []byte("[]"))) {
			return fail()
		}
	}
	var authFields map[string]json.RawMessage
	if json.Unmarshal(root["auth"], &authFields) != nil || !bytes.Equal(bytes.TrimSpace(authFields["renewable"]), []byte("false")) {
		return fail()
	}
	var auth struct {
		ClientToken      string            `json:"client_token"`
		TokenType        string            `json:"token_type"`
		Renewable        bool              `json:"renewable"`
		LeaseDuration    int64             `json:"lease_duration"`
		Policies         []string          `json:"policies"`
		TokenPolicies    []string          `json:"token_policies"`
		IdentityPolicies []string          `json:"identity_policies"`
		Metadata         map[string]string `json:"metadata"`
	}
	if json.Unmarshal(root["auth"], &auth) != nil || len(auth.ClientToken) < 16 || len(auth.ClientToken) > 4096 || auth.TokenType != "batch" || auth.Renewable || auth.LeaseDuration < 1 || auth.LeaseDuration > 20 ||
		len(auth.Policies) != 1 || auth.Policies[0] != m.Policy || (auth.TokenPolicies != nil && (len(auth.TokenPolicies) != 1 || auth.TokenPolicies[0] != m.Policy)) || len(auth.IdentityPolicies) != 0 ||
		auth.Metadata["role"] != m.Role || auth.Metadata["namespace"] != w.Namespace || auth.Metadata["pod_uid"] != w.PodUID || auth.Metadata["service_account_uid"] != w.ServiceAccountUID {
		return fail()
	}
	for _, v := range []byte(auth.ClientToken) {
		if v < 33 || v > 126 {
			return fail()
		}
	}
	return []byte(auth.ClientToken), time.Duration(auth.LeaseDuration) * time.Second, nil
}
