package systembackupevidence

import (
	"context"
	"encoding/json"
	"os"
	"sync"
)

// RecoveryAuditJournal writes management audit records to an already
// provisioned regular file. The caller must place it on independently reserved
// durable storage and provide a single writer. No path is accepted from a
// management request, and the journal never creates a missing file.
type RecoveryAuditJournal struct {
	mu       sync.Mutex
	file     *os.File
	path     string
	maxBytes int64
	size     int64
	poisoned bool
}

func NewRecoveryAuditJournal(path string, maxBytes int64) (*RecoveryAuditJournal, error) {
	if path == "" || maxBytes < 4096 {
		return nil, ErrDenied
	}
	before, err := os.Lstat(path)
	if err != nil || !before.Mode().IsRegular() || before.Size() > maxBytes {
		return nil, ErrDenied
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		return nil, ErrUnavailable
	}
	after, err := f.Stat()
	if err != nil || !after.Mode().IsRegular() || !os.SameFile(before, after) {
		f.Close()
		return nil, ErrDenied
	}
	return &RecoveryAuditJournal{file: f, path: path, maxBytes: maxBytes, size: after.Size()}, nil
}

type recoveryAuditJournalEntry struct {
	Kind       string                                        `json:"kind"`
	Bootstrap  *RecoveryManagerExternalAuditRecord           `json:"bootstrap,omitempty"`
	Authority  *RecoveryAuthorityExternalAuditRecord         `json:"authority,omitempty"`
	Revocation *RecoveryManagerRevocationExternalAuditRecord `json:"revocation,omitempty"`
	Download   *downloadFailureJournalRecord                 `json:"download,omitempty"`
}

func (j *RecoveryAuditJournal) AppendRecoveryManagerAudit(ctx context.Context, record RecoveryManagerExternalAuditRecord) error {
	if record.Stage != "intent" && record.Stage != "result" ||
		!recoveryBootstrapID.MatchString(record.GrantID) || !digestPattern.MatchString(record.GrantSHA256) ||
		!digestPattern.MatchString(record.BootstrapIdentityHash) || !digestPattern.MatchString(record.ManagerIdentityHash) ||
		!digestPattern.MatchString(record.ScopeKeySHA256) {
		return ErrDenied
	}
	return j.append(ctx, recoveryAuditJournalEntry{Kind: "manager_bootstrap", Bootstrap: &record})
}

func (j *RecoveryAuditJournal) AppendRecoveryAuthorityAudit(ctx context.Context, record RecoveryAuthorityExternalAuditRecord) error {
	if record.Stage != "intent" && record.Stage != "result_prepared" ||
		!digestPattern.MatchString(record.DecisionSHA256) || !digestPattern.MatchString(record.RequestHash) ||
		!digestPattern.MatchString(record.ManagerIdentityHash) {
		return ErrDenied
	}
	return j.append(ctx, recoveryAuditJournalEntry{Kind: "authority_change", Authority: &record})
}

func (j *RecoveryAuditJournal) AppendRecoveryManagerRevocationAudit(ctx context.Context, record RecoveryManagerRevocationExternalAuditRecord) error {
	if record.Stage != "intent" && record.Stage != "result" ||
		!recoveryBootstrapID.MatchString(record.GrantID) || !digestPattern.MatchString(record.GrantSHA256) ||
		!digestPattern.MatchString(record.SuperiorIdentityHash) || !digestPattern.MatchString(record.ManagerIdentityHash) ||
		!digestPattern.MatchString(record.ScopeKeySHA256) {
		return ErrDenied
	}
	return j.append(ctx, recoveryAuditJournalEntry{Kind: "manager_revocation", Revocation: &record})
}

func (j *RecoveryAuditJournal) append(ctx context.Context, entry recoveryAuditJournalEntry) error {
	if j == nil || ctx == nil || ctx.Err() != nil {
		return ErrUnavailable
	}
	raw, err := json.Marshal(entry)
	if err != nil || len(raw) > 2048 {
		return ErrDenied
	}
	raw = append(raw, '\n')
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.poisoned || j.file == nil || ctx.Err() != nil {
		return ErrUnavailable
	}
	info, err := j.file.Stat()
	pathInfo, pathErr := os.Lstat(j.path)
	if err != nil || pathErr != nil || !info.Mode().IsRegular() || !pathInfo.Mode().IsRegular() ||
		!os.SameFile(info, pathInfo) || info.Size() != j.size || info.Size() > j.maxBytes-int64(len(raw)) {
		j.poisoned = true
		return ErrUnavailable
	}
	n, err := j.file.Write(raw)
	if err != nil || n != len(raw) || j.file.Sync() != nil {
		j.poisoned = true
		return ErrUnavailable
	}
	j.size += int64(len(raw))
	if ctx.Err() != nil {
		return ErrUnavailable
	}
	return nil
}

func (j *RecoveryAuditJournal) Close() error {
	if j == nil {
		return nil
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.file == nil {
		return nil
	}
	j.poisoned = true
	err := j.file.Close()
	j.file = nil
	return err
}

var _ RecoveryManagerExternalAudit = (*RecoveryAuditJournal)(nil)
var _ RecoveryAuthorityExternalAudit = (*RecoveryAuditJournal)(nil)
var _ RecoveryManagerRevocationExternalAudit = (*RecoveryAuditJournal)(nil)
