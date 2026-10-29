// Historical command name retained only to fail safely on stale deployments.
// The sole production controller is system-backup-v2-controller/public-v1.
package main

import (
	"log"
	"os"
)

func main() {
	log.Print("legacy controller disabled: use system-backup-v2-controller with SYSTEM_BACKUP_EXECUTION_PROTOCOL=public-v1")
	os.Exit(1)
}
