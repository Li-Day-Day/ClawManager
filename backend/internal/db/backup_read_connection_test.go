package db

import (
	"testing"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"github.com/upper/db/v4/adapter/mysql"
)

func TestSystemBackupReadPoolConfiguresEveryConnectionForUTC(t *testing.T) {
	options := systemBackupReadOptions()
	settings := mysql.ConnectionURL{Host: "127.0.0.1:3306", User: "synthetic", Database: "synthetic", Options: options}
	parsed, err := mysqlDriver.ParseDSN(settings.String())
	if err != nil || parsed.Loc.String() != "UTC" || parsed.Params["time_zone"] != "'+00:00'" {
		t.Fatal("backup reads/session issuance lost pooled UTC settings")
	}
	options["loc"] = "Local"
	if systemBackupReadOptions()["loc"] != "UTC" {
		t.Fatal("caller mutated another pool's options")
	}
}
