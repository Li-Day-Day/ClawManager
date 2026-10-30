package systembackupcontroller

import (
	b "clawreef/internal/systembackup/publicadapter"
	d "clawreef/internal/systembackupdispatch"
	p "clawreef/internal/systembackupproducer"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"time"
)

// SQLAuthenticatedRelayAcceptor is constructed by the current execution owner
// for an admitted attempt, never from request fields. Bind revalidates Current
// against the locked public claim/fence on every request, including replays.
// The current runtime resource journal supports backup/capture only.
type SQLAuthenticatedRelayAcceptor struct {
	Authority SQLExecutionAuthority
	Current   d.Authority
	Scope     p.Scope
}

var _ b.AuthenticatedRelayAcceptor = SQLAuthenticatedRelayAcceptor{}

func (s SQLAuthenticatedRelayAcceptor) AcceptAuthenticatedRelay(ctx context.Context, r *b.AuthenticatedRelay) (b.RelayDecision, error) {
	if ctx == nil || ctx.Err() != nil || r == nil || s.Authority.DB == nil || s.Current.TaskType != "backup" || s.Current.Phase != "capture" || string(s.Scope.Installation) != s.Current.InstallationID {
		return "", ErrExecutionAuthority
	}
	a := s.Current
	m := r.Message()
	raw, digest := r.Body()
	if m.TaskPublicID != a.TaskPublicID || m.InstallationID != a.InstallationID || len(raw) == 0 || len(raw) > 65536 || recordHash(raw) != digest {
		return "", ErrExecutionRecord
	}
	tx, e := s.Authority.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead})
	if e != nil {
		return "", e
	}
	defer tx.Rollback()
	guard, e := s.Authority.Bind(ctx, tx, a)
	if e != nil {
		return "", e
	}
	var database, server string
	if tx.QueryRowContext(ctx, "SELECT DATABASE(),@@server_uuid").Scan(&database, &server) != nil || database != string(s.Scope.Database) || server != string(s.Scope.ServerUUID) {
		return "", ErrExecutionAuthority
	}
	var bindingRaw []byte
	var uid string
	var revoked bool
	var attempt uint64
	if tx.QueryRowContext(ctx, `SELECT binding_json,observed_uid,revoked,attempt_no FROM system_backup_v2_runtime_resources WHERE task_public_id=? AND resource_kind='Job' AND namespace_name=? AND resource_name=? AND lifecycle='ready' AND create_dispatched=TRUE FOR UPDATE`, a.TaskPublicID, m.Namespace, m.JobName).Scan(&bindingRaw, &uid, &revoked, &attempt) != nil || revoked || attempt != a.AttemptNo {
		return "", ErrExecutionAuthority
	}
	var job d.JobBinding
	if json.Unmarshal(bindingRaw, &job) != nil || job.UID != uid || job.JobUnitKey != m.JobUnitKey || job.Namespace != m.Namespace || job.Name != m.JobName {
		return "", ErrExecutionRecord
	}
	// The immutable receipt log owns this protocol's cursor. Worker control
	// uses running/sealed with a different sequence in job_observations.
	// The original Job FOR UPDATE above serializes first insert, replay and
	// revoke; this locking read observes the latest committed receipt in RR.
	const cursorSQL = `SELECT sequence_no,body_sha256,body_json FROM system_backup_v2_relay_receipts WHERE origin_installation_id=? AND task_public_id=? AND attempt_no=? AND phase=? AND job_unit_key=? ORDER BY sequence_no DESC LIMIT 1 FOR SHARE`
	var cursor b.RelayCursor
	var previous []byte
	e = tx.QueryRowContext(ctx, cursorSQL, a.InstallationID, a.TaskPublicID, a.AttemptNo, a.Phase, job.JobUnitKey).Scan(&cursor.Sequence, &cursor.BodySHA256, &previous)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		return "", e
	}
	if e == nil {
		var prior b.RelayMessage
		if cursor.Sequence == 0 || recordHash(previous) != cursor.BodySHA256 || json.Unmarshal(previous, &prior) != nil || prior.Sequence != strconv.FormatUint(cursor.Sequence, 10) || prior.JobUID != job.UID || prior.JobGeneration != strconv.FormatUint(job.Generation, 10) || prior.RelayIdentityRef != job.RelayIdentityRef || prior.RelayIdentityVersion != job.RelayIdentityVersion {
			return "", ErrExecutionRecord
		}
		cursor.Status = prior.Status
	}
	var now time.Time
	if tx.QueryRowContext(ctx, "SELECT UTC_TIMESTAMP(6)").Scan(&now) != nil {
		return "", ErrExecutionAuthority
	}
	decision, _, e := r.Bind(tx, s.Scope, a, job, now, cursor)
	if e != nil {
		return "", e
	}
	if m.ResultEvidence != nil {
		// The Job row is already locked. A same-task evidence from another part
		// is not proof of this worker's result, even if created in this attempt.
		var resultDigest sql.NullString
		if tx.QueryRowContext(ctx, `SELECT result_sha256 FROM system_backup_v2_runtime_resources WHERE task_public_id=? AND resource_kind='Job' AND namespace_name=? AND resource_name=? AND observed_uid=? AND attempt_no=? AND revoked=FALSE FOR SHARE`, a.TaskPublicID, job.Namespace, job.Name, job.UID, a.AttemptNo).Scan(&resultDigest) != nil || !resultDigest.Valid || resultDigest.String != m.ResultEvidence.SHA256 {
			return "", ErrExecutionRecord
		}
		var schema, kind, owner, hash string
		var created, attemptStarted time.Time
		if tx.QueryRowContext(ctx, `SELECT schema_version,owner_target_type,owner_target_public_id,content_checksum,created_at FROM system_backup_v2_evidence WHERE public_id=? FOR SHARE`, m.ResultEvidence.PublicID).Scan(&schema, &kind, &owner, &hash, &created) != nil || schema != "system-backup-evidence.v1" || kind != a.TaskType || owner != a.TaskPublicID || hash != m.ResultEvidence.SHA256 {
			return "", ErrExecutionRecord
		}
		if tx.QueryRowContext(ctx, `SELECT started_at FROM system_backup_v2_attempts WHERE target_type=? AND target_public_id=? AND attempt_no=? AND phase=? FOR SHARE`, a.TaskType, a.TaskPublicID, a.AttemptNo, a.Phase).Scan(&attemptStarted) != nil || created.Before(attemptStarted) {
			return "", ErrExecutionRecord
		}
	}
	seq, e := strconv.ParseUint(m.Sequence, 10, 64)
	if e != nil {
		return "", ErrExecutionRecord
	}
	if decision == b.RelayAdvance {
		_, e = tx.ExecContext(ctx, `INSERT INTO system_backup_v2_relay_receipts (origin_installation_id,task_public_id,attempt_no,phase,job_unit_key,sequence_no,body_sha256,body_json) VALUES (?,?,?,?,?,?,?,?)`, a.InstallationID, a.TaskPublicID, a.AttemptNo, a.Phase, job.JobUnitKey, seq, digest, raw)
		if e != nil {
			return "", e
		}
	} else {
		var original []byte
		var originalHash string
		if tx.QueryRowContext(ctx, `SELECT body_sha256,body_json FROM system_backup_v2_relay_receipts WHERE origin_installation_id=? AND task_public_id=? AND attempt_no=? AND phase=? AND job_unit_key=? AND sequence_no=? FOR SHARE`, a.InstallationID, a.TaskPublicID, a.AttemptNo, a.Phase, job.JobUnitKey, seq).Scan(&originalHash, &original) != nil || originalHash != digest || string(original) != string(raw) {
			return "", ErrExecutionRecord
		}
	}
	if tx.QueryRowContext(ctx, "SELECT UTC_TIMESTAMP(6)").Scan(&now) != nil {
		return "", ErrExecutionAuthority
	}
	if _, e = r.Recheck(tx, s.Scope, a, job, now); e != nil {
		return "", e
	}
	if e = guard.RecheckAfter(ctx, tx, now); e != nil {
		return "", e
	}
	if tx.Commit() != nil {
		return "", ErrExecutionCommitUnknown
	}
	return decision, nil
}
