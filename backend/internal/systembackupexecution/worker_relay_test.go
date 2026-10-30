package systembackupexecution

import (
	d "clawreef/internal/systembackupdispatch"
	"testing"
)

func TestWorkerRelayTemplateUsesOriginalAuthorityAndJob(t *testing.T) {
	a := d.Authority{InstallationID: "installation_test", TaskPublicID: "sbk_11111111-1111-4111-8111-111111111111", TaskType: "backup", AttemptNo: 3, Phase: "capture"}
	j := d.JobBinding{JobUnitKey: "workspace", Namespace: "backup", Name: "worker", UID: "22222222-2222-4222-8222-222222222222", Generation: 7, RelayIdentityRef: "original", RelayIdentityVersion: "v2"}
	for _, action := range []string{"ready", "acquire"} {
		m, err := workerRelayTemplate(a, j, action)
		if err != nil {
			t.Fatal(err)
		}
		if m.TaskPublicID != a.TaskPublicID || m.AttemptNo != "3" || m.JobUID != j.UID || m.JobGeneration != "7" || m.RelayIdentityRef != j.RelayIdentityRef || m.ResultEvidence != nil {
			t.Fatal("template invented binding")
		}
		if action == "ready" && (m.Sequence != "1" || m.Status != "ready") || action == "acquire" && (m.Sequence != "2" || m.Status != "running") {
			t.Fatal("wrong progress")
		}
	}
	if _, err := workerRelayTemplate(a, j, "complete"); err == nil {
		t.Fatal("invented terminal evidence")
	}
	j.UID = ""
	if _, err := workerRelayTemplate(a, j, "ready"); err == nil {
		t.Fatal("unobserved Job accepted")
	}
}
