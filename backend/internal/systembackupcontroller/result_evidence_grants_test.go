package systembackupcontroller

import (
	"strings"
	"testing"
)

func TestResultEvidenceGrantsRequireInsertWithoutMutation(t *testing.T) {
	for _, runtime := range []bool{false, true} {
		generate, validate := PublicCaptureGrantSQL, ValidatePublicCaptureGrants
		if runtime {
			generate, validate = RuntimeControlGrantSQL, ValidateRuntimeControlGrants
		}
		grants, err := generate("capture", "worker", "127.0.0.1", false)
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for i := range grants {
			grants[i] = strings.TrimSuffix(grants[i], ";")
			if strings.Contains(grants[i], "`system_backup_v2_evidence`") {
				found = true
				if !strings.Contains(grants[i], "INSERT") || strings.Contains(grants[i], "UPDATE") || strings.Contains(grants[i], "DELETE") {
					t.Fatal("wrong evidence privileges", grants[i])
				}
			}
		}
		if !found || validate("capture", grants) != nil {
			t.Fatal("evidence role missing")
		}
		old := append([]string(nil), grants...)
		for i := range old {
			if strings.Contains(old[i], "`system_backup_v2_evidence`") {
				old[i] = "GRANT SELECT ON `capture`.`system_backup_v2_evidence` TO 'worker'@'127.0.0.1'"
			}
		}
		if validate("capture", old) == nil {
			t.Fatal("old read-only role accepted")
		}
	}
}
