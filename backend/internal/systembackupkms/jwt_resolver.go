package systembackupkms

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

// exchangeJWT uses the same narrow Transit login profile as the existing
// evidence adapter: batch, nonrenewable, exactly one policy, TTL 1..20 seconds,
// no retry/cache/identity policies. Backup additionally verifies mapped Pod/SA
// identity metadata against the ORIGINAL Job identity, not locally decoded JWT.
func (r *PinnedJobResolver) exchangeJWT(ctx context.Context, p ProviderPermit, a Access) ([]byte, time.Time, error) {
	deny := func() ([]byte, time.Time, error) { return nil, time.Time{}, ErrPermission }
	if r.config == nil {
		return deny()
	}
	client, e := newTransit(*r.config, r, a.Operation)
	if e != nil {
		return deny()
	}
	defer client.client.CloseIdleConnections()
	jwt, e := readControlled(p.JWT.IdentityFile, 16384, true)
	defer clear(jwt)
	if e != nil || len(jwt) < 16 {
		return deny()
	}
	for _, b := range jwt {
		if b < 33 || b > 126 {
			return deny()
		}
	}
	until := p.ExpiresAt.Add(-5 * time.Second)
	ctx, cancel := context.WithDeadline(ctx, until)
	defer cancel()
	if ctx.Err() != nil {
		return deny()
	}
	body, _ := json.Marshal(struct {
		Role string `json:"role"`
		JWT  string `json:"jwt"`
	}{p.JWT.Role, string(jwt)})
	defer clear(body)
	req, e := http.NewRequestWithContext(ctx, http.MethodPost, p.Endpoint+"/v1/auth/"+p.JWT.Mount+"/login", bytes.NewReader(body))
	if e != nil {
		return deny()
	}
	req.Header.Set("Content-Type", "application/json")
	started := time.Now()
	response, e := client.client.Do(req)
	if e != nil {
		return deny()
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || response.Header.Get("Content-Encoding") != "" {
		return deny()
	}
	raw, e := io.ReadAll(io.LimitReader(response.Body, 65537))
	defer clear(raw)
	if e != nil || len(raw) > 65536 || ctx.Err() != nil {
		return deny()
	}
	token, ttl, e := jwtToken(raw, p)
	expires := started.Add(ttl)
	if e != nil || time.Now().Add(ttl).After(until) || !time.Now().Before(expires) {
		clear(token)
		return deny()
	}
	return token, expires, nil
}

func jwtToken(raw []byte, p ProviderPermit) ([]byte, time.Duration, error) {
	deny := func() ([]byte, time.Duration, error) { return nil, 0, ErrPermission }
	root, e := object(raw)
	if e != nil {
		return deny()
	}
	defer clearFields(root)
	for _, name := range []string{"errors", "wrap_info"} {
		if v, ok := root[name]; ok && !bytes.Equal(bytes.TrimSpace(v), []byte("null")) && !(name == "errors" && bytes.Equal(bytes.TrimSpace(v), []byte("[]"))) {
			return deny()
		}
	}
	auth, e := object(root["auth"])
	if e != nil {
		return deny()
	}
	defer clearFields(auth)
	var token, kind string
	var seconds int64
	var policies []string
	if json.Unmarshal(auth["client_token"], &token) != nil || len(token) < 16 || len(token) > 4096 || json.Unmarshal(auth["token_type"], &kind) != nil || kind != "batch" || !bytes.Equal(bytes.TrimSpace(auth["renewable"]), []byte("false")) || json.Unmarshal(auth["lease_duration"], &seconds) != nil || seconds < 1 || seconds > 20 || json.Unmarshal(auth["policies"], &policies) != nil || len(policies) != 1 || policies[0] != p.JWT.Policy {
		return deny()
	}
	for _, b := range []byte(token) {
		if b < 33 || b > 126 {
			return deny()
		}
	}
	if v, ok := auth["token_policies"]; ok {
		if json.Unmarshal(v, &policies) != nil || len(policies) != 1 || policies[0] != p.JWT.Policy {
			return deny()
		}
	}
	if v, ok := auth["identity_policies"]; ok {
		if json.Unmarshal(v, &policies) != nil || len(policies) != 0 {
			return deny()
		}
	}
	metadata, e := object(auth["metadata"])
	if e != nil {
		return deny()
	}
	defer clearFields(metadata)
	for field, want := range map[string]string{"role": p.JWT.Role, "namespace": p.Identity.Namespace, "pod_uid": p.Identity.PodUID, "service_account_uid": p.Identity.ServiceAccountUID} {
		var got string
		if json.Unmarshal(metadata[field], &got) != nil || got != want {
			return deny()
		}
	}
	return []byte(token), time.Duration(seconds) * time.Second, nil
}
