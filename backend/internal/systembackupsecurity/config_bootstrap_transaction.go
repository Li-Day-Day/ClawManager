package systembackupsecurity

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const BootstrapConfigEndpoint = "bootstrapSystemBackupConfig"

var ErrBootstrapExists = errors.New("bootstrap_already_initialized")

// OfflineBootstrapGrant comes from deployment/operator authorization. It MUST
// NOT be deserialized from an HTTP request. First security_admin authorization
// is an offline operation; the regular HTTP configuration API cannot grant it.
type OfflineBootstrapGrant struct {
	InstallationID, ServerUUID, Database, Username        string
	UserID                                                int64
	MatrixKey, ConfigSHA256, IdempotencyKey, ChangeReason string
}

// BootstrapAdmission is mandatory deployment integration, with no allow-all
// default. Authorize must validate a live, immutable operator grant and RBAC
// (including committed retries). ValidateAndReserve must resolve and validate
// ALL nine registries and twenty typed refs, issuer purpose/key separation,
// retention and nonce keys, and reserve metadata capacity in the supplied tx.
// Network/provider work must be completed before acquiring transaction locks.
// Implementations must neither commit nor substitute placeholder resources.
type BootstrapAdmission interface {
	Authorize(context.Context, *sql.Tx, OfflineBootstrapGrant, BootstrapConfig, time.Time) error
	ValidateAndReserve(context.Context, *sql.Tx, OfflineBootstrapGrant, BootstrapConfig, time.Time) error
}
type ConfigBootstrapService struct {
	DB        *sql.DB
	Admission BootstrapAdmission
}
type ConfigBootstrapResult struct {
	OperationPublicID string `json:"operation_public_id"`
	Version           int64  `json:"version"`
	ConfigSHA256      string `json:"config_sha256"`
	Replayed          bool   `json:"replayed"`
}

// Bootstrap creates a disabled config v1, installation state, operation receipt
// and both audits atomically. It never updates an existing installation/config
// and is deliberately not registered on the HTTP listener.
func (s ConfigBootstrapService) Bootstrap(ctx context.Context, g OfflineBootstrapGrant, raw []byte) (ConfigBootstrapResult, error) {
	var zero ConfigBootstrapResult
	c, err := DecodeBootstrapConfig(raw)
	if err != nil {
		return zero, err
	}
	if s.DB == nil || s.Admission == nil || !validBootstrapGrant(g) || c.SHA256() != g.ConfigSHA256 {
		return zero, ErrRegistrationUnavailable
	}
	// Include all grant semantics, not transport formatting, in idempotency.
	binding, _ := json.Marshal(g)
	digest := registrationHash(string(binding))
	tx, err := s.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return zero, ErrProviderEvidenceStorage
	}
	defer tx.Rollback()
	var server, database string
	var now time.Time
	var offset int64
	if tx.QueryRowContext(ctx, "SELECT @@server_uuid,DATABASE(),UTC_TIMESTAMP(6),TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(6),CURRENT_TIMESTAMP(6))").Scan(&server, &database, &now, &offset) != nil {
		return zero, ErrProviderEvidenceStorage
	}
	if server != g.ServerUUID || database != g.Database || now.IsZero() || offset != 0 {
		return zero, ErrRegistrationUnavailable
	}
	// Match the registration transaction lock order. An empty index is still
	// gap-locked under RepeatableRead; deadlock victims retry the same request.
	if err = lockRegistrationInstallations(ctx, tx); err != nil {
		return zero, err
	}
	var username, role, provider string
	var active bool
	err = tx.QueryRowContext(ctx, "SELECT username,role,is_active,auth_provider FROM users WHERE id=? FOR UPDATE", g.UserID).Scan(&username, &role, &active, &provider)
	if errors.Is(err, sql.ErrNoRows) {
		return zero, ErrRegistrationPermission
	}
	if err != nil {
		return zero, ErrProviderEvidenceStorage
	}
	if username != g.Username || role != "admin" || !active || provider != "local" {
		return zero, ErrRegistrationPermission
	}
	if err = s.Admission.Authorize(ctx, tx, g, c, now); err != nil {
		return zero, registrationBoundaryError(err)
	}
	actor := strconv.FormatInt(g.UserID, 10)
	var prior ConfigBootstrapResult
	var priorHash, status string
	var httpStatus int
	err = tx.QueryRowContext(ctx, `SELECT public_id,result_config_version,request_hash,status,http_status FROM system_backup_operations
		WHERE origin_installation_id=? AND actor_type='admin' AND actor_id=? AND endpoint=? AND idempotency_key=? FOR UPDATE`, g.InstallationID, actor, BootstrapConfigEndpoint, g.IdempotencyKey).
		Scan(&prior.OperationPublicID, &prior.Version, &priorHash, &status, &httpStatus)
	if err == nil {
		if priorHash != digest {
			return zero, ErrRegistrationConflict
		}
		var configHash string
		var version int64
		var enabled bool
		if tx.QueryRowContext(ctx, `SELECT c.config_sha256,s.active_config_version,c.enabled FROM system_backup_installation_state s
			JOIN system_backup_configs c ON c.origin_installation_id=s.origin_installation_id AND c.version=s.active_config_version
			WHERE s.origin_installation_id=? FOR UPDATE`, g.InstallationID).Scan(&configHash, &version, &enabled) != nil {
			return zero, ErrRegistrationUnavailable
		}
		if status != "succeeded" || prior.Version != 1 || httpStatus != 201 || version != 1 || enabled || configHash != g.ConfigSHA256 {
			return zero, ErrBootstrapExists
		}
		if err = tx.Commit(); err != nil {
			return zero, ErrRegistrationCommitUnknown
		}
		prior.ConfigSHA256 = g.ConfigSHA256
		prior.Replayed = true
		return prior, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return zero, ErrProviderEvidenceStorage
	}
	// Reject both a previously initialized installation and orphan config rows.
	for _, q := range []string{"SELECT active_config_version FROM system_backup_installation_state WHERE origin_installation_id=? FOR UPDATE", "SELECT version FROM system_backup_configs WHERE origin_installation_id=? ORDER BY version FOR UPDATE"} {
		var version int64
		err = tx.QueryRowContext(ctx, q, g.InstallationID).Scan(&version)
		if err == nil {
			return zero, ErrBootstrapExists
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return zero, ErrProviderEvidenceStorage
		}
	}
	if err = s.Admission.ValidateAndReserve(ctx, tx, g, c, now); err != nil {
		return zero, registrationBoundaryError(err)
	}
	op, err := registrationID("sop_")
	if err != nil {
		return zero, ErrRegistrationUnavailable
	}
	audit := func(action string) error {
		details, _ := json.Marshal(map[string]any{"operation_public_id": op, "installation_id": g.InstallationID, "config_sha256": g.ConfigSHA256, "config_version": 1, "request_hash": digest, "authorization": "offline_bootstrap"})
		_, e := tx.ExecContext(ctx, "INSERT INTO audit_logs (user_id,action,resource_type,details) VALUES (?,?,'system_backup',?)", g.UserID, action, string(details))
		if e != nil {
			return ErrProviderEvidenceStorage
		}
		return nil
	}
	if err = audit("system_backup.config_bootstrap.intent"); err != nil {
		return zero, err
	}
	columns, args := c.sqlValues(g.InstallationID, actor, g.ChangeReason)
	marks := strings.TrimSuffix(strings.Repeat("?,", len(args)), ",")
	if _, err = tx.ExecContext(ctx, "INSERT INTO system_backup_configs ("+strings.Join(columns, ",")+") VALUES ("+marks+")", args...); err != nil {
		return zero, ErrProviderEvidenceStorage
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO system_backup_installation_state
		(origin_installation_id,active_config_version,last_effective_enabled,last_effective_enabled_transition_at,matrix_key)
		VALUES (?,1,FALSE,?,?)`, g.InstallationID, now, g.MatrixKey); err != nil {
		return zero, ErrProviderEvidenceStorage
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO system_backup_operations
		(public_id,origin_installation_id,operation_type,target_type,target_public_id,actor_type,actor_id,endpoint,idempotency_key,request_hash,
		external_action_public_ids_canonical_json,external_action_public_ids_size_bytes,external_action_public_ids_sha256,status,result_config_version,http_status,deadline_at,started_at,finished_at,created_at)
		VALUES (?,?,'config_update','system',?,'admin',?,?,?,?,?,2,?,'succeeded',1,201,?,?,?,?)`,
		op, g.InstallationID, g.InstallationID, actor, BootstrapConfigEndpoint, g.IdempotencyKey, digest, []byte("[]"), registrationHash("[]"), now.Add(time.Duration(c.numbers["operation_deadline_seconds"])*time.Second), now, now, now); err != nil {
		return zero, ErrProviderEvidenceStorage
	}
	if err = audit("system_backup.config_bootstrap.result"); err != nil {
		return zero, err
	}
	if err = tx.Commit(); err != nil {
		return zero, ErrRegistrationCommitUnknown
	}
	return ConfigBootstrapResult{OperationPublicID: op, Version: 1, ConfigSHA256: g.ConfigSHA256}, nil
}
func validBootstrapGrant(g OfflineBootstrapGrant) bool {
	return regexp.MustCompile(`^installation_[A-Za-z0-9._:-]{1,115}$`).MatchString(g.InstallationID) &&
		regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).MatchString(g.ServerUUID) &&
		regexp.MustCompile(`^[A-Za-z0-9_]{1,64}$`).MatchString(g.Database) && g.UserID > 0 && len(g.Username) > 0 && len(g.Username) <= 128 &&
		contains([]string{"k8s-cluster", "k3s-cluster", "k8s-single-node", "k3s-single-node"}, g.MatrixKey) && providerHashPattern.MatchString(g.ConfigSHA256) &&
		regexp.MustCompile(`^[A-Za-z0-9._:-]{16,128}$`).MatchString(g.IdempotencyKey) && strings.TrimSpace(g.ChangeReason) != "" && utf8.ValidString(g.ChangeReason) && utf8.RuneCountInString(g.ChangeReason) <= 512
}
