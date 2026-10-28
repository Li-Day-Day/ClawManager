// Package systembackupplancustody persists public runner plans as authenticated
// ciphertext. It does not authorize execution or own D's task/intent journal.
package systembackupplancustody

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"reflect"
	"strconv"

	"clawreef/internal/systembackup/staging"
	dispatch "clawreef/internal/systembackupdispatch"
)

const maxPlanBytes = 8 << 20

// CMSTG01 uses bounded frames; leave room for their authenticated headers.
const maxSealedBytes = maxPlanBytes + 4096

var ErrCustody = errors.New("system backup plan custody unavailable")

// Record is stored by D together with the original task/attempt and key-version
// reference. It contains no key or plaintext. The caller must authenticate that
// journal and obtain the exact task-scoped DEK through its existing key owner.
type Record struct {
	File       staging.Receipt
	PlanSHA256 string
}

func live(ctx context.Context) bool {
	if ctx == nil {
		return false
	}
	v := reflect.ValueOf(ctx)
	switch v.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Interface, reflect.Chan:
		if v.IsNil() {
			return false
		}
	}
	return ctx.Err() == nil
}

func binding(in dispatch.Input, name, digest string) staging.Binding {
	return staging.Binding{
		BackupID:           in.Authority.TaskPublicID,
		Attempt:            strconv.FormatUint(in.Authority.AttemptNo, 10),
		Path:               name,
		CaptureContextHash: in.Authority.ConfigSHA256,
		EnvelopeID:         digest,
	}
}

// Save validates the exact public task-plan binding before writing. The caller
// must first durably record its intent (name, original task and exact key ref).
// It owns root exclusively. Existing/uncertain objects are never overwritten or
// retried automatically. No plaintext file is created, even on failure.
func Save(ctx context.Context, root *os.Root, name string, key []byte, in dispatch.Input, plan dispatch.Plan, innerVersion string) (Record, error) {
	if !live(ctx) || root == nil || len(key) != 32 || len(plan.CanonicalJSON) == 0 || len(plan.CanonicalJSON) > maxPlanBytes {
		return Record{}, ErrCustody
	}
	owned := bytes.Clone(plan.CanonicalJSON)
	defer clear(owned)
	plan.CanonicalJSON = owned
	inner, err := dispatch.UnwrapTaskPlan(in, plan, innerVersion)
	clear(inner.CanonicalJSON)
	if err != nil {
		return Record{}, ErrCustody
	}
	dek := bytes.Clone(key)
	defer clear(dek)
	r, err := staging.SealFile(ctx, root, name, dek, binding(in, name, plan.SHA256), func(w io.Writer) error {
		_, err := io.Copy(w, bytes.NewReader(owned))
		return err
	})
	if err != nil || !live(ctx) {
		return Record{}, ErrCustody
	}
	return Record{File: r, PlanSHA256: plan.SHA256}, nil
}

// Load checks ciphertext checksum, every AEAD frame including the final frame,
// then the original task/config/profile/spec and plan hash before releasing any
// plaintext. Claim renewal does not change custody; current execution/recovery
// authorization remains D/A's separate mandatory guard. In particular this
// reader does not reject an expired task needed for authorized recovery.
func Load(ctx context.Context, root *os.Root, key []byte, in dispatch.Input, record Record, innerVersion string) (dispatch.Plan, error) {
	if !live(ctx) || root == nil || len(key) != 32 || record.File.Size <= 0 || record.File.Size > maxSealedBytes || len(record.PlanSHA256) != 64 {
		return dispatch.Plan{}, ErrCustody
	}
	f, err := staging.OpenFile(ctx, root, record.File)
	if err != nil {
		return dispatch.Plan{}, ErrCustody
	}
	defer f.Close()
	dek := bytes.Clone(key)
	defer clear(dek)
	// Fixed capacity avoids leaving plaintext in abandoned buffer allocations.
	plain := bytes.NewBuffer(make([]byte, 0, maxPlanBytes))
	defer func() { clear(plain.Bytes()) }()
	err = staging.Open(ctx, f, plain, dek, binding(in, record.File.Name, record.PlanSHA256), maxPlanBytes)
	if err != nil || f.Close() != nil || !live(ctx) {
		return dispatch.Plan{}, ErrCustody
	}
	plan := dispatch.Plan{SchemaVersion: dispatch.TaskPlanVersion, CanonicalJSON: plain.Bytes(), SHA256: record.PlanSHA256}
	inner, err := dispatch.UnwrapTaskPlan(in, plan, innerVersion)
	clear(inner.CanonicalJSON)
	if err != nil || !live(ctx) {
		return dispatch.Plan{}, ErrCustody
	}
	plan.CanonicalJSON = bytes.Clone(plan.CanonicalJSON)
	return plan, nil
}
