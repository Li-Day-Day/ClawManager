package systembackupsecurity

import (
	"context"
	"database/sql"

	reg "clawreef/internal/systembackupkekregistry"
)

// ConfigMutationKEKPreparation composes C's independently resolved source
// with A's validator before the original mutation transaction takes locks.
type ConfigMutationKEKPreparation interface {
	PrepareConfigMutationKEK(context.Context, *sql.DB, ConfigMutationResourceInput) (reg.PreparedAdmission, error)
}

type configMutationKEKInputProvider interface {
	KEKInput() ConfigMutationResourceInput
}
