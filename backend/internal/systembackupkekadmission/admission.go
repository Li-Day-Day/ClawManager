package systembackupkekadmission

import (
	"context"
	"reflect"
	"time"

	reg "clawreef/internal/systembackupkekregistry"
	"clawreef/internal/systembackupkms"
)

// PreparedCapability is an independently authenticated current provider
// permission. It is purpose-specific and never grants an execution Job.
type PreparedCapability interface {
	Source() reg.SourceRecord
	Binding() reg.Binding
	Operation() systembackupkms.Operation
	NotBefore() time.Time
	ValidUntil() time.Time
	Recheck(context.Context, reg.SQLReadView, reg.LockedSnapshot, time.Time) error
}

type Capabilities struct{ Generate, Unwrap PreparedCapability }

// Prepare authenticates the candidate against the independently prepared
// original mapping and the complete, fenced reference source. Neither input
// document nor a provider profile can substitute for these owner adapters.
func Prepare(ctx context.Context, in reg.AdmissionInput, original reg.PreparedMappingSource, capabilities Capabilities, now time.Time) (reg.PreparedAdmission, error) {
	if ctx == nil || ctx.Err() != nil || nilPrepared(original) || nilPrepared(in.Coverage) || nilPrepared(capabilities.Generate) || nilPrepared(capabilities.Unwrap) || CheckUnadmittedInput(in, now) != nil {
		return nil, ErrCandidate
	}
	for _, c := range []struct {
		prepared  PreparedCapability
		source    reg.SourceRecord
		operation systembackupkms.Operation
	}{
		{capabilities.Generate, in.Observation.GenerateCapabilitySource, systembackupkms.Generate},
		{capabilities.Unwrap, in.Observation.UnwrapCapabilitySource, systembackupkms.Unwrap},
	} {
		if c.prepared.Source() != c.source || c.prepared.Operation() != c.operation || !reflect.DeepEqual(c.prepared.Binding(), in.Candidate) ||
			c.prepared.NotBefore().IsZero() || !c.prepared.NotBefore().Before(c.prepared.ValidUntil()) ||
			now.Before(c.prepared.NotBefore()) || !now.Before(c.prepared.ValidUntil()) {
			return nil, ErrCandidate
		}
	}
	if original.Source() != in.Observation.MappingSource || original.SourceRevision() != in.Observation.SourceRevision ||
		!reflect.DeepEqual(original.Binding(), in.Candidate) || original.ValidUntil().IsZero() || !now.Before(original.ValidUntil()) ||
		in.Coverage.ExpectedEpoch() != in.Snapshot.Epoch || in.Coverage.ValidUntil().IsZero() || !now.Before(in.Coverage.ValidUntil()) ||
		!reflect.DeepEqual(in.Coverage.Sources(), in.Snapshot.Coverage) || !reflect.DeepEqual(in.Coverage.References(), in.Snapshot.References) {
		return nil, ErrCandidate
	}
	// The first binding is inserted only later by D's original transaction.
	// Independent mapping/capability sources and complete coverage are already
	// mandatory above; absence here cannot by itself authorize an empty scan.
	// An existing identity/version must match exactly and remain unrevoked.
	for _, b := range in.Snapshot.Bindings {
		if b.Binding.Key.IdentityHash == in.Candidate.Key.IdentityHash && b.Binding.Key.RegistryVersion == in.Candidate.Key.RegistryVersion {
			if !reflect.DeepEqual(b.Binding, in.Candidate) || b.GenerateRevoked != nil || b.UnwrapRevoked != nil {
				return nil, ErrCandidate
			}
		}
	}
	end := in.Observation.ValidUntil
	for _, t := range []time.Time{original.ValidUntil(), in.Coverage.ValidUntil(), capabilities.Generate.ValidUntil(), capabilities.Unwrap.ValidUntil()} {
		if t.Before(end) {
			end = t
		}
	}
	in = copyInput(in)
	return &prepared{input: in, original: original, capabilities: capabilities, until: end}, nil
}

func nilPrepared(v any) bool {
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

func copyBinding(b reg.Binding) reg.Binding {
	b.GenerateRef.RawJSON = append([]byte(nil), b.GenerateRef.RawJSON...)
	b.UnwrapRef.RawJSON = append([]byte(nil), b.UnwrapRef.RawJSON...)
	return b
}

func copySnapshot(s reg.Snapshot) reg.Snapshot {
	if s.Coverage != nil {
		s.Coverage = append(make([]reg.CoverageSource, 0, len(s.Coverage)), s.Coverage...)
	}
	if s.References != nil {
		s.References = append(make([]reg.Reference, 0, len(s.References)), s.References...)
	}
	if s.Bindings != nil {
		s.Bindings = append(make([]reg.BindingFacts, 0, len(s.Bindings)), s.Bindings...)
	}
	for i := range s.Bindings {
		s.Bindings[i].Binding = copyBinding(s.Bindings[i].Binding)
		if r := s.Bindings[i].GenerateRevoked; r != nil {
			v := *r
			s.Bindings[i].GenerateRevoked = &v
		}
		if r := s.Bindings[i].UnwrapRevoked; r != nil {
			v := *r
			s.Bindings[i].UnwrapRevoked = &v
		}
	}
	return s
}

func copyInput(in reg.AdmissionInput) reg.AdmissionInput {
	in.Candidate = copyBinding(in.Candidate)
	in.Snapshot = copySnapshot(in.Snapshot)
	return in
}

type prepared struct {
	input        reg.AdmissionInput
	original     reg.PreparedMappingSource
	capabilities Capabilities
	until        time.Time
}

func (p *prepared) Binding() reg.Binding                       { return copyBinding(p.input.Candidate) }
func (p *prepared) Observation() reg.AdmissionObservation      { return p.input.Observation }
func (p *prepared) ExpectedSnapshot() reg.Snapshot             { return copySnapshot(p.input.Snapshot) }
func (p *prepared) OriginalMapping() reg.PreparedMappingSource { return p.original }
func (p *prepared) Risk() reg.Risk                             { return reg.Risk{SecurityBoundary: true} }
func (p *prepared) ValidUntil() time.Time                      { return p.until }

// Recheck is called under D's original SQL transaction and shared KEK fence.
// It performs no provider I/O and never commits or grants a Job operation.
func (p *prepared) Recheck(ctx context.Context, view reg.SQLReadView, locked reg.LockedSnapshot, now time.Time) error {
	if p == nil || ctx == nil || ctx.Err() != nil || view == nil || now.IsZero() || !now.Before(p.until) {
		return ErrCandidate
	}
	current := locked.Facts()
	if !reflect.DeepEqual(current, p.input.Snapshot) ||
		p.original.Recheck(ctx, view, locked, now) != nil || p.input.Coverage.Recheck(ctx, view, locked, now) != nil ||
		p.capabilities.Generate.Recheck(ctx, view, locked, now) != nil || p.capabilities.Unwrap.Recheck(ctx, view, locked, now) != nil {
		return ErrCandidate
	}
	return nil
}
