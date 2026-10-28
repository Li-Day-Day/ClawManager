package main

import (
	"database/sql"
	"os"
	"time"

	"clawreef/internal/middleware"
	"clawreef/internal/systembackupapi"
	"clawreef/internal/systembackupread"
	"clawreef/internal/systembackupsecurity"
	"github.com/gin-gonic/gin"
)

// This is the only production task application composition point. The existing
// read authorizer is intentionally not reused as system_backup.operate authority.
// Supply reviewed deployment owners through this build-time composition seam.
// SQL persistence and complete DTO composition are concrete implementations;
// the missing owner contract/admission/provider implementations are explicit.
type systemBackupTaskOwners struct {
	Admission    systembackupapi.TaskAdmission
	CurrentFacts systembackupread.CurrentTaskFacts
	Manifest     systembackupread.ManifestReader
}

// A deployment composition file may bind real owners, as with the bootstrap
// owner link. HTTP/env JSON cannot inject callbacks or approve a missing owner.
// The repository currently has no B/C production link: leave it unavailable.
var systemBackupTaskOwnerLink func(*sql.DB) (systemBackupTaskOwners, error)

func linkedSystemBackupTaskApplication(db *sql.DB, sessions *systembackupsecurity.SQLLoginSessions) systembackupapi.TaskApplication {
	if db == nil || sessions == nil || systemBackupTaskOwnerLink == nil {
		return nil
	}
	owners, err := systemBackupTaskOwnerLink(db)
	if err != nil {
		return nil
	}
	application, err := composeOwnedSystemBackupTaskApplication(db, sessions, owners, os.Getenv)
	if err != nil {
		return nil
	}
	return application
}

func composeOwnedSystemBackupTaskApplication(db *sql.DB, sessions *systembackupsecurity.SQLLoginSessions, owners systemBackupTaskOwners, getenv func(string) string) (systembackupapi.TaskApplication, error) {
	if getenv == nil {
		return nil, &systembackupapi.Error{Code: "not_ready"}
	}
	var enabled bool
	switch getenv("SYSTEM_BACKUP_ENABLED") {
	case "", "false":
	case "true":
		enabled = true
	default:
		return nil, &systembackupapi.Error{Code: "not_ready"}
	}
	writer, err := systembackupapi.NewSQLTaskWriter(systembackupapi.NewTaskRequestContract(), owners.Admission, enabled)
	if err != nil {
		return nil, err
	}
	details, err := systembackupapi.NewSQLTaskDetails(db, owners.CurrentFacts, owners.Manifest)
	if err != nil {
		return nil, err
	}
	return composeSystemBackupTaskApplication(db, sessions, writer, details, getenv)
}

func composeSystemBackupTaskApplication(db *sql.DB, sessions *systembackupsecurity.SQLLoginSessions,
	writer systembackupapi.TaskWriter, details systembackupapi.TaskDetails, getenv func(string) string) (systembackupapi.TaskApplication, error) {
	if writer == nil || details == nil || getenv == nil {
		return nil, &systembackupapi.Error{Code: "not_ready"}
	}
	// A's action and read scopes share the real login/refresh recorder and
	// existing pins; operate authority is never inferred from read authority.
	actions, err := systembackupsecurity.LoadSystemBackupActionAuthorizer(sessions, getenv("SYSTEM_BACKUP_READ_PINS_PATH"), getenv("SYSTEM_BACKUP_READ_PINS_SHA256"))
	if err != nil {
		return nil, err
	}
	reads, err := systembackupsecurity.LoadSystemBackupReadAuthorizer(sessions, getenv("SYSTEM_BACKUP_READ_PINS_PATH"), getenv("SYSTEM_BACKUP_READ_PINS_SHA256"))
	if err != nil {
		return nil, err
	}
	return systembackupapi.NewSQLApplication(db, actions, reads, writer, details, 30*time.Second)
}

func registerBackupTaskMutations(admin *gin.RouterGroup, handler *systembackupapi.Handler) {
	admin.POST("/system-backups", func(c *gin.Context) {
		handler.Create(c.Writer, c.Request, systembackupread.BackupTask, middleware.SystemBackupRequestID(c))
	})
	admin.POST("/system-backup-preflights", func(c *gin.Context) {
		handler.Create(c.Writer, c.Request, systembackupread.PreflightTask, middleware.SystemBackupRequestID(c))
	})
}
