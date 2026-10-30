package publicadapter

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"testing"
)

func TestLinuxSourceAuthenticationUsesDiscoveryTransaction(t *testing.T) {
	for _, failAt := range []int{0, 1, 2} {
		t.Run(strconv.Itoa(failAt), func(t *testing.T) {
			f, _, _ := setup(t)
			sf := &sourceFixture{}
			p := linuxFixture(t, f, sf)
			calls := 0
			var original *sql.Tx
			p.cfg.VerifySource = func(ctx context.Context, tx *sql.Tx) error {
				calls++
				if original == nil {
					original = tx
				} else if original != tx {
					t.Fatal("authentication changed transaction")
				}
				if calls == 1 && sf.queries != 0 {
					t.Fatal("read before authentication")
				}
				if calls == 2 && sf.queries != 3 {
					t.Fatal("missing complete discovery before recheck")
				}
				if calls == failAt {
					return errors.New("revoked source identity")
				}
				return nil
			}
			inv, err := p.inventory(context.Background())
			if failAt == 0 {
				if err != nil || calls != 2 || len(inv.Instances) != 1 {
					t.Fatal("valid authenticated inventory rejected", err)
				}
			} else if err == nil || calls != failAt || len(inv.Users) != 0 || len(inv.Instances) != 0 || inv.Database != "" {
				t.Fatal("failed authentication exposed inventory")
			}
			if sf.writes != 0 || sf.rollbacks != 1 {
				t.Fatal("source transaction not rolled back")
			}
		})
	}
}
