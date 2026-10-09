package systembackupevidence

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func downloadRuntimeFixture(t *testing.T) (DownloadRuntimeConfig, *downloadTransitFixture, *atomic.Int32) {
	t.Helper()
	x := newDownloadTransitFixture(t, "ok")
	f := x.f
	var requests atomic.Int32
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Method == "POST" && r.URL.Path == "/" {
			if r.ParseForm() != nil || r.Form.Get("Action") != "AssumeRoleWithWebIdentity" {
				t.Error("wrong STS call")
				w.WriteHeader(400)
				return
			}
			session := r.Form.Get("RoleSessionName")
			fmt.Fprintf(w, `<AssumeRoleWithWebIdentityResponse xmlns="%s"><AssumeRoleWithWebIdentityResult><Credentials><AccessKeyId>%s</AccessKeyId><SecretAccessKey>%s</SecretAccessKey><SessionToken>%s</SessionToken><Expiration>%s</Expiration></Credentials><Audience>%s</Audience><Provider>%s</Provider><SubjectFromWebIdentityToken>%s</SubjectFromWebIdentityToken><AssumedRoleUser><Arn>arn:aws:sts::123456789012:assumed-role/evidence/%s</Arn><AssumedRoleId>ROLEID:%s</AssumedRoleId></AssumedRoleUser><PackedPolicySize>10</PackedPolicySize></AssumeRoleWithWebIdentityResult><ResponseMetadata><RequestId>local-runtime</RequestId></ResponseMetadata></AssumeRoleWithWebIdentityResponse>`, stsNamespace, s3TestAccess, s3TestSecret, s3TestSession, time.Now().UTC().Add(899*time.Second).Format(time.RFC3339), f.c.Audience, f.c.Issuer, f.c.Subject, session, session)
			return
		}
		if !verifyS3Wire(r) || r.URL.Path != "/evidence-bucket/"+f.record.Ref.RelativeKey || r.URL.Query().Get("versionId") != f.record.Ref.ImmutableVersion {
			t.Error("wrong object authorization")
			w.WriteHeader(403)
			return
		}
		w.Header().Set("X-Amz-Version-Id", f.record.Ref.ImmutableVersion)
		switch r.Method {
		case "HEAD":
			digest, _ := hex.DecodeString(f.record.Manifest.ObjectHash)
			w.Header().Set("X-Amz-Checksum-Sha256", base64.StdEncoding.EncodeToString(digest))
			w.Header().Set("Content-Length", fmt.Sprint(len(f.object)))
		case "GET":
			var start, end int
			if _, err := fmt.Sscanf(r.Header.Get("Range"), "bytes=%d-%d", &start, &end); err != nil || start < 0 || end < start || end >= len(f.object) {
				t.Error("unbounded Range")
				w.WriteHeader(400)
				return
			}
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, len(f.object)))
			w.Header().Set("Content-Length", fmt.Sprint(end-start+1))
			w.WriteHeader(206)
			w.Write(f.object[start : end+1])
		default:
			t.Error("download attempted mutation")
			w.WriteHeader(403)
		}
	}))
	t.Cleanup(srv.Close)
	ca := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srv.Certificate().Raw})
	store := S3Config{Endpoint: srv.URL, Region: "us-east-1", Bucket: "evidence-bucket", Root: f.c.Root, Installation: f.c.Registry.Installation, Identity: f.c.Store.Identity, Version: f.c.Store.Version, CAPEM: ca, CASHA256: hash(ca)}
	c := DownloadRuntimeConfig{Authority: f.c, S3: S3STSConfig{Store: store, Endpoint: srv.URL, RoleARN: "arn:aws:iam::123456789012:role/evidence", Issuer: f.c.Issuer, Audience: f.c.Audience, CAPEM: ca, CASHA256: hash(ca)}, Transit: []DownloadTransitConfig{x.c}, Failure: func(context.Context, string, string) {}}
	return c, x, &requests
}

func TestDownloadRuntimeHTTPWithSTSAndTransit(t *testing.T) {
	for _, revoked := range []bool{false, true} {
		t.Run(fmt.Sprint(revoked), func(t *testing.T) {
			c, x, requests := downloadRuntimeFixture(t)
			f := x.f
			runtime, err := NewDownloadRuntime(c)
			if err != nil {
				t.Fatal(err)
			}
			defer runtime.Close()
			// This isolates HTTP/provider assembly from D's still-missing real
			// owner/reference policy. Session/RBAC/provider authorization uses SQL;
			// the claim/audit registry and SQL transport are explicitly synthetic.
			m := &memoryRegistry{r: f.record, now: time.Now().UTC()}
			m.r.Claim = ""
			m.r.ClaimUntil = time.Time{}
			m.r.RowVersion = 1
			f.db.onBegin = func(int) {
				f.db.plan[7].values[23] = m.r.Claim
				f.db.plan[7].values[24] = m.r.ClaimUntil
				f.db.plan[7].values[27] = m.r.RowVersion
				if revoked && x.decrypts.Load() > 0 {
					f.db.plan[5].values[4] = true
				}
			}
			runtime.handler.Service.Registry = downloadMemoryRegistry{memoryRegistry: m, actor: f.actor}
			server := httptest.NewTLSServer(runtime)
			defer server.Close()
			r, _ := http.NewRequest("GET", server.URL+Path+f.record.Manifest.Identity.ID, nil)
			r.Header = f.request.Header.Clone()
			r.Header.Set("Range", "bytes=0-20")
			res, err := server.Client().Do(r)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			body, err := io.ReadAll(io.LimitReader(res.Body, 1024))
			if err != nil {
				t.Fatal(err)
			}
			if requests.Load() < 4 || x.logins.Load() != 1 || x.decrypts.Load() != 1 {
				t.Fatal("test did not exercise network chain", requests.Load(), x.logins.Load(), x.decrypts.Load(), res.StatusCode, string(body))
			}
			if revoked {
				if res.StatusCode != 503 || bytes.Contains(body, f.plain[:21]) {
					t.Fatal("revoked runtime released plaintext")
				}
			} else if res.StatusCode != 206 || !bytes.Equal(body, f.plain[:21]) {
				t.Fatal("runtime download failed", res.StatusCode, string(body))
			}
			if m.r.Claim != "" {
				t.Fatal("runtime retained download claim")
			}
			before := requests.Load()
			if runtime.handler.Service.Store.Put(f.ctx, f.record.Ref, strings.NewReader("x"), ObjectInfo{}, time.Now()) != ErrDenied || runtime.handler.Service.Store.Delete(f.ctx, f.record.Ref, ObjectInfo{}) != ErrDenied {
				t.Fatal("runtime store exposed writes")
			}
			if _, err := runtime.handler.Service.Store.Absent(f.ctx, f.record.Ref); err != ErrDenied {
				t.Fatal("runtime invented absence")
			}
			if before != requests.Load() {
				t.Fatal("denied mutation reached provider")
			}
			runtime.Close()
			runtime.Close()
			closed := httptest.NewRecorder()
			runtime.ServeHTTP(closed, r)
			if closed.Code != 503 || before != requests.Load() {
				t.Fatal("closed runtime accepted request")
			}
		})
	}
}

func TestDownloadRuntimeRejectsDriftAndMissingPolicy(t *testing.T) {
	c, x, requests := downloadRuntimeFixture(t)
	for _, mode := range []string{"policy", "Failure", "store", "version", "root", "installation", "issuer", "audience", "Transit"} {
		t.Run(mode, func(t *testing.T) {
			bad := c
			switch mode {
			case "policy":
				bad.Authority.Registry.Policy = nil
			case "Failure":
				bad.Failure = nil
			case "store":
				bad.S3.Store.Identity = strings.Repeat("e", 64)
			case "version":
				bad.S3.Store.Version = "other"
			case "root":
				bad.S3.Store.Root = "other"
			case "installation":
				bad.S3.Store.Installation = "installation_other"
			case "issuer":
				bad.S3.Issuer = "https://other.example"
			case "audience":
				bad.S3.Audience = "other"
			case "Transit":
				bad.Transit = nil
			}
			r, err := NewDownloadRuntime(bad)
			if r != nil {
				r.Close()
			}
			if err == nil || r != nil || requests.Load() != 0 || x.logins.Load() != 0 {
				t.Fatal("invalid runtime constructed")
			}
		})
	}
}
