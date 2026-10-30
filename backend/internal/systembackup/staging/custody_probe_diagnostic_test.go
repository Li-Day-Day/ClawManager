package staging

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestProbeWorkerDiagnosticPreservesError(t *testing.T) {
	err := ProbeSealWorker(context.Background(), "relative", "invalid")
	if !errors.Is(err, ErrFile) || !strings.Contains(err.Error(), "step=validate-input") {
		t.Fatalf("missing actionable diagnostic or original error: %v", err)
	}
}
