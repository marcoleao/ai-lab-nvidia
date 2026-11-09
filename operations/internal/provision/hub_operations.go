package provision

import (
	"context"
	"os"
)

type HubObservation struct {
	State    string             `json:"state"`
	Prepared bool               `json:"prepared"`
	APIReady *bool              `json:"api_ready"`
	Endpoint string             `json:"endpoint,omitempty"`
	Service  ServiceObservation `json:"service"`
	Coverage string             `json:"coverage"`
}

func (e *Engine) hubOperationService(ctx context.Context, o Options) (*accessContainer, error) {
	identity, err := readHubIdentity(o)
	if err != nil {
		return nil, err
	}
	s, err := e.hubSpec(o, identity)
	if err != nil {
		return nil, err
	}
	var record accessRecord
	if err = networkControl(o, "hub.resources.json", &record); err != nil {
		return nil, err
	}
	if record.Spec != s.Digest {
		return nil, codedError("PLATFORM_HUB_MIGRATION_REQUIRED")
	}
	c, err := e.readAccessContainer(ctx, o, s.Project+"-homepage")
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, codedError("PLATFORM_HUB_RESOURCE_MISSING")
	}
	if err = e.validateAccessContainer(o, s, "homepage", c); err != nil {
		return nil, err
	}
	if record.Containers["homepage"] != c.ID {
		return nil, codedError("PLATFORM_HUB_RESOURCE_CHANGED")
	}
	return c, nil
}
func (e *Engine) observeHub(ctx context.Context, o Options, s *operationSnapshot) {
	v := &HubObservation{State: "NOT_PREPARED", Coverage: "LOCAL_FOUNDATION_LINKS_ONLY_NO_HEALTH_WIDGETS_NO_APPLICATIONS"}
	s.hub = v
	row := liveService{observation: ServiceObservation{Component: "homepage", State: "NOT_PREPARED", Reason: "PLATFORM_HUB_PREPARATION_REQUIRED", NextAction: "setup install --phase hub"}}
	defer func() { s.services["homepage"] = row; v.Service = row.observation }()
	identity, err := readHubIdentity(o)
	if os.IsNotExist(err) {
		return
	}
	var record accessRecord
	if err == nil {
		err = networkControl(o, "hub.resources.json", &record)
	}
	var spec accessSpec
	if err == nil {
		spec, err = e.hubSpec(o, identity)
	}
	if err == nil && record.Spec == "" {
		v.State = "PREPARATION_INCOMPLETE"
		row.observation.State = "NOT_OBSERVED"
		row.observation.Reason = "PLATFORM_HUB_PREPARATION_INCOMPLETE"
		return
	}
	if err == nil && record.Spec != spec.Digest {
		err = codedError("PLATFORM_HUB_MIGRATION_REQUIRED")
	}
	if err != nil {
		v.State = "CONFLICT"
		row.observation.State = "CONFLICT"
		row.observation.Reason = code(err)
		return
	}
	v.Prepared = true
	v.Endpoint = hubURL(o)
	if !s.runtime {
		v.State = "NOT_OBSERVED"
		row.observation.State = "NOT_OBSERVED"
		row.observation.Reason = "PLATFORM_RUNTIME_UNAVAILABLE"
		return
	}
	c, err := e.hubOperationService(ctx, o)
	if err != nil {
		v.State = "CONFLICT"
		row.observation.State = "CONFLICT"
		row.observation.Reason = code(err)
		return
	}
	row = liveService{observeContainer("homepage", c), c}
	v.State = row.observation.State
}
func (e *Engine) diagnoseHub(ctx context.Context, o Options, s *operationSnapshot) {
	if s.hub == nil || !s.hub.Prepared {
		return
	}
	ready := s.hub.State == "RUNNING"
	reason := "PLATFORM_HUB_PROCESS_UNCONFIRMED"
	if ready {
		if err := e.verifyHub(ctx, o); err != nil {
			ready = false
			reason = code(err)
		}
	}
	s.hub.APIReady = &ready
	if ready {
		s.hub.State = "READY"
		s.checks = append(s.checks, OperationCheck{"homepage", "READY", "PLATFORM_HUB_LOCAL_LINKS_OBSERVED", ""})
	} else {
		s.checks = append(s.checks, OperationCheck{"homepage", "UNHEALTHY", reason, "inspect homepage logs; verify the sealed native configuration"})
	}
}
