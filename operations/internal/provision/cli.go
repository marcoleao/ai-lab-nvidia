package provision

import (
	"ai-platform/operations/internal/platform"
	"context"
	"encoding/json"
	"flag"
	"io"
	"time"
)

// RunCLI is a distinct command branch; it does not expand the side effects of
// validate/inventory/plan. Plan never creates a control directory or subprocess.
func RunCLI(arguments []string, stdout, stderr io.Writer) int {
	o := Options{}
	flags := flag.NewFlagSet("setup", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&o.Action, "action", "plan", "")
	flags.StringVar(&o.Phase, "phase", "all", "")
	flags.StringVar(&o.Root, "root", "", "")
	flags.StringVar(&o.Configuration, "config", "", "")
	flags.StringVar(&o.Profile, "profile", "", "")
	flags.StringVar(&o.InstallationID, "installation-id", "", "")
	flags.StringVar(&o.OperationID, "operation-id", "", "")
	flags.StringVar(&o.ControlRoot, "control-root", "", "")
	flags.StringVar(&o.DataRoot, "data-root", "", "")
	flags.StringVar(&o.Pool, "runtime-pool", "10.248.0.0/16", "")
	flags.StringVar(&o.RuntimeMode, "runtime-mode", "auto", "")
	flags.StringVar(&o.OriginRevision, "origin-revision", "", "")
	flags.IntVar(&o.MemoryGiB, "memory-gib", 16, "")
	flags.IntVar(&o.CPUs, "cpus", 4, "")
	flags.IntVar(&o.DiskGiB, "disk-gib", 80, "")
	if err := flags.Parse(arguments); err == flag.ErrHelp {
		_, _ = io.WriteString(stdout, "platform setup --action plan|install --phase host|runtime|network|access|origin|ingress|observability|hub|infrastructure|all --profile <id> [--root <bundle>] [--config <json>] [--runtime-mode auto|owned|external] [--runtime-pool <private CIDR>] [--memory-gib 16 --cpus 4 --disk-gib 80] [--origin-revision <id>: origin phase only]\nExplicit preparation only. Observability is an explicit local phase. Installation readiness, public access and GPU container qualification remain false.\n")
		return 0
	} else if err != nil || flags.NArg() != 0 {
		return emitError(stdout, "PLATFORM_SETUP_ARGUMENTS_INVALID")
	}
	definition, err := platform.Load(platform.Options{Root: o.Root, Configuration: o.Configuration, Profile: o.Profile})
	if err != nil {
		return emitError(stdout, "PLATFORM_SETUP_CONFIGURATION_INVALID")
	}
	if o.InstallationID != "" && o.InstallationID != definition.Configuration.InstallationID {
		return emitError(stdout, "PLATFORM_IDENTITY_INVALID")
	}
	bindSetupDefinition(&o, definition)
	engine := Engine{Host: observeHost()}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()
	result, err := engine.Run(ctx, o)
	if err != nil {
		result.Outcome, result.Phase, result.Reason, result.ExitCode = "REJECTED", "COMPLETED", code(err), 1
		if result.effectsStarted {
			result.Outcome, result.Phase = "UNKNOWN", "OBSERVED"
		}
	}
	if err = json.NewEncoder(stdout).Encode(result); err != nil {
		return 1
	}
	return result.ExitCode
}

func bindSetupDefinition(o *Options, definition *platform.Definition) {
	o.HubPort = 3300
	if port := definition.ByID["homepage"].LocalPort; port != nil {
		o.HubPort = *port
	}
	if port, ok := definition.Configuration.Ports["homepage"]; ok {
		o.HubPort = port
	}
	o.GrafanaPort = 3001
	if port := definition.ByID["grafana"].LocalPort; port != nil {
		o.GrafanaPort = *port
	}
	if port, ok := definition.Configuration.Ports["grafana"]; ok {
		o.GrafanaPort = port
	}
	o.InstallationID = definition.Configuration.InstallationID
	o.Profile = definition.Profile.ID
	o.DefinitionDigest = definition.Digest
	o.PublicationMode = definition.Configuration.Publication.Mode
	o.Ingress = definition.Configuration.Publication.Ingress
	o.IngressHostname = platform.CandidateIngressHostname(definition.Configuration.Publication)
	o.IdentityPort = 8082
	o.SecretStorePort = 8200
	if p := definition.ByID["identity"].LocalPort; p != nil {
		o.IdentityPort = *p
	}
	if p := definition.ByID["secret-store"].LocalPort; p != nil {
		o.SecretStorePort = *p
	}
	if port, ok := definition.Configuration.Ports["identity"]; ok {
		o.IdentityPort = port
	}
	if port, ok := definition.Configuration.Ports["secret-store"]; ok {
		o.SecretStorePort = port
	}
	o.OriginPort = 9443
	if p := definition.ByID["origin-tls"].LocalPort; p != nil {
		o.OriginPort = *p
	}
	if port, ok := definition.Configuration.Ports["origin-tls"]; ok {
		o.OriginPort = port
	}
}
func emitError(out io.Writer, reason string) int {
	_ = json.NewEncoder(out).Encode(Result{SchemaVersion: 1, Outcome: "REJECTED", Phase: "COMPLETED", Decision: "NOT_APPLICABLE", Reason: reason, ExitCode: 1, Steps: []Step{}})
	return 1
}
