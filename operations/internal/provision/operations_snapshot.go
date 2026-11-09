package provision

import (
	"context"
	"os"
	"path/filepath"
	"time"
)

func existingOperationRoots(e *Engine, o Options) error {
	identity := o.InstallationID + ":" + o.Profile + ":" + e.Host.Actor
	for path, wanted := range map[string]string{o.ControlRoot: identity, o.DataRoot: identity + ":control:" + digest([]byte(o.ControlRoot))} {
		marker := filepath.Join(path, ".platform-owner")
		if err := plain(marker); err != nil {
			return err
		}
		data, err := os.ReadFile(marker)
		if err != nil {
			return err
		}
		if string(data) != wanted {
			return codedError("PLATFORM_PROVISION_OWNERSHIP_CONFLICT")
		}
	}
	return nil
}

func observeContainer(id string, c *accessContainer) ServiceObservation {
	v := ServiceObservation{Component: id, Owned: true, ID: c.ID, Running: c.State.Running, ExitCode: c.State.ExitCode, OOMKilled: c.State.OOMKilled, State: "STOPPED", Reason: "PLATFORM_SERVICE_STOPPED", NextAction: "start"}
	if c.State.Running {
		v.State = "RUNNING"
		v.Reason = ""
		v.NextAction = ""
	}
	if c.State.Paused || c.State.Restarting {
		v.State = "TRANSITION"
		v.Reason = "PLATFORM_SERVICE_IN_TRANSITION"
		v.NextAction = "doctor"
	}
	if c.State.StartedAt != "" {
		at, err := time.Parse(time.RFC3339Nano, c.State.StartedAt)
		if err != nil {
			v.State = "UNKNOWN"
			v.Reason = "PLATFORM_SERVICE_TIMESTAMP_INVALID"
		} else if !at.IsZero() {
			v.StartedAt = at.UTC().Format(time.RFC3339Nano)
		}
	}
	return v
}

func (e *Engine) observeFoundationOperations(ctx context.Context, o Options) operationSnapshot {
	s := operationSnapshot{services: map[string]liveService{}, checks: []OperationCheck{}}
	v := e.observeRuntimeOperation(ctx, o)
	s.engine = &v
	if v.State == "CONFLICT" {
		s.checks = append(s.checks, OperationCheck{"container-runtime-controller", "CONFLICT", v.Reason, v.NextAction})
	}
	for _, id := range operationServices {
		s.services[id] = liveService{observation: ServiceObservation{Component: id, State: "NOT_PREPARED", Reason: "PLATFORM_SERVICE_PREPARATION_REQUIRED", NextAction: "setup install"}}
	}
	if _, err := os.Stat(filepath.Join(o.ControlRoot, "platform_container_runtime_prepared.state")); err != nil {
		s.checks = append(s.checks, OperationCheck{"container-runtime", "NOT_PREPARED", "PLATFORM_RUNTIME_PREPARATION_REQUIRED", "setup install --phase runtime"})
		return s
	}
	if err := verifyToolFiles(filepath.Join(o.DataRoot, "tools")); err != nil {
		s.checks = append(s.checks, OperationCheck{"container-runtime", "CONFLICT", code(err), "doctor: verify installed tools"})
		return s
	}
	if _, err := e.runtimeProof(ctx, o, map[string][]byte{}); err != nil {
		s.checks = append(s.checks, OperationCheck{"container-runtime", "UNAVAILABLE", code(err), "verify the owned engine or external Docker service"})
		for _, id := range operationServices {
			v := s.services[id]
			v.observation.State = "NOT_OBSERVED"
			v.observation.Reason = "PLATFORM_RUNTIME_UNAVAILABLE"
			v.observation.NextAction = "restore the existing runtime; this command does not provision it"
			s.services[id] = v
		}
		return s
	}
	s.runtime = true
	s.checks = append(s.checks, OperationCheck{"container-runtime", "READY", "PLATFORM_RUNTIME_OBSERVED", ""})
	if err := e.requireAccessNetworks(ctx, o); err != nil {
		s.checks = append(s.checks, OperationCheck{"network", "CONFLICT", code(err), "verify network ownership and configured pool"})
	} else {
		s.network = true
		s.checks = append(s.checks, OperationCheck{"network", "READY", "PLATFORM_NETWORKS_OBSERVED", ""})
	}
	seed, seedErr := readAccessSeed(o)
	var record accessRecord
	recordErr := networkControl(o, "access.resources.json", &record)
	if seedErr == nil && recordErr == nil {
		spec := e.accessSpec(o, seed)
		for _, id := range operationServices[:4] {
			v := s.services[id]
			if record.Spec == "" {
				s.services[id] = v
				continue
			}
			c, err := e.readAccessContainer(ctx, o, spec.Project+"-"+id)
			if err == nil && c != nil {
				err = e.validateAccessContainer(o, spec, id, c)
				if err == nil && (record.Spec != spec.Digest || record.Containers[id] != c.ID) {
					err = codedError("PLATFORM_SERVICE_RECEIPT_CHANGED")
				}
			}
			if err != nil {
				v.observation.State = "CONFLICT"
				v.observation.Reason = code(err)
				v.observation.NextAction = "verify installation configuration and resource ownership"
			} else if c == nil {
				v.observation.State = "MISSING"
				v.observation.Reason = "PLATFORM_SERVICE_RESOURCE_MISSING"
				v.observation.NextAction = "doctor: inspect the recorded resource; do not recreate implicitly"
			} else {
				v = liveService{observeContainer(id, c), c}
			}
			s.services[id] = v
		}
	} else if !os.IsNotExist(seedErr) || recordErr != nil {
		err := seedErr
		if recordErr != nil {
			err = recordErr
		}
		for _, id := range operationServices[:4] {
			v := s.services[id]
			v.observation.State = "CONFLICT"
			v.observation.Reason = code(err)
			v.observation.NextAction = "verify private installation records"
			s.services[id] = v
		}
	}
	m, err := e.readOriginMaterial(o, false)
	if err == nil {
		var record originRecord
		err = networkControl(o, "origin.resources.json", &record)
		if err == nil && record.Active.Generation == "" {
			return s
		}
		var c *accessContainer
		if err == nil {
			expected, _, _ := e.originSpec(o, m)
			if record.Active.Generation != m.Generation || record.Active.Spec != expected.Spec {
				err = codedError("PLATFORM_ORIGIN_ACTIVE_MATERIAL_MISMATCH")
			} else {
				c, err = e.originContainer(ctx, o, record.Active, m)
			}
		}
		v := s.services["origin-tls"]
		if err != nil {
			v.observation.State = "CONFLICT"
			v.observation.Reason = code(err)
			v.observation.NextAction = "finish the pending origin preparation or verify ownership"
		} else if c != nil {
			v = liveService{observeContainer("origin-tls", c), c}
		}
		s.services["origin-tls"] = v
	} else if !os.IsNotExist(err) {
		v := s.services["origin-tls"]
		v.observation.State = "CONFLICT"
		v.observation.Reason = code(err)
		v.observation.NextAction = "verify origin material"
		s.services["origin-tls"] = v
	}
	return s
}

func (e *Engine) diagnoseOperations(ctx context.Context, o Options, s *operationSnapshot) {
	defer e.diagnoseGitlab(ctx, o, s)
	defer e.diagnoseCIRunner(ctx, o, s)
	defer e.diagnoseHub(ctx, o, s)
	defer e.diagnoseObservability(ctx, o, s)
	if err := readAuditIntegrity(o.ControlRoot); err != nil {
		s.checks = append(s.checks, OperationCheck{"administrative-audit", "CONFLICT", code(err), "preserve the ledger; investigate before maintenance"})
	} else {
		s.checks = append(s.checks, OperationCheck{"administrative-audit", "READY", "PLATFORM_AUDIT_CHAIN_OBSERVED", ""})
	}
	if !s.runtime {
		return
	}
	if s.services["edge"].observation.State == "RUNNING" {
		discovery, status, err := e.accessRequest(ctx, o, "identity", "GET", "/realms/platform/.well-known/openid-configuration", "", nil)
		issuer := accessEndpoints(o)["identity"] + "/realms/platform"
		if err != nil || status != 200 || discovery["issuer"] != issuer {
			s.checks = append(s.checks, OperationCheck{"identity", "UNHEALTHY", "PLATFORM_IDENTITY_DISCOVERY_UNCONFIRMED", "inspect identity and edge logs; verify the canonical issuer"})
		} else {
			s.checks = append(s.checks, OperationCheck{"identity", "READY", "PLATFORM_IDENTITY_DISCOVERY_OBSERVED", ""})
		}
		health, status, err := e.accessRequest(ctx, o, "secret_store", "GET", "/v1/sys/health", "", nil)
		if err != nil {
			s.checks = append(s.checks, OperationCheck{"secret-store", "UNHEALTHY", code(err), "inspect secret-store and edge logs"})
		} else if health["initialized"] == false {
			s.checks = append(s.checks, OperationCheck{"secret-store", "UNHEALTHY", "PLATFORM_SECRET_STORE_DATA_CHANGED", "verify state and recovery material; do not initialize automatically"})
		} else if health["sealed"] == true {
			s.checks = append(s.checks, OperationCheck{"secret-store", "SEALED", "PLATFORM_SECRET_STORE_SEALED", "start --unseal"})
		} else if status == 200 && health["initialized"] == true && health["sealed"] == false {
			s.checks = append(s.checks, OperationCheck{"secret-store", "READY", "PLATFORM_SECRET_STORE_HEALTH_OBSERVED", ""})
		} else {
			s.checks = append(s.checks, OperationCheck{"secret-store", "UNHEALTHY", "PLATFORM_SECRET_STORE_HEALTH_UNCONFIRMED", "inspect secret-store logs"})
		}
	}
	if s.services["origin-tls"].observation.State == "RUNNING" {
		m, err := e.readOriginMaterial(o, false)
		if err == nil {
			err = e.verifyOrigin(ctx, o, m)
		}
		if err != nil {
			s.checks = append(s.checks, OperationCheck{"origin-tls", "UNHEALTHY", code(err), "verify certificates; rotate with a new origin revision when required"})
		} else {
			s.checks = append(s.checks, OperationCheck{"origin-tls", "READY", "PLATFORM_ORIGIN_MTLS_OBSERVED", ""})
		}
	}
	if _, err := os.Stat(filepath.Join(o.ControlRoot, "origin-pending-material.json")); err == nil {
		s.checks = append(s.checks, OperationCheck{"origin-tls", "PENDING", "PLATFORM_ORIGIN_PENDING_CONFIGURATION", "repeat the pending origin revision"})
	}
	if b, err := readIngressBundle(o); err == nil {
		m, err := e.readOriginMaterial(o, false)
		if err == nil && b.OriginGeneration == m.Generation {
			s.checks = append(s.checks, OperationCheck{"ingress-adapters", "PREPARED_NOT_ACTIVE", "PLATFORM_INGRESS_ARTIFACTS_ONLY", "public activation remains pending"})
		} else {
			s.checks = append(s.checks, OperationCheck{"ingress-adapters", "STALE", "PLATFORM_INGRESS_ORIGIN_BINDING_CHANGED", "prepare a new ingress revision"})
		}
	} else if !os.IsNotExist(err) {
		s.checks = append(s.checks, OperationCheck{"ingress-adapters", "CONFLICT", code(err), "verify immutable bundle and receipt"})
	}
}

func fillOperationSnapshot(r *OperationResult, s operationSnapshot) {
	r.Observability = s.observability
	r.Hub = s.hub
	r.Gitlab = s.gitlab
	r.CIRunner = s.ciRunner
	r.Runtime = s.engine
	r.RuntimeObserved = s.runtime
	r.ProcessesReady = s.runtime && s.network
	r.Services = []ServiceObservation{}
	r.Checks = s.checks
	for _, id := range operationServices {
		v := s.services[id].observation
		r.Services = append(r.Services, v)
		r.ProcessesReady = r.ProcessesReady && v.State == "RUNNING"
	}
}
