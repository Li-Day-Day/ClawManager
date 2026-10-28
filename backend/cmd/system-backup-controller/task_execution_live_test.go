package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"testing"
	"time"

	"clawreef/internal/systembackup/flow"
	b "clawreef/internal/systembackup/publicadapter"
	controller "clawreef/internal/systembackupcontroller"
	d "clawreef/internal/systembackupdispatch"
	"k8s.io/client-go/kubernetes"
)

func TestTaskExecutionProductionRequiresCompleteOwners(t *testing.T) {
	original := systemBackupExecutionOwnerLink
	defer func() { systemBackupExecutionOwnerLink = original }()
	deps := taskExecutionDependencies{DB: &sql.DB{}, Kubernetes: &kubernetes.Clientset{}}
	systemBackupExecutionOwnerLink = nil
	if got, err := composeTaskExecution(deps, nil, time.Second); err == nil || got != nil {
		t.Fatal("missing owner enabled execution")
	}
	systemBackupExecutionOwnerLink = func(taskExecutionDependencies) (taskExecutionOwners, error) { return taskExecutionOwners{}, nil }
	if got, err := composeTaskExecution(deps, controller.ReadinessProbeSet{}, time.Second); err == nil || got != nil {
		t.Fatal("partial owners enabled execution")
	}
}

type compositionExecutionPorts struct {
	d.Ports
	checks int
}

// Only construction/denial is tested here; no fake Job may reach Ensure.
type compositionJobOwner struct{ controller.ExecutionJobOwner }

func (p *compositionExecutionPorts) Check(context.Context, d.Authority) error { p.checks++; return nil }

type compositionExecutionOwners struct {
	work     controller.ExecutionWork
	recorded int
	out      controller.ExecutionOutcome
	admitted int
	builders int
}

func (o *compositionExecutionOwners) Ready(context.Context) error { return nil }
func (o *compositionExecutionOwners) Next(context.Context) (*controller.ExecutionWork, error) {
	return &o.work, nil
}
func (o *compositionExecutionOwners) Record(_ context.Context, _ controller.ExecutionWork, out controller.ExecutionOutcome) error {
	o.recorded++
	o.out = out
	return nil
}
func (o *compositionExecutionOwners) Read(context.Context, d.Authority, d.JobBinding, d.EvidenceRef) ([]byte, error) {
	return nil, d.ErrNotReady
}
func (o *compositionExecutionOwners) Pending(context.Context, d.Authority) (b.RecoverySnapshot, error) {
	return b.RecoverySnapshot{}, d.ErrNotReady
}

func TestTaskExecutionProductionCallsConcreteBAndKeepsOriginalAdmission(t *testing.T) {
	original := systemBackupExecutionOwnerLink
	defer func() { systemBackupExecutionOwnerLink = original }()
	config := []byte(`{"integration_fixture":true}`)
	sum := sha256.Sum256(config)
	in := d.Input{Authority: d.Authority{InstallationID: "installation_test", TaskPublicID: "sbk_01234567-89ab-cdef-0123-456789abcdef", TaskType: "backup", RequestID: "request-1", ConfigVersion: 1, ConfigSHA256: hex.EncodeToString(sum[:]), AttemptNo: 1, Phase: "capture", ClaimOwner: "controller-1", ClaimRowVersion: 3, DeadlineAt: time.Now().UTC().Add(time.Minute)}, ConfigSnapshot: config, ProfileID: "linux", ProfileRevision: "r1", Backup: &d.BackupSpec{SourceOrchestrator: "kubernetes", SourceProfile: "cluster", MatrixKey: "k8s-cluster", DatasourceTopology: "in_cluster", Runner: "k8s", TaskPurpose: "functional_test", RequestedParts: []string{"workspace"}}}
	o := &compositionExecutionOwners{work: controller.ExecutionWork{Step: controller.ExecutionPrepare, Input: in}}
	ports := &compositionExecutionPorts{}
	systemBackupExecutionOwnerLink = func(taskExecutionDependencies) (taskExecutionOwners, error) {
		return taskExecutionOwners{Profiles: []taskExecutionLinuxProfile{{Key: b.ProfileKey{ID: "linux", Revision: "r1"}, Source: b.LinuxProfileConfig{Source: &sql.DB{}, Database: "synthetic", ServerUUID: "synthetic-uuid", Supported: map[b.AgentKind]bool{{Type: "type", Mode: "mode", OS: "linux"}: true}, HoldLimit: time.Minute,
			BuildWriters: func(context.Context, d.Input, b.SourceInventory, []b.FrozenWriter) ([]flow.Writer, error) {
				o.builders++
				return nil, d.ErrNotReady
			}, BuildParts: func(d.Input, b.SourceInventory, time.Time) ([]b.JobPart, error) {
				o.builders++
				return nil, d.ErrNotReady
			}}}},
			B: b.Dependencies{Results: o, Recovery: o, Admission: func(context.Context, d.Input) error { o.admitted++; return &b.Failure{Category: "permission_denied"} }, ValidateInventory: func(context.Context, d.Input, b.Discovery) error { return d.ErrNotReady }, RecoveryTimeout: time.Second}, Ports: ports, Store: o, Records: &controller.SQLExecutionRecords{}, Jobs: compositionJobOwner{}}, nil
	}
	l, err := composeTaskExecution(taskExecutionDependencies{DB: &sql.DB{}, Kubernetes: &kubernetes.Clientset{}}, controller.ReadinessProbeFunc(func(context.Context) error { return nil }), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if o.admitted != 0 || o.builders != 0 {
		t.Fatal("constructors ran source/owner operations")
	}
	if err := l.RunOnce(context.Background()); err == nil || o.admitted != 0 || o.recorded != 0 {
		t.Fatal("missing persistence owners admitted runner work")
	}
	// Isolate the concrete runner composition assertion below from SQL custody;
	// the production loop above must reject this deliberately empty record store.
	l.Store = o
	err = l.RunOnce(context.Background())
	if err == nil || err.Error() != "permission_denied" || o.admitted != 1 || o.recorded != 1 || o.out.Err == nil || o.builders != 0 || ports.checks < 2 {
		t.Fatal("actual D -> bound B runner caller bypassed owner denial", err)
	}
}
