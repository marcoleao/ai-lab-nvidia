package provision

import (
	"context"
	"os"
	"path/filepath"
	"time"
)

func validRuntimeTarget(v *RuntimeObservation, configuration string) bool {
	return v != nil && v.Owned && v.Configuration == configuration && (v.State == "RUNNING" || v.State == "STOPPED")
}

func saveRuntimeOperationIntent(o Options, v operationIntent) error {
	return atomicFile(filepath.Join(o.DataRoot, "runtime-operation.intent.json"), jsonBytes(v), 0600)
}

func (e *Engine) runRuntimeLifecycle(ctx context.Context, p OperationOptions, r *OperationResult, s operationSnapshot) (finalErr error) {
	if p.RuntimeMode != "owned" {
		return codedError("PLATFORM_RUNTIME_EXTERNAL_MANAGEMENT_REQUIRED")
	}
	current := s.engine
	if current == nil || !current.Owned || (current.State != "RUNNING" && current.State != "STOPPED") {
		return codedError("PLATFORM_RUNTIME_OWNERSHIP_NOT_CONFIRMED")
	}
	if current.State == "RUNNING" && !current.APIReady {
		return codedError("PLATFORM_RUNTIME_API_UNAVAILABLE")
	}
	if r.Pending != nil && p.Command != "start" {
		return codedError("PLATFORM_OPERATION_PENDING")
	}
	v, err := readOperationIntent(p.Options, "runtime-operation.intent.json")
	if err != nil {
		return err
	}
	replay := false
	if v.Schema != 0 {
		if v.Component != runtimeComponent || v.Command != p.Command || p.RequestID != "" && p.RequestID != v.MaintenanceID {
			return codedError("PLATFORM_OPERATION_PENDING")
		}
	} else {
		if p.RequestID != "" {
			v, err = readOperationIntent(p.Options, filepath.Join("operation-completed", p.RequestID+".json"))
			if err != nil {
				return err
			}
			if v.Schema != 0 {
				if v.Component != runtimeComponent || v.Command != p.Command || v.Unseal {
					return codedError("PLATFORM_OPERATION_REQUEST_CONFLICT")
				}
				replay = true
			}
		}
		if v.Schema == 0 {
			id := p.RequestID
			if id == "" {
				id, err = randomIdentity()
				if err != nil {
					return err
				}
			}
			v = operationIntent{Schema: 1, Installation: p.InstallationID, Profile: p.Profile, MaintenanceID: id, Command: p.Command, Component: runtimeComponent, Mode: "APPLYING", Targets: []operationTarget{{Component: runtimeComponent, ID: current.Configuration, BeforeRunning: current.State == "RUNNING", Stage: "PENDING"}}}
		}
	}
	target := &v.Targets[0]
	if r.Pending != nil && v.MaintenanceID == r.Pending.MaintenanceID {
		return codedError("PLATFORM_OPERATION_REQUEST_CONFLICT")
	}
	if !validRuntimeTarget(current, target.ID) {
		return codedError("PLATFORM_RUNTIME_CONFIGURATION_CHANGED")
	}
	wanted := p.Command != "stop"
	if replay && ((current.State == "RUNNING") != wanted || wanted && !current.APIReady) {
		return codedError("PLATFORM_OPERATION_COMPLETED_STATE_CHANGED")
	}
	// Stop/restart never drain workloads implicitly. Recheck at the actual stop
	// as well, because a process outside our lock may create a container meanwhile.
	if !replay && (p.Command == "stop" || p.Command == "restart") && current.State == "RUNNING" && (target.Stage == "PENDING" || target.Stage == "STOP_REQUESTED") && v.Mode == "APPLYING" {
		if err = e.requireRuntimeIdle(ctx, p.Options); err != nil {
			return err
		}
	}
	p.MaintenanceID = v.MaintenanceID
	r.MaintenanceID = v.MaintenanceID
	audit := recorder{p.ControlRoot, p.Options, e.Host, e.Now}
	step := Step{runtimeOperationCatalog[p.Command].Action, "ACCEPTED", "REQUESTED", runtimeProcessDigest(*current), "NOT_OBSERVED", "EXPLICIT_OWNED_RUNTIME_REQUEST"}
	if err = audit.append(step); err != nil {
		return err
	}
	r.effectsStarted = true
	terminal := false
	defer func() {
		if finalErr != nil && !terminal {
			audit.diagnostic(step.Action, finalErr)
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(finalErr)
			if auditErr := audit.append(step); auditErr != nil {
				finalErr = auditErr
			}
			r.Outcome, r.Phase = "UNKNOWN", "OBSERVED"
			if !replay {
				r.PendingRuntime = &v
			}
		}
	}()
	if replay {
		step.Outcome, step.Phase, step.After, step.Reason = "NO_CHANGE", "COMPLETED", step.Before, "COMPLETED_REQUEST_REPLAY"
		if err = audit.append(step); err != nil {
			return err
		}
		terminal = true
		r.Outcome = "NO_CHANGE"
		ready := current.APIReady
		r.ScopeReady = &ready
		return nil
	}
	if err = saveRuntimeOperationIntent(p.Options, v); err != nil {
		return err
	}
	applyErr := func() error {
		if v.Mode == "COMPENSATING" {
			return codedError("PLATFORM_OPERATION_PREVIOUS_ATTEMPT_FAILED")
		}
		if target.Stage == "DONE" {
			if (current.State == "RUNNING") != wanted {
				return codedError("PLATFORM_OPERATION_COMPLETED_STATE_CHANGED")
			}
			return nil
		}
		if p.Command == "restart" && target.BeforeRunning && (target.Stage == "PENDING" || target.Stage == "STOP_REQUESTED") {
			target.Stage = "STOP_REQUESTED"
			if err := saveRuntimeOperationIntent(p.Options, v); err != nil {
				return err
			}
			if err := e.setRuntimeRunning(ctx, p.Options, false, target.ID); err != nil {
				return err
			}
			target.Stage = "STOPPED"
			if err := saveRuntimeOperationIntent(p.Options, v); err != nil {
				return err
			}
		}
		target.Stage = "START_REQUESTED"
		if !wanted {
			target.Stage = "STOP_REQUESTED"
		}
		if err := saveRuntimeOperationIntent(p.Options, v); err != nil {
			return err
		}
		if err := e.setRuntimeRunning(ctx, p.Options, wanted, target.ID); err != nil {
			return err
		}
		target.Stage = "DONE"
		return saveRuntimeOperationIntent(p.Options, v)
	}()
	if applyErr != nil {
		audit.diagnostic(step.Action, applyErr)
		v.Mode = "COMPENSATING"
		if err = saveRuntimeOperationIntent(p.Options, v); err != nil {
			return err
		}
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Minute)
		defer cancel()
		before := e.observeRuntimeOperation(cleanupCtx, p.Options)
		compensation := Step{"PLATFORM_RUNTIME_STATE_RESTORED", "ACCEPTED", "REQUESTED", runtimeProcessDigest(before), "NOT_OBSERVED", "RUNTIME_RUNNING_FLAG_COMPENSATION"}
		if err = audit.append(compensation); err != nil {
			return err
		}
		restoreErr := e.setRuntimeRunning(cleanupCtx, p.Options, target.BeforeRunning, target.ID)
		after := e.observeRuntimeOperation(cleanupCtx, p.Options)
		compensation.After = runtimeProcessDigest(after)
		compensation.Outcome, compensation.Phase, compensation.Reason = "SUCCEEDED", "COMPLETED", "RUNTIME_RUNNING_FLAG_RESTORED_DATA_EFFECTS_PRESERVED"
		if restoreErr != nil {
			compensation.Outcome, compensation.Phase, compensation.Reason = "UNKNOWN", "OBSERVED", code(restoreErr)
			audit.diagnostic(compensation.Action, restoreErr)
		}
		if err = audit.append(compensation); err != nil {
			return err
		}
		step.Outcome, step.Phase, step.After, step.Reason = "FAILED", "COMPLETED", compensation.After, code(applyErr)
		if restoreErr != nil {
			step.Outcome, step.Phase, step.Reason = "UNKNOWN", "OBSERVED", code(restoreErr)
		}
		if err = audit.append(step); err != nil {
			return err
		}
		fillOperationSnapshot(r, e.observeOperations(cleanupCtx, p.Options))
		r.Outcome, r.Phase, r.Reason, r.ExitCode = step.Outcome, step.Phase, step.Reason, 1
		if restoreErr == nil {
			if err = os.Remove(filepath.Join(p.DataRoot, "runtime-operation.intent.json")); err != nil {
				return err
			}
			r.PendingRuntime = nil
		} else {
			r.PendingRuntime = &v
		}
		terminal = true
		return nil
	}
	after := e.observeRuntimeOperation(ctx, p.Options)
	if !validRuntimeTarget(&after, target.ID) || (after.State == "RUNNING") != wanted || wanted && !after.APIReady {
		return codedError("PLATFORM_RUNTIME_PROCESS_UNCONFIRMED")
	}
	step.After = runtimeProcessDigest(after)
	step.Outcome, step.Phase, step.Reason = "SUCCEEDED", "COMPLETED", "OWNED_RUNTIME_STATE_OBSERVED"
	if step.Before == step.After && p.Command != "restart" {
		step.Outcome = "NO_CHANGE"
	}
	v.Mode = "COMPLETED"
	if err = ownedDirectory(filepath.Join(p.DataRoot, "operation-completed"), p.InstallationID+":"+p.Profile+":"+digest([]byte(p.ControlRoot))+":completed-maintenance"); err != nil {
		return err
	}
	if err = writeOwned(filepath.Join(p.DataRoot, "operation-completed", v.MaintenanceID+".json"), jsonBytes(v)); err != nil {
		return err
	}
	if err = atomicFile(filepath.Join(p.DataRoot, "operation.last.json"), jsonBytes(v), 0600); err != nil {
		return err
	}
	if err = audit.append(step); err != nil {
		return err
	}
	if err = os.Remove(filepath.Join(p.DataRoot, "runtime-operation.intent.json")); err != nil {
		return err
	}
	terminal = true
	r.PendingRuntime = nil
	r.Outcome = step.Outcome
	s = e.observeOperations(ctx, p.Options)
	if wanted {
		e.diagnoseOperations(ctx, p.Options, &s)
		ready := operationAPIsReady(s)
		r.APIsReady = &ready
	}
	fillOperationSnapshot(r, s)
	ready := after.APIReady
	r.ScopeReady = &ready
	return nil
}
