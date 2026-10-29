// Package systembackupkekcandidate decodes non-authorizing public C inputs.
// It performs no IO, registry admission, permission check or complete scan.
// Its outputs cannot be passed directly to systembackupkms.Config.
package systembackupkekcandidate

import "errors"

const MappingVersion = "public-c-backup-kek-mapping.v1"
const RetainedVersion = "public-c-backup-kek-retained-input.v1"
const MaxMappingBytes = 256 << 10
const MaxRetainedBytes = 8 << 20

var ErrInvalid = errors.New("invalid KEK candidate")
var ErrMismatch = errors.New("KEK candidate binding mismatch")
var ErrRebinding = errors.New("KEK candidate immutable mapping changed")

// These DTOs are untrusted claims even after structural decoding. They contain
// no grant, permission boolean, provider credential or production Config.
type SourceRecord struct {
	SourceID      string `json:"source_id"`
	RecordID      string `json:"record_id"`
	RecordVersion string `json:"record_version"`
	ContentSHA256 string `json:"content_sha256"`
}
type KeyBindingInput struct {
	Provider        string `json:"provider"`
	IdentityHash    string `json:"identity_hash"`
	RegistryVersion string `json:"registry_version"`
	ProviderKeyID   string `json:"provider_key_id"`
	ProviderVersion string `json:"provider_version"`
}
type ConfigReference struct {
	Purpose      string `json:"purpose"`
	IdentityHash string `json:"identity_hash"`
	Version      string `json:"version"`
}
type ProviderInput struct {
	Endpoint             string       `json:"endpoint"`
	KeyName              string       `json:"key_name"`
	ProviderIdentityHash string       `json:"provider_identity_hash"`
	ScopeHash            string       `json:"scope_hash"`
	CAPEMSHA256          string       `json:"ca_pem_sha256"`
	CASource             SourceRecord `json:"ca_source"`
}
type KMSReference struct {
	Kind                 string `json:"ref_kind"`
	Purpose              string `json:"purpose"`
	IdentityHash         string `json:"identity_hash"`
	Version              string `json:"identity_version"`
	ProviderIdentityHash string `json:"provider_identity_hash"`
	ScopeHash            string `json:"scope_hash"`
	Description          string `json:"description_redacted"`
	Capability           string `json:"kms_capability"`
}
type MappingInput struct {
	SchemaVersion  string          `json:"schema_version"`
	InstallationID string          `json:"installation_id"`
	ConfigSHA256   string          `json:"config_sha256"`
	ConfigRef      ConfigReference `json:"config_ref"`
	KeyBinding     KeyBindingInput `json:"key_binding"`
	Provider       ProviderInput   `json:"provider"`
	GenerateRef    KMSReference    `json:"generate_ref"`
	UnwrapRef      KMSReference    `json:"unwrap_ref"`
	SourceRevision string          `json:"source_revision"`
}
type Partition struct {
	SourceID         string `json:"source_id"`
	SnapshotRevision string `json:"snapshot_revision"`
	FenceRevision    string `json:"fence_revision"`
	RecordCount      int64  `json:"record_count"`
	RecordSetSHA256  string `json:"record_set_sha256"`
}
type Coverage struct {
	RetainedArtifacts        Partition `json:"retained_artifacts"`
	InflightAndUnknownWrites Partition `json:"inflight_and_unknown_writes"`
	HoldsAndCatalog          Partition `json:"holds_and_catalog"`
	RestoreAndPrune          Partition `json:"restore_and_prune"`
}
type RetainedReference struct {
	Partition             string          `json:"partition"`
	SourceRecordID        string          `json:"source_record_id"`
	SourceRecordVersion   string          `json:"source_record_version"`
	BackupPublicID        string          `json:"backup_public_id"`
	AttemptNo             string          `json:"attempt_no"`
	EnvelopeID            string          `json:"envelope_id"`
	KeyBinding            KeyBindingInput `json:"key_binding"`
	BindingSHA256         string          `json:"binding_sha256"`
	MappingSource         SourceRecord    `json:"mapping_source"`
	ExpectedRequestSource SourceRecord    `json:"expected_request_source"`
}
type RetainedInput struct {
	SchemaVersion    string              `json:"schema_version"`
	InstallationID   string              `json:"installation_id"`
	ConfigSHA256     string              `json:"config_sha256"`
	SourceRevision   string              `json:"source_revision"`
	ObservedAt       string              `json:"observed_at"`
	ValidUntil       string              `json:"valid_until"`
	Coverage         Coverage            `json:"coverage"`
	References       []RetainedReference `json:"references"`
	ReferencesSHA256 string              `json:"references_sha256"`
}

// UnadmittedMapping is an immutable structural candidate, never an admission.
type UnadmittedMapping struct {
	input     MappingInput
	canonical []byte
}

func (m UnadmittedMapping) Input() MappingInput   { return m.input }
func (m UnadmittedMapping) CanonicalJSON() []byte { return append([]byte(nil), m.canonical...) }

// UnadmittedRetained validates only the supplied set, not its completeness,
// source authority, pagination, lifecycle eligibility or transactional fence.
type UnadmittedRetained struct {
	input     RetainedInput
	canonical []byte
}

func (r UnadmittedRetained) Input() RetainedInput {
	v := r.input
	if v.References != nil {
		v.References = append([]RetainedReference{}, v.References...)
	}
	return v
}
func (r UnadmittedRetained) CanonicalJSON() []byte { return append([]byte(nil), r.canonical...) }
