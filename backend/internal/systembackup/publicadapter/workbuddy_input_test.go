package publicadapter

import (
	"encoding/json"
	"reflect"
	"sort"
	"strconv"
	"testing"

	"clawreef/internal/systembackup/domain"
)

func workBuddyInputFixture(t *testing.T) (*fixture, UsersInstancesModuleConfig, domain.Snapshot) {
	t.Helper()
	f, cfg := usersInstancesModuleFixture(t)
	cfg.Source.Instances[0].Type = "workbuddy"
	cfg.Workspaces[0].Request.Invocation.Request.RuntimePolicy.Runtime.Type = "workbuddy"
	table := func(name string, rows []domain.Row, columns []domain.Column, key string) domain.Table {
		return domain.Table{Name: name, Engine: "InnoDB", PrimaryKey: []string{key}, Rows: rows, Columns: columns}
	}
	users := []domain.Row{}
	for _, id := range cfg.Source.Users {
		username, role := "synthetic-user", "user"
		if id == 1 {
			username, role = "admin", "admin"
		}
		users = append(users, domain.Row{"id": domain.Text(strconv.Itoa(id)), "username": domain.Text(username), "password_hash": domain.Text("synthetic-private-password"), "role": domain.Text(role), "is_active": domain.Text("1")})
	}
	instances := []domain.Row{}
	for _, i := range cfg.Source.Instances {
		r := domain.Row{}
		for k, v := range map[string]string{"id": strconv.Itoa(i.ID), "user_id": strconv.Itoa(i.UserID), "runtime_generation": strconv.Itoa(i.Generation), "type": i.Type, "instance_mode": i.Mode, "runtime_type": i.Backend, "runtime_variant": i.Variant, "os_type": i.OS, "status": i.Status, "pod_name": i.Pod, "pod_namespace": i.Namespace, "workspace_path": i.Workspace} {
			r[k] = domain.Text(v)
		}
		r["workbuddy_storage_identity"] = domain.Cell{Null: true}
		instances = append(instances, r)
	}
	columnsFor := func(row domain.Row) []domain.Column {
		// Fixture column order is stable; no plaintext snapshot is persisted.
		var keys []string
		for k := range row {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var cols []domain.Column
		for _, k := range keys {
			cols = append(cols, domain.Column{Name: k, Type: "varchar(512)", Nullable: true})
		}
		return cols
	}
	ident := table("workbuddy_linux_identities", []domain.Row{
		{"instance_id": domain.Text("7"), "user_id": domain.Text("1"), "linux_uid": domain.Text("22001"), "created_at": domain.Text("2020-01-01 00:00:00.000000")},
		{"instance_id": domain.Text("987"), "user_id": domain.Text("998"), "linux_uid": domain.Text("25000"), "created_at": domain.Text("2020-01-01 00:00:01.000000")},
	}, []domain.Column{{Name: "instance_id", Type: "int"}, {Name: "user_id", Type: "int"}, {Name: "linux_uid", Type: "int"}, {Name: "created_at", Type: "datetime(6)"}}, "instance_id")
	ident.UniqueKeys = []domain.UniqueKey{{Name: "linux_uid", Columns: []string{"linux_uid"}}}
	allocator := table("workbuddy_linux_identity_allocator", []domain.Row{{"id": domain.Text("1"), "next_uid": domain.Text("25001")}}, []domain.Column{{Name: "id", Type: "int"}, {Name: "next_uid", Type: "int"}}, "id")
	snapshot := domain.Snapshot{Version: domain.Version, Tables: []domain.Table{table("users", users, columnsFor(users[0]), "id"), table("instances", instances, columnsFor(instances[0]), "id"), table("user_quotas", nil, []domain.Column{{Name: "id", Type: "int"}}, "id"), ident, allocator}}
	return f, cfg, snapshot
}

func TestWorkBuddyInputAssemblyUsesValidatedUIDAndFreezesInputs(t *testing.T) {
	f, cfg, snapshot := workBuddyInputFixture(t)
	before, _ := json.Marshal(snapshot)
	bound, err := WithWorkBuddyIdentities(cfg, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	identity := bound.Workspaces[0].Request.Invocation.Request.WorkBuddyIdentity
	if identity == nil || identity.UID != 22001 || identity.GID != 22001 || identity.UserID != 1 || identity.InstanceID != 7 {
		t.Fatal("original SQL identity lost")
	}
	if cfg.Workspaces[0].Request.Invocation.Request.WorkBuddyIdentity != nil || bound.Workspaces[1].Request.Invocation.Request.WorkBuddyIdentity != nil {
		t.Fatal("input/non-WorkBuddy mount changed")
	}
	after, _ := json.Marshal(snapshot)
	if string(before) != string(after) {
		t.Fatal("snapshot was mutated")
	}
	r, err := NewUsersInstancesModule(bound)
	if err != nil {
		t.Fatal(err)
	}
	m, _ := NewCaptureModules([]CaptureModuleRegistration{r}, moduleTestContext)
	if parts, err := m.BuildParts(f.in, bound.Source, f.x.HoldUntil); err != nil || len(parts) != 3 || f.ensures != 0 {
		t.Fatal("concrete factory rejected bound identity", err)
	}
	bound.Workspaces[0].Request.Invocation.Request.RuntimePolicy.Files[0].Path = "changed"
	bound.Database.Invocation.Request.Database.RootCA[0] = 'x'
	if cfg.Workspaces[0].Request.Invocation.Request.RuntimePolicy.Files[0].Path != "config.json" || cfg.Database.Invocation.Request.Database.RootCA[0] == 'x' {
		t.Fatal("returned configuration aliases input")
	}
}

func TestWorkBuddyInputAssemblyRejectsForeignStaleAndInvalidSnapshotsAtomically(t *testing.T) {
	for _, attack := range []string{"owner", "generation", "workspace", "users", "missing-column", "missing-schema", "allocator", "duplicate-uid", "retired-only", "prefilled-conflict", "partial-mounts"} {
		t.Run(attack, func(t *testing.T) {
			_, cfg, s := workBuddyInputFixture(t)
			switch attack {
			case "owner":
				s.Tables[1].Rows[0]["user_id"] = domain.Text("2")
			case "generation":
				s.Tables[1].Rows[0]["runtime_generation"] = domain.Text("99")
			case "workspace":
				s.Tables[1].Rows[0]["workspace_path"] = domain.Text("/foreign")
			case "users":
				cfg.Source.Users = cfg.Source.Users[:1]
			case "missing-column":
				delete(s.Tables[1].Rows[0], "runtime_generation")
			case "missing-schema":
				s.Tables = s.Tables[:3]
			case "allocator":
				s.Tables[4].Rows[0]["next_uid"] = domain.Text("22001")
			case "duplicate-uid":
				s.Tables[3].Rows[1]["linux_uid"] = domain.Text("22001")
			case "retired-only":
				s.Tables[3].Rows = s.Tables[3].Rows[1:]
			case "prefilled-conflict":
				cfg.Workspaces[0].Request.Invocation.Request.WorkBuddyIdentity = &domain.WorkBuddyUIDIdentity{Schema: 1, InstanceID: 7, UserID: 1, UID: 22002, GID: 22002}
			case "partial-mounts":
				cfg.Workspaces = nil
			}
			got, err := WithWorkBuddyIdentities(cfg, s)
			if err == nil || !reflect.DeepEqual(got, UsersInstancesModuleConfig{}) {
				t.Fatal("invalid source produced partial executable configuration")
			}
		})
	}
}

func TestWorkBuddyInputNoOpWithoutWorkBuddyStillCopiesAndValidates(t *testing.T) {
	_, cfg := usersInstancesModuleFixture(t)
	bound, err := WithWorkBuddyIdentities(cfg, domain.Snapshot{})
	if err != nil {
		t.Fatal(err)
	}
	bound.Source.Users[0] = 99
	if cfg.Source.Users[0] != 1 {
		t.Fatal("non-WorkBuddy input aliases output")
	}
	cfg.Revision = ""
	if _, err := WithWorkBuddyIdentities(cfg, domain.Snapshot{}); err == nil {
		t.Fatal("no-op bypassed constructor checks")
	}
}

func TestWorkBuddyInputMultipleInstancesAndIdempotentAssemblyDoNotAlias(t *testing.T) {
	_, cfg, s := workBuddyInputFixture(t)
	cfg.Source.Instances[1].Type = "workbuddy"
	cfg.Workspaces[1].Request.Invocation.Request.RuntimePolicy.Runtime.Type = "workbuddy"
	s.Tables[1].Rows[1]["type"] = domain.Text("workbuddy")
	s.Tables[3].Rows = append(s.Tables[3].Rows, domain.Row{"instance_id": domain.Text("9"), "user_id": domain.Text("2"), "linux_uid": domain.Text("23000"), "created_at": domain.Text("2020-01-01 00:00:02.000000")})
	bound, err := WithWorkBuddyIdentities(cfg, s)
	if err != nil {
		t.Fatal(err)
	}
	again, err := WithWorkBuddyIdentities(bound, s)
	if err != nil || !reflect.DeepEqual(bound, again) {
		t.Fatal("exact replay changed assembly", err)
	}
	again.Workspaces[0].Request.Invocation.Request.WorkBuddyIdentity.UID = 12345
	if bound.Workspaces[0].Request.Invocation.Request.WorkBuddyIdentity.UID != 22001 || again.Workspaces[1].Request.Invocation.Request.WorkBuddyIdentity.UID != 23000 || cfg.Workspaces[0].Request.Invocation.Request.WorkBuddyIdentity != nil {
		t.Fatal("identity alias across source/replay/instances")
	}
}
