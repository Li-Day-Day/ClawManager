package worker

import (
	"context"
	"errors"

	k "clawreef/internal/systembackupkms"
	w "clawreef/internal/systembackupwire"
)

type formalCaptureFailure struct {
	code  string
	cause error
}

func (e *formalCaptureFailure) Error() string { return "formal capture failed: " + e.code }
func (e *formalCaptureFailure) Unwrap() error { return e.cause }
func formalFailure(err error) error {
	switch {
	case errors.Is(err, k.ErrUnknown):
		return &formalCaptureFailure{"provider_outcome_unknown", k.ErrUnknown}
	case errors.Is(err, context.Canceled):
		return &formalCaptureFailure{"capture_canceled", context.Canceled}
	case errors.Is(err, context.DeadlineExceeded):
		return &formalCaptureFailure{"deadline_exceeded", context.DeadlineExceeded}
	case errors.Is(err, k.ErrPermission):
		return &formalCaptureFailure{"provider_permission_denied", k.ErrPermission}
	case errors.Is(err, ErrNotReady), errors.Is(err, w.ErrStreamAuthority):
		return &formalCaptureFailure{"capture_authority_unavailable", ErrNotReady}
	default:
		return &formalCaptureFailure{"formal_capture_failed", ErrExecution}
	}
}
