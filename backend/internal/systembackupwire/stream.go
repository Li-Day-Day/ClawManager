package systembackupwire

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"hash"
	"io"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

var ErrStream = errors.New("backup stream failed; unpublished output is not accepted")
var ErrStreamAuthority = errors.New("backup stream authority unavailable")
var streamBackupID = regexp.MustCompile(`^sbk_[A-Za-z0-9_-]+$`)

const ChunkSize = 1 << 20
const MaxStreamFrames = 65536

// StreamSpec consumes the ORIGINAL frozen C KeyRequest. It never computes a
// capture-context hash from an inventory, checkpoint or caller's success flag.
// Source provenance, complete mount coverage and permission remain D/A/C's
// original admission obligations. This cipher layer performs no provider
// operation or downgrade; the production worker separately requires KMS Generate.
type StreamSpec struct {
	Request           KeyRequest
	Path              string
	MaxPlaintextBytes int64
	MaxFrames         uint64 // includes the mandatory EOF; bounded metadata memory
}

type StreamChunk struct {
	Path             string `json:"path"`
	Index            uint64 `json:"chunk_index"`
	PlaintextLength  uint32 `json:"plaintext_length"`
	CiphertextLength uint32 `json:"ciphertext_length"`
	Final            bool   `json:"final"`
	Nonce            string `json:"nonce"`
	Tag              string `json:"tag"`
	SHA256           string `json:"frame_sha256"`
}

// StreamSeal is only constructible by successful EncryptStream. No raw DEK or
// cipher is retained. It is a local stream result, not C publication authority.
type StreamSeal struct {
	spec             StreamSpec
	chunks           []StreamChunk
	plain, encrypted int64
	sha              string
}

func (s StreamSeal) CiphertextSHA256() string { return s.sha }
func (s StreamSeal) CiphertextBytes() int64   { return s.encrypted }
func (s StreamSeal) PlaintextBytes() int64    { return s.plain }
func (s StreamSeal) Chunks() []StreamChunk    { return append([]StreamChunk(nil), s.chunks...) }

func (s StreamSpec) binding() (ChunkBinding, error) {
	r, k := s.Request.Context, s.Request.Key
	providerOK := k.Provider == "external-kms" || k.Provider == "external-secret" || k.Provider == "k8s-secret"
	if !providerOK || (k.Provider == "external-kms" && (!decimal.MatchString(k.ProviderVersion) || k.ProviderVersion == "0")) || !digest.MatchString(k.IdentityHash) || k.RegistryVersion == "latest" || k.RegistryVersion == "current" || k.RegistryVersion == "default" || !streamBackupID.MatchString(r.BackupPublicID) || r.Phase != "capture" || len(s.Path) > 1024 || s.MaxFrames < 1 || s.MaxFrames > MaxStreamFrames || s.MaxPlaintextBytes < 0 || s.MaxPlaintextBytes > int64(s.MaxFrames-1)*ChunkSize {
		return ChunkBinding{}, ErrBinding
	}
	for _, v := range []string{k.ProviderKeyID, k.RegistryVersion, k.ProviderVersion, r.InstallationID, r.BackupPublicID, r.Phase, r.Part, r.EnvelopeID} {
		if v == "" || len(v) > 256 || !utf8.ValidString(v) {
			return ChunkBinding{}, ErrBinding
		}
	}
	keyJSON, err := keyBindingJSON(k)
	if err != nil {
		return ChunkBinding{}, err
	}
	h := sha256.Sum256(keyJSON)
	b := ChunkBinding{FramingVersion, r.InstallationID, r.BackupPublicID, r.AttemptNo, r.Phase, r.Part, r.PartIndex, s.Path, r.EnvelopeID, r.CaptureContextHash, hex.EncodeToString(h[:])}
	_, err = ChunkAAD(b, 0, 0, true)
	return b, err
}

// EncryptStream is a synchronous PUSH stream: the producer exits before the
// borrowed DEK callback can return. There is no detached pipe/goroutine or raw
// key serialization. On ANY failure return zero seal; caller must not publish
// the sink. The real entry uses crypto/rand; nonce injection is test-private.
func EncryptStream(ctx context.Context, spec StreamSpec, key []byte, dst io.Writer, produce func(io.Writer) error) (StreamSeal, error) {
	return encryptStream(ctx, spec, key, dst, produce, rand.Reader)
}
func encryptStream(ctx context.Context, spec StreamSpec, key []byte, dst io.Writer, produce func(io.Writer) error, random io.Reader) (StreamSeal, error) {
	var zero StreamSeal
	b, err := spec.binding()
	if err != nil || ctx == nil || len(key) != 32 || dst == nil || produce == nil || random == nil {
		return zero, ErrBinding
	}
	if ctx.Err() != nil {
		return zero, ctx.Err()
	}
	owned := append([]byte(nil), key...)
	defer clear(owned)
	block, err := aes.NewCipher(owned)
	if err != nil {
		return zero, ErrStream
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return zero, ErrStream
	}
	w := &frameWriter{ctx: ctx, spec: spec, binding: b, aead: gcm, dst: dst, random: random, hash: sha256.New(), nonces: map[[12]byte]bool{}, buffer: make([]byte, 0, ChunkSize)}
	defer func() { w.closed = true; w.aead = nil; clear(w.buffer[:cap(w.buffer)]) }()
	if err = produce(w); err != nil {
		if ctx.Err() != nil {
			return zero, ctx.Err()
		}
		if errors.Is(err, ErrStreamAuthority) {
			return zero, ErrStreamAuthority
		}
		return zero, ErrStream
	}
	w.closed = true
	if w.err != nil {
		return zero, w.err
	}
	if len(w.buffer) > 0 {
		if err = w.frame(w.buffer, false); err != nil {
			return zero, err
		}
	}
	if err = w.frame(nil, true); err != nil {
		return zero, err
	}
	if ctx.Err() != nil {
		return zero, ctx.Err()
	}
	return StreamSeal{spec: spec, chunks: w.chunks, plain: w.plain, encrypted: w.encrypted, sha: hex.EncodeToString(w.hash.Sum(nil))}, nil
}

type frameWriter struct {
	ctx              context.Context
	spec             StreamSpec
	binding          ChunkBinding
	aead             cipher.AEAD
	dst              io.Writer
	random           io.Reader
	hash             hash.Hash
	nonces           map[[12]byte]bool
	buffer           []byte
	chunks           []StreamChunk
	plain, encrypted int64
	err              error
	closed           bool
}

func (w *frameWriter) Write(p []byte) (int, error) {
	if w.closed {
		return 0, ErrStream
	}
	if w.err != nil {
		return 0, w.err
	}
	if w.ctx.Err() != nil {
		w.err = w.ctx.Err()
		return 0, w.err
	}
	if int64(len(p)) > w.spec.MaxPlaintextBytes-w.plain {
		w.err = ErrStream
		return 0, w.err
	}
	total := len(p)
	w.plain += int64(total)
	for len(p) > 0 {
		n := min(len(p), ChunkSize-len(w.buffer))
		w.buffer = append(w.buffer, p[:n]...)
		p = p[n:]
		if len(w.buffer) == ChunkSize {
			if w.err = w.frame(w.buffer, false); w.err != nil {
				return total - len(p), w.err
			}
			clear(w.buffer)
			w.buffer = w.buffer[:0]
		}
	}
	return total, nil
}
func (w *frameWriter) frame(plain []byte, final bool) error {
	if w.ctx.Err() != nil {
		return w.ctx.Err()
	}
	index := uint64(len(w.chunks))
	if index >= w.spec.MaxFrames || (!final && index >= w.spec.MaxFrames-1) {
		return ErrStream
	}
	var nonce [12]byte
	unique := false
	for n := 0; n < 8; n++ {
		if _, err := io.ReadFull(w.random, nonce[:]); err != nil {
			return ErrStream
		}
		if !w.nonces[nonce] {
			unique = true
			break
		}
	}
	if !unique {
		return ErrStream
	}
	w.nonces[nonce] = true
	aad, err := ChunkAAD(w.binding, index, uint32(len(plain)), final)
	if err != nil {
		return ErrBinding
	}
	frame := make([]byte, 41, 41+len(plain)+16)
	copy(frame, "CMBKGC01")
	binary.BigEndian.PutUint32(frame[8:12], 41)
	binary.BigEndian.PutUint64(frame[12:20], index)
	binary.BigEndian.PutUint32(frame[20:24], uint32(len(plain)))
	binary.BigEndian.PutUint32(frame[24:28], uint32(len(plain)))
	if final {
		frame[28] = 1
	}
	copy(frame[29:41], nonce[:])
	frame = w.aead.Seal(frame, nonce[:], plain, aad)
	n, err := w.dst.Write(frame)
	if errors.Is(err, ErrStreamAuthority) {
		return ErrStreamAuthority
	}
	if err != nil || n != len(frame) {
		return ErrStream
	}
	if w.ctx.Err() != nil {
		return w.ctx.Err()
	}
	h := sha256.Sum256(frame)
	w.hash.Write(frame)
	w.encrypted += int64(n)
	w.chunks = append(w.chunks, StreamChunk{w.spec.Path, index, uint32(len(plain)), uint32(len(plain)), final, hex.EncodeToString(nonce[:]), hex.EncodeToString(frame[len(frame)-16:]), hex.EncodeToString(h[:])})
	return nil
}

// These encoders cover ONLY the closed string/integer/bool C envelope fields,
// in fixed JCS key order. They do not replace the existing generic JCS library.
func quoteWire(s string) (string, error) {
	if !utf8.ValidString(s) {
		return "", ErrBinding
	}
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"', '\\':
			b.WriteByte('\\')
			b.WriteRune(r)
		case '\b':
			b.WriteString(`\b`)
		case '\t':
			b.WriteString(`\t`)
		case '\n':
			b.WriteString(`\n`)
		case '\f':
			b.WriteString(`\f`)
		case '\r':
			b.WriteString(`\r`)
		default:
			if r < 32 {
				b.WriteString(`\u00`)
				b.WriteByte("0123456789abcdef"[byte(r)>>4])
				b.WriteByte("0123456789abcdef"[byte(r)&15])
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String(), nil
}
func wireString(s string) string { q, _ := quoteWire(s); return q }
func keyBindingJSON(k KeyBinding) ([]byte, error) {
	for _, v := range []string{k.Provider, k.IdentityHash, k.RegistryVersion, k.ProviderKeyID, k.ProviderVersion} {
		if !utf8.ValidString(v) {
			return nil, ErrBinding
		}
	}
	return []byte(`{"identity_hash":` + wireString(k.IdentityHash) + `,"provider":` + wireString(k.Provider) + `,"provider_key_id":` + wireString(k.ProviderKeyID) + `,"provider_version":` + wireString(k.ProviderVersion) + `,"registry_version":` + wireString(k.RegistryVersion) + `}`), nil
}
func contextJSON(c KeyContext) string {
	return `{"attempt_no":` + wireString(c.AttemptNo) + `,"backup_public_id":` + wireString(c.BackupPublicID) + `,"capture_context_hash":` + wireString(c.CaptureContextHash) + `,"envelope_id":` + wireString(c.EnvelopeID) + `,"origin_installation_id":` + wireString(c.InstallationID) + `,"part":` + wireString(c.Part) + `,"part_index":` + wireString(c.PartIndex) + `,"phase":` + wireString(c.Phase) + `}`
}
func chunkJSON(c StreamChunk) string {
	return `{"chunk_index":` + strconv.FormatUint(c.Index, 10) + `,"ciphertext_length":` + strconv.FormatUint(uint64(c.CiphertextLength), 10) + `,"final":` + strconv.FormatBool(c.Final) + `,"frame_sha256":` + wireString(c.SHA256) + `,"nonce":` + wireString(c.Nonce) + `,"path":` + wireString(c.Path) + `,"plaintext_length":` + strconv.FormatUint(uint64(c.PlaintextLength), 10) + `,"tag":` + wireString(c.Tag) + `}`
}

// EnvelopeJSON emits a single-entry C envelope (a part-local unpublished
// candidate). C's finalizer must merge/sort all entries and publish atomically.
func (s StreamSeal) EnvelopeJSON(wrapped WrappedKey) ([]byte, error) {
	algorithm := "provider-native"
	if s.spec.Request.Key.Provider != "external-kms" {
		algorithm = "AES-256-KW"
	}
	if s.sha == "" || len(s.chunks) == 0 || wrapped.Request != s.spec.Request || wrapped.Algorithm != algorithm || len(wrapped.Ciphertext) == 0 || len(wrapped.Ciphertext) > 32768 || (algorithm == "AES-256-KW" && len(wrapped.Ciphertext) != 40) {
		return nil, ErrBinding
	}
	k, err := keyBindingJSON(wrapped.Request.Key)
	if err != nil {
		return nil, err
	}
	var chunks []string
	for _, c := range s.chunks {
		chunks = append(chunks, chunkJSON(c))
	}
	entry := `{"chunks":[` + strings.Join(chunks, ",") + `],"context":` + contextJSON(wrapped.Request.Context) + `,"data_algorithm":"AES-256-GCM","envelope_id":` + wireString(wrapped.Request.Context.EnvelopeID) + `,"framing_version":"aes-gcm-chunked.v1","kek":` + string(k) + `,"wrap_algorithm":` + wireString(algorithm) + `,"wrapped_dek":` + wireString(base64.RawURLEncoding.EncodeToString(wrapped.Ciphertext)) + `}`
	return []byte(`{"entries":[` + entry + `],"schema_version":"system-backup-envelope.v1"}`), nil
}
