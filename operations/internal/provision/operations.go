package provision

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"time"
)

func (e *Engine) RunOperation(ctx context.Context, p OperationOptions) (OperationResult, error) {
	spec, ok := operationCatalog[p.Command]
	if p.Component == runtimeComponent && p.Command != "status" && p.Command != "doctor" {
		spec, ok = runtimeOperationCatalog[p.Command]
	}
	r := OperationResult{SchemaVersion: 1, Command: p.Command, Action: spec.Action, Effect: spec.Effect, AuditPersistence: spec.Persistence, Outcome: "SUCCEEDED", Phase: "COMPLETED", Decision: "NOT_APPLICABLE", Coverage: "FOUNDATION_ONLY", Consistency: "SERIALIZED_MAINTENANCE_NOT_DISTRIBUTED_SNAPSHOT", Services: []ServiceObservation{}, Checks: []OperationCheck{}, Limitations: []string{"REMAINING_MIDDLEWARE_AI_AGENTS_APPLICATIONS_NOT_OBSERVED", "RUNTIME_LIFECYCLE_EXPLICIT_OWNED_SCOPE_ONLY", "NO_DATA_ROLLBACK_OR_BACKUP", "PUBLICATION_AND_HARDWARE_NOT_QUALIFIED"}}
	if !ok {
		return r, codedError("PLATFORM_OPERATION_COMMAND_INVALID")
	}
	if p.Component == "" {
		p.Component = "all"
	}
	if p.Tail == 0 {
		p.Tail = 200
	}
	r.Component = p.Component
	if !slices.Contains(operationComponents(), p.Component) || p.Tail < 1 || p.Tail > 5000 || p.RequestID != "" && !operationPattern.MatchString(p.RequestID) || p.Unseal && (!slices.Contains([]string{"start", "restart"}, p.Command) || !slices.Contains([]string{"all", "secret-store"}, p.Component)) || p.Command == "logs" && p.Component == "all" {
		return r, codedError("PLATFORM_OPERATION_ARGUMENTS_INVALID")
	}
	p.Options.Action = "plan"
	p.Options.Phase = "infrastructure"
	if err := e.defaults(&p.Options); err != nil {
		return r, err
	}
	r.InstallationID, r.Profile, r.OperationID, r.ObservedAt = p.InstallationID, p.Profile, p.OperationID, e.Now().UTC().Format(time.RFC3339Nano)
	if e.Host.OS == "linux" && !e.Host.Root {
		return r, codedError("PLATFORM_ROOT_REQUIRED")
	}
	if err := existingOperationRoots(e, p.Options); err != nil {
		if !os.IsNotExist(err) {
			return r, err
		}
		s := operationSnapshot{services: map[string]liveService{}, checks: []OperationCheck{{"container-runtime", "NOT_PREPARED", "PLATFORM_OPERATION_PREPARATION_REQUIRED", "run the solution installer"}}}
		s.engine = &RuntimeObservation{Mode: p.RuntimeMode, State: "NOT_PREPARED", Reason: "PLATFORM_RUNTIME_PREPARATION_REQUIRED", NextAction: "setup install --phase runtime"}
		for _, id := range operationServices {
			s.services[id] = liveService{observation: ServiceObservation{Component: id, State: "NOT_PREPARED", Reason: "PLATFORM_OPERATION_PREPARATION_REQUIRED", NextAction: "run the solution installer"}}
		}
		fillOperationSnapshot(&r, s)
		if p.Component == runtimeComponent {
			ready := false
			r.ScopeReady = &ready
		}
		if spec.Persistence != "none_read_only" {
			return r, codedError("PLATFORM_OPERATION_PREPARATION_REQUIRED")
		}
		if p.Command == "doctor" {
			value := false
			r.APIsReady = &value
			r.ExitCode = 2
		}
		return r, nil
	}
	var unlock func()
	var err error
	if spec.Persistence == "none_read_only" {
		unlock, err = readOperationLock(filepath.Join(p.ControlRoot, "installation.lock"))
	} else {
		unlock, err = lockFile(filepath.Join(p.ControlRoot, "installation.lock"))
	}
	if err != nil {
		if code(err) != "PLATFORM_PROVISION_BUSY" {
			return r, err
		}
		r.Outcome, r.Phase, r.Reason, r.ExitCode = "DEFERRED", "WAITING", "PLATFORM_PROVISION_BUSY", 42
		return r, nil
	}
	defer unlock()
	s := e.observeOperations(ctx, p.Options)
	if pending, err := readOperationIntent(p.Options, "operation.intent.json"); err != nil {
		return r, err
	} else if pending.Schema != 0 {
		r.Pending = &pending
	}
	if pending, err := readOperationIntent(p.Options, "runtime-operation.intent.json"); err != nil {
		return r, err
	} else if pending.Schema != 0 {
		if pending.Component != runtimeComponent {
			return r, codedError("PLATFORM_OPERATION_INTENT_INVALID")
		}
		r.PendingRuntime = &pending
	}
	if p.Command == "doctor" {
		e.diagnoseOperations(ctx, p.Options, &s)
		value := operationAPIsReady(s)
		r.APIsReady = &value
		if !value || r.Pending != nil || r.PendingRuntime != nil {
			r.ExitCode = 2
		}
		if p.Component == "all" && s.observability != nil && s.observability.Prepared && (s.observability.APIReady == nil || !*s.observability.APIReady) {
			r.ExitCode = 2
		}
		if p.Component == "all" && s.observability != nil && s.observability.Prepared && (s.observability.SignalsReady == nil || !*s.observability.SignalsReady) {
			r.ExitCode = 2
		}
		if isObservabilityService(p.Component) {
			ready := s.observability != nil && s.observability.APIReady != nil && *s.observability.APIReady && s.services[p.Component].observation.State == "RUNNING" && r.Pending == nil && r.PendingRuntime == nil
			if p.Component == "telemetry" {
				ready = ready && s.observability.SignalsReady != nil && *s.observability.SignalsReady
			}
			r.ScopeReady = &ready
			r.ExitCode = 2
			if ready {
				r.ExitCode = 0
			}
		}
		if s.hub != nil && s.hub.Prepared && p.Component == "all" && (s.hub.APIReady == nil || !*s.hub.APIReady) {
			r.ExitCode = 2
		}
		if p.Component == "homepage" {
			ready := s.hub != nil && s.hub.APIReady != nil && *s.hub.APIReady && r.Pending == nil && r.PendingRuntime == nil
			r.ScopeReady = &ready
			r.ExitCode = 2
			if ready {
				r.ExitCode = 0
			}
		}
		if p.Component == runtimeComponent {
			ready := s.engine != nil && s.engine.APIReady && s.engine.State == "RUNNING" && r.Pending == nil && r.PendingRuntime == nil
			for _, c := range s.checks {
				if c.Component == "administrative-audit" && c.State != "READY" {
					ready = false
				}
			}
			r.ScopeReady = &ready
			r.ExitCode = 2
			if ready {
				r.ExitCode = 0
			}
		}
	}
	fillOperationSnapshot(&r, s)
	if p.Component == runtimeComponent && p.Command == "status" {
		ready := s.engine != nil && s.engine.APIReady
		r.ScopeReady = &ready
	}
	if p.Command == "status" || p.Command == "doctor" {
		return r, nil
	}
	if r.PendingRuntime != nil && p.Component != runtimeComponent && p.Command != "logs" {
		return r, codedError("PLATFORM_OPERATION_PENDING")
	}
	if p.Component == runtimeComponent {
		err = e.runRuntimeLifecycle(ctx, p, &r, s)
	} else if p.Command == "logs" {
		err = e.exportOperationLogs(ctx, p, &r, s)
	} else {
		err = e.runLifecycle(ctx, p, &r, s)
	}
	if err != nil {
		r.Reason = code(err)
		r.ExitCode = 1
		if r.Outcome == "SUCCEEDED" {
			r.Outcome, r.Phase = "REJECTED", "COMPLETED"
			if r.effectsStarted {
				r.Outcome, r.Phase = "UNKNOWN", "OBSERVED"
			}
		}
		return r, err
	}
	return r, nil
}
