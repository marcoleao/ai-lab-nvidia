package provision

import (
	"context"
	"os"
)

type ObservabilityObservation struct {
	State        string               `json:"state"`
	Prepared     bool                 `json:"prepared"`
	APIReady     *bool                `json:"api_ready"`
	Endpoint     string               `json:"grafana_endpoint,omitempty"`
	DashboardUID string               `json:"dashboard_uid,omitempty"`
	Services     []ServiceObservation `json:"services"`
	Coverage     string               `json:"coverage"`
	SignalsReady *bool                `json:"signals_ready"`
	Signals      []SignalObservation  `json:"signals"`
}

func (e *Engine) observeOperations(ctx context.Context, o Options) operationSnapshot {
	s := e.observeFoundationOperations(ctx, o)
	e.observeObservability(ctx, o, &s)
	e.observeGitlab(ctx, o, &s)
	e.observeHub(ctx, o, &s)
	return s
}
func (e *Engine) observeObservability(ctx context.Context, o Options, s *operationSnapshot) {
	v := &ObservabilityObservation{State: "NOT_PREPARED", Services: []ServiceObservation{}, Coverage: "HTTP_ENDPOINTS_IDENTITY_JVM_ONLY_NO_HOST_GPU_AGENTS_APPS_LOGS_INGESTION", Signals: unobservedSignals("PLATFORM_OBSERVABILITY_DOCTOR_REQUIRED")}
	s.observability = v
	for _, id := range observabilityServices {
		s.services[id] = liveService{observation: ServiceObservation{Component: id, State: "NOT_PREPARED", Reason: "PLATFORM_OBSERVABILITY_PREPARATION_REQUIRED", NextAction: "setup install --phase observability"}}
	}
	defer func() {
		for _, id := range observabilityServices {
			v.Services = append(v.Services, s.services[id].observation)
		}
	}()
	seed, err := readObservabilitySeed(o)
	if os.IsNotExist(err) {
		return
	}
	var record accessRecord
	if err == nil {
		err = networkControl(o, "observability.resources.json", &record)
	}
	var spec accessSpec
	if err == nil {
		spec, err = e.observabilitySpec(o, seed)
	}
	if err == nil && record.Spec == "" {
		v.State = "PREPARATION_INCOMPLETE"
		return
	}
	if err == nil && record.Spec != spec.Digest {
		err = codedError("PLATFORM_OBSERVABILITY_MIGRATION_REQUIRED")
	}
	if err != nil {
		v.State = "CONFLICT"
		for _, id := range observabilityServices {
			s.services[id] = liveService{observation: ServiceObservation{Component: id, State: "CONFLICT", Reason: code(err), NextAction: "verify observability credentials and resource receipt"}}
		}
		return
	}
	v.Prepared = true
	v.State = "NOT_OBSERVED"
	v.Endpoint = observabilityURL(o)
	v.DashboardUID = "platform-foundation"
	if !s.runtime {
		for _, id := range observabilityServices {
			s.services[id] = liveService{observation: ServiceObservation{Component: id, State: "NOT_OBSERVED", Reason: "PLATFORM_RUNTIME_UNAVAILABLE", NextAction: "restore the prepared runtime"}}
		}
		return
	}
	v.State = "PROCESSES_RUNNING"
	for _, id := range observabilityServices {
		c, err := e.observabilityService(ctx, o, id)
		if err != nil {
			v.State = "CONFLICT"
			s.services[id] = liveService{observation: ServiceObservation{Component: id, State: "CONFLICT", Reason: code(err), NextAction: "verify the recorded observability resource"}}
			continue
		}
		observation := observeContainer(id, c)
		s.services[id] = liveService{observation, c}
		if observation.State != "RUNNING" && v.State != "CONFLICT" {
			v.State = "PROCESS_NOT_RUNNING"
		}
	}
}
func (e *Engine) observabilityService(ctx context.Context, o Options, id string) (*accessContainer, error) {
	seed, err := readObservabilitySeed(o)
	if err != nil {
		return nil, err
	}
	spec, err := e.observabilitySpec(o, seed)
	if err != nil {
		return nil, err
	}
	var record accessRecord
	if err = networkControl(o, "observability.resources.json", &record); err != nil {
		return nil, err
	}
	if record.Spec != spec.Digest {
		return nil, codedError("PLATFORM_OBSERVABILITY_MIGRATION_REQUIRED")
	}
	c, err := e.readAccessContainer(ctx, o, spec.Project+"-"+id)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, codedError("PLATFORM_SERVICE_RESOURCE_MISSING")
	}
	if err = e.validateAccessContainer(o, spec, id, c); err != nil {
		return nil, err
	}
	if record.Containers[id] != c.ID {
		return nil, codedError("PLATFORM_SERVICE_RECEIPT_CHANGED")
	}
	return c, nil
}
func (e *Engine) diagnoseObservability(ctx context.Context, o Options, s *operationSnapshot) {
	if s.observability == nil || !s.observability.Prepared {
		return
	}
	ready := s.observability.State == "PROCESSES_RUNNING"
	if ready {
		seed, err := readObservabilitySeed(o)
		if err == nil {
			err = e.verifyObservability(ctx, o, seed)
		}
		if err != nil {
			ready = false
			s.checks = append(s.checks, OperationCheck{"observability", "UNHEALTHY", code(err), "inspect observability logs and datasource health"})
		}
	}
	s.observability.APIReady = &ready
	if ready {
		s.observability.State = "CORE_READY"
		s.checks = append(s.checks, OperationCheck{"observability", "READY", "PLATFORM_OBSERVABILITY_CORE_OBSERVED", ""})
		seed, err := readObservabilitySeed(o)
		if err != nil {
			s.observability.Signals = unobservedSignals("PLATFORM_OBSERVABILITY_CREDENTIALS_UNAVAILABLE")
		} else {
			s.observability.Signals = e.observeSignals(ctx, o, seed)
		}
		signalsReady := err == nil
		for _, row := range s.observability.Signals {
			if row.State != "HEALTHY" && row.State != "OBSERVED" {
				signalsReady = false
			}
		}
		s.observability.SignalsReady = &signalsReady
		if !signalsReady {
			s.checks = append(s.checks, OperationCheck{"observability-signals", "DEGRADED", "PLATFORM_OBSERVABILITY_SIGNALS_UNCONFIRMED", "inspect per-source evidence and native Grafana; verify collectors and endpoints"})
		}
	} else {
		s.observability.Signals = unobservedSignals("PLATFORM_OBSERVABILITY_CORE_NOT_READY")
	}
}
