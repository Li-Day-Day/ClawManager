package systembackupcontroller

import (
	"clawreef/internal/systembackup/flow"
	b "clawreef/internal/systembackup/publicadapter"
	d "clawreef/internal/systembackupdispatch"
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
)

func TestRuntimeControlTransactionFinalAuthority(t *testing.T) {
	for _, fault := range []string{"", "callback", "revoked", "version", "clock"} {
		t.Run(fault, func(t *testing.T) {
			authority, m := newExecutionModel(t)
			owner := &SQLRuntimeControl{cfg: RuntimeControlConfig{Gate: SQLCaptureGate{Authority: authority}}}
			e := owner.transaction(context.Background(), m.a, false, func(tx *sql.Tx) error {
				if tx == nil {
					t.Fatal("missing original transaction")
				}
				switch fault {
				case "callback":
					return errors.New("failed operation")
				case "revoked":
					authority.Authorization.(*executionAuth).deny = true
				case "version":
					m.drift = "version"
				case "clock":
					m.clockShift = m.a.DeadlineAt.Sub(m.now)
				}
				return nil
			})
			if fault == "" {
				if e != nil || m.commits != 1 {
					t.Fatal(e, m.commits)
				}
			} else if e == nil || m.commits != 0 || m.rollbacks != 1 {
				t.Fatal("failed operation committed", e, m.commits, m.rollbacks)
			}
		})
	}
}
func TestRuntimeControlStateAndRecoveryBoundary(t *testing.T) {
	spec := b.RuntimeWriterSpec{Kind: "gateway", UID: "pod-uid", Source: b.InstanceIdentity{ID: 7, Generation: 3}}
	original := flow.State{UID: "pod-uid/gw-7-3", Generation: 3, Running: true, Checkpoint: "original"}
	if runtimeWriterID(spec) != "gateway/pod-uid/7" || !runtimeStateMatches(spec, original, "observed") {
		t.Fatal("original mapping rejected")
	}
	for _, mutation := range []func(*flow.State){func(s *flow.State) { s.UID = "replacement/gw-7-3" }, func(s *flow.State) { s.Generation = 4 }, func(s *flow.State) { s.Checkpoint = "" }, func(s *flow.State) { s.Running = false }} {
		changed := original
		mutation(&changed)
		if runtimeStateMatches(spec, changed, "observed") {
			t.Fatal("source identity drift accepted")
		}
	}
	for _, point := range []string{"claim-restart", "complete-restart", "recovery-check-stopped", "before-resume"} {
		recovery, e := runtimeRecoveryPoint(point)
		if e != nil || !recovery {
			t.Fatal(point, e)
		}
	}
	if _, e := runtimeRecoveryPoint("unreviewed-point"); e == nil {
		t.Fatal("unknown operation accepted")
	}
	if _, e := NewSQLRuntimeControl(RuntimeControlConfig{}); e == nil {
		t.Fatal("missing owners accepted")
	}
	if e := (&SQLRuntimeControl{}).CheckGate(SQLCaptureGate{Authority: SQLExecutionAuthority{InstallationID: "other"}}); e == nil {
		t.Fatal("different installation accepted")
	}
}
func TestRuntimeControlGrantsDoNotWidenOriginalRole(t *testing.T) {
	grants, e := RuntimeControlGrantSQL("capture", "runtime_control", "127.0.0.1", false)
	if e != nil {
		t.Fatal(e)
	}
	for i := range grants {
		grants[i] = strings.TrimSuffix(grants[i], ";")
	}
	if ValidateRuntimeControlGrants("capture", grants) != nil {
		t.Fatal("runtime role invalid")
	}
	if ValidatePublicCaptureGrants("capture", grants) == nil {
		t.Fatal("business mutation role accepted as ordinary capture")
	}
	for _, extra := range []string{"GRANT DELETE ON `capture`.`instances` TO 'runtime_control'@'127.0.0.1'", "GRANT UPDATE ON `capture`.`system_backup_v2_configs` TO 'runtime_control'@'127.0.0.1'"} {
		if ValidateRuntimeControlGrants("capture", append(append([]string(nil), grants...), extra)) == nil {
			t.Fatal("excess privilege accepted")
		}
	}
}
func TestRuntimeControlRelayRejectsUnauthenticatedInput(t *testing.T) {
	for _, r := range []*b.AuthenticatedRelay{nil, {}} {
		owner := SQLAuthenticatedRelayAcceptor{Current: d.Authority{TaskType: "backup", Phase: "capture"}}
		if decision, e := owner.AcceptAuthenticatedRelay(context.Background(), r); e == nil || decision != "" {
			t.Fatal("unauthenticated relay accepted")
		}
	}
}
