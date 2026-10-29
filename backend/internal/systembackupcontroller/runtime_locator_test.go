package systembackupcontroller

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

	"clawreef/internal/services"
	b "clawreef/internal/systembackup/publicadapter"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

type locatorConnector struct{ row *gatewayBindingRow }

func (c locatorConnector) Connect(context.Context) (driver.Conn, error) {
	return locatorConn{c.row}, nil
}
func (c locatorConnector) Driver() driver.Driver { return grantProbeDriver{} }

type locatorConn struct{ row *gatewayBindingRow }

func (c locatorConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("unexpected prepare")
}
func (c locatorConn) Close() error { return nil }
func (c locatorConn) Begin() (driver.Tx, error) {
	return nil, errors.New("unexpected mutation transaction")
}
func (c locatorConn) QueryContext(_ context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	if !strings.HasPrefix(q, "SELECT p.id,COALESCE(p.pod_uid,'')") || len(args) != 1 || args[0].Value != int64(7) {
		return nil, errors.New("unexpected locator query")
	}
	r := c.row
	return &claimReceiptRows{values: []driver.Value{int64(r.ID), r.UID, r.Pod, r.Namespace, r.Endpoint, int64(r.Port), r.Workspace, int64(r.Generation), r.State, r.Gateway, r.Deployment, int64(r.PID)}}, nil
}

type locatorAgent struct {
	caps  services.RuntimeBackupCapabilities
	calls int
}

func (a *locatorAgent) BackupCapabilities(context.Context, string, int) (*services.RuntimeBackupCapabilities, error) {
	a.calls++
	copy := a.caps
	return &copy, nil
}
func (*locatorAgent) BackupControl(context.Context, string, string, services.RuntimeBackupRequest, *services.RuntimeAgentCreateGatewayRequest) (services.RuntimeBackupObservation, error) {
	panic("discovery mutated a gateway")
}
func (*locatorAgent) GatewayState(context.Context, string, string) (*services.RuntimeAgentGatewayState, error) {
	panic("unexpected state read")
}
func (*locatorAgent) DeleteGateway(context.Context, string, string) error {
	panic("discovery deleted a gateway")
}
func (*locatorAgent) CreateGateway(context.Context, string, services.RuntimeAgentCreateGatewayRequest) (*services.RuntimeAgentCreateGatewayResponse, error) {
	panic("discovery created a gateway")
}

func TestRuntimeLocatorPreservesNullSourceAndChecksIndependentIdentity(t *testing.T) {
	for _, fault := range []string{"", "registered-uid", "source-namespace", "binding-namespace", "source-pod", "workspace", "generation", "pid", "port", "endpoint", "not-ready", "owner", "agent-uid", "agent-epoch", "no-durable-reservation", "probe"} {
		t.Run(fault, func(t *testing.T) {
			source := b.InstanceIdentity{ID: 7, UserID: 1, Generation: 3, Mode: "lite", Status: "running", Workspace: "/workspaces/user-1/instance-7"}
			row := gatewayBindingRow{ID: 6, Pod: "runtime-pod", Namespace: "backup", Endpoint: "http://10.1.2.3:8080", Port: 20000, Workspace: source.Workspace, Generation: 3, State: "running", Gateway: "gw-7-3", Deployment: "runtime", PID: 123}
			controller := true
			pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: row.Pod, Namespace: row.Namespace, UID: "actual-pod-uid", OwnerReferences: []metav1.OwnerReference{{Kind: "ReplicaSet", Name: "runtime-rs", UID: "rs-uid", Controller: &controller}}}, Spec: corev1.PodSpec{NodeName: "node"}, Status: corev1.PodStatus{Phase: corev1.PodRunning, PodIP: "10.1.2.3", Conditions: []corev1.PodCondition{{Type: corev1.PodReady, Status: corev1.ConditionTrue}}}}
			rs := &appsv1.ReplicaSet{ObjectMeta: metav1.ObjectMeta{Name: "runtime-rs", Namespace: "backup", UID: "rs-uid", OwnerReferences: []metav1.OwnerReference{{Kind: "Deployment", Name: "runtime", UID: "dep-uid", Controller: &controller}}}}
			dep := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "runtime", Namespace: "backup", UID: "dep-uid"}}
			agent := &locatorAgent{caps: services.RuntimeBackupCapabilities{Protocol: services.RuntimeBackupProtocol, Namespace: row.Namespace, GatewayPort: row.Port, Slot: "slot-0", PodUID: string(pod.UID), AgentEpoch: strings.Repeat("a", 32), Supported: true, DurableReservation: true, Scope: services.RuntimeBackupStopScope}}
			switch fault {
			case "registered-uid":
				row.UID = "old-pod"
			case "source-namespace":
				source.Namespace = "outside"
			case "binding-namespace":
				row.Namespace = "outside"
			case "source-pod":
				source.Pod = "different"
			case "workspace":
				row.Workspace = "/workspaces/user-2/instance-7"
			case "generation":
				row.Generation++
			case "pid":
				row.PID = 0
			case "port":
				row.Port = 0
			case "endpoint":
				row.Endpoint = "http://10.1.2.4:8080"
			case "not-ready":
				pod.Status.Conditions = nil
			case "owner":
				rs.OwnerReferences[0].UID = "replaced-deployment"
			case "agent-uid":
				agent.caps.PodUID = "different"
			case "agent-epoch":
				agent.caps.AgentEpoch = strings.Repeat("z", 32)
			case "no-durable-reservation":
				agent.caps.DurableReservation = false
			}
			db := sql.OpenDB(locatorConnector{&row})
			defer db.Close()
			client := fake.NewSimpleClientset(pod, rs, dep)
			owner := &SQLRuntimeControl{cfg: RuntimeControlConfig{Namespace: "backup", Gate: SQLCaptureGate{Authority: SQLExecutionAuthority{DB: db}}, Client: client, Agent: agent, DeploymentChecks: map[string]ReadinessProbe{"backup/runtime": ReadinessProbeFunc(func(context.Context) error {
				if fault == "probe" {
					return errors.New("not fenced")
				}
				return nil
			})}}}
			mapped, e := owner.ResolveGatewaySource(context.Background(), source)
			if (e == nil) != (fault == "") {
				t.Fatal("mapping admitted or rejected wrong source", e)
			}
			if fault == "binding-namespace" || fault == "source-namespace" {
				if len(client.Actions()) != 0 || agent.calls != 0 {
					t.Fatal("contacted out-of-scope resource")
				}
			}
			if e != nil {
				return
			}
			if mapped.Source != source || mapped.Source.Pod != "" || mapped.Source.Namespace != "" || mapped.RuntimePod() != row.Pod || mapped.RuntimeNamespace() != row.Namespace || mapped.UID != string(pod.UID) || mapped.Runtime.RegisteredPodUID != "" {
				t.Fatal("raw source changed or nullable registration invented")
			}
			agent.caps.AgentEpoch = strings.Repeat("b", 32)
			if owner.checkGatewayPod(context.Background(), mapped) == nil {
				t.Fatal("restarted Agent adopted")
			}
		})
	}
}
