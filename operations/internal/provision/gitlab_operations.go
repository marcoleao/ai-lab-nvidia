package provision

import (
	"context"
	"os"
)

type GitlabObservation struct {
	State    string               `json:"state"`
	Prepared bool                 `json:"prepared"`
	APIReady *bool                `json:"api_ready"`
	Endpoint string               `json:"endpoint,omitempty"`
	Services []ServiceObservation `json:"services"`
	Coverage string               `json:"coverage"`
}

func (e *Engine) gitlabOperationService(ctx context.Context, o Options, key string) (*accessContainer, error) {
	seed, err := readGitlabSeed(o)
	if err != nil {
		return nil, err
	}
	s, err := e.gitlabSpec(o, seed)
	if err != nil {
		return nil, err
	}
	var record accessRecord
	if err = networkControl(o, "gitlab.resources.json", &record); err != nil {
		return nil, err
	}
	if record.Spec != s.Digest {
		return nil, codedError("PLATFORM_GITLAB_MIGRATION_REQUIRED")
	}
	c, err := e.readAccessContainer(ctx, o, s.Project+"-"+key)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, codedError("PLATFORM_GITLAB_RESOURCE_MISSING")
	}
	if err = e.validateAccessContainer(o, s, key, c); err != nil {
		return nil, err
	}
	if record.Containers[key] != c.ID {
		return nil, codedError("PLATFORM_GITLAB_RESOURCE_CHANGED")
	}
	return c, nil
}
func (e *Engine) observeGitlab(ctx context.Context, o Options, s *operationSnapshot) {
	v := &GitlabObservation{State: "NOT_PREPARED", Coverage: "LOCAL_SCM_HTTP_READINESS_NO_RUNNER_SSO_OR_PUBLICATION", Services: []ServiceObservation{}}
	s.gitlab = v
	for _, key := range gitlabServices {
		s.services[key] = liveService{observation: ServiceObservation{Component: key, State: "NOT_PREPARED", Reason: "PLATFORM_GITLAB_PREPARATION_REQUIRED", NextAction: "setup install --phase gitlab"}}
	}
	defer func() {
		for _, key := range gitlabServices {
			v.Services = append(v.Services, s.services[key].observation)
		}
	}()
	seed, err := readGitlabSeed(o)
	if os.IsNotExist(err) {
		return
	}
	var spec accessSpec
	var record accessRecord
	if err == nil {
		spec, err = e.gitlabSpec(o, seed)
	}
	if err == nil {
		err = networkControl(o, "gitlab.resources.json", &record)
	}
	if err == nil && record.Spec == "" {
		v.State = "PREPARATION_INCOMPLETE"
		return
	}
	if err == nil && record.Spec != spec.Digest {
		err = codedError("PLATFORM_GITLAB_MIGRATION_REQUIRED")
	}
	if err != nil {
		v.State = "CONFLICT"
		for _, key := range gitlabServices {
			s.services[key] = liveService{observation: ServiceObservation{Component: key, State: "CONFLICT", Reason: code(err)}}
		}
		return
	}
	v.Prepared = true
	v.Endpoint = gitlabURL(o)
	v.State = "NOT_OBSERVED"
	for _, key := range gitlabServices {
		row := liveService{observation: ServiceObservation{Component: key, State: "NOT_OBSERVED", Reason: "PLATFORM_RUNTIME_UNAVAILABLE"}}
		if s.runtime {
			c, err := e.gitlabOperationService(ctx, o, key)
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
func (e *Engine) diagnoseGitlab(ctx context.Context, o Options, s *operationSnapshot) {
	if s.gitlab == nil || !s.gitlab.Prepared {
		return
	}
	if s.gitlab.State == "CONFLICT" {
		ready := false
		s.gitlab.APIReady = &ready
		s.checks = append(s.checks, OperationCheck{"gitlab", "CONFLICT", "PLATFORM_GITLAB_RESOURCE_CHANGED", "inspect owned resources before maintenance"})
		return
	}
	ready := true
	reason := "PLATFORM_GITLAB_PROCESS_UNCONFIRMED"
	for _, key := range gitlabServices {
		ready = ready && s.services[key].observation.State == "RUNNING"
	}
	if ready {
		seed, err := readGitlabSeed(o)
		var spec accessSpec
		if err == nil {
			spec, err = e.gitlabSpec(o, seed)
		}
		if err == nil {
			err = e.verifyGitlab(ctx, o, spec)
		}
		if err != nil {
			ready = false
			reason = code(err)
		}
	}
	s.gitlab.APIReady = &ready
	if ready {
		s.gitlab.State = "READY"
		s.checks = append(s.checks, OperationCheck{"gitlab", "READY", "PLATFORM_GITLAB_READINESS_OBSERVED", ""})
	} else {
		s.gitlab.State = "UNHEALTHY"
		s.checks = append(s.checks, OperationCheck{"gitlab", "UNHEALTHY", reason, "inspect private gitlab logs; verify capacity and native configuration"})
	}
}
