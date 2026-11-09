package platform

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const help = `platform <validate|inventory|plan|publication> [options]

Runtime operations: status, doctor, start, stop, restart, logs.
Use platform <operation> --help. These have separate ownership/privilege contracts.

Read-only foundation configuration queries. No deployment or cleanup is performed.

  --profile <id>      precision-windows, macos-m3-max, dell-gb10
  --installation-id <id>  reject configuration belonging to another installation
  --stack <id>        dependency closure of a declared stack
  --component <id>    dependency closure of one component
  --root <path>       repository or configuration bundle root
  --config <path>     installation JSON, relative to root or absolute
  --previous-config <path>  previous installation JSON for publication comparison
  --format <format>  text (default) or json

inventory without a scope includes the entire declared catalog.
publication without a scope reports all public candidates and private exclusions.
publication computes DNS/TLS requirements, path policy and migration impact only.
plan without a scope uses default_stack from environments/platform.json.
--stack and --component are mutually exclusive.
`

func locateRoot() (string, error) {
	current, err := os.Getwd()
	if err != nil {
		return "", invalid("ROOT_UNAVAILABLE")
	}
	starts := []string{current}
	if executable, err := os.Executable(); err == nil {
		starts = append(starts, filepath.Dir(executable))
	}
	for _, start := range starts {
		for candidate := start; ; candidate = filepath.Dir(candidate) {
			catalog, catalogErr := os.Stat(filepath.Join(candidate, "operations", "catalog.json"))
			config, configErr := os.Stat(filepath.Join(candidate, "environments", "platform.json"))
			if catalogErr == nil && configErr == nil && catalog.Mode().IsRegular() && config.Mode().IsRegular() {
				return candidate, nil
			}
			if parent := filepath.Dir(candidate); parent == candidate {
				break
			}
		}
	}
	return "", invalid("ROOT_NOT_FOUND")
}

func ResolveRoot() (string, error) { return locateRoot() }

func Run(arguments []string, stdout, stderr io.Writer) int {
	if len(arguments) == 0 || arguments[0] == "--help" || arguments[0] == "-h" {
		fmt.Fprint(stdout, help)
		return 0
	}
	options := Options{Command: arguments[0]}
	format := "text"
	flags := flag.NewFlagSet("platform", flag.ContinueOnError)
	flags.SetOutput(io.Discard) // Flag errors may include arbitrary caller input.
	flags.StringVar(&options.Profile, "profile", "", "target profile")
	flags.StringVar(&options.InstallationID, "installation-id", "", "expected installation identity")
	flags.StringVar(&options.Stack, "stack", "", "stack")
	flags.StringVar(&options.Component, "component", "", "component")
	flags.StringVar(&options.Root, "root", "", "configuration root")
	flags.StringVar(&options.Configuration, "config", "", "installation configuration")
	flags.StringVar(&options.PreviousConfiguration, "previous-config", "", "previous publication configuration")
	flags.StringVar(&format, "format", "text", "output format")
	parseErr := flags.Parse(arguments[1:])
	if parseErr == flag.ErrHelp {
		fmt.Fprint(stdout, help)
		return 0
	}
	var queryErr error
	if actions[options.Command] == "" {
		options.Command = "unknown"
		queryErr = invalid("COMMAND_UNKNOWN")
	} else if parseErr != nil || flags.NArg() != 0 || (format != "text" && format != "json") {
		queryErr = invalid("ARGUMENTS_INVALID")
	}
	if queryErr == nil && options.Root == "" {
		options.Root, queryErr = locateRoot()
	}
	var result Result
	if queryErr == nil {
		result, queryErr = Query(options)
	}
	if queryErr != nil {
		result = envelope(options.Command)
		result.Outcome, result.ErrorCode = "REJECTED", errorCode(queryErr)
		if result.ErrorCode == "PLATFORM_QUERY_FAILED" {
			result.Outcome = "FAILED"
		}
		if format == "json" {
			_ = json.NewEncoder(stdout).Encode(result)
		} else {
			fmt.Fprintf(stderr, "Platform query rejected: %s. See operations/README.md.\n", result.ErrorCode)
		}
		return 1
	}
	if format == "json" {
		encoder := json.NewEncoder(stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(result); err != nil {
			return 1
		}
	} else if err := writeText(stdout, result); err != nil {
		return 1
	}
	return 0
}

func writeText(writer io.Writer, result Result) error {
	if _, err := fmt.Fprintf(writer, "Platform: %s | Profile: %s | Query: %s\nConfiguration valid. Installation readiness: not verified. Runtime changes: none.\nTarget: %s/%s, %s, %s\n", result.InstallationID, result.Profile.ID, result.Command, result.Profile.HostOS, result.Profile.Architecture, result.Profile.Accelerator, result.Profile.ContainerRuntime); err != nil {
		return err
	}
	for _, warning := range result.Warnings {
		if _, err := fmt.Fprintf(writer, "Warning: %s\n", warning); err != nil {
			return err
		}
	}
	if result.Command == "plan" {
		for _, step := range result.Steps {
			if _, err := fmt.Fprintf(writer, "%2d. %s\n", step.Order, step.ComponentID); err != nil {
				return err
			}
		}
		if _, err := fmt.Fprintln(writer, "Implementation dependency plan only; provisioning executors are not available in this milestone."); err != nil {
			return err
		}
	} else if result.Command == "publication" {
		p := result.Publication
		if _, err := fmt.Fprintf(writer, "Publication: %s | mode=%s | external readiness: not verified | execution: unavailable\n", p.State, p.Mode); err != nil {
			return err
		}
		for _, route := range p.Routes {
			origin := "address not configured"
			if route.CandidateOrigin != nil {
				origin = *route.CandidateOrigin
			}
			if _, err := fmt.Fprintf(writer, "Candidate %s: %s [%s]; policy=%s; default=%s\n", route.ComponentID, origin, route.AddressStatus, route.PolicyStatus, route.DefaultAction); err != nil {
				return err
			}
		}
		for _, excluded := range p.Excluded {
			if _, err := fmt.Fprintf(writer, "Excluded %s: %s\n", excluded.ComponentID, excluded.Reason); err != nil {
				return err
			}
		}
		for _, requirement := range p.Requirements {
			if _, err := fmt.Fprintf(writer, "Requirement %s: %s\n", requirement.Code, requirement.Status); err != nil {
				return err
			}
		}
		for _, change := range p.Changes {
			before, after := "(absent)", "(absent)"
			if change.Before != nil {
				before = *change.Before
			}
			if change.After != nil {
				after = *change.After
			}
			if _, err := fmt.Fprintf(writer, "Change %s.%s: %s -> %s | runtime migration=%t\n", change.ComponentID, change.Field, before, after, change.RuntimeMigrationRequired); err != nil {
				return err
			}
		}
		if len(p.ImpactedOutsideScope) > 0 {
			if _, err := fmt.Fprintf(writer, "Identity consumers outside requested scope: %v\n", p.ImpactedOutsideScope); err != nil {
				return err
			}
		}
		for _, task := range p.Reconciliation {
			if _, err := fmt.Fprintf(writer, "%d. %s [execution unavailable]\n", task.Order, task.Code); err != nil {
				return err
			}
		}
	} else if result.Command == "inventory" {
		for _, component := range result.Components {
			if _, err := fmt.Fprintf(writer, "%s [%s] %s; runtime=not_observed\n", component.ID, component.Layer, component.SourceAdoption); err != nil {
				return err
			}
		}
		if _, err := fmt.Fprintf(writer, "Declared components in scope: %d/%d. This is not a running-service inventory.\n", result.SelectedCount, result.CatalogCount); err != nil {
			return err
		}
	}
	_, err := fmt.Fprintf(writer, "Correlation: %s | Configuration digest: %s\n", result.OperationID, result.ConfigurationDigest)
	return err
}
