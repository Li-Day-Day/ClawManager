package systembackupkekadapter

import (
	"context"
	"reflect"
	"time"

	admission "clawreef/internal/systembackupkekadmission"
	reg "clawreef/internal/systembackupkekregistry"
	sec "clawreef/internal/systembackupsecurity"
)

// OriginalKEKPreparation resolves an independently configured mapping owner
// and the two current purpose authorities. It must authenticate its sources;
// the candidate and its hash cannot authorize themselves.
type OriginalKEKPreparation interface {
	PrepareKEK(context.Context, reg.AdmissionInput) (reg.PreparedMappingSource, admission.Capabilities, error)
}

// KEKAdmissionValidator binds A's checks to the original bootstrap and config
// mutation inputs. D owns the later locked snapshot and same-transaction stage.
type KEKAdmissionValidator struct {
	Original OriginalKEKPreparation
	Now      func() time.Time
}

func (v KEKAdmissionValidator) prepare(ctx context.Context, in reg.AdmissionInput) (reg.PreparedAdmission, error) {
	if ctx == nil || ctx.Err() != nil || nilSource(v.Original) || v.Now == nil {
		return nil, sec.ErrRegistrationUnavailable
	}
	original, capabilities, err := v.Original.PrepareKEK(ctx, in)
	if err != nil {
		return nil, sec.ErrRegistrationUnavailable
	}
	p, err := admission.Prepare(ctx, in, original, capabilities, v.Now().UTC())
	if err != nil {
		return nil, sec.ErrRegistrationUnavailable
	}
	return p, nil
}

func (v KEKAdmissionValidator) PrepareBootstrapKEK(ctx context.Context, grant sec.OfflineBootstrapGrant, config sec.BootstrapConfig, in reg.AdmissionInput) (reg.PreparedAdmission, error) {
	if !sec.ValidOfflineBootstrapGrant(grant) || len(config.CanonicalJSON()) == 0 || grant.ConfigSHA256 != config.SHA256() ||
		grant.InstallationID != in.Candidate.InstallationID || in.Observation.ConfigSHA256 != config.SHA256() ||
		!matchesKEKReference(config.References(), in.Candidate.ConfigRef) {
		return nil, sec.ErrRegistrationUnavailable
	}
	return v.prepare(ctx, in)
}

func (v KEKAdmissionValidator) PrepareConfigMutationKEK(ctx context.Context, input sec.ConfigMutationResourceInput, in reg.AdmissionInput) (reg.PreparedAdmission, error) {
	current, proposed, ok := input.ReferencePair("kek")
	_, proposedConfig := input.Configs()
	if !ok || input.Slot() != "reference:kek" || input.InstallationID() != in.Candidate.InstallationID ||
		len(proposedConfig.CanonicalJSON()) == 0 || in.Observation.ConfigSHA256 != proposedConfig.SHA256() ||
		proposed.IdentityHash != in.Candidate.ConfigRef.IdentityHash || proposed.Version != in.Candidate.ConfigRef.Version {
		return nil, sec.ErrRegistrationUnavailable
	}
	// The outgoing mapping must remain in the complete retained snapshot when
	// the pin rotates. Its old grant does not authorize new writes or unwraps.
	if current.IdentityHash != proposed.IdentityHash || current.Version != proposed.Version {
		found := false
		for _, fact := range in.Snapshot.Bindings {
			if fact.Binding.InstallationID == input.InstallationID() && fact.Binding.Key.IdentityHash == current.IdentityHash && fact.Binding.Key.RegistryVersion == current.Version {
				found = true
			}
		}
		if !found {
			return nil, sec.ErrRegistrationUnavailable
		}
	}
	return v.prepare(ctx, in)
}

func matchesKEKReference(refs []sec.BootstrapSecretRef, pin reg.ReferencePin) bool {
	count := 0
	for _, ref := range refs {
		if ref.Purpose == "kek" {
			if ref.IdentityHash != pin.IdentityHash || ref.Version != pin.Version {
				return false
			}
			count++
		}
	}
	return count == 1
}

func nilSource(v any) bool {
	if v == nil {
		return true
	}
	r := reflect.ValueOf(v)
	switch r.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return r.IsNil()
	}
	return false
}
