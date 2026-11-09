package provision

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"time"
)

func (e *Engine) ciRunnerState(ctx context.Context, o Options, s accessSpec) (map[string]map[string]any, error) {
	state := map[string]map[string]any{}
	for _, key := range ciRunnerServices {
		c, err := e.readAccessContainer(ctx, o, s.Project+"-"+key)
		if err != nil {
			return nil, err
		}
		if c == nil {
			state[key] = map[string]any{"state": "ABSENT"}
			continue
		}
		if err = e.validateAccessContainer(o, s, key, c); err != nil {
			return nil, err
		}
		state[key] = map[string]any{"id": c.ID, "running": c.State.Running}
	}
	return state, nil
}
func (e *Engine) verifyCIRunnerControl(ctx context.Context, o Options, s accessSpec) error {
	state, err := e.ciRunnerState(ctx, o, s)
	if err != nil {
		return err
	}
	if state[ciRunnerComponent]["running"] != true {
		return codedError("PLATFORM_CI_RUNNER_PROCESS_UNCONFIRMED")
	}
	v, err := readCIRunnerIdentity(o)
	if err != nil {
		return err
	}
	if _, err = e.ciRunnerRegistration(ctx, o, v, false); err != nil {
		return err
	}
	// Explicit setup verification may create/update GitLab manager metadata. Doctor
	// uses only the read-only adapter and never invokes this POST-based verifier.
	_, err = e.docker(ctx, o, "container", "exec", state[ciRunnerComponent]["id"].(string), "/usr/bin/gitlab-runner", "verify", "--config", "/etc/gitlab-runner/config.toml")
	if err != nil {
		return codedError("PLATFORM_CI_RUNNER_AUTHENTICATION_UNCONFIRMED")
	}
	return nil
}
func (e *Engine) prepareCIRunnerControl(ctx context.Context, o Options) ([]byte, error) {
	seed, err := readCIRunnerIdentity(o)
	if err != nil {
		return nil, err
	}
	s, err := e.ciRunnerSpec(o, seed)
	if err != nil {
		return nil, err
	}
	var record, intent accessRecord
	if err = networkControl(o, "ci-runner.resources.json", &record); err != nil {
		return nil, err
	}
	if err = networkControl(o, "ci-runner.intent.json", &intent); err != nil {
		return nil, err
	}
	if record.Spec != "" && record.Spec != s.Digest || intent.Spec != "" && intent.Spec != s.Digest {
		return nil, codedError("PLATFORM_CI_RUNNER_MIGRATION_REQUIRED")
	}
	before, err := e.ciRunnerState(ctx, o, s)
	if err != nil {
		return nil, err
	}
	for _, key := range ciRunnerServices {
		if id, exists := before[key]["id"]; exists {
			if record.Containers[key] != "" && record.Containers[key] != id || record.Containers[key] == "" && intent.Spec != s.Digest {
				return nil, codedError("PLATFORM_CI_RUNNER_UNCLAIMED_CONTAINER")
			}
		}
	}

	if err = atomicFile(filepath.Join(o.DataRoot, "ci-runner.intent.json"), jsonBytes(accessRecord{Spec: s.Digest}), 0600); err != nil {
		return nil, err
	}
	if err = e.cleanupAccessHelper(ctx, o, s); err != nil {
		return nil, err
	}
	keys := []string{}
	for key := range s.Volumes {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if err = e.ensureAccessVolume(ctx, o, s, key, s.Volumes[key]); err != nil {
			return nil, err
		}
	}
	for name, data := range map[string][]byte{"compose.json": s.Compose, "empty.env": []byte("# No ambient environment file.\n")} {
		if err = writeOwned(filepath.Join(o.DataRoot, "ci-runner", name), data); err != nil {
			return nil, err
		}
	}
	_, startErr := e.docker(ctx, o, "compose", "--project-name", s.Project, "--env-file", filepath.Join(o.DataRoot, "ci-runner", "empty.env"), "--file", filepath.Join(o.DataRoot, "ci-runner", "compose.json"), "up", "--detach", "--no-build", "--no-recreate", "--pull", "never")
	if startErr == nil {
		waitCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
		for {
			if e.verifyCIRunnerControl(waitCtx, o, s) == nil {
				break
			}
			select {
			case <-waitCtx.Done():
				startErr = codedError("PLATFORM_CI_RUNNER_HEALTH_TIMEOUT")
			case <-time.After(2 * time.Second):
			}
			if startErr != nil {
				break
			}
		}
		cancel()
	}
	after, inspectErr := e.ciRunnerState(ctx, o, s)
	if startErr == nil {
		startErr = inspectErr
		for _, key := range ciRunnerServices {
			if startErr == nil && after[key]["running"] != true {
				startErr = codedError("PLATFORM_CI_RUNNER_PROCESS_UNCONFIRMED")
			}
		}
	}
	if startErr != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Minute)
		defer cancel()
		if err = e.compensateCIRunnerControl(cleanupCtx, o, s, before); err != nil {
			return nil, err
		}
		after, err = e.ciRunnerState(cleanupCtx, o, s)
		if err != nil {
			return nil, err
		}
		return nil, &restoredError{cause: startErr, after: digest(jsonBytes(after))}
	}
	ids := map[string]string{}
	for _, key := range ciRunnerServices {
		ids[key] = after[key]["id"].(string)
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "ci-runner.resources.json"), jsonBytes(accessRecord{Spec: s.Digest, Containers: ids}), 0600); err != nil {
		return nil, err
	}
	if err = os.Remove(filepath.Join(o.DataRoot, "ci-runner.intent.json")); err != nil {
		return nil, err
	}
	return jsonBytes(after), nil
}
func (e *Engine) compensateCIRunnerControl(ctx context.Context, o Options, s accessSpec, before map[string]map[string]any) (finalErr error) {
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	step := Step{"PLATFORM_CI_RUNNER_STARTUP_COMPENSATED", "ACCEPTED", "REQUESTED", digest(jsonBytes(before)), "NOT_OBSERVED", "STOP_NEW_START_PRESERVE_DATA"}
	if err := audit.append(step); err != nil {
		return err
	}
	defer func() {
		step.Outcome, step.Phase, step.Reason = "SUCCEEDED", "COMPLETED", "PROCESS_FLAGS_RESTORED_DATA_PRESERVED"
		if finalErr != nil {
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(finalErr)
		}
		if err := audit.append(step); err != nil {
			finalErr = err
		}
	}()
	for i := len(ciRunnerServices) - 1; i >= 0; i-- {
		key := ciRunnerServices[i]
		c, err := e.readAccessContainer(ctx, o, s.Project+"-"+key)
		if err != nil {
			return err
		}
		if c == nil {
			continue
		}
		if err = e.validateAccessContainer(o, s, key, c); err != nil {
			return err
		}
		if before[key]["running"] != true && c.State.Running {
			if _, err = e.docker(ctx, o, "container", "stop", "--timeout", "60", c.ID); err != nil {
				return err
			}
		}
	}
	after, err := e.ciRunnerState(ctx, o, s)
	if err != nil {
		return err
	}
	for _, key := range ciRunnerServices {
		if (before[key]["running"] == true) != (after[key]["running"] == true) {
			return codedError("PLATFORM_CI_RUNNER_COMPENSATION_UNCONFIRMED")
		}
	}
	step.After = digest(jsonBytes(after))
	return nil
}
