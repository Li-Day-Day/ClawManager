package systembackupread

import (
	"context"
	"database/sql"
	"errors"
)

// detailReadSQL deliberately has no mutation or transaction-control methods.
// Future per-kind builders run before the final authority check and must use
// the trusted installation on the TaskHeader in every additional SQL scope.
type detailReadSQL interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// readTaskInTransaction keeps all future owner projections under one read
// authority decision. A builder error rolls back and no partial result escapes.
func readTaskInTransaction[T any](ctx context.Context, r *Reader, kind TaskKind, publicID string,
	build func(context.Context, detailReadSQL, TaskHeader) (T, error)) (T, error) {
	var zero T
	if r == nil || r.db == nil || nilScope(r.scope) || ctx == nil || ctx.Err() != nil {
		return zero, ErrDenied
	}
	table, ok := taskTables[kind]
	if !ok || len(publicID) != len(table.prefix)+36 || publicID[:len(table.prefix)] != table.prefix ||
		!taskUUID.MatchString(publicID[len(table.prefix):]) {
		return zero, ErrInvalid
	}
	if build == nil {
		return zero, ErrUnavailable
	}
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return zero, ErrUnavailable
	}
	defer tx.Rollback()
	installation, err := r.scope.AuthorizeRead(ctx, tx)
	if err != nil || !installationID.MatchString(installation) {
		return zero, ErrDenied
	}
	query := "SELECT " + taskProjectionColumns + " FROM " + table.name +
		" WHERE origin_installation_id=? AND public_id=?"
	item, err := scanTask(tx.QueryRowContext(ctx, query, installation, publicID), kind, table, installation)
	missing := errors.Is(err, sql.ErrNoRows)
	if err != nil && !missing || !missing && item.PublicID != publicID {
		return zero, ErrUnavailable
	}
	var result T
	if !missing {
		result, err = build(ctx, tx, item)
		if err != nil {
			return zero, ErrUnavailable
		}
	}
	// A missing row must still pass the final authority check. In particular,
	// revocation racing a miss must never be reported as an authorized 404.
	if err := r.scope.RecheckRead(ctx, tx, installation); err != nil {
		return zero, ErrDenied
	}
	if err := tx.Commit(); err != nil {
		return zero, ErrUnavailable
	}
	if missing {
		return zero, ErrNotFound
	}
	return result, nil
}

// GetTaskBase reads only the common Task projection for a detail request.
// It is not a v12 DetailResource: owner execution, artifact and evidence
// fields still require separately reviewed authoritative projections.
func (r *Reader) GetTaskBase(ctx context.Context, kind TaskKind, publicID string) (TaskHeader, error) {
	return readTaskInTransaction(ctx, r, kind, publicID,
		func(_ context.Context, _ detailReadSQL, item TaskHeader) (TaskHeader, error) { return item, nil })
}

// GetTaskBase returns a redacted common task only. The caller cannot treat it
// as the complete per-kind detail response.
func (s *Service) GetTaskBase(ctx context.Context, kind TaskKind, publicID string) (TaskDTO, error) {
	if s == nil || s.reader == nil {
		return TaskDTO{}, ErrDenied
	}
	item, err := s.reader.GetTaskBase(ctx, kind, publicID)
	if err != nil {
		return TaskDTO{}, err
	}
	return ProjectTask(item)
}
