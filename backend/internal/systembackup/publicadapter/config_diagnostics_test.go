package publicadapter

import (
	"encoding/json"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
)

func TestModuleDiagnosticsCollectMissingInputsWithoutLeakingValues(t *testing.T) {
	report := DiagnoseUsersInstancesConfig(UsersInstancesModuleConfig{})
	want := map[string]bool{"revision": false, "source.database": false, "source.server_uuid": false, "source.users": false, "database.invocation.database": false, "database.workload.worker_control": false}
	for _, issue := range report.Issues {
		if _, ok := want[issue.Field]; ok {
			want[issue.Field] = true
		}
	}
	for field, found := range want {
		if !found {
			t.Fatal("missing diagnostic field", field)
		}
	}
	_, cfg := usersInstancesModuleFixture(t)
	secret := "synthetic-secret-DO-NOT-PRINT"
	cfg.Source.Database = secret
	cfg.Database.Invocation.Request.Database.Address = secret
	cfg.Database.Invocation.Request.Database.RootCA = []byte(secret)
	cfg.Workspaces[0].Request.Workload.Source.PersistentVolumeClaim.ClaimName = secret
	cfg.Workspaces[0].Request.Workload.WorkerControl.IdentitySecret = secret
	cfg.Workspaces[0].Request.Invocation.Request.Binding.EnvelopeID = secret
	cfg.Workspaces[0].Request.Workload.Image = secret
	raw, _ := json.Marshal(DiagnoseUsersInstancesConfig(cfg))
	if strings.Contains(string(raw), secret) || strings.Contains(string(raw), "fixture.invalid") || strings.Contains(string(raw), "source-pvc") {
		t.Fatal("diagnostics disclosed input material")
	}
}

func TestModuleDiagnosticsWorkBuddyAssemblyClosesOnlyLocalIdentityGap(t *testing.T) {
	_, cfg, snapshot := workBuddyInputFixture(t)
	before := DiagnoseUsersInstancesConfig(cfg)
	found := false
	for _, issue := range before.Issues {
		if issue.Code == "workbuddy_identity_required" && issue.InstanceID == 7 && issue.MountIndex == 0 && issue.Receiver == "B" {
			found = true
		}
	}
	if !found {
		t.Fatal("missing exact WorkBuddy input location")
	}
	bound, err := WithWorkBuddyIdentities(cfg, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if report := DiagnoseUsersInstancesConfig(bound); len(report.Issues) != 0 || report.Truncated {
		t.Fatal("valid local assembly has issues", report)
	}
}

func TestModuleDiagnosticsAreBoundedAndDeferToStrictConstructor(t *testing.T) {
	_, cfg := usersInstancesModuleFixture(t)
	cfg.Source.Instances[0].Status = "creating"
	r := DiagnoseUsersInstancesConfig(cfg)
	if len(r.Issues) != 1 || r.Issues[0].Code != "module_config_invalid" {
		t.Fatal("strict constructor rejection lost")
	}
	_, cfg = usersInstancesModuleFixture(t)
	for n := 0; n < 1000; n++ {
		cfg.Workspaces = append(cfg.Workspaces, cfg.Workspaces[0])
	}
	r = DiagnoseUsersInstancesConfig(cfg)
	if !r.Truncated || len(r.Issues) != MaxModuleConfigIssues {
		t.Fatal("diagnostic report unbounded")
	}
	a, _ := json.Marshal(r)
	b, _ := json.Marshal(DiagnoseUsersInstancesConfig(cfg))
	if string(a) != string(b) {
		t.Fatal("report nondeterministic")
	}
	cfg.Source.Users = make([]int, 100001)
	r = DiagnoseUsersInstancesConfig(cfg)
	if len(r.Issues) != 1 || r.Issues[0].Code != "capacity_exceeded" {
		t.Fatal("capacity check missing")
	}
}

func TestModuleDiagnosticsPreserveSupportedStorageFormsAndDetectCollisions(t *testing.T) {
	for _, kind := range []string{"pvc", "nfs", "hostpath"} {
		t.Run(kind, func(t *testing.T) {
			_, cfg := usersInstancesModuleFixture(t)
			if kind == "nfs" {
				cfg.Workspaces[0].Request.Workload.Source.VolumeSource = corev1.VolumeSource{NFS: &corev1.NFSVolumeSource{Server: "synthetic.invalid", Path: "/source"}}
			}
			if kind == "hostpath" {
				cfg.Workspaces[0].Request.Workload.Source.VolumeSource = corev1.VolumeSource{HostPath: &corev1.HostPathVolumeSource{Path: "/source"}}
				cfg.Workspaces[0].Request.Workload.NodeName = "synthetic-node"
			}
			if report := DiagnoseUsersInstancesConfig(cfg); len(report.Issues) != 0 {
				t.Fatal("supported storage falsely rejected", report)
			}
			cfg.Workspaces[1].Request.Invocation.Request.ArtifactName = cfg.Workspaces[0].Request.Invocation.Request.ArtifactName
			report := DiagnoseUsersInstancesConfig(cfg)
			if len(report.Issues) != 1 || report.Issues[0].Code != "output_collision" || report.Issues[0].InstanceID != 9 {
				t.Fatal("shared output not diagnosed", report)
			}
		})
	}
}
