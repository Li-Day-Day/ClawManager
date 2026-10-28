package systembackupapi

import (
	"context"
	"database/sql"

	contract "clawreef/internal/systembackupcontract"
	read "clawreef/internal/systembackupread"
	security "clawreef/internal/systembackupsecurity"
)

// SQLTaskDetails composes complete resources in the original authorized read
// transaction. The required owner reader must supply actual current facts.
// Constructing this adapter does not certify a deployment's B/C providers.
type SQLTaskDetails struct {
	db       *sql.DB
	facts    read.CurrentTaskFacts
	manifest read.ManifestReader
}

func NewSQLTaskDetails(db *sql.DB, facts read.CurrentTaskFacts, manifest read.ManifestReader) (*SQLTaskDetails, error) {
	if db == nil || nilDependency(facts) || nilDependency(manifest) {
		return nil, &Error{"not_ready"}
	}
	return &SQLTaskDetails{db, facts, manifest}, nil
}

func (d *SQLTaskDetails) Manifest(ctx context.Context, scope *security.SystemBackupReadScope, id string) ([]byte, error) {
	if d == nil || scope == nil || nilDependency(d.facts) || nilDependency(d.manifest) {
		return nil, &Error{"not_ready"}
	}
	reader, err := read.NewReader(d.db, scope)
	if err != nil {
		return nil, err
	}
	return reader.ReadBackupManifest(ctx, id, d.facts, d.manifest)
}
func (d *SQLTaskDetails) Backup(ctx context.Context, scope *security.SystemBackupReadScope, id string) (contract.BackupDetailResource, error) {
	if d == nil || scope == nil || nilDependency(d.facts) {
		return contract.BackupDetailResource{}, &Error{"not_ready"}
	}
	reader, err := read.NewReader(d.db, scope)
	if err != nil {
		return contract.BackupDetailResource{}, err
	}
	return reader.ReadBackupDetail(ctx, id, d.facts)
}
func (d *SQLTaskDetails) Preflight(ctx context.Context, scope *security.SystemBackupReadScope, id string) (contract.PreflightDetailResource, error) {
	if d == nil || scope == nil || nilDependency(d.facts) {
		return contract.PreflightDetailResource{}, &Error{"not_ready"}
	}
	reader, err := read.NewReader(d.db, scope)
	if err != nil {
		return contract.PreflightDetailResource{}, err
	}
	return reader.ReadPreflightDetail(ctx, id, d.facts)
}
