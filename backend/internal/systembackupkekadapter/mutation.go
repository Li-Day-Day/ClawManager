package systembackupkekadapter

import (
	"context"
	"database/sql"

	reg "clawreef/internal/systembackupkekregistry"
	sec "clawreef/internal/systembackupsecurity"
)

// MutationAdmissionSource resolves C's original mapping and coverage records
// for the exact KEK reference pair prepared by the config resolver.
type MutationAdmissionSource interface {
	MutationAdmissionInput(context.Context, sec.ConfigMutationResourceInput, reg.Snapshot) (reg.AdmissionInput, error)
}

type MutationComposition struct {
	Store     reg.SQLStore
	Source    MutationAdmissionSource
	Validator KEKAdmissionValidator
}

var _ sec.ConfigMutationKEKPreparation = MutationComposition{}

func (c MutationComposition) PrepareConfigMutationKEK(ctx context.Context, db *sql.DB, input sec.ConfigMutationResourceInput) (reg.PreparedAdmission, error) {
	if ctx == nil || ctx.Err() != nil || db == nil || nilSource(c.Source) || input.Slot() != "reference:kek" {
		return nil, sec.ErrRegistrationUnavailable
	}
	snapshot, err := c.Store.ReadSnapshot(ctx, db, input.InstallationID())
	if err != nil {
		return nil, sec.ErrRegistrationUnavailable
	}
	in, err := c.Source.MutationAdmissionInput(ctx, input, snapshot)
	if err != nil || !reg.SameSnapshotFacts(in.Snapshot, snapshot) || !in.Snapshot.ObservedAt.Equal(snapshot.ObservedAt) {
		return nil, sec.ErrRegistrationUnavailable
	}
	return c.Validator.PrepareConfigMutationKEK(ctx, input, in)
}
