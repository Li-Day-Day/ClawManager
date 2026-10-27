//go:build systembackup_integration

package db

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"clawreef/internal/config"
)

// Called only after TestDDatabaseInvariants verifies the isolated namespace,
// marker, server UUID and the deliberately non-UTC server default.
func testDBackupReadConnectionPools(t *testing.T, ctx context.Context, cfg config.DatabaseConfig) {
	t.Helper()
	global := Session
	business, err := connect(cfg)
	dMust(t, err)
	defer business.Close()
	core := business.Driver().(*sql.DB)
	var before int64
	dMust(t, core.QueryRowContext(ctx, "SELECT TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),NOW())").Scan(&before))
	if before != 8*3600 {
		t.Fatal("business pool did not inherit the negative-control server timezone")
	}
	reads, err := OpenSystemBackupRead(cfg)
	dMust(t, err)
	defer reads.Close()
	if Session != global {
		t.Fatal("backup read pool replaced the application's global session")
	}
	database := reads.Driver().(*sql.DB)
	connections := map[int64]bool{}
	for i := 0; i < 4; i++ {
		conn, err := database.Conn(ctx)
		dMust(t, err)
		defer conn.Close()
		var id, offset int64
		var zone string
		var now time.Time
		dMust(t, conn.QueryRowContext(ctx, "SELECT CONNECTION_ID(),@@session.time_zone,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),NOW()),NOW(6)").Scan(&id, &zone, &offset, &now))
		if connections[id] || zone != "+00:00" || offset != 0 || now.Location() != time.UTC {
			t.Fatal("a physical backup read/session connection lost UTC")
		}
		connections[id] = true
	}
	var after int64
	dMust(t, core.QueryRowContext(ctx, "SELECT TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),NOW())").Scan(&after))
	if after != before || Session != global {
		t.Fatal("backup pool modified the business pool or global session")
	}
}
