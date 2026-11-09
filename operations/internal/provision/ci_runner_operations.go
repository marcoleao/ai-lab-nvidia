package provision

import (
	"context"
	"os"
)

type CIRunnerObservation struct {
	ExecutionReady bool                 `json:"execution_ready"`
	ExecutorState  string               `json:"executor_state"`
	Paused         *bool                `json:"paused"`
	State          string               `json:"state"`
	Prepared       bool                 `json:"prepared"`
	ControlReady   *bool                `json:"control_ready"`
	Endpoint       string               `json:"endpoint,omitempty"`
	Services       []ServiceObservation `json:"services"`
	Coverage       string               `json:"coverage"`
}

func (e *Engine) ciRunnerOperationService(ctx context.Context, o Options, key string) (*accessContainer, error) {
	seed, err := readCIRunnerIdentity(o)
	if err != nil {
		return nil, err
	}
	s, err := e.ciRunnerSpec(o, seed)
	if err != nil {
		return nil, err
	}
	var record accessRecord
	if err = networkControl(o, "ci-runner.resources.json", &record); err != nil {
		return nil, err
	}
	if record.Spec != s.Digest {
		return nil, codedError("PLATFORM_CI_RUNNER_MIGRATION_REQUIRED")
	}
	c, err := e.readAccessContainer(ctx, o, s.Project+"-"+key)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, codedError("PLATFORM_CI_RUNNER_RESOURCE_MISSING")
	}
	if err = e.validateAccessContainer(o, s, key, c); err != nil {
		return nil, err
	}
	if record.Containers[key] != c.ID {
		return nil, codedError("PLATFORM_CI_RUNNER_RESOURCE_CHANGED")
	}
	return c, nil
}
func (e *Engine) observeCIRunner(ctx context.Context, o Options, s *operationSnapshot) {
	v := &CIRunnerObservation{State: "NOT_PREPARED", ExecutorState: "NOT_PROVISIONED", Coverage: "REGISTERED_PAUSED_CONTROL_ONLY_EXECUTOR_PENDING", Services: []ServiceObservation{}}
	s.ciRunner = v
	for _, key := range ciRunnerServices {
		s.services[key] = liveService{observation: ServiceObservation{Component: key, State: "NOT_PREPARED", Reason: "PLATFORM_CI_RUNNER_PREPARATION_REQUIRED", NextAction: "setup install --phase runner-control"}}
	}
	defer func() {
		for _, key := range ciRunnerServices {
			v.Services = append(v.Services, s.services[key].observation)
		}
	}()
	seed, err := readCIRunnerIdentity(o)
	if os.IsNotExist(err) {
		return
	}
	var spec accessSpec
	var record accessRecord
	if err == nil {
		spec, err = e.ciRunnerSpec(o, seed)
	}
	if err == nil {
		err = networkControl(o, "ci-runner.resources.json", &record)
	}
	if err == nil && record.Spec == "" {
		v.State = "PREPARATION_INCOMPLETE"
		return
	}
	if err == nil && record.Spec != spec.Digest {
		err = codedError("PLATFORM_CI_RUNNER_MIGRATION_REQUIRED")
	}
	if err != nil {
		v.State = "CONFLICT"
		for _, key := range ciRunnerServices {
			s.services[key] = liveService{observation: ServiceObservation{Component: key, State: "CONFLICT", Reason: code(err)}}
		}
		return
	}
	v.Prepared = true
	v.Endpoint = ciRunnerAdminURL(o, seed.ID)
	v.State = "NOT_OBSERVED"
	for _, key := range ciRunnerServices {
		row := liveService{observation: ServiceObservation{Component: key, State: "NOT_OBSERVED", Reason: "PLATFORM_RUNTIME_UNAVAILABLE"}}
		if s.runtime {
			c, err := e.ciRunnerOperationService(ctx, o, key)
			if err != nil {
				row.observation.State = "CONFLICT"
				row.observation.Reason = code(err)
				v.State = "CONFLICT"
			} else {
				row = liveService{observeContainer(key, c), c}
			}
		}
		s.services[key] = row
	}
}
func (e *Engine) diagnoseCIRunner(ctx context.Context, o Options, s *operationSnapshot) {
	if s.ciRunner == nil || !s.ciRunner.Prepared {
		return
	}
	if s.ciRunner.State == "CONFLICT" {
		ready := false
		s.ciRunner.ControlReady = &ready
		s.checks = append(s.checks, OperationCheck{"gitlab-runner", "CONFLICT", "PLATFORM_CI_RUNNER_RESOURCE_CHANGED", "inspect owned resources before maintenance"})
		return
	}
	ready := true
	reason := "PLATFORM_CI_RUNNER_PROCESS_UNCONFIRMED"
	for _, key := range ciRunnerServices {
		ready = ready && s.services[key].observation.State == "RUNNING"
	}
	if ready {
		seed, err := readCIRunnerIdentity(o)
		if err == nil {
			_, err = e.ciRunnerRegistration(ctx, o, seed, false)
		}
		if err != nil {
			ready = false
			reason = code(err)
		}
	}
	s.ciRunner.ControlReady = &ready
	if ready {
		s.ciRunner.State = "REGISTERED_PAUSED_EXECUTOR_PENDING"
		paused := true
		s.ciRunner.Paused = &paused
		s.checks = append(s.checks, OperationCheck{"gitlab-runner", "READY", "PLATFORM_CI_RUNNER_READINESS_OBSERVED", ""})
	} else {
		s.ciRunner.State = "UNHEALTHY"
		s.checks = append(s.checks, OperationCheck{"gitlab-runner", "UNHEALTHY", reason, "inspect private runner logs and native GitLab runner policy"})
	}
}
