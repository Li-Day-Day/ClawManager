// system-backup-legacy-inventory reads schema and migration metadata only.
// It cannot execute DDL, import a copy, or admit a backup.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"clawreef/internal/db"
	"github.com/go-sql-driver/mysql"
)

func main() {
	dsnFile := flag.String("dsn-file", "", "private file containing the database DSN")
	appEnv := flag.Bool("app-env", false, "use this process's DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME")
	server := flag.String("expected-server-uuid", "", "pinned MySQL server UUID")
	name := flag.String("expected-database", "", "pinned database name")
	ledger := flag.String("expected-ledger-sha256", "", "pinned LF migration filename ledger SHA-256")
	budget := flag.Duration("timeout", 2*time.Minute, "read-only inventory deadline (maximum 5m)")
	flag.Parse()
	if flag.NArg() != 0 || (*dsnFile == "") == !*appEnv || *server == "" || *name == "" || *ledger == "" || *budget <= 0 || *budget > 5*time.Minute {
		fmt.Fprintln(os.Stderr, "legacy inventory requires one database source and exact bounded target pins")
		os.Exit(2)
	}
	ctx, cancel := context.WithTimeout(context.Background(), *budget)
	defer cancel()
	if run(ctx, *dsnFile, *appEnv, *server, *name, *ledger, os.Stdout) != nil {
		// Driver errors can contain connection details. The public failure is
		// deliberately generic and never echoes a DSN or database contents.
		fmt.Fprintln(os.Stderr, "legacy inventory rejected; no migration attempted")
		os.Exit(1)
	}
}

func run(ctx context.Context, path string, appEnv bool, server, name, ledger string, output io.Writer) error {
	if ctx == nil || output == nil || (path == "") == !appEnv {
		return errors.New("legacy inventory input invalid")
	}
	var config *mysql.Config
	var err error
	if appEnv {
		config, err = configFromAppEnv(name)
	} else {
		config, err = configFromFile(path, name)
	}
	if err != nil {
		return err
	}
	config.ParseTime = true
	config.Loc = time.UTC
	config.Timeout = 5 * time.Second
	config.ReadTimeout = 2 * time.Minute
	config.WriteTimeout = 2 * time.Minute
	config.Logger = &mysql.NopLogger{}
	if config.Params == nil {
		config.Params = map[string]string{}
	}
	config.Params["time_zone"] = "'+00:00'"
	connector, err := mysql.NewConnector(config)
	if err != nil {
		return err
	}
	pool := sql.OpenDB(connector)
	defer pool.Close()
	pool.SetMaxOpenConns(1)
	pool.SetMaxIdleConns(0)
	inventory, err := db.CaptureBackupLegacyInventory(ctx, pool, server, name, ledger)
	if err != nil {
		return err
	}
	encoded, err := db.EncodeBackupLegacyInventory(inventory)
	if err != nil {
		return err
	}
	_, err = output.Write(encoded)
	return err
}

func configFromAppEnv(name string) (*mysql.Config, error) {
	host, port, user, password, database := os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME")
	portNumber, err := strconv.Atoi(port)
	if host == "" || portNumber < 1 || portNumber > 65535 || user == "" || password == "" || database != name || err != nil {
		return nil, errors.New("legacy inventory app database configuration invalid")
	}
	config := mysql.NewConfig()
	config.Net, config.Addr, config.User, config.Passwd, config.DBName = "tcp", net.JoinHostPort(host, port), user, password, name
	return config, nil
}

func configFromFile(path, name string) (*mysql.Config, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > 8192 {
		return nil, errors.New("legacy inventory credential file invalid")
	}
	raw, err := io.ReadAll(io.LimitReader(f, 8193))
	if err != nil || len(raw) == 0 || len(raw) > 8192 {
		return nil, errors.New("legacy inventory credential invalid")
	}
	defer func() {
		for i := range raw {
			raw[i] = 0
		}
	}()
	config, err := mysql.ParseDSN(strings.TrimSpace(string(raw)))
	if err != nil || config.DBName != name || config.MultiStatements || config.AllowAllFiles {
		return nil, errors.New("legacy inventory DSN invalid")
	}
	return config, nil
}
