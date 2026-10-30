package systembackupexecution

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"

	b "clawreef/internal/systembackup/publicadapter"
	"clawreef/internal/systembackup/staging"
	"clawreef/internal/systembackup/worker"
	d "clawreef/internal/systembackupdispatch"
)

func TestWorkerSealUsesObservedVersionAndChecksStoredReport(t *testing.T) {
	a, j, _ := resultEvidenceFixture()
	a.ConfigSHA256 = strings.Repeat("a", 64)
	root, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if err = root.Mkdir(a.TaskPublicID, 0700); err != nil {
		t.Fatal(err)
	}
	source, err := root.OpenRoot(a.TaskPublicID)
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	owner := PublicJobOwner{Staging: root, SealCustodyMaxBytes: 1 << 30}
	i := worker.Invocation{Request: worker.Request{Operation: "capture-workspace", ArtifactName: "workspace.enc", MaxCompressedBytes: 1 << 20, Binding: staging.Binding{BackupID: a.TaskPublicID, Attempt: "1", Path: j.JobUnitKey, PartIndex: 1, CaptureContextHash: a.ConfigSHA256, EnvelopeID: "original"}}}
	key := make([]byte, 32)
	receipt, err := staging.SealFile(context.Background(), source, i.Request.ArtifactName, key, i.Request.Binding, func(w io.Writer) error { _, e := io.WriteString(w, "original ciphertext content"); return e })
	if err != nil {
		t.Fatal(err)
	}
	result := worker.Result{Receipt: receipt}
	seal, err := owner.observeWorkerSeal(context.Background(), a, j, i, result, key)
	if err != nil {
		t.Fatal(err)
	}
	if seal.Reference == receipt.Name || seal.ContentSHA256 != receipt.SHA256 {
		t.Fatal("self-report promoted")
	}
	rawInvocation, _ := json.Marshal(i)
	desc := b.Discovery{Parts: []b.JobPart{{Intent: d.JobIntent{JobUnitKey: j.JobUnitKey}, InvocationJSON: rawInvocation}}}
	cp, _ := json.Marshal(b.Checkpoint{SealedRef: seal.Reference, ContentSHA256: seal.ContentSHA256})
	report := d.ModuleResult{Checkpoint: cp, Statistics: map[string]uint64{"sealed_bytes": uint64(receipt.Size)}}
	raw, _ := json.Marshal(report)
	if err = owner.checkWorkerSeal(context.Background(), a, j, desc, raw); err != nil {
		t.Fatal(err)
	}
	source.Chmod(receipt.Name, 0600)
	if err = source.Remove(receipt.Name); err != nil {
		t.Fatal(err)
	}
	if err = owner.checkWorkerSeal(context.Background(), a, j, desc, raw); err != nil {
		t.Fatal("read used worker source", err)
	}
	for _, fault := range []string{"job", "reference", "size", "invocation"} {
		jj, rr, dd := j, report, desc
		switch fault {
		case "job":
			jj.UID = "replacement"
		case "reference":
			rr.Checkpoint, _ = json.Marshal(b.Checkpoint{SealedRef: receipt.Name, ContentSHA256: receipt.SHA256})
		case "size":
			rr.Statistics = map[string]uint64{"sealed_bytes": uint64(receipt.Size + 1)}
		case "invocation":
			ii := i
			ii.WorkspacePath = "other"
			encoded, _ := json.Marshal(ii)
			dd = b.Discovery{Parts: []b.JobPart{{Intent: d.JobIntent{JobUnitKey: j.JobUnitKey}, InvocationJSON: encoded}}}
		}
		bad, _ := json.Marshal(rr)
		if owner.checkWorkerSeal(context.Background(), a, jj, dd, bad) == nil {
			t.Fatal("unbound seal accepted", fault)
		}
	}
}
