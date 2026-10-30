package systembackupwire

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
)

func streamFixture() StreamSpec {
	return StreamSpec{Request: KeyRequest{Key: KeyBinding{"external-kms", strings.Repeat("a", 64), "opaque-r17", "backup-key", "1"}, Context: KeyContext{"installation_fixture", "sbk_fixture", "1", "capture", "workspace", "0", "env_1", strings.Repeat("c", 64)}}, Path: "workspace/part.enc", MaxPlaintextBytes: 2 * ChunkSize, MaxFrames: 4}
}
func TestStreamMatchesIndependentCPublicFramesAndEntireEnvelope(t *testing.T) {
	raw, e := os.ReadFile("../../../contracts/system-backup/v12/public-c-crypto-v1/envelope-vectors.json")
	if e != nil {
		t.Fatal(e)
	}
	var v struct {
		Key      string `json:"test_dek_hex"`
		Wrapped  string `json:"wrapped_dek_hex"`
		Envelope string `json:"envelope_json"`
		Frames   []struct{ Plain, Nonce, Frame string }
	}
	var generic map[string]json.RawMessage
	json.Unmarshal(raw, &generic)
	json.Unmarshal(generic["test_dek_hex"], &v.Key)
	json.Unmarshal(generic["wrapped_dek_hex"], &v.Wrapped)
	json.Unmarshal(generic["envelope_json"], &v.Envelope)
	var envelope struct {
		Entries []struct {
			Context struct{ Installation, Backup, Attempt, Phase, Part, Index, ID, Hash string }
			KEK     map[string]string
		}
	}
	_ = envelope // decode public field names explicitly below; no new golden bytes
	var fields struct {
		Entries []struct {
			Context map[string]string `json:"context"`
			KEK     map[string]string `json:"kek"`
		}
	}
	json.Unmarshal([]byte(v.Envelope), &fields)
	c, k := fields.Entries[0].Context, fields.Entries[0].KEK
	spec := StreamSpec{Request: KeyRequest{Key: KeyBinding{k["provider"], k["identity_hash"], k["registry_version"], k["provider_key_id"], k["provider_version"]}, Context: KeyContext{c["origin_installation_id"], c["backup_public_id"], c["attempt_no"], c["phase"], c["part"], c["part_index"], c["envelope_id"], c["capture_context_hash"]}}, Path: "mysql/part-00001.enc", MaxPlaintextBytes: ChunkSize, MaxFrames: 2}
	var frames []struct {
		Plain string `json:"plaintext_hex"`
		Nonce string `json:"nonce_hex"`
		Frame string `json:"frame_hex"`
	}
	json.Unmarshal(generic["frames"], &frames)
	var plain, nonces, want []byte
	for _, f := range frames {
		p, _ := hex.DecodeString(f.Plain)
		plain = append(plain, p...)
		n, _ := hex.DecodeString(f.Nonce)
		nonces = append(nonces, n...)
		b, _ := hex.DecodeString(f.Frame)
		want = append(want, b...)
	}
	key, _ := hex.DecodeString(v.Key)
	defer clear(key)
	var out bytes.Buffer
	seal, e := encryptStream(context.Background(), spec, key, &out, func(w io.Writer) error { _, e := w.Write(plain); return e }, bytes.NewReader(nonces))
	if e != nil || !bytes.Equal(out.Bytes(), want) {
		t.Fatal("C frame bytes differ", e)
	}
	wrapped, _ := hex.DecodeString(v.Wrapped)
	got, e := seal.EnvelopeJSON(WrappedKey{spec.Request, "AES-256-KW", wrapped})
	if e != nil || string(got) != v.Envelope {
		t.Fatal("complete C envelope bytes differ", e)
	}
}

func TestStreamBoundedChunksEmptyEOFAndIndependentDecrypt(t *testing.T) {
	for _, size := range []int{0, 1, ChunkSize, ChunkSize + 7, 2 * ChunkSize} {
		spec := streamFixture()
		plain := bytes.Repeat([]byte{37}, size)
		key := bytes.Repeat([]byte{9}, 32)
		var out bytes.Buffer
		var retained io.Writer
		seal, e := EncryptStream(context.Background(), spec, key, &out, func(w io.Writer) error {
			retained = w
			for _, p := range [][]byte{plain[:size/2], plain[size/2:]} {
				if _, e := w.Write(p); e != nil {
					return e
				}
			}
			return nil
		})
		if e != nil {
			t.Fatal(e)
		}
		if _, e := retained.Write([]byte("late")); e == nil {
			t.Fatal("writer outlived DEK callback")
		}
		block, _ := aes.NewCipher(key)
		gcm, _ := cipher.NewGCM(block)
		binding, _ := spec.binding()
		raw := out.Bytes()
		var got []byte
		for n, c := range seal.Chunks() {
			length := 41 + int(c.CiphertextLength) + 16
			frame := raw[:length]
			raw = raw[length:]
			aad, _ := ChunkAAD(binding, uint64(n), c.PlaintextLength, c.Final)
			p, e := gcm.Open(nil, frame[29:41], frame[41:], aad)
			if e != nil {
				t.Fatal(e)
			}
			got = append(got, p...)
			clear(p)
			if binary.BigEndian.Uint64(frame[12:20]) != uint64(n) {
				t.Fatal("noncontiguous frames")
			}
		}
		if !bytes.Equal(plain, got) || len(raw) != 0 || !seal.Chunks()[len(seal.Chunks())-1].Final || seal.PlaintextBytes() != int64(size) {
			t.Fatal("plaintext/EOF mismatch")
		}
		if _, e = seal.EnvelopeJSON(WrappedKey{spec.Request, "provider-native", []byte("wrapped")}); e != nil {
			t.Fatal(e)
		}
		wrong := spec.Request
		wrong.Context.AttemptNo = "2"
		if _, e = seal.EnvelopeJSON(WrappedKey{wrong, "provider-native", []byte("wrapped")}); e == nil {
			t.Fatal("foreign wrapped key accepted")
		}
	}
}

type shortSink struct{}

func (shortSink) Write(p []byte) (int, error) { return len(p) - 1, nil }
func TestStreamFailuresNeverReturnUsableSeal(t *testing.T) {
	for _, mode := range []string{"canceled", "source", "ignored-budget", "short-write", "duplicate-nonce", "frame-budget"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			spec := streamFixture()
			var out bytes.Buffer
			var dst io.Writer = &out
			var random io.Reader = bytes.NewReader(make([]byte, 120))
			produce := func(w io.Writer) error { _, e := w.Write([]byte("payload")); return e }
			switch mode {
			case "canceled":
				cancel()
			case "source":
				produce = func(w io.Writer) error { w.Write([]byte("partial")); return errors.New("private source path") }
			case "ignored-budget":
				spec.MaxPlaintextBytes = 1
				produce = func(w io.Writer) error { w.Write([]byte("too much")); return nil }
			case "short-write":
				dst = shortSink{}
			case "frame-budget":
				spec.MaxFrames = 1
				spec.MaxPlaintextBytes = 0
			}
			seal, e := encryptStream(ctx, spec, bytes.Repeat([]byte{2}, 32), dst, produce, random)
			if e == nil || seal.CiphertextSHA256() != "" || len(seal.Chunks()) != 0 || strings.Contains(e.Error(), "private source path") {
				t.Fatal("partial result escaped", e)
			}
		})
	}
}
func TestWireClosedStringEncoderPreservesUnicodeAndRejectsBadBinding(t *testing.T) {
	q, e := quoteWire("<>&\u2028\u2029😀\n\x00")
	if e != nil || q != "\"<>&\u2028\u2029😀\\n\\u0000\"" {
		t.Fatal("C string encoding changed")
	}
	for _, path := range []string{"/absolute", "a/../b", "a//b", `a\b`, string([]byte{255})} {
		s := streamFixture()
		s.Path = path
		if _, e := s.binding(); e == nil {
			t.Fatal("invalid path accepted")
		}
	}
}
