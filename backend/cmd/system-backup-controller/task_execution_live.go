package main

import (
	"database/sql"
	"time"

	b "clawreef/internal/systembackup/publicadapter"
	controller "clawreef/internal/systembackupcontroller"
	dispatch "clawreef/internal/systembackupdispatch"
	"k8s.io/client-go/kubernetes"
)

// The composition owner receives admitted deployment objects, never HTTP DTOs.
// B exports the runner constructor; D supplies public SQL/ledger/state ports,
// A authority/materials and C artifact/evidence dependencies. This hook remains
// unbound until those REAL owners can be constructed. Missing is not a runner.
type taskExecutionDependencies struct {
	DB         *sql.DB
	Kubernetes kubernetes.Interface
	Snapshot   controller.BootstrapSnapshot
}
type taskExecutionOwners struct {
	Profiles []taskExecutionLinuxProfile
	B        b.Dependencies
	Ports    dispatch.Ports
	Store    controller.ExecutionWorkStore
	Records  *controller.SQLExecutionRecords
	Jobs     controller.ExecutionJobOwner
}

type taskExecutionLinuxProfile struct {
	Key    b.ProfileKey
	Source b.LinuxProfileConfig
}

var systemBackupExecutionOwnerLink func(taskExecutionDependencies) (taskExecutionOwners, error)

func composeTaskExecution(deps taskExecutionDependencies, guard controller.ReadinessProbe, interval time.Duration) (*controller.TaskExecutionLoop, error) {
	if deps.DB == nil || deps.Kubernetes == nil || systemBackupExecutionOwnerLink == nil {
		return nil, dispatch.ErrNotReady
	}
	owners, err := systemBackupExecutionOwnerLink(deps)
	if err != nil {
		return nil, err
	}
	// Concrete B construction belongs here, not to an independent Controller
	// or SQLStore. Profiles/results/recovery/registries are REAL owner inputs;
	// NewPublicRunner rejects missing dependencies and opens no connections.
	if len(owners.Profiles) == 0 || len(owners.B.Profiles) != 0 {
		return nil, dispatch.ErrNotReady
	}
	profiles := make(map[b.ProfileKey]b.Profile, len(owners.Profiles))
	for _, entry := range owners.Profiles {
		if entry.Key.ID == "" || entry.Key.Revision == "" {
			return nil, dispatch.ErrNotReady
		}
		if _, exists := profiles[entry.Key]; exists {
			return nil, dispatch.ErrNotReady
		}
		profile, err := b.NewLinuxProfile(entry.Source)
		if err != nil {
			return nil, err
		}
		profiles[entry.Key] = profile
	}
	owners.B.Profiles = profiles
	runner, err := b.NewPublicRunner(owners.B)
	if err != nil {
		return nil, err
	}
	bound, err := dispatch.BindTaskRunner(runner, b.PlanVersion)
	if err != nil {
		return nil, err
	}
	if owners.Records == nil || owners.Jobs == nil {
		return nil, dispatch.ErrNotReady
	}
	store := controller.DurableExecutionStore{Scheduler: owners.Store, Records: *owners.Records}
	ports, err := controller.NewExecutionJobPorts(owners.Ports, owners.Jobs)
	if err != nil {
		return nil, err
	}
	l := &controller.TaskExecutionLoop{Guard: guard, Store: store, Dispatch: dispatch.Dispatcher{Runner: bound, Ports: ports}, Interval: interval}
	if err := l.Validate(); err != nil {
		return nil, err
	}
	return l, nil
}
