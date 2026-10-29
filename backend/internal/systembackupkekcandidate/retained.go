package systembackupkekcandidate

import (
	"slices"
	"time"
	"unicode/utf16"
)

func partitions(c Coverage) map[string]Partition {
	return map[string]Partition{"retained_artifacts": c.RetainedArtifacts, "inflight_and_unknown_writes": c.InflightAndUnknownWrites, "holds_and_catalog": c.HoldsAndCatalog, "restore_and_prune": c.RestoreAndPrune}
}
func orderKey(r RetainedReference) (string, error) {
	b, e := canonical([]string{r.Partition, r.SourceRecordID, r.SourceRecordVersion, r.EnvelopeID})
	return string(b), e
}
func lessUTF16(a, b string) bool {
	return slices.Compare(utf16.Encode([]rune(a)), utf16.Encode([]rune(b))) < 0
}

// DecodeRetained validates exactly the supplied set. Empty valid input is still
// UNADMITTED; it is not evidence of empty history or permission to retire keys.
// It neither sorts nor removes entries to repair invalid source observations.
func DecodeRetained(raw []byte) (UnadmittedRetained, error) {
	var r RetainedInput
	b, err := decode(raw, MaxRetainedBytes, &r)
	if err != nil || r.SchemaVersion != RetainedVersion || !text(r.InstallationID, 256) || !digest.MatchString(r.ConfigSHA256) || !version(r.SourceRevision) || !digest.MatchString(r.ReferencesSHA256) {
		return UnadmittedRetained{}, ErrInvalid
	}
	start, e1 := time.Parse(time.RFC3339Nano, r.ObservedAt)
	end, e2 := time.Parse(time.RFC3339Nano, r.ValidUntil)
	if e1 != nil || e2 != nil || !end.After(start) {
		return UnadmittedRetained{}, ErrInvalid
	}
	groups := map[string][]RetainedReference{}
	for name, p := range partitions(r.Coverage) {
		if !text(p.SourceID, 256) || !version(p.SnapshotRevision) || !version(p.FenceRevision) || p.RecordCount < 0 || !digest.MatchString(p.RecordSetSHA256) {
			return UnadmittedRetained{}, ErrInvalid
		}
		groups[name] = []RetainedReference{}
	}
	previous := ""
	bindings := map[[2]string]KeyBindingInput{}
	for i, ref := range r.References {
		if _, ok := groups[ref.Partition]; !ok {
			return UnadmittedRetained{}, ErrInvalid
		}
		if !text(ref.SourceRecordID, 256) || !version(ref.SourceRecordVersion) || !backupID.MatchString(ref.BackupPublicID) || !positive.MatchString(ref.AttemptNo) || !text(ref.EnvelopeID, 256) || !binding(ref.KeyBinding) || !source(ref.MappingSource) || !source(ref.ExpectedRequestSource) {
			return UnadmittedRetained{}, ErrInvalid
		}
		identity := [2]string{ref.KeyBinding.IdentityHash, ref.KeyBinding.RegistryVersion}
		if prior, exists := bindings[identity]; exists && prior != ref.KeyBinding {
			return UnadmittedRetained{}, ErrRebinding
		}
		bindings[identity] = ref.KeyBinding
		kb, e := canonical(ref.KeyBinding)
		if e != nil || hash(kb) != ref.BindingSHA256 {
			return UnadmittedRetained{}, ErrInvalid
		}
		order, e := orderKey(ref)
		if e != nil || (i > 0 && !lessUTF16(previous, order)) {
			return UnadmittedRetained{}, ErrInvalid
		}
		previous = order
		groups[ref.Partition] = append(groups[ref.Partition], ref)
	}
	all, e := canonical(r.References)
	if e != nil || hash(all) != r.ReferencesSHA256 {
		return UnadmittedRetained{}, ErrInvalid
	}
	for name, p := range partitions(r.Coverage) {
		bytes, e := canonical(groups[name])
		if e != nil || int64(len(groups[name])) != p.RecordCount || hash(bytes) != p.RecordSetSHA256 {
			return UnadmittedRetained{}, ErrInvalid
		}
	}
	return UnadmittedRetained{r, b}, nil
}

// MatchObservation checks pins and a supplied clock only. Source authenticity,
// shared fences, pagination/EOF and complete lifecycle coverage remain A/D work.
func (r UnadmittedRetained) MatchObservation(installation, configSHA, sourceRevision string, now time.Time) error {
	if len(r.canonical) == 0 || now.IsZero() || r.input.InstallationID != installation || r.input.ConfigSHA256 != configSHA || r.input.SourceRevision != sourceRevision {
		return ErrMismatch
	}
	start, _ := time.Parse(time.RFC3339Nano, r.input.ObservedAt)
	end, _ := time.Parse(time.RFC3339Nano, r.input.ValidUntil)
	if now.Before(start) || !now.Before(end) {
		return ErrMismatch
	}
	return nil
}
