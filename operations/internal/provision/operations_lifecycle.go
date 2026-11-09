package provision

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"time"
)

type operationTarget struct {
	Component       string `json:"component"`
	ID              string `json:"container_id"`
	BeforeRunning   bool   `json:"before_running"`
	BeforeStartedAt string `json:"before_started_at,omitempty"`
	Stage           string `json:"stage"`
}
type operationIntent struct {
	Schema        int               `json:"schema_version"`
	Installation  string            `json:"installation_id"`
	Profile       string            `json:"profile"`
	MaintenanceID string            `json:"maintenance_id"`
	Command       string            `json:"command"`
	Component     string            `json:"component"`
	Unseal        bool              `json:"unseal_requested"`
	Mode          string            `json:"mode"`
	Targets       []operationTarget `json:"targets"`
}

func readOperationIntent(o Options, name string) (operationIntent, error) {
	var v operationIntent
	if err := networkControl(o, name, &v); err != nil {
		return v, err
	}
	if v.Schema == 0 {
		return v, nil
	}
	if v.Schema != 1 || v.Installation != o.InstallationID || v.Profile != o.Profile || !operationPattern.MatchString(v.MaintenanceID) || !slices.Contains([]string{"start", "stop", "restart"}, v.Command) || !slices.Contains(operationComponents(), v.Component) || !slices.Contains([]string{"APPLYING", "COMPENSATING", "COMPLETED"}, v.Mode) || len(v.Targets) == 0 || len(v.Targets) > len(managedOperationServices()) {
		return v, codedError("PLATFORM_OPERATION_INTENT_INVALID")
	}
	group := v.Component == "gitlab"
	if v.Component != "all" && !group && (len(v.Targets) != 1 || v.Targets[0].Component != v.Component) || group && (len(v.Targets) != 2 || !isGitlabService(v.Targets[0].Component) || !isGitlabService(v.Targets[1].Component)) || v.Unseal && (v.Command == "stop" || v.Component != "all" && v.Component != "secret-store") {
		return v, codedError("PLATFORM_OPERATION_INTENT_INVALID")
	}
	seen := map[string]bool{}
	for _, target := range v.Targets {
		if !slices.Contains(append([]string{runtimeComponent}, managedOperationServices()...), target.Component) || v.Component == "all" && target.Component == runtimeComponent || seen[target.Component] || !hashPattern.MatchString(target.ID) || !slices.Contains([]string{"PENDING", "STOP_REQUESTED", "STOPPED", "START_REQUESTED", "DONE"}, target.Stage) {
			return v, codedError("PLATFORM_OPERATION_INTENT_INVALID")
		}
		seen[target.Component] = true
		if target.BeforeStartedAt != "" {
			if _, err := time.Parse(time.RFC3339Nano, target.BeforeStartedAt); err != nil {
				return v, codedError("PLATFORM_OPERATION_INTENT_INVALID")
			}
		}
		if v.Mode == "COMPLETED" && target.Stage != "DONE" {
			return v, codedError("PLATFORM_OPERATION_INTENT_INVALID")
		}
	}
	return v, nil
}
func saveOperationIntent(o Options, v operationIntent) error {
	return atomicFile(filepath.Join(o.DataRoot, "operation.intent.json"), jsonBytes(v), 0600)
}

func (e *Engine) operationService(ctx context.Context, o Options, id, wantedID string) (*accessContainer, error) {
	var c *accessContainer
	var err error
	if id == ciRunnerComponent {
		c, err = e.ciRunnerOperationService(ctx, o, id)
	} else if isGitlabService(id) {
		c, err = e.gitlabOperationService(ctx, o, id)
	} else if id == "homepage" {
		c, err = e.hubOperationService(ctx, o)
	} else if isObservabilityService(id) {
		c, err = e.observabilityService(ctx, o, id)
	} else if id == "origin-tls" {
		m, readErr := e.readOriginMaterial(o, false)
		if readErr != nil {
			return nil, readErr
		}
		var record originRecord
		if err = networkControl(o, "origin.resources.json", &record); err != nil {
			return nil, err
		}
		expected, _, _ := e.originSpec(o, m)
		if record.Active.Spec != expected.Spec || record.Active.Generation != m.Generation {
			return nil, codedError("PLATFORM_ORIGIN_ACTIVE_MATERIAL_MISMATCH")
		}
		c, err = e.originContainer(ctx, o, record.Active, m)
	} else {
		seed, readErr := readAccessSeed(o)
		if readErr != nil {
			return nil, readErr
		}
		spec := e.accessSpec(o, seed)
		var record accessRecord
		if err = networkControl(o, "access.resources.json", &record); err != nil {
			return nil, err
		}
		if record.Spec != spec.Digest {
			return nil, codedError("PLATFORM_SERVICE_RECEIPT_CHANGED")
		}
		c, err = e.readAccessContainer(ctx, o, spec.Project+"-"+id)
		if err == nil && c != nil {
			err = e.validateAccessContainer(o, spec, id, c)
			if err == nil && record.Containers[id] != c.ID {
				err = codedError("PLATFORM_SERVICE_RECEIPT_CHANGED")
			}
		}
	}
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, codedError("PLATFORM_SERVICE_RESOURCE_MISSING")
	}
	if c.ID != wantedID {
		return nil, codedError("PLATFORM_SERVICE_RECEIPT_CHANGED")
	}
	v := observeContainer(id, c)
	if v.State == "TRANSITION" || v.State == "UNKNOWN" {
		return nil, codedError("PLATFORM_SERVICE_IN_TRANSITION")
	}
	return c, nil
}
func (e *Engine) setOperationRunning(ctx context.Context, o Options, t operationTarget, running bool) error {
	c, err := e.operationService(ctx, o, t.Component, t.ID)
	if err != nil {
		return err
	}
	if c.State.Running == running {
		return nil
	}
	args := []string{"container", "start", c.ID}
	if !running {
		args = []string{"container", "stop", "--timeout", "30", c.ID}
	}
	_, callErr := e.docker(ctx, o, args...)
	c, err = e.operationService(ctx, o, t.Component, t.ID)
	if err == nil && c != nil && c.State.Running == running {
		return nil
	}
	if err != nil {
		return err
	}
	if callErr != nil {
		return callErr
	}
	return codedError("PLATFORM_SERVICE_PROCESS_UNCONFIRMED")
}
func operationProcessDigest(s operationSnapshot, targets []operationTarget) string {
	values := map[string]any{}
	for _, target := range targets {
		v := s.services[target.Component].observation
		values[target.Component] = map[string]any{"id": v.ID, "state": v.State, "running": v.Running, "started_at": v.StartedAt}
	}
	return digest(jsonBytes(values))
}

func newOperationTargets(p OperationOptions, s operationSnapshot) ([]operationTarget, error) {
	if p.Component == ciRunnerComponent && (p.Command == "start" || p.Command == "restart") && s.services["gitlab"].observation.State != "RUNNING" {
		return nil, codedError("PLATFORM_OPERATION_DEPENDENCY_STOPPED")
	}
	if p.Command == "start" && p.Component == "gitlab-web" && s.services["gitlab"].observation.State != "RUNNING" {
		return nil, codedError("PLATFORM_OPERATION_DEPENDENCY_STOPPED")
	}
	if !s.runtime {
		return nil, codedError("PLATFORM_RUNTIME_NOT_RUNNING")
	}
	if p.Command != "stop" && !s.network {
		return nil, codedError("PLATFORM_OPERATION_NETWORK_REQUIRED")
	}
	targets := []operationTarget{}
	for _, id := range managedOperationServices() {
		if p.Component != "all" && p.Component != id && !(p.Component == "gitlab" && isGitlabService(id)) {
			continue
		}
		live, exists := s.services[id]
		if !exists && p.Component == "all" {
			continue
		}
		v := live.observation
		if p.Component == "all" && v.State == "NOT_PREPARED" {
			continue
		}
		if !v.Owned || v.State == "TRANSITION" || v.State == "UNKNOWN" {
			return nil, codedError("PLATFORM_OPERATION_RESOURCE_NOT_CONFIRMED")
		}
		targets = append(targets, operationTarget{Component: id, ID: v.ID, BeforeRunning: v.Running, BeforeStartedAt: v.StartedAt, Stage: "PENDING"})
	}
	if len(targets) == 0 {
		return nil, codedError("PLATFORM_OPERATION_PREPARATION_REQUIRED")
	}
	if p.Command == "start" && p.Component == "identity" && s.services["identity-db"].observation.State != "RUNNING" {
		return nil, codedError("PLATFORM_OPERATION_DEPENDENCY_STOPPED")
	}
	if (p.Command == "stop" || p.Command == "restart") && p.Component == "identity-db" && s.services["identity"].observation.State == "RUNNING" {
		return nil, codedError("PLATFORM_OPERATION_DEPENDENT_RUNNING")
	}
	if p.Unseal && p.Component == "secret-store" && s.services["edge"].observation.State != "RUNNING" {
		return nil, codedError("PLATFORM_OPERATION_DEPENDENCY_STOPPED")
	}
	if p.Command == "stop" {
		slices.Reverse(targets)
	}
	return targets, nil
}

func (e *Engine) applyOperationTargets(ctx context.Context, p OperationOptions, v *operationIntent) error {
	// Stop the whole scope in reverse dependency order before starting it again.
	// START_REQUESTED/DONE prove that the stop phase already passed on a retry.
	if p.Command == "restart" && (p.Component == "all" || p.Component == "gitlab") {
		for i := len(v.Targets) - 1; i >= 0; i-- {
			t := &v.Targets[i]
			if !t.BeforeRunning || (t.Stage != "PENDING" && t.Stage != "STOP_REQUESTED") {
				continue
			}
			t.Stage = "STOP_REQUESTED"
			if err := saveOperationIntent(p.Options, *v); err != nil {
				return err
			}
			if err := e.setOperationRunning(ctx, p.Options, *t, false); err != nil {
				return err
			}
			t.Stage = "STOPPED"
			if err := saveOperationIntent(p.Options, *v); err != nil {
				return err
			}
		}
	}
	for i := range v.Targets {
		t := &v.Targets[i]
		current, err := e.operationService(ctx, p.Options, t.Component, t.ID)
		if err != nil {
			return err
		}
		wanted := p.Command != "stop"
		if t.Stage == "DONE" {
			if current.State.Running != wanted {
				return codedError("PLATFORM_OPERATION_COMPLETED_STATE_CHANGED")
			}
			continue
		}
		if p.Command == "restart" && t.BeforeRunning && (t.Stage == "PENDING" || t.Stage == "STOP_REQUESTED") {
			t.Stage = "STOP_REQUESTED"
			if err = saveOperationIntent(p.Options, *v); err != nil {
				return err
			}
			if err = e.setOperationRunning(ctx, p.Options, *t, false); err != nil {
				return err
			}
			t.Stage = "STOPPED"
			if err = saveOperationIntent(p.Options, *v); err != nil {
				return err
			}
		}
		t.Stage = "START_REQUESTED"
		if !wanted {
			t.Stage = "STOP_REQUESTED"
		}
		if err = saveOperationIntent(p.Options, *v); err != nil {
			return err
		}
		if err = e.setOperationRunning(ctx, p.Options, *t, wanted); err != nil {
			return err
		}
		t.Stage = "DONE"
		if err = saveOperationIntent(p.Options, *v); err != nil {
			return err
		}
	}
	return nil
}

func (e *Engine) compensateOperation(ctx context.Context, p OperationOptions, v *operationIntent) error {
	v.Mode = "COMPENSATING"
	if err := saveOperationIntent(p.Options, *v); err != nil {
		return err
	}
	audit := recorder{p.ControlRoot, p.Options, e.Host, e.Now}
	before := e.observeOperations(ctx, p.Options)
	step := Step{"PLATFORM_SERVICE_STATE_RESTORED", "ACCEPTED", "REQUESTED", operationProcessDigest(before, v.Targets), "NOT_OBSERVED", "PROCESS_COMPENSATION_REQUESTED"}
	if err := audit.append(step); err != nil {
		return err
	}
	rollbackErr := func() error {
		for i := len(v.Targets) - 1; i >= 0; i-- {
			t := v.Targets[i]
			if !t.BeforeRunning {
				if err := e.setOperationRunning(ctx, p.Options, t, false); err != nil {
					return err
				}
			}
		}
		for _, id := range managedOperationServices() {
			for _, t := range v.Targets {
				if t.Component == id && t.BeforeRunning {
					if err := e.setOperationRunning(ctx, p.Options, t, true); err != nil {
						return err
					}
				}
			}
		}
		return nil
	}()
	after := e.observeOperations(ctx, p.Options)
	step.After = operationProcessDigest(after, v.Targets)
	if rollbackErr != nil {
		step.Outcome, step.Phase, step.Reason = "UNKNOWN", "OBSERVED", code(rollbackErr)
		_ = audit.append(step)
		return rollbackErr
	}
	step.Outcome, step.Phase, step.Reason = "SUCCEEDED", "COMPLETED", "PREVIOUS_RUNNING_FLAGS_RESTORED_DATA_EFFECTS_PRESERVED"
	return audit.append(step)
}

func (e *Engine) unsealForOperation(ctx context.Context, p OperationOptions) error {
	seed, err := readAccessSeed(p.Options)
	if err != nil {
		return err
	}
	var recovery baoState
	if err = accessPrivateRead(p.Options, "access-recovery.json", &recovery); err != nil {
		return err
	}
	if recovery.Schema != 1 || recovery.Installation != p.InstallationID || recovery.Profile != p.Profile || recovery.Owner != seed.Owner || !recovery.Complete || recovery.RootToken != "" || recovery.UnsealKey == "" {
		return codedError("PLATFORM_OPERATION_RECOVERY_NOT_CONFIRMED")
	}
	health, err := e.baoCall(ctx, p.Options, "GET", "sys/health", "", nil, 200, 501, 503)
	if err != nil {
		return err
	}
	if health["initialized"] != true {
		return codedError("PLATFORM_SECRET_STORE_DATA_CHANGED")
	}
	if health["sealed"] == false {
		return nil
	}
	audit := recorder{p.ControlRoot, p.Options, e.Host, e.Now}
	step := Step{"PLATFORM_SECRET_STORE_UNSEALED", "ACCEPTED", "REQUESTED", digest(jsonBytes(map[string]any{"initialized": true, "sealed": true})), "NOT_OBSERVED", "EXPLICIT_UNSEAL_REQUESTED"}
	if err = audit.append(step); err != nil {
		return err
	}
	_, callErr := e.baoCall(ctx, p.Options, "PUT", "sys/unseal", "", map[string]string{"key": recovery.UnsealKey}, 200)
	health, err = e.baoCall(ctx, p.Options, "GET", "sys/health", "", nil, 200, 501, 503)
	if err != nil || health["initialized"] != true || health["sealed"] != false {
		step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", "PLATFORM_SECRET_STORE_UNSEAL_UNCONFIRMED"
		_ = audit.append(step)
		if callErr != nil {
			return callErr
		}
		return codedError("PLATFORM_SECRET_STORE_UNSEAL_UNCONFIRMED")
	}
	step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", digest(jsonBytes(map[string]any{"initialized": true, "sealed": false})), "UNSEAL_OBSERVED"
	return audit.append(step)
}

func (e *Engine) runLifecycle(ctx context.Context, p OperationOptions, r *OperationResult, s operationSnapshot) (finalErr error) {
	v, err := readOperationIntent(p.Options, "operation.intent.json")
	if err != nil {
		return err
	}
	if v.Schema != 0 {
		if v.Command != p.Command || v.Component != p.Component || v.Unseal != p.Unseal || p.RequestID != "" && p.RequestID != v.MaintenanceID {
			r.Pending = &v
			return codedError("PLATFORM_OPERATION_PENDING")
		}
	} else {
		if p.RequestID != "" {
			last, err := readOperationIntent(p.Options, filepath.Join("operation-completed", p.RequestID+".json"))
			if err != nil {
				return err
			}
			if last.MaintenanceID == p.RequestID {
				if last.Command != p.Command || last.Component != p.Component || last.Unseal != p.Unseal {
					return codedError("PLATFORM_OPERATION_REQUEST_CONFLICT")
				}
				for _, t := range last.Targets {
					current, err := e.operationService(ctx, p.Options, t.Component, t.ID)
					if err != nil {
						return err
					}
					if current.State.Running != (p.Command != "stop") {
						return codedError("PLATFORM_OPERATION_COMPLETED_STATE_CHANGED")
					}
				}
				if p.Unseal {
					health, err := e.baoCall(ctx, p.Options, "GET", "sys/health", "", nil, 200, 501, 503)
					if err != nil {
						return err
					}
					if health["initialized"] != true || health["sealed"] != false {
						return codedError("PLATFORM_OPERATION_COMPLETED_STATE_CHANGED")
					}
				}
				r.MaintenanceID = p.RequestID
				p.MaintenanceID = p.RequestID
				step := Step{operationCatalog[p.Command].Action, "ACCEPTED", "REQUESTED", operationProcessDigest(s, last.Targets), "NOT_OBSERVED", "COMPLETED_REQUEST_REPLAY"}
				audit := recorder{p.ControlRoot, p.Options, e.Host, e.Now}
				if err = audit.append(step); err != nil {
					return err
				}
				r.effectsStarted = true
				step.Outcome, step.Phase, step.After = "NO_CHANGE", "COMPLETED", step.Before
				if err = audit.append(step); err != nil {
					audit.diagnostic(step.Action, err)
					step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(err)
					_ = audit.append(step)
					return err
				}
				r.Outcome = "NO_CHANGE"
				return nil
			}
		}
		targets, err := newOperationTargets(p, s)
		if err != nil {
			return err
		}
		id := p.RequestID
		if id == "" {
			id, err = randomIdentity()
			if err != nil {
				return err
			}
		}
		v = operationIntent{Schema: 1, Installation: p.InstallationID, Profile: p.Profile, MaintenanceID: id, Command: p.Command, Component: p.Component, Unseal: p.Unseal, Mode: "APPLYING", Targets: targets}
	}
	p.MaintenanceID = v.MaintenanceID
	r.MaintenanceID = v.MaintenanceID
	step := Step{operationCatalog[p.Command].Action, "ACCEPTED", "REQUESTED", operationProcessDigest(s, v.Targets), "NOT_OBSERVED", "REQUEST_ACCEPTED"}
	audit := recorder{p.ControlRoot, p.Options, e.Host, e.Now}
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
			r.Pending = &v
		}
	}()
	if err = saveOperationIntent(p.Options, v); err != nil {
		return err
	}
	if v.Mode == "COMPENSATING" {
		err = codedError("PLATFORM_OPERATION_PREVIOUS_ATTEMPT_FAILED")
	} else {
		err = e.applyOperationTargets(ctx, p, &v)
	}
	if err != nil {
		audit.diagnostic(step.Action, err)
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 90*time.Second)
		defer cancel()
		rollbackErr := e.compensateOperation(cleanupCtx, p, &v)
		after := e.observeOperations(cleanupCtx, p.Options)
		fillOperationSnapshot(r, after)
		step.After, step.Reason = operationProcessDigest(after, v.Targets), code(err)
		step.Outcome, step.Phase = "FAILED", "COMPLETED"
		if rollbackErr != nil {
			step.Outcome, step.Phase, step.Reason = "UNKNOWN", "OBSERVED", code(rollbackErr)
		}
		if auditErr := audit.append(step); auditErr != nil {
			return auditErr
		}
		r.Outcome, r.Phase, r.Reason, r.ExitCode = step.Outcome, step.Phase, step.Reason, 1
		if rollbackErr == nil {
			if err = os.Remove(filepath.Join(p.DataRoot, "operation.intent.json")); err != nil {
				return err
			}
			r.Pending = nil
			terminal = true
			return nil
		}
		terminal = true
		r.Pending = &v
		return nil
	}
	if p.Unseal {
		if err = e.unsealForOperation(ctx, p); err != nil {
			r.Pending = &v
			return err
		}
	}
	after := e.observeOperations(ctx, p.Options)
	fillOperationSnapshot(r, after)
	step.After = operationProcessDigest(after, v.Targets)
	step.Outcome, step.Phase, step.Reason = "SUCCEEDED", "COMPLETED", "PROCESS_STATE_OBSERVED"
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
	if err = os.Remove(filepath.Join(p.DataRoot, "operation.intent.json")); err != nil {
		return err
	}
	terminal = true
	r.Pending = nil
	r.Outcome = step.Outcome
	if p.Command != "stop" {
		e.diagnoseOperations(ctx, p.Options, &after)
		fillOperationSnapshot(r, after)
		ready := operationAPIsReady(after)
		r.APIsReady = &ready
		if !ready || after.observability != nil && after.observability.Prepared && (after.observability.APIReady == nil || !*after.observability.APIReady) || after.hub != nil && after.hub.Prepared && (after.hub.APIReady == nil || !*after.hub.APIReady) {
			r.Reason = "PLATFORM_PROCESSES_OBSERVED_HEALTH_PENDING"
		}
	}
	return nil
}

func operationAPIsReady(s operationSnapshot) bool {
	for _, c := range s.checks {
		if c.State == "CONFLICT" {
			return false
		}
	}
	for _, id := range operationServices {
		if s.services[id].observation.State != "RUNNING" {
			return false
		}
	}
	for _, id := range []string{"identity", "secret-store", "origin-tls"} {
		ready := false
		for _, c := range s.checks {
			if c.Component == id && c.State == "READY" {
				ready = true
			}
		}
		if !ready {
			return false
		}
	}
	return s.runtime && s.network
}
