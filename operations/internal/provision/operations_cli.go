package provision

import (
	"ai-platform/operations/internal/platform"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"time"
)

func RunOperationCLI(command string, args []string, stdout, stderr io.Writer) int {
	p := OperationOptions{Command: command, Component: "all", Tail: 200}
	format := "text"
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&p.Root, "root", "", "")
	flags.StringVar(&p.Configuration, "config", "", "")
	flags.StringVar(&p.Profile, "profile", "", "")
	flags.StringVar(&p.InstallationID, "installation-id", "", "")
	flags.StringVar(&p.OperationID, "operation-id", "", "")
	flags.StringVar(&p.RequestID, "request-id", "", "")
	flags.StringVar(&p.ControlRoot, "control-root", "", "")
	flags.StringVar(&p.DataRoot, "data-root", "", "")
	flags.StringVar(&p.RuntimeMode, "runtime-mode", "auto", "")
	flags.StringVar(&p.Pool, "runtime-pool", "10.248.0.0/16", "")
	flags.StringVar(&p.Component, "component", "all", "")
	flags.StringVar(&format, "format", "text", "")
	flags.IntVar(&p.Tail, "tail", 200, "")
	flags.BoolVar(&p.Unseal, "unseal", false, "")
	if err := flags.Parse(args); err == flag.ErrHelp {
		fmt.Fprintln(stdout, "platform status|doctor|start|stop|restart|logs [--component all|container-runtime|identity-db|identity|secret-store|edge|origin-tls|metrics|logs|telemetry|grafana|gitlab|gitlab-web|gitlab-runner|homepage] [--format text|json] [--request-id <id>] [--unseal: service start/restart only] [--tail 200: service logs]\nAll maintains prepared foundation, observability and Homepage services. Runtime lifecycle requires explicit container-runtime scope. Logs are exported privately, never printed.")
		return 0
	} else if err != nil || flags.NArg() != 0 || format != "text" && format != "json" {
		return emitOperationError(stdout, command, "PLATFORM_OPERATION_ARGUMENTS_INVALID")
	}
	if p.Root == "" {
		var err error
		p.Root, err = platform.ResolveRoot()
		if err != nil {
			return emitOperationError(stdout, command, "PLATFORM_OPERATION_CONFIGURATION_UNAVAILABLE")
		}
	}
	host := observeHost()
	if p.Profile == "" {
		if host.OS == "darwin" {
			p.Profile = "macos-m3-max"
		} else if host.Arch == "arm64" {
			p.Profile = "dell-gb10"
		} else {
			p.Profile = "precision-windows"
		}
	}
	definition, err := platform.Load(platform.Options{Root: p.Root, Configuration: p.Configuration, Profile: p.Profile})
	if err != nil {
		return emitOperationError(stdout, command, "PLATFORM_OPERATION_CONFIGURATION_INVALID")
	}
	if p.InstallationID != "" && p.InstallationID != definition.Configuration.InstallationID {
		return emitOperationError(stdout, command, "PLATFORM_IDENTITY_INVALID")
	}
	bindSetupDefinition(&p.Options, definition)
	e := Engine{Host: host}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	r, err := e.RunOperation(ctx, p)
	if err != nil {
		if r.Outcome == "SUCCEEDED" {
			r.Outcome, r.Phase = "REJECTED", "COMPLETED"
		}
		r.Reason = code(err)
		r.ExitCode = 1
	}
	if format == "json" {
		if err = json.NewEncoder(stdout).Encode(r); err != nil {
			return 1
		}
	} else {
		fmt.Fprintf(stdout, "FundaÃ§Ã£o: %s | perfil: %s | comando: %s\nResultado: %s / %s | cobertura: somente fundaÃ§Ã£o\n", r.InstallationID, r.Profile, r.Command, r.Outcome, r.Phase)
		if r.Runtime != nil {
			fmt.Fprintf(stdout, "Runtime (%s / %s): %s | API pronta=%t\n", r.Runtime.Mode, r.Runtime.Controller, r.Runtime.State, r.Runtime.APIReady)
			if r.Runtime.Reason != "" {
				fmt.Fprintln(stdout, "  Motivo:", r.Runtime.Reason)
			}
			if r.Runtime.NextAction != "" {
				fmt.Fprintln(stdout, "  PrÃ³ximo passo:", r.Runtime.NextAction)
			}
		}
		for _, s := range r.Services {
			fmt.Fprintf(stdout, "%s: %s", s.Component, s.State)
			if s.Reason != "" {
				fmt.Fprintf(stdout, " [%s]", s.Reason)
			}
			fmt.Fprintln(stdout)
			if s.NextAction != "" {
				fmt.Fprintln(stdout, "  PrÃ³ximo passo:", s.NextAction)
			}
		}
		if r.Observability != nil {
			fmt.Fprintln(stdout, "Observabilidade:", r.Observability.State)
			for _, s := range r.Observability.Services {
				fmt.Fprintf(stdout, "  %s: %s [%s]\n", s.Component, s.State, s.Reason)
			}
			if r.Observability.Endpoint != "" {
				fmt.Fprintln(stdout, "  Grafana:", r.Observability.Endpoint)
			}
			for _, signal := range r.Observability.Signals {
				fmt.Fprintf(stdout, "  Sinal %s: %s [%s]", signal.Signal, signal.State, signal.Reason)
				if signal.AgeSeconds != nil {
					fmt.Fprintf(stdout, " | idade da amostra=%.0fs", *signal.AgeSeconds)
				}
				fmt.Fprintln(stdout)
			}
		}
		if r.Hub != nil {
			fmt.Fprintf(stdout, "Homepage: %s | %s\n", r.Hub.State, r.Hub.Endpoint)
		}
		for _, c := range r.Checks {
			fmt.Fprintf(stdout, "%s: %s [%s]\n", c.Component, c.State, c.Reason)
			if c.NextAction != "" {
				fmt.Fprintln(stdout, "  PrÃ³ximo passo:", c.NextAction)
			}
		}
		if r.Reason != "" {
			fmt.Fprintln(stdout, "Motivo:", r.Reason)
		}
		for _, pending := range []*operationIntent{r.PendingRuntime, r.Pending} {
			if pending != nil {
				unseal := ""
				if pending.Unseal {
					unseal = " --unseal"
				}
				fmt.Fprintf(stdout, "ManutenÃ§Ã£o pendente: %s | %s --component %s --request-id %s%s | repetir a mesma aÃ§Ã£o para retomar.\n", pending.MaintenanceID, pending.Command, pending.Component, pending.MaintenanceID, unseal)
			}
		}
		if r.Export != nil {
			fmt.Fprintf(stdout, "Log privado: %s | %d bytes | truncado=%t | janela limitada; histÃ³rico completo nÃ£o declarado.\n", r.Export.RelativePath, r.Export.CapturedBytes, r.Export.Truncated)
		}
		fmt.Fprintln(stdout, "CorrelaÃ§Ã£o:", r.OperationID)
	}
	return r.ExitCode
}
func emitOperationError(out io.Writer, command, reason string) int {
	_ = json.NewEncoder(out).Encode(OperationResult{SchemaVersion: 1, Command: command, Outcome: "REJECTED", Phase: "COMPLETED", Decision: "NOT_APPLICABLE", Reason: reason, ExitCode: 1, Coverage: "FOUNDATION_ONLY"})
	return 1
}
