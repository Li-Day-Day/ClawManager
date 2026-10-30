package systembackupexecution

import (
	"context"
	"errors"
	"testing"
)

func TestDeploymentRecoveryDoesNotRequireForwardPrivileges(t *testing.T) {
	denied := errors.New("capture privileges absent")
	for _, forward := range []bool{false, true} {
		for _, revoked := range []bool{false, true} {
			captureCalls := 0
			err := checkDeploymentGrantMode(context.Background(), forward,
				func(context.Context) error {
					if revoked {
						return denied
					}
					return nil
				},
				func(context.Context) error { captureCalls++; return denied })
			if (err != nil) != (revoked || forward) {
				t.Fatalf("forward=%v revoked=%v: %v", forward, revoked, err)
			}
			want := 0
			if forward && !revoked {
				want = 1
			}
			if captureCalls != want {
				t.Fatal("capture authority used during recovery or after revocation")
			}
		}
	}
}
