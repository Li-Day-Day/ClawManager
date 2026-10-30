package worker

import (
	"bytes"
	"clawreef/internal/systembackup/relaywire"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
)

var resultEvidenceID = regexp.MustCompile(`^sev_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var resultEvidenceSHA = regexp.MustCompile(`^[0-9a-f]{64}$`)

// Templates come only from the authenticated owner after process registration.
// No worker-generated sequence, terminal evidence or alternate URL is accepted.
func validLeaseRelay(m *relaywire.RelayMessage, r ControlRequest) bool {
	if m == nil {
		return true
	}
	status, sequence := "ready", "1"
	if r.Action == "acquire" {
		status, sequence = "running", "2"
	} else if r.Action == "complete" {
		status, sequence = "completed", "3"
		if m.ResultEvidence == nil || !resultEvidenceID.MatchString(m.ResultEvidence.PublicID) || !resultEvidenceSHA.MatchString(m.ResultEvidence.SHA256) {
			return false
		}
	} else if r.Action != "ready" {
		return false
	}
	return m.SchemaVersion == relaywire.RelayVersion && m.TaskPublicID == r.Invocation.Request.Binding.BackupID && m.AttemptNo == r.Invocation.Request.Binding.Attempt && m.JobUnitKey == r.Invocation.Request.Binding.Path && m.TaskType == "backup" && m.Phase == "capture" && m.Status == status && m.Sequence == sequence && (r.Action == "complete" || m.ResultEvidence == nil) && m.InstallationID != "" && m.Namespace != "" && m.JobName != "" && m.JobUID != "" && m.JobGeneration != "" && m.RelayIdentityRef != "" && m.RelayIdentityVersion != ""
}

func (c *ControlClient) sendRelay(ctx context.Context, m relaywire.RelayMessage) error {
	if c.tokenFile == "" {
		return ErrExecution
	}
	u, err := url.Parse(c.endpoint)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return ErrExecution
	}
	u.Path, u.RawPath = "/relay", ""
	// Deterministic struct encoding preserves the exact bytes on control retries.
	raw, err := json.Marshal(m)
	if err != nil {
		return ErrExecution
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(raw))
	if err != nil {
		return ErrExecution
	}
	token, err := os.ReadFile(c.tokenFile)
	defer clear(token)
	if err != nil || len(token) < 16 || len(token) > 16384 || strings.ContainsAny(string(token), "\r\n\x00") {
		return ErrNotReady
	}
	req.Header.Set("Authorization", "Bearer "+string(token))
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return ErrNotReady
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusServiceUnavailable {
		return ErrNotReady
	}
	if res.StatusCode != http.StatusOK {
		return ErrExecution
	}
	var receipt struct {
		Decision string `json:"decision"`
	}
	if decodeBounded(res.Body, &receipt, 1024) != nil || (receipt.Decision != "advance" && receipt.Decision != "replay") {
		return ErrExecution
	}
	return nil
}
