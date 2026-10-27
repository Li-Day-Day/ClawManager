package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"clawreef/internal/systembackup/control"
	"clawreef/internal/systembackup/host"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if e := run(ctx, os.Args[1:], os.Stdout); e != nil && ctx.Err() == nil {
		fmt.Fprintln(os.Stderr, "backup controller unavailable; check mounted configuration and dependency evidence")
		os.Exit(1)
	}
}
func run(ctx context.Context, args []string, out io.Writer) error {
	f := flag.NewFlagSet("backup-controller", flag.ContinueOnError)
	f.SetOutput(io.Discard)
	path := f.String("config", "", "absolute mounted configuration path")
	check := f.Bool("check-config", false, "validate configuration without network or writes")
	diagnose := f.Bool("diagnose", false, "emit redacted offline configuration and policy coverage report")
	materials := f.Bool("materials-template", false, "emit credential-free materials checklist without reading configuration")
	if f.Parse(args) != nil || f.NArg() != 0 {
		return control.ErrInvalid
	}
	if *materials {
		if *path != "" || *check || *diagnose {
			return control.ErrInvalid
		}
		encoder := json.NewEncoder(out)
		encoder.SetIndent("", "  ")
		return encoder.Encode(host.MaterialsTemplate())
	}
	if *diagnose {
		if *check {
			return control.ErrInvalid
		}
		raw, e := host.ReadFile(*path, 4<<20)
		if e != nil {
			return e
		}
		defer clear(raw)
		r := host.Diagnose(raw)
		encoder := json.NewEncoder(out)
		encoder.SetIndent("", "  ")
		if e = encoder.Encode(r); e != nil {
			return e
		}
		if !r.StructureValid {
			return control.ErrInvalid
		}
		return nil
	}
	cfg, e := host.Load(*path)
	if e != nil {
		return e
	}
	if *check {
		_, e = fmt.Fprintln(out, "configuration structure valid; no connections opened")
		return e
	}
	if runtime.GOOS != "linux" {
		return control.ErrNotReady
	}
	return host.Run(ctx, cfg, func(code string) { fmt.Fprintln(out, code) })
}
