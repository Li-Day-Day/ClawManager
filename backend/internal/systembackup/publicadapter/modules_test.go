package publicadapter

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"

	"clawreef/internal/systembackup/kube"
	"clawreef/internal/systembackup/worker"
	d "clawreef/internal/systembackupdispatch"
	k "clawreef/internal/systembackupkms"
	w "clawreef/internal/systembackupwire"
	corev1 "k8s.io/api/core/v1"
)

func moduleTestInput(t *testing.T) *fixture {
	t.Helper()
	f, _, _ := setup(t)
	f.in.Backup = &d.BackupSpec{SourceOrchestrator: "kubernetes", SourceProfile: "cluster", MatrixKey: "k8s-cluster", DatasourceTopology: "in_cluster", Runner: "k8s", TaskPurpose: "functional_test", RequestedParts: []string{"workspace"}}
	return f
}

func moduleTestContext(in d.Input, source SourceInventory, hold time.Time, catalog string) (ModuleCaptureContext, error) {
	raw, _ := json.Marshal(source)
	a := in.Authority
	return ModuleCaptureContext{InstallationID: a.InstallationID, TaskPublicID: a.TaskPublicID, ConfigVersion: a.ConfigVersion, AttemptNo: a.AttemptNo, Phase: a.Phase, ConfigSHA256: a.ConfigSHA256, ProfileID: in.ProfileID, ProfileRevision: in.ProfileRevision, InventorySHA256: digest(raw), CatalogSHA256: catalog, CaptureContextSHA256: strings.Repeat("c", 64), HoldUntil: hold}, nil
}

func moduleTestRequests(t *testing.T, f *fixture, input CaptureModuleInput) ([]CapturePartRequest, error) {
	t.Helper()
	var requests []CapturePartRequest
	for _, selection := range input.Parts {
		var inv worker.Invocation
		if err := json.Unmarshal(f.x.Parts[0].InvocationJSON, &inv); err != nil {
			t.Fatal(err)
		}
		inv.Request.Binding.Path = selection.Part
		inv.Request.Binding.PartIndex = selection.PartIndex
		inv.Request.Binding.CaptureContextHash = input.Context.CaptureContextSHA256
		inv.Request.Deadline = input.Context.HoldUntil
		inv.Request.Operation = selection.Operation
		inv.Request.ArtifactName = selection.Part + ".enc"
		// Unified worker capture archives have no restore-normalization policy.
		inv.Request.PolicyVersion, inv.Request.Files = "", nil
		name := strings.ReplaceAll(selection.Part, "_", "-")
		w := kube.JobRequest{Identity: kube.Identity{Namespace: "cm-drill-b", Name: "capture-" + name, Owner: input.Input.Authority.TaskPublicID}, Image: "worker@sha256:" + strings.Repeat("a", 64), ServiceAccount: "b-worker", Source: corev1.Volume{Name: "workspace", VolumeSource: corev1.VolumeSource{PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: "source-pvc"}}}, StagingClaim: "staging-pvc", DeadlineSeconds: 10, WorkerControl: &kube.WorkerControl{URL: "https://owner.invalid/worker", InvocationConfigMap: "invoke-" + name, IdentitySecret: "job-identity", BoundPodIdentity: true}}
		if selection.Operation == "capture-database" {
			w.Source = corev1.Volume{}
			inv.WorkspacePath = ""
			inv.Request.MaxFiles, inv.Request.MaxFileBytes = 0, 0
			inv.Request.PolicyVersion, inv.Request.Files = "", nil
			inv.Request.Database = &worker.DatabaseSpec{Address: "fixture.invalid:3306", Name: input.Source.Database, ServerUUID: input.Source.ServerUUID, TLSServerName: "fixture.invalid", RootCA: []byte("synthetic-public-ca"), MaxRows: 100, MaxMemoryBytes: 1 << 20}
		}
		requests = append(requests, CapturePartRequest{Part: selection.Part, Category: selection.Category, JobUnitKey: selection.Part, Generation: 5, Invocation: inv, Workload: w})
	}
	return requests, nil
}

func TestModuleDatabaseAndWorkspaceUseTheActualTwoWorkerFactories(t *testing.T) {
	f := moduleTestInput(t)
	f.in.Backup.RequestedParts = []string{"mysql", "workspace"}
	a := moduleTestRegistration(t, f, "b_database", "B", "mysql_users")
	a.Descriptor.Parts[0].RequestedPart, a.Descriptor.Parts[0].Operation = "mysql", "capture-database"
	b := moduleTestRegistration(t, f, "c_workspace", "C", "teams_workspace")
	m, err := NewCaptureModules([]CaptureModuleRegistration{a, b}, moduleTestContext)
	if err != nil {
		t.Fatal(err)
	}
	parts, err := m.BuildParts(f.in, SourceInventory{Database: "source", ServerUUID: "source-uuid"}, f.x.HoldUntil)
	if err != nil || len(parts) != 2 {
		t.Fatal("actual worker materialization failed", err)
	}
	for _, part := range parts {
		var inv worker.Invocation
		json.Unmarshal(part.InvocationJSON, &inv)
		if part.Part == "mysql_users" && (inv.Request.Database == nil || inv.WorkspacePath != "") {
			t.Fatal("SQL part has wrong capability")
		}
	}
	// RequestedParts are selectors, never permission to invoke unrelated modules.
	f.in.Backup.RequestedParts = []string{"workspace"}
	parts, err = m.BuildParts(f.in, SourceInventory{}, f.x.HoldUntil)
	if err != nil || len(parts) != 1 || parts[0].Part != "teams_workspace" {
		t.Fatal("unrequested module invoked", err)
	}
}

func TestModuleBuildersCannotMutateOtherModulesAndDuplicateJobsReject(t *testing.T) {
	for _, duplicate := range []bool{false, true} {
		f := moduleTestInput(t)
		a := moduleTestRegistration(t, f, "a_instances", "B", "instances")
		b := moduleTestRegistration(t, f, "b_teams", "C", "teams")
		a.Build = func(input CaptureModuleInput) ([]CapturePartRequest, error) {
			requests, err := moduleTestRequests(t, f, input)
			input.Input.Backup.RequestedParts[0] = "forged"
			input.Source.Users[0] = 99
			input.Parts[0].Part = "forged"
			return requests, err
		}
		b.Build = func(input CaptureModuleInput) ([]CapturePartRequest, error) {
			if input.Source.Users[0] != 1 || input.Input.Backup.RequestedParts[0] != "workspace" || input.Parts[0].Part != "teams" {
				t.Fatal("earlier builder mutated another module input")
			}
			requests, err := moduleTestRequests(t, f, input)
			if duplicate {
				requests[0].Workload.Identity.Name = "capture-instances"
			}
			return requests, err
		}
		m, _ := NewCaptureModules([]CaptureModuleRegistration{a, b}, moduleTestContext)
		parts, err := m.BuildParts(f.in, SourceInventory{Users: []int{1}}, f.x.HoldUntil)
		if duplicate && (err == nil || parts != nil) {
			t.Fatal("aliased Jobs returned as success")
		}
		if !duplicate && (err != nil || len(parts) != 2) {
			t.Fatal("isolated module inputs rejected", err)
		}
	}
}

func TestModuleDatabasePayloadCannotChangeDiscoveredDatabaseIdentity(t *testing.T) {
	for _, field := range []string{"database", "server"} {
		f := moduleTestInput(t)
		f.in.Backup.RequestedParts = []string{"mysql"}
		a := moduleTestRegistration(t, f, "users_instances", "B", "mysql")
		a.Descriptor.Parts[0].RequestedPart, a.Descriptor.Parts[0].Operation = "mysql", "capture-database"
		a.Build = func(input CaptureModuleInput) ([]CapturePartRequest, error) {
			requests, err := moduleTestRequests(t, f, input)
			if field == "database" {
				requests[0].Invocation.Request.Database.Name = "foreign"
			} else {
				requests[0].Invocation.Request.Database.ServerUUID = "foreign"
			}
			return requests, err
		}
		m, _ := NewCaptureModules([]CaptureModuleRegistration{a}, moduleTestContext)
		if parts, err := m.BuildParts(f.in, SourceInventory{Database: "source", ServerUUID: "source-uuid"}, f.x.HoldUntil); err == nil || parts != nil {
			t.Fatal("foreign SQL source accepted")
		}
	}
}

func moduleTestRegistration(t *testing.T, f *fixture, id, owner, part string) CaptureModuleRegistration {
	t.Helper()
	return CaptureModuleRegistration{Descriptor: CaptureModuleDescriptor{ID: id, Owner: owner, Revision: "candidate-r1", Parts: []CaptureModulePart{{Part: part, Category: "metadata", RequestedPart: "workspace", Operation: "capture-workspace"}}}, Build: func(input CaptureModuleInput) ([]CapturePartRequest, error) { return moduleTestRequests(t, f, input) }}
}

func TestModulesRejectCrossOwnerStagingOutputCollisionWithoutDispatch(t *testing.T) {
	f := moduleTestInput(t)
	a := moduleTestRegistration(t, f, "b_instances", "B", "instances")
	b := moduleTestRegistration(t, f, "c_teams", "C", "teams")
	b.Build = func(input CaptureModuleInput) ([]CapturePartRequest, error) {
		requests, err := moduleTestRequests(t, f, input)
		requests[0].Invocation.Request.ArtifactName = "instances.enc"
		return requests, err
	}
	m, err := NewCaptureModules([]CaptureModuleRegistration{a, b}, moduleTestContext)
	if err != nil {
		t.Fatal(err)
	}
	if parts, err := m.BuildParts(f.in, SourceInventory{}, f.x.HoldUntil); err == nil || parts != nil || f.ensures != 0 || len(f.events) != 0 {
		t.Fatal("shared output collision escaped", err)
	}
}

func TestModulesRejectFormalEnvelopeAndOtherPartOutputCollision(t *testing.T) {
	f := moduleTestInput(t)
	a := moduleTestRegistration(t, f, "b_instances", "B", "instances")
	b := moduleTestRegistration(t, f, "c_teams", "C", "teams")
	a.Build = func(input CaptureModuleInput) ([]CapturePartRequest, error) {
		requests, e := moduleTestRequests(t, f, input)
		r := &requests[0]
		binding := r.Invocation.Request.Binding
		r.Invocation.FormalCapture = &worker.FormalCaptureSpec{Version: worker.FormalCaptureVersion, ConfigSHA256: strings.Repeat("a", 64), EnvelopeName: "teams.enc", MaxFrames: 8}
		r.Invocation.ProviderKey = &k.Access{Operation: k.Generate, Endpoint: "https://bao.example.invalid:8200", KeyName: "backup-key", Request: w.KeyRequest{Key: w.KeyBinding{Provider: "external-kms", IdentityHash: strings.Repeat("a", 64), RegistryVersion: "r1", ProviderKeyID: "backup-key", ProviderVersion: "1"}, Context: w.KeyContext{InstallationID: input.Input.Authority.InstallationID, BackupPublicID: binding.BackupID, AttemptNo: binding.Attempt, Phase: "capture", Part: binding.Path, PartIndex: strconv.FormatUint(uint64(binding.PartIndex), 10), EnvelopeID: binding.EnvelopeID, CaptureContextHash: binding.CaptureContextHash}}}
		return requests, e
	}
	only, e := NewCaptureModules([]CaptureModuleRegistration{a}, moduleTestContext)
	if e != nil {
		t.Fatal(e)
	}
	if parts, e := only.BuildParts(f.in, SourceInventory{}, f.x.HoldUntil); e != nil || len(parts) != 1 {
		t.Fatal("formal request fixture itself rejected", e)
	}
	m, e := NewCaptureModules([]CaptureModuleRegistration{a, b}, moduleTestContext)
	if e != nil {
		t.Fatal(e)
	}
	if parts, e := m.BuildParts(f.in, SourceInventory{}, f.x.HoldUntil); e == nil || parts != nil || f.ensures != 0 {
		t.Fatal("formal envelope collision escaped", e)
	}
}

func TestModuleCatalogCanonicalAndDefensivelyFrozen(t *testing.T) {
	f := moduleTestInput(t)
	a, b := moduleTestRegistration(t, f, "instances", "B", "instances"), moduleTestRegistration(t, f, "teams", "C", "teams")
	one, err := NewCaptureModules([]CaptureModuleRegistration{b, a}, moduleTestContext)
	if err != nil {
		t.Fatal(err)
	}
	two, err := NewCaptureModules([]CaptureModuleRegistration{a, b}, moduleTestContext)
	if err != nil || one.CatalogSHA256() != two.CatalogSHA256() {
		t.Fatal("catalog depends on registration order", err)
	}
	a.Descriptor.Parts[0].Operation = "forged"
	copy := one.Describe()
	copy[0].Parts[0].Part = "forged"
	parts, err := one.BuildParts(f.in, SourceInventory{Users: []int{1}}, f.x.HoldUntil)
	if err != nil || len(parts) != 2 || parts[0].Part != "instances" || parts[1].Part != "teams" || f.ensures != 0 {
		t.Fatal("catalog was mutated or dispatch occurred", err)
	}
	for index, part := range parts {
		var invocation worker.Invocation
		json.Unmarshal(part.InvocationJSON, &invocation)
		if invocation.Request.Binding.PartIndex != uint32(index) || invocation.Request.Binding.CaptureContextHash != strings.Repeat("c", 64) {
			t.Fatal("parts do not share frozen context/index")
		}
	}
}

func TestModuleRegistrationRejectsUnsupportedOrUnownedOperations(t *testing.T) {
	for _, which := range []string{"duplicate-module", "duplicate-part", "nil-builder", "owner", "revision", "invalid-utf8-revision", "unknown-op", "c-database", "storage-part", "nil-context"} {
		t.Run(which, func(t *testing.T) {
			f := moduleTestInput(t)
			a := moduleTestRegistration(t, f, "instances", "B", "users")
			registrations, resolve := []CaptureModuleRegistration{a}, CaptureContextResolver(moduleTestContext)
			switch which {
			case "duplicate-module":
				registrations = append(registrations, a)
			case "duplicate-part":
				b := a
				b.Descriptor.ID = "other"
				registrations = append(registrations, b)
			case "nil-builder":
				registrations[0].Build = nil
			case "owner":
				registrations[0].Descriptor.Owner = ""
			case "revision":
				registrations[0].Descriptor.Revision = ""
			case "invalid-utf8-revision":
				registrations[0].Descriptor.Revision = string([]byte{0xff})
			case "unknown-op":
				registrations[0].Descriptor.Parts[0].Operation = "capture-redis"
			case "c-database":
				registrations[0].Descriptor.Owner = "C"
				registrations[0].Descriptor.Parts[0].Operation = "capture-database"
				registrations[0].Descriptor.Parts[0].RequestedPart = "mysql"
			case "storage-part":
				registrations[0].Descriptor.Parts[0].RequestedPart = "redis"
			case "nil-context":
				resolve = nil
			}
			if _, err := NewCaptureModules(registrations, resolve); err == nil {
				t.Fatal("invalid registration accepted")
			}
		})
	}
}

func TestModuleSelectionDoesNotSkipMissingPartsOrClaimAcceptance(t *testing.T) {
	f := moduleTestInput(t)
	calls := 0
	a := moduleTestRegistration(t, f, "instances", "B", "users")
	original := a.Build
	a.Build = func(input CaptureModuleInput) ([]CapturePartRequest, error) { calls++; return original(input) }
	m, err := NewCaptureModules([]CaptureModuleRegistration{a}, moduleTestContext)
	if err != nil {
		t.Fatal(err)
	}
	for _, requested := range [][]string{{"workspace", "redis"}, {"mysql"}, {"mysql", "redis", "object_storage", "workspace", "deployment_resources", "secret_bundle"}} {
		f.in.Backup.RequestedParts = requested
		if len(requested) == 6 {
			f.in.Backup.TaskPurpose = "acceptance"
		}
		if parts, err := m.BuildParts(f.in, SourceInventory{}, f.x.HoldUntil); err == nil || parts != nil || calls != 0 {
			t.Fatal("missing part became a partial successful plan", err)
		}
	}
}

func TestModuleContextRejectsForeignAndExpiredProjectionBeforeBuilder(t *testing.T) {
	for _, which := range []string{"task", "attempt", "config", "profile", "inventory", "catalog", "point", "hold", "expired"} {
		t.Run(which, func(t *testing.T) {
			f := moduleTestInput(t)
			calls := 0
			a := moduleTestRegistration(t, f, "instances", "B", "users")
			a.Build = func(CaptureModuleInput) ([]CapturePartRequest, error) { calls++; return nil, nil }
			m, _ := NewCaptureModules([]CaptureModuleRegistration{a}, func(in d.Input, inv SourceInventory, hold time.Time, catalog string) (ModuleCaptureContext, error) {
				p, _ := moduleTestContext(in, inv, hold, catalog)
				switch which {
				case "task":
					p.TaskPublicID = "foreign"
				case "attempt":
					p.AttemptNo++
				case "config":
					p.ConfigSHA256 = strings.Repeat("0", 64)
				case "profile":
					p.ProfileRevision = "foreign"
				case "inventory":
					p.InventorySHA256 = strings.Repeat("0", 64)
				case "catalog":
					p.CatalogSHA256 = strings.Repeat("0", 64)
				case "point":
					p.CaptureContextSHA256 = ""
				case "hold":
					p.HoldUntil = hold.Add(time.Second)
				}
				return p, nil
			})
			hold := f.x.HoldUntil
			if which == "expired" {
				hold = time.Now().Add(-time.Second)
			}
			if _, err := m.BuildParts(f.in, SourceInventory{}, hold); err == nil || calls != 0 {
				t.Fatal("foreign context reached a module")
			}
		})
	}
}

func TestModuleOutputRejectsChangedPayloadAndPartialSuccess(t *testing.T) {
	for _, which := range []string{"empty", "extra", "category", "operation", "index", "context", "attempt", "path", "command", "image", "unbound-pod", "restore-policy", "error"} {
		t.Run(which, func(t *testing.T) {
			f := moduleTestInput(t)
			a := moduleTestRegistration(t, f, "instances", "B", "users")
			a.Build = func(input CaptureModuleInput) ([]CapturePartRequest, error) {
				requests, _ := moduleTestRequests(t, f, input)
				switch which {
				case "empty":
					return nil, nil
				case "extra":
					return append(requests, requests[0]), nil
				case "category":
					requests[0].Category = "other"
				case "operation":
					requests[0].Invocation.Request.Operation = "restore-workspace"
				case "index":
					requests[0].Invocation.Request.Binding.PartIndex++
				case "context":
					requests[0].Invocation.Request.Binding.CaptureContextHash = strings.Repeat("0", 64)
				case "attempt":
					requests[0].Invocation.Request.Binding.Attempt = "99"
				case "path":
					requests[0].Invocation.Request.Binding.Path = "other"
				case "command":
					requests[0].Workload.Command = []string{"sh"}
				case "image":
					requests[0].Workload.Image = "worker:latest"
				case "unbound-pod":
					requests[0].Workload.WorkerControl.BoundPodIdentity = false
				case "restore-policy":
					requests[0].Invocation.Request.PolicyVersion = "restore-normalization"
				case "error":
					return requests, errors.New("owner not ready")
				}
				return requests, nil
			}
			m, _ := NewCaptureModules([]CaptureModuleRegistration{a}, moduleTestContext)
			if parts, err := m.BuildParts(f.in, SourceInventory{}, f.x.HoldUntil); err == nil || parts != nil || f.ensures != 0 {
				t.Fatal("invalid output was returned or dispatched")
			}
		})
	}
}
