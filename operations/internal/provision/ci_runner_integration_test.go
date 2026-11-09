package provision

import (
	"context"
	"encoding/json"
	"os"
)

func cleanupIsolatedCIRunner(ctx context.Context, e *Engine, o Options, audit recorder) (finalErr error) {
	seed, err := readCIRunnerIdentity(o)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if seed.ID == 0 {
		return nil
	}
	s, err := e.ciRunnerSpec(o, seed)
	if err != nil {
		return err
	}
	step := Step{"PLATFORM_CI_RUNNER_ISOLATED_TEST_REMOVED", "ACCEPTED", "REQUESTED", s.Digest, "NOT_OBSERVED", "DISPOSABLE_OWNED_RESOURCE_CLEANUP"}
	if err = audit.append(step); err != nil {
		return err
	}
	defer func() {
		step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", "ABSENT", "CONTROL_REMOVED_REGISTRATION_REMAINS_PAUSED"
		if finalErr != nil {
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(finalErr)
		}
		if err := audit.append(step); err != nil {
			finalErr = err
		}
	}()
	if err = e.cleanupAccessHelper(ctx, o, s); err != nil {
		return err
	}
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
		if _, err = e.docker(ctx, o, "container", "rm", "--force", c.ID); err != nil {
			return err
		}
		if remaining, err := e.readAccessContainer(ctx, o, s.Project+"-"+key); err != nil || remaining != nil {
			return codedError("PLATFORM_CI_RUNNER_TEST_CLEANUP_UNCONFIRMED")
		}
	}
	for key, v := range s.Volumes {
		r, err := e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
		if err != nil {
			return err
		}
		if r.ExitCode != 0 {
			if dockerVolumeAbsent(r) {
				continue
			}
			return codedError("PLATFORM_CI_RUNNER_TEST_VOLUME_UNCONFIRMED")
		}
		var values []struct {
			Name, Driver, Scope string
			Labels, Options     map[string]string
		}
		if json.Unmarshal([]byte(r.Output), &values) != nil || len(values) != 1 || values[0].Name != v.Name || values[0].Driver != "local" || values[0].Scope != "local" || len(values[0].Options) != 0 {
			return codedError("PLATFORM_CI_RUNNER_TEST_VOLUME_UNCONFIRMED")
		}
		for name, wanted := range volumeLabels(o, s, key, v) {
			if values[0].Labels[name] != wanted {
				return codedError("PLATFORM_CI_RUNNER_TEST_VOLUME_UNCONFIRMED")
			}
		}
		if _, err = e.docker(ctx, o, "volume", "rm", v.Name); err != nil {
			return err
		}
		r, err = e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
		if err != nil || r.ExitCode == 0 || !dockerVolumeAbsent(r) {
			return codedError("PLATFORM_CI_RUNNER_TEST_CLEANUP_UNCONFIRMED")
		}
	}
	return nil
}
