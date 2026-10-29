package systembackupwire

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"
)

func TestPublicCChunkAADGolden(t *testing.T) {
	raw, err := os.ReadFile("../../../contracts/system-backup/v12/public-c-crypto-v1/envelope-vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector struct {
		Key     string       `json:"test_dek_hex"`
		Binding ChunkBinding `json:"binding"`
		Frames  []struct {
			Index uint64 `json:"index"`
			Plain string `json:"plaintext_hex"`
			Final bool   `json:"final"`
			AAD   string `json:"aad_hex"`
			Frame string `json:"frame_hex"`
		} `json:"frames"`
	}
	if err = json.Unmarshal(raw, &vector); err != nil {
		t.Fatal(err)
	}
	key, err := hex.DecodeString(vector.Key)
	if err != nil {
		t.Fatal(err)
	}
	defer clear(key)
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range vector.Frames {
		got, err := ChunkAAD(vector.Binding, f.Index, uint32(len(f.Plain)/2), f.Final)
		if err != nil || hex.EncodeToString(got) != f.AAD {
			t.Fatalf("frame %d mismatch: %v", f.Index, err)
		}
		frame, err := hex.DecodeString(f.Frame)
		if err != nil || len(frame) < 57 {
			t.Fatal("invalid frame fixture")
		}
		plain, err := gcm.Open(nil, frame[29:41], frame[41:], got)
		if err != nil || hex.EncodeToString(plain) != f.Plain {
			t.Fatalf("independent Go decrypt: %v", err)
		}
		clear(plain)
		changed := bytes.Clone(got)
		changed[0] ^= 1
		if _, err = gcm.Open(nil, frame[29:41], frame[41:], changed); err == nil {
			t.Fatal("accepted changed AAD")
		}
	}
	bad := vector.Binding
	bad.Path = "mysql/../secret"
	if _, err = ChunkAAD(bad, 0, 1, false); err == nil {
		t.Fatal("accepted traversal")
	}
	bad = vector.Binding
	bad.AttemptNo = "01"
	if _, err = ChunkAAD(bad, 0, 1, false); err == nil {
		t.Fatal("accepted noncanonical attempt")
	}
	if _, err = ChunkAAD(vector.Binding, 0, 1, true); err == nil {
		t.Fatal("accepted nonempty EOF")
	}
}
