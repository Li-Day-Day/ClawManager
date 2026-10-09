//go:build linux

package systembackupsecurity

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"syscall"
)

// collectRegistrationCapacity must run beside MySQL with access to its real
// data volume; auto.cnf must match the live SQL server identity.
func collectRegistrationCapacity(ctx context.Context, db *sql.Conn, expected CapacityCollectorConfig) (CapacityReport, error) {
	var r CapacityReport
	var datadir string
	if db.QueryRowContext(ctx, "SELECT @@server_uuid,DATABASE(),@@datadir").Scan(&r.ServerUUID, &r.Database, &datadir) != nil || !filepath.IsAbs(datadir) || r.ServerUUID != expected.ServerUUID || r.Database != expected.Database || filepath.Clean(datadir) != expected.DataDir {
		return r, ErrRegistrationUnavailable
	}
	raw, err := boundedFile(filepath.Join(datadir, "auto.cnf"), 4096)
	if err != nil {
		return r, err
	}
	found := false
	for _, line := range strings.Split(string(raw), "\n") {
		if strings.TrimSpace(line) == "server-uuid="+r.ServerUUID {
			found = true
		}
	}
	if !found {
		return r, ErrRegistrationUnavailable
	}
	var stat syscall.Statfs_t
	if syscall.Statfs(datadir, &stat) != nil || stat.Bsize <= 0 {
		return r, ErrRegistrationUnavailable
	}
	if uint64(stat.Bavail) > uint64(1<<62)/uint64(stat.Bsize) {
		return r, ErrRegistrationUnavailable
	}
	r.AvailableBytes = int64(stat.Bavail) * stat.Bsize
	var tableCount int
	err = db.QueryRowContext(ctx, `SELECT COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0),COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND (LEFT(TABLE_NAME,14)='system_backup_' OR LEFT(TABLE_NAME,15)='system_restore_' OR TABLE_NAME='audit_logs')`).Scan(&r.AllocatedBytes, &tableCount)
	if err != nil || tableCount != len(expected.Tables) || r.AllocatedBytes < 0 || db.QueryRowContext(ctx, "SELECT UTC_TIMESTAMP(6)").Scan(&r.ObservedAt) != nil {
		return r, ErrRegistrationUnavailable
	}
	return r, nil
}
