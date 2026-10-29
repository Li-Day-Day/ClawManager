// Package runtimecustody retains encrypted ORIGINAL gateway create requests.
// It is not a backup artifact format or a source of execution authorization.
package runtimecustody

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"

	"clawreef/internal/systembackup/staging"
)

var ErrCustody = errors.New("original gateway request custody unavailable")

type Identity struct {
	InstanceID    int    `json:"instance_id"`
	UserID        int    `json:"user_id"`
	Generation    int    `json:"generation"`
	WorkspacePath string `json:"workspace_path"`
}

func digest(raw []byte) string { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }
func Binding(installation string, id Identity, plainSHA256 string) staging.Binding {
	raw, _ := json.Marshal(id)
	return staging.Binding{BackupID: installation, Attempt: strconv.Itoa(id.Generation), Path: "runtime-original/" + strconv.Itoa(id.InstanceID), CaptureContextHash: digest(raw), EnvelopeID: plainSHA256}
}

// Store is explicitly enabled at the real Runtime Agent HTTP client. Files
// are written and fsynced before POST. Retries verify existing ciphertext;
// different payloads get different immutable filenames, including port retries.
type Store struct{ Directory, KeyFile, Installation string }

func (s Store) Save(ctx context.Context, raw []byte) error {
	var id Identity
	if ctx == nil || ctx.Err() != nil || s.Installation == "" || !filepath.IsAbs(s.Directory) || !filepath.IsAbs(s.KeyFile) || len(raw) == 0 || len(raw) > 7<<20 || json.Unmarshal(raw, &id) != nil || id.InstanceID <= 0 || id.UserID <= 0 || id.Generation <= 0 || id.WorkspacePath == "" {
		return ErrCustody
	}
	keyFile, e := os.Open(s.KeyFile)
	if e != nil {
		return ErrCustody
	}
	st, e := keyFile.Stat()
	if e != nil || !st.Mode().IsRegular() || st.Size() != 32 || (runtime.GOOS == "linux" && st.Mode().Perm()&0077 != 0) {
		keyFile.Close()
		return ErrCustody
	}
	key, e := io.ReadAll(io.LimitReader(keyFile, 33))
	keyFile.Close()
	defer clear(key)
	if e != nil || len(key) != 32 {
		return ErrCustody
	}
	root, e := os.OpenRoot(s.Directory)
	if e != nil {
		return ErrCustody
	}
	defer root.Close()
	sum := digest(raw)
	name := fmt.Sprintf("gateway-%d-%d-%s.enc", id.InstanceID, id.Generation, sum)
	binding := Binding(s.Installation, id, sum)
	// Verification includes the final AEAD frame and exact plaintext identity.
	verify := func() error {
		info, e := root.Lstat(name)
		if e != nil || !info.Mode().IsRegular() || info.Size() > 8<<20 {
			return ErrCustody
		}
		f, e := root.Open(name)
		if e != nil {
			return ErrCustody
		}
		defer f.Close()
		var plain bytes.Buffer
		defer func() { clear(plain.Bytes()) }()
		if staging.Open(ctx, f, &plain, key, binding, 7<<20) != nil || !bytes.Equal(plain.Bytes(), raw) {
			return ErrCustody
		}
		return nil
	}
	if _, e := root.Lstat(name); e == nil {
		return verify()
	} else if !os.IsNotExist(e) {
		return ErrCustody
	}
	if _, e = staging.SealFile(ctx, root, name, key, binding, func(w io.Writer) error { _, e := w.Write(raw); return e }); e != nil {
		// A concurrent identical create may have won; only verified complete data
		// can turn its EEXIST into success. No truncated object is repaired in place.
		return verify()
	}
	return nil
}
