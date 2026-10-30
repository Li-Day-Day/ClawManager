package systembackupexecution

import (
	b "clawreef/internal/systembackup/publicadapter"
	d "clawreef/internal/systembackupdispatch"
	"strconv"
)

func workerRelayTemplate(a d.Authority, j d.JobBinding, action string) (*b.RelayMessage, error) {
	m := &b.RelayMessage{SchemaVersion: b.RelayVersion, InstallationID: a.InstallationID, TaskPublicID: a.TaskPublicID, TaskType: a.TaskType, AttemptNo: strconv.FormatUint(a.AttemptNo, 10), Phase: a.Phase, JobUnitKey: j.JobUnitKey, Namespace: j.Namespace, JobName: j.Name, JobUID: j.UID, JobGeneration: strconv.FormatUint(j.Generation, 10), RelayIdentityRef: j.RelayIdentityRef, RelayIdentityVersion: j.RelayIdentityVersion, Sequence: "1", Status: "ready"}
	previous := ""
	if action == "acquire" {
		m.Sequence, m.Status, previous = "2", "running", "ready"
	} else if action != "ready" {
		return nil, d.ErrNotReady
	}
	if err := b.RelayProgress(previous, *m, b.RelayAdvance); err != nil {
		return nil, err
	}
	return m, nil
}
