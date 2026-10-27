package services

import (
	"clawreef/internal/systembackup/mutation"
	"context"
)

// Set before Start. Each permit spans all child goroutines and external writes;
// failure to release leaves durable evidence that blocks capture admission.
type BackupMutationGate interface {
	Enter(context.Context, string) (func() error, error)
}

func enterBackupMutation(ctx context.Context, g BackupMutationGate, name string) (func() error, error) {
	if g == nil {
		return mutation.Enter(ctx, name)
	}
	return g.Enter(ctx, name)
}
