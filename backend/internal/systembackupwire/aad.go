package systembackupwire

import (
	"bytes"
	"encoding/binary"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

// ChunkBinding contains strings in the exact wire order. No normalization,
// escaping, path cleaning or version inference is allowed before encoding.
type ChunkBinding struct {
	SchemaVersion      string `json:"schema_version"`
	InstallationID     string `json:"origin_installation_id"`
	BackupPublicID     string `json:"backup_public_id"`
	AttemptNo          string `json:"attempt_no"`
	Phase              string `json:"phase"`
	Part               string `json:"part"`
	PartIndex          string `json:"part_index"`
	Path               string `json:"path"`
	EnvelopeID         string `json:"envelope_id"`
	CaptureContextHash string `json:"capture_context_hash"`
	KEKBindingSHA256   string `json:"kek_binding_sha256"`
}

var decimal = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)
var digest = regexp.MustCompile(`^[0-9a-f]{64}$`)
var ErrBinding = errors.New("invalid backup crypto binding")

// ChunkAAD returns the v1 length-prefixed UTF-8 encoding, not its digest.
func ChunkAAD(b ChunkBinding, index uint64, length uint32, final bool) ([]byte, error) {
	if b.SchemaVersion != FramingVersion || !decimal.MatchString(b.AttemptNo) || b.AttemptNo == "0" || !decimal.MatchString(b.PartIndex) ||
		!digest.MatchString(b.CaptureContextHash) || !digest.MatchString(b.KEKBindingSHA256) || index > 9007199254740991 || length > 1<<20 || final != (length == 0) || strings.Contains(b.Path, `\`) {
		return nil, ErrBinding
	}
	for _, p := range strings.Split(b.Path, "/") {
		if p == "" || p == "." || p == ".." {
			return nil, ErrBinding
		}
	}
	var out bytes.Buffer
	for _, s := range []string{"clawmanager.system-backup.chunk.v1", b.SchemaVersion, b.InstallationID, b.BackupPublicID, b.AttemptNo, b.Phase, b.Part, b.PartIndex, b.Path, b.EnvelopeID, b.CaptureContextHash, b.KEKBindingSHA256} {
		if len(s) == 0 || len(s) > 4096 || !utf8.ValidString(s) {
			return nil, ErrBinding
		}
		_ = binary.Write(&out, binary.BigEndian, uint32(len(s)))
		out.WriteString(s)
	}
	_ = binary.Write(&out, binary.BigEndian, index)
	_ = binary.Write(&out, binary.BigEndian, length)
	if final {
		out.WriteByte(1)
	} else {
		out.WriteByte(0)
	}
	return out.Bytes(), nil
}
