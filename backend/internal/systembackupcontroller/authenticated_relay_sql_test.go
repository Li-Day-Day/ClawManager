package systembackupcontroller

import (
	b "clawreef/internal/systembackup/publicadapter"
	d "clawreef/internal/systembackupdispatch"
	evidence "clawreef/internal/systembackupevidence"
	p "clawreef/internal/systembackupproducer"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

type relaySQLRows struct {
	values []driver.Value
	read   bool
}

func (r *relaySQLRows) Columns() []string {
	v := make([]string, len(r.values))
	for i := range v {
		v[i] = fmt.Sprint(i)
	}
	return v
}
func (r *relaySQLRows) Close() error { return nil }
func (r *relaySQLRows) Next(v []driver.Value) error {
	if r.read || r.values == nil {
		return io.EOF
	}
	r.read = true
	copy(v, r.values)
	return nil
}

type relaySQLModel struct {
	base        *executionModel
	job         d.JobBinding
	cursor      b.RelayCursor
	exists      bool
	raw         []byte
	unknown     bool
	failInsert  bool
	oldEvidence bool
	resultFault string
}
type relaySQLDriver struct{ m *relaySQLModel }
type relaySQLConn struct {
	*executionConn
	m      *relaySQLModel
	cursor b.RelayCursor
	exists bool
	raw    []byte
}

func (d relaySQLDriver) Open(string) (driver.Conn, error) {
	return &relaySQLConn{executionConn: &executionConn{m: d.m.base}, m: d.m}, nil
}
func (c *relaySQLConn) BeginTx(ctx context.Context, o driver.TxOptions) (driver.Tx, error) {
	_, e := c.executionConn.BeginTx(ctx, o)
	c.cursor = c.m.cursor
	c.exists = c.m.exists
	c.raw = append([]byte(nil), c.m.raw...)
	return relaySQLTx{c}, e
}

type relaySQLTx struct{ c *relaySQLConn }

func (t relaySQLTx) Rollback() error { return (executionTx{t.c.executionConn}).Rollback() }
func (t relaySQLTx) Commit() error {
	c := t.c
	c.m.cursor = c.cursor
	c.m.exists = c.exists
	c.m.raw = c.raw
	(executionTx{c.executionConn}).Commit()
	if c.m.unknown {
		c.m.unknown = false
		return errors.New("commit reply lost")
	}
	return nil
}
func (c *relaySQLConn) QueryContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	row := func(v ...driver.Value) (driver.Rows, error) { return &relaySQLRows{values: v}, nil }
	j := c.m.job
	switch {
	case q == "SELECT DATABASE(),@@server_uuid":
		return row("synthetic", "11111111-2222-4333-8444-555555555555")
	case strings.HasPrefix(q, "SELECT binding_json,"):
		raw, _ := json.Marshal(j)
		return row(raw, j.UID, false, int64(c.m.base.a.AttemptNo))
	case strings.HasPrefix(q, "SELECT sequence_no,body_sha256,body_json"):
		if !c.exists {
			return row()
		}
		return row(int64(c.cursor.Sequence), c.cursor.BodySHA256, c.raw)
	case strings.HasPrefix(q, "SELECT body_sha256,body_json"):
		return row(c.cursor.BodySHA256, c.raw)
	case strings.HasPrefix(q, "SELECT schema_version,owner_target_type,owner_target_public_id,content_checksum,created_at"):
		created := c.m.base.now
		if c.m.oldEvidence {
			created = created.Add(-time.Hour)
		}
		return row("system-backup-evidence.v1", "backup", c.m.base.a.TaskPublicID, strings.Repeat("d", 64), created)
	case strings.HasPrefix(q, "SELECT result_sha256 FROM system_backup_v2_runtime_resources"):
		if len(args) != 5 || args[0].Value != c.m.base.a.TaskPublicID || args[1].Value != j.Namespace || args[2].Value != j.Name || args[3].Value != j.UID || args[4].Value != int64(c.m.base.a.AttemptNo) {
			return nil, errors.New("result lookup escaped original Job")
		}
		if c.m.resultFault == "missing" {
			return row(nil)
		}
		if c.m.resultFault == "foreign" {
			return row(strings.Repeat("e", 64))
		}
		if c.m.resultFault == "sql" {
			return nil, errors.New("result unavailable")
		}
		return row(strings.Repeat("d", 64))
	case strings.HasPrefix(q, "SELECT started_at FROM system_backup_v2_attempts"):
		return row(c.m.base.now.Add(-time.Second))
	}
	return c.executionConn.QueryContext(ctx, q, args)
}
func (c *relaySQLConn) ExecContext(_ context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	if !c.active {
		return nil, errors.New("write escaped transaction")
	}
	switch {
	case strings.HasPrefix(q, "INSERT INTO system_backup_v2_relay_receipts"):
		if c.m.failInsert {
			return nil, errors.New("receipt write failed")
		}
		c.raw = append([]byte(nil), args[7].Value.([]byte)...)
		if args[5].Value.(int64) != int64(c.cursor.Sequence+1) {
			return driver.RowsAffected(0), nil
		}
		var message b.RelayMessage
		if json.Unmarshal(c.raw, &message) != nil {
			return nil, errors.New("invalid receipt")
		}
		c.exists = true
		c.cursor = b.RelayCursor{Sequence: uint64(args[5].Value.(int64)), BodySHA256: args[6].Value.(string), Status: message.Status}
	default:
		return nil, fmt.Errorf("unexpected SQL %s", q)
	}
	return driver.RowsAffected(1), nil
}
func relaySQLHandler(t *testing.T, authority SQLExecutionAuthority, m *relaySQLModel) (http.Handler, *tls.ConnectionState, b.RelayMessage) {
	t.Helper()
	now := m.base.now
	pub, key, _ := ed25519.GenerateKey(rand.Reader)
	ca := &x509.Certificate{SerialNumber: big.NewInt(1), NotBefore: now.Add(-time.Minute), NotAfter: now.Add(time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	der, e := x509.CreateCertificate(rand.Reader, ca, ca, pub, key)
	if e != nil {
		t.Fatal(e)
	}
	root, _ := x509.ParseCertificate(der)
	uri, _ := url.Parse("spiffe://isolated.test/backup/worker")
	leaf := &x509.Certificate{SerialNumber: big.NewInt(2), NotBefore: ca.NotBefore, NotAfter: ca.NotAfter, URIs: []*url.URL{uri}, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}, KeyUsage: x509.KeyUsageDigitalSignature}
	leafDER, e := x509.CreateCertificate(rand.Reader, leaf, root, pub, key)
	if e != nil {
		t.Fatal(e)
	}
	cert, _ := x509.ParseCertificate(leafDER)
	scope := p.Scope{ServerUUID: "11111111-2222-4333-8444-555555555555", Database: "synthetic", Installation: p.Installation(m.base.a.InstallationID)}
	a, j := m.base.a, m.job
	caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	peer, e := evidence.NewRelayPeerAuthenticator(evidence.RelayPeerConfig{Peer: evidence.SystemPeerConfig{Scope: scope, IssuerIdentityHash: strings.Repeat("b", 64), Subject: uri.String(), ClientCAPEM: caPEM, ClientCASHA256: recordHash(caPEM), CertificateSHA256: recordHash(leafDER), ExpiresAt: now.Add(time.Hour)}, Binding: evidence.RelayJobBinding{Scope: scope, ConfigVersion: int64(a.ConfigVersion), ConfigSHA256: a.ConfigSHA256, TargetType: a.TaskType, TargetPublicID: a.TaskPublicID, AttemptNo: int64(a.AttemptNo), Phase: a.Phase, JobUnitKey: j.JobUnitKey, JobUID: j.UID, JobGeneration: int64(j.Generation), RelayIdentityRef: j.RelayIdentityRef, RelayIdentityVersion: j.RelayIdentityVersion, RelayIdentityBoundAt: j.RelayBoundAt, RelayIdentityExpiresAt: j.RelayExpiresAt}})
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(peer.Close)
	owner := SQLAuthenticatedRelayAcceptor{Authority: authority, Current: a, Scope: scope}
	h, e := b.NewAuthenticatedRelayHandler(b.RelayAuthentication{ResolvePeer: func(context.Context, b.RelayMessage) (*evidence.RelayPeerAuthenticator, error) { return peer, nil }, TransactionBudget: 10 * time.Second}, owner)
	if e != nil {
		t.Fatal(e)
	}
	message := b.RelayMessage{SchemaVersion: b.RelayVersion, InstallationID: a.InstallationID, TaskPublicID: a.TaskPublicID, TaskType: a.TaskType, AttemptNo: fmt.Sprint(a.AttemptNo), Phase: a.Phase, JobUnitKey: j.JobUnitKey, Namespace: j.Namespace, JobName: j.Name, JobUID: j.UID, JobGeneration: fmt.Sprint(j.Generation), RelayIdentityRef: j.RelayIdentityRef, RelayIdentityVersion: j.RelayIdentityVersion, Sequence: "1", Status: "ready"}
	return h, &tls.ConnectionState{HandshakeComplete: true, Version: tls.VersionTLS13, PeerCertificates: []*x509.Certificate{cert}, VerifiedChains: [][]*x509.Certificate{{cert, root}}}, message
}
func TestRuntimeControlAuthenticatedRelaySQLCommitReplayAndRollback(t *testing.T) {
	for _, fault := range []string{"", "receipt", "revoked", "unknown"} {
		t.Run(fault, func(t *testing.T) {
			authority, base := newExecutionModel(t)
			base.now = time.Now().UTC().Truncate(time.Microsecond)
			base.a.DeadlineAt = base.now.Add(time.Minute)
			authority.Authorization.(*executionAuth).until = base.a.DeadlineAt
			m := &relaySQLModel{base: base, job: d.JobBinding{JobUnitKey: "users", Namespace: "test", Name: "users-job", UID: "22222222-2222-4222-8222-222222222222", Generation: 1, RelayIdentityRef: "relay-ref", RelayIdentityVersion: "v1", RelayBoundAt: base.now.Add(-time.Second), RelayExpiresAt: base.a.DeadlineAt}}
			name := fmt.Sprintf("runtime-relay-%d", executionModelCounter.Add(1))
			sql.Register(name, relaySQLDriver{m})
			db, e := sql.Open(name, "")
			if e != nil {
				t.Fatal(e)
			}
			defer db.Close()
			authority.DB = db
			if fault == "receipt" {
				m.failInsert = true
			}
			if fault == "unknown" {
				m.unknown = true
			}
			if fault == "revoked" {
				authority.Authorization.(*executionAuth).onRecheck = func() { base.drift = "version" }
			}
			h, tlsState, message := relaySQLHandler(t, authority, m)
			send := func(message b.RelayMessage) int {
				raw, _ := json.Marshal(message)
				r := httptest.NewRequest("POST", "https://relay.invalid/", strings.NewReader(string(raw)))
				r.Header.Set("Content-Type", "application/json")
				r.TLS = tlsState
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				return w.Code
			}
			status := send(message)
			if fault == "receipt" || fault == "revoked" {
				if status == 200 || m.cursor.Sequence != 0 || base.commits != 0 {
					t.Fatal("failed transaction escaped", status, m.cursor, base.commits)
				}
				return
			}
			if (status == 200) != (fault == "") || m.cursor.Sequence != 1 || len(m.raw) == 0 {
				t.Fatal("commit result mismatch", status, m.cursor)
			}
			if send(message) != 200 || m.cursor.Sequence != 1 {
				t.Fatal("exact committed replay rejected")
			}
			message.Sequence = "3"
			message.Status = "running"
			if send(message) == 200 || m.cursor.Sequence != 1 {
				t.Fatal("sequence gap accepted")
			}
			message.Sequence = "2"
			if send(message) != 200 || m.cursor.Sequence != 2 {
				t.Fatal("valid advance rejected")
			}
			message.Sequence = "3"
			message.Status = "completed"
			message.ResultEvidence = &b.RelayEvidence{PublicID: "sev_33333333-3333-4333-8333-333333333333", SHA256: strings.Repeat("d", 64)}
			m.oldEvidence = true
			if send(message) == 200 || m.cursor.Sequence != 2 {
				t.Fatal("previous attempt evidence accepted")
			}
			m.oldEvidence = false
			for _, resultFault := range []string{"missing", "foreign", "sql"} {
				m.resultFault = resultFault
				commits := base.commits
				if send(message) == 200 || m.cursor.Sequence != 2 || base.commits != commits {
					t.Fatal("completion accepted without exact Job result", resultFault)
				}
			}
			m.resultFault = ""
			if send(message) != 200 || m.cursor.Sequence != 3 {
				t.Fatal("current completion evidence rejected")
			}
			message.Sequence = "4"
			message.Status = "running"
			message.ResultEvidence = nil
			if send(message) == 200 || m.cursor.Sequence != 3 {
				t.Fatal("terminal observation reopened")
			}
		})
	}
}
