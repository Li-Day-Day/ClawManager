package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"clawreef/internal/systembackup/control"
	"clawreef/internal/systembackup/host"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if e := run(ctx, os.Args[1:], os.Stdout); e != nil && ctx.Err() == nil {
		fmt.Fprintln(os.Stderr, "provider gateway unavailable; check pinned configuration and native adapter")
		os.Exit(1)
	}
}
func run(ctx context.Context, args []string, out io.Writer) error {
	f := flag.NewFlagSet("backup-provider-gateway", flag.ContinueOnError)
	f.SetOutput(io.Discard)
	path := f.String("config", "", "absolute mounted configuration path")
	check := f.Bool("check-config", false, "offline structure check; no credential reads or connections")
	if f.Parse(args) != nil || f.NArg() != 0 {
		return control.ErrInvalid
	}
	c, e := host.LoadProviderGateway(*path)
	if e != nil {
		return e
	}
	if *check {
		_, e = fmt.Fprintln(out, "provider gateway configuration structure valid; native adapter unverified; no connections opened")
		return e
	}
	return host.RunProviderGateway(ctx, c, nil)
}
