// Package systembackupobserver independently reads durable execution facts.
// It owns no application credentials, authorization, mutation, or retry path.
package systembackupobserver

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
)

var ErrUnavailable = errors.New("system backup observation unavailable")
var installationPattern = regexp.MustCompile(`^installation_[A-Za-z0-9._:-]{1,115}$`)
var publicPattern = regexp.MustCompile(`^(sbk_|spf_)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var digestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
var namePattern = regexp.MustCompile(`^[A-Za-z0-9_]+$`)
var hostPattern = regexp.MustCompile(`^[A-Za-z0-9.-]{1,253}$`)
var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var actorPattern = regexp.MustCompile(`^[1-9][0-9]{0,19}$`)

const EnqueueEvent = "diagnostic.d.task_enqueued"
const ClaimEvent = "diagnostic.d.task_claim_acquired"

// Pins are operator-selected, independent of the API response being checked.
type Pins struct{ InstallationID, ServerUUID, Database, User, Host string }
type Request struct {
	Kind, PublicID                string
	ConfigVersion                 uint64
	ActorID, IdempotencyKeySHA256 string
}

type Observation struct {
	SchemaVersion                    string  `json:"schemaVersion"`
	PublicID                         string  `json:"publicID"`
	InstallationID                   string  `json:"installationID"`
	ConfigVersion                    uint64  `json:"configVersion"`
	TaskCount                        uint64  `json:"taskCount"`
	InstallationKeyCount             uint64  `json:"installationKeyCount"`
	TupleBound                       bool    `json:"tupleBound"`
	EnqueueCount                     uint64  `json:"enqueueCount"`
	ClaimCount                       *uint64 `json:"claimCount"`
	ClaimHistory                     string  `json:"claimHistory"`
	AttemptCount                     uint64  `json:"attemptCount"`
	JobCount                         uint64  `json:"jobCount"`
	RelayObservationCount            uint64  `json:"relayObservationCount"`
	LatestCaptureJobCount            uint64  `json:"latestCaptureJobCount"`
	LatestCaptureCompletedRelayCount uint64  `json:"latestCaptureCompletedRelayCount"`
	CurrentClaimObserved             bool    `json:"currentClaimObserved"`
	Scheduled                        bool    `json:"scheduled"`
	Status                           string  `json:"status"`
	FailureCategory                  string  `json:"failureCategory"`
	ManifestSHA256                   *string `json:"manifestSHA256"`
	ResultPublicID                   *string `json:"resultPublicID"`
	ResultSHA256                     *string `json:"resultSHA256"`
	ReadOnly                         bool    `json:"readOnly"`
	SnapshotRolledBack               bool    `json:"snapshotRolledBack"`
}

func (p Pins) Validate() error {
	if !installationPattern.MatchString(p.InstallationID) || !uuidPattern.MatchString(p.ServerUUID) || !namePattern.MatchString(p.Database) || !namePattern.MatchString(p.User) || !hostPattern.MatchString(p.Host) {
		return ErrUnavailable
	}
	return nil
}

func (r Request) table() (string, error) {
	if !publicPattern.MatchString(r.PublicID) || r.ConfigVersion < 1 || r.ConfigVersion > 9007199254740991 || !actorPattern.MatchString(r.ActorID) || !digestPattern.MatchString(r.IdempotencyKeySHA256) {
		return "", ErrUnavailable
	}
	if r.Kind == "backup" && strings.HasPrefix(r.PublicID, "sbk_") {
		return "system_backup_v2_backups", nil
	}
	if r.Kind == "preflight" && strings.HasPrefix(r.PublicID, "spf_") {
		return "system_backup_v2_preflights", nil
	}
	return "", ErrUnavailable
}

// Observe uses one dedicated SQL connection and a read-only repeatable-read
// snapshot. The operator must provide the exact SELECT-only account below.
// It always rolls back; neither SQL writes nor provider execution are available.
func Observe(ctx context.Context, db *sql.DB, pins Pins, request Request) (Observation, error) {
	var zero Observation
	table, err := request.table()
	if err != nil || pins.Validate() != nil || ctx == nil || ctx.Err() != nil || db == nil {
		return zero, ErrUnavailable
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		return zero, ErrUnavailable
	}
	defer conn.Close()
	var server, database, account, role string
	if conn.QueryRowContext(ctx, "SELECT @@server_uuid,DATABASE(),CURRENT_USER(),CURRENT_ROLE()").Scan(&server, &database, &account, &role) != nil || server != pins.ServerUUID || database != pins.Database || account != pins.User+"@"+pins.Host || strings.ToUpper(role) != "NONE" {
		return zero, ErrUnavailable
	}
	rows, err := conn.QueryContext(ctx, "SHOW GRANTS")
	if err != nil {
		return zero, ErrUnavailable
	}
	var grants []string
	for rows.Next() {
		var grant string
		if rows.Scan(&grant) != nil {
			rows.Close()
			return zero, ErrUnavailable
		}
		grants = append(grants, grant)
	}
	iterateErr, closeErr := rows.Err(), rows.Close()
	if iterateErr != nil || closeErr != nil || ValidateGrants(pins.Database, grants) != nil {
		return zero, ErrUnavailable
	}
	tx, err := conn.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return zero, ErrUnavailable
	}
	defer tx.Rollback()
	value := Observation{SchemaVersion: "system-backup-sql-observation.v1", PublicID: request.PublicID, InstallationID: pins.InstallationID, ReadOnly: true, ClaimHistory: "unavailable"}
	var actorType, actorID, endpoint, key, snapshotHash, actualSnapshotHash string
	var snapshotSize, actualSnapshotSize uint64
	var manifest, resultID, resultHash sql.NullString
	resultColumns := "manifest_checksum,NULL,NULL"
	if request.Kind == "preflight" {
		resultColumns = "NULL,report_evidence_public_id,report_evidence_sha256"
	}
	query := "SELECT config_version,actor_type,actor_id,endpoint,idempotency_key,status,failure_category,next_reconcile_at IS NOT NULL,(controller_owner IS NOT NULL AND controller_lease_expires_at>UTC_TIMESTAMP(6)),config_snapshot_sha256,SHA2(config_snapshot_json,256),config_snapshot_size_bytes,OCTET_LENGTH(config_snapshot_json)," + resultColumns + " FROM " + table + " WHERE origin_installation_id=? AND public_id=?"
	if tx.QueryRowContext(ctx, query, pins.InstallationID, request.PublicID).Scan(&value.ConfigVersion, &actorType, &actorID, &endpoint, &key, &value.Status, &value.FailureCategory, &value.Scheduled, &value.CurrentClaimObserved, &snapshotHash, &actualSnapshotHash, &snapshotSize, &actualSnapshotSize, &manifest, &resultID, &resultHash) != nil || value.ConfigVersion != request.ConfigVersion || !digestPattern.MatchString(snapshotHash) || snapshotHash != actualSnapshotHash || snapshotSize != actualSnapshotSize || snapshotSize < 2 || snapshotSize > 262144 {
		return zero, ErrUnavailable
	}
	expectedEndpoint := "createSystemBackup"
	if request.Kind == "preflight" {
		expectedEndpoint = "createSystemBackupPreflight"
	}
	keyDigest := sha256.Sum256([]byte(key))
	if actorType != "admin" || actorID != request.ActorID || endpoint != expectedEndpoint || hex.EncodeToString(keyDigest[:]) != request.IdempotencyKeySHA256 {
		return zero, ErrUnavailable
	}
	value.TupleBound = true
	if tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table+" WHERE origin_installation_id=? AND actor_type=? AND actor_id=? AND endpoint=? AND idempotency_key=?", pins.InstallationID, actorType, actorID, endpoint, key).Scan(&value.TaskCount) != nil || value.TaskCount != 1 {
		return zero, ErrUnavailable
	}
	// A rejected create under another actor must not have produced a task in
	// this installation. This is wider than the original idempotency tuple;
	// the smoke key must therefore be unique for this run across all actors.
	if tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table+" WHERE origin_installation_id=? AND endpoint=? AND idempotency_key=?", pins.InstallationID, endpoint, key).Scan(&value.InstallationKeyCount) != nil {
		return zero, ErrUnavailable
	}
	var claims uint64
	if tx.QueryRowContext(ctx, "SELECT COALESCE(SUM(event_type=?),0),COALESCE(SUM(event_type=?),0) FROM system_backup_v2_events WHERE origin_installation_id=? AND target_type=? AND target_public_id=?", EnqueueEvent, ClaimEvent, pins.InstallationID, request.Kind, request.PublicID).Scan(&value.EnqueueCount, &claims) != nil {
		return zero, ErrUnavailable
	}
	// A durable receipt is required. Lease state, task row_version and attempts
	// do not recover historical claim count after release or takeover.
	if claims > 0 {
		value.ClaimCount = &claims
		value.ClaimHistory = "durable_receipts"
	}
	if tx.QueryRowContext(ctx, "SELECT COUNT(DISTINCT a.attempt_no) FROM system_backup_v2_attempts a JOIN "+table+" t ON t.public_id=a.target_public_id AND t.task_type=a.target_type WHERE t.origin_installation_id=? AND t.public_id=? AND a.target_type=?", pins.InstallationID, request.PublicID, request.Kind).Scan(&value.AttemptCount) != nil {
		return zero, ErrUnavailable
	}
	if tx.QueryRowContext(ctx, "SELECT COUNT(*),COALESCE(SUM(last_accepted_sequence>0),0) FROM system_backup_v2_job_observations WHERE origin_installation_id=? AND target_type=? AND target_public_id=?", pins.InstallationID, request.Kind, request.PublicID).Scan(&value.JobCount, &value.RelayObservationCount) != nil {
		return zero, ErrUnavailable
	}
	if request.Kind == "backup" {
		// Historical jobs from an earlier attempt cannot prove that the latest
		// capture was executed. Both queries use this same read-only snapshot.
		q := `SELECT COUNT(*),COALESCE(SUM(j.last_accepted_sequence>0 AND j.last_observed_status='completed'),0)
FROM system_backup_v2_job_observations j
WHERE j.origin_installation_id=? AND j.target_type=? AND j.target_public_id=? AND j.phase='capture'
AND j.attempt_no=(SELECT MAX(a.attempt_no) FROM system_backup_v2_attempts a WHERE a.target_type=? AND a.target_public_id=? AND a.phase='capture')
AND EXISTS (SELECT 1 FROM system_backup_v2_attempts a2 WHERE a2.target_type=j.target_type AND a2.target_public_id=j.target_public_id AND a2.attempt_no=j.attempt_no AND a2.phase=j.phase AND a2.status='sealed')`
		if tx.QueryRowContext(ctx, q, pins.InstallationID, request.Kind, request.PublicID, request.Kind, request.PublicID).Scan(&value.LatestCaptureJobCount, &value.LatestCaptureCompletedRelayCount) != nil {
			return zero, ErrUnavailable
		}
	}
	if manifest.Valid {
		if !digestPattern.MatchString(manifest.String) {
			return zero, ErrUnavailable
		}
		value.ManifestSHA256 = &manifest.String
	}
	if resultID.Valid != resultHash.Valid {
		return zero, ErrUnavailable
	}
	if resultID.Valid {
		if !regexp.MustCompile(`^sev_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).MatchString(resultID.String) || !digestPattern.MatchString(resultHash.String) {
			return zero, ErrUnavailable
		}
		var evidenceCount uint64
		if tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM system_backup_v2_evidence WHERE public_id=? AND owner_target_type=? AND owner_target_public_id=? AND content_checksum=?", resultID.String, request.Kind, request.PublicID, resultHash.String).Scan(&evidenceCount) != nil || evidenceCount != 1 {
			return zero, ErrUnavailable
		}
		value.ResultPublicID = &resultID.String
		value.ResultSHA256 = &resultHash.String
	}
	if ctx.Err() != nil || tx.Rollback() != nil {
		return zero, ErrUnavailable
	}
	value.SnapshotRolledBack = true
	return value, nil
}

var selectGrant = regexp.MustCompile("^GRANT SELECT ON `([A-Za-z0-9_]+)`\\.`([A-Za-z0-9_]+)` TO .+$")
var usageGrant = regexp.MustCompile(`^GRANT USAGE ON \*\.\* TO .+$`)
var requiredTables = []string{"system_backup_v2_backups", "system_backup_v2_preflights", "system_backup_v2_events", "system_backup_v2_attempts", "system_backup_v2_job_observations", "system_backup_v2_evidence"}

// ValidateGrants rejects roles, global/database wildcards, write/delegation
// privileges, unlisted tables and unknown SQL. It never creates a SQL account.
func ValidateGrants(schema string, grants []string) error {
	if !namePattern.MatchString(schema) {
		return ErrUnavailable
	}
	seen := map[string]bool{}
	for _, grant := range grants {
		if strings.Contains(grant, " WITH ") {
			return ErrUnavailable
		}
		if usageGrant.MatchString(grant) {
			continue
		}
		parts := selectGrant.FindStringSubmatch(grant)
		if parts == nil || parts[1] != schema {
			return ErrUnavailable
		}
		allowed := false
		for _, table := range requiredTables {
			if table == parts[2] {
				allowed = true
			}
		}
		if !allowed {
			return ErrUnavailable
		}
		seen[parts[2]] = true
	}
	for _, table := range requiredTables {
		if !seen[table] {
			return ErrUnavailable
		}
	}
	return nil
}
