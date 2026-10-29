// Package systembackupwire declares the public C v1 backup crypto boundary.
// It is not a provider implementation or a production authorization source.
package systembackupwire

import "context"

const EnvelopeVersion = "system-backup-envelope.v1"
const FramingVersion = "aes-gcm-chunked.v1"

// KeyBinding is supplied by trusted deployment composition, never by an Admin
// request. RegistryVersion is opaque; ProviderVersion is separately pinned.
type KeyBinding struct {
	Provider, IdentityHash, RegistryVersion, ProviderKeyID, ProviderVersion string
}

// KeyContext is frozen before source capture. AttemptNo and PartIndex are
// canonical decimal strings in the encryption context (not floating numbers).
type KeyContext struct {
	InstallationID, BackupPublicID, AttemptNo, Phase, Part, PartIndex string
	EnvelopeID, CaptureContextHash                                    string
}

type KeyRequest struct {
	Key     KeyBinding
	Context KeyContext
}

// WrappedKey carries only public metadata and provider ciphertext. Its complete
// binding and context must equal the trusted request before calling a provider.
type WrappedKey struct {
	Request    KeyRequest
	Algorithm  string // provider-native or AES-256-KW
	Ciphertext []byte
}

// WithDEK borrows exactly 32 bytes within the originating Job. Implementations
// must erase owned plaintext buffers after the callback on every return path,
// reject canceled/revoked/expired authority before and after provider calls,
// and never expose DEKs through logs, JSON, or errors. The callback must neither
// retain nor transfer the buffer. Go cannot enforce secure-memory properties.
type WithDEK func([]byte) error

// Generator is the external-kms capture capability (GenerateDataKey). Capture
// composition receives only this interface, never Unwrapper. No latest/default
// version or operation fallback is permitted. A callback error returns no usable
// result. A provider timeout is outcome-unknown, not proof of absence.
type Generator interface {
	Generate(context.Context, KeyRequest, WithDEK) (WrappedKey, error)
}

// Wrapper is only the external-secret/k8s-secret functional_test capability:
// AES-256-KW with an exact 32-byte KEK and caller-generated random 32-byte DEK.
// KW has no native AAD; context is authenticated by the final chunk GCM AAD.
// Implementations borrow the DEK, erase their copies, and do not erase the
// caller's buffer. The caller must erase it. No external-kms wrap alias exists.
type Wrapper interface {
	Wrap(context.Context, KeyRequest, []byte) (WrappedKey, error)
}

// Unwrapper uses current recovery authority and the full retained exact mapping;
// historical key retention alone never authorizes a read. Provider errors or a
// mismatched key/context must not invoke the plaintext callback.
type Unwrapper interface {
	Unwrap(context.Context, KeyRequest, WrappedKey, WithDEK) error
}
