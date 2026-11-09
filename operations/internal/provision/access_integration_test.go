package provision

import (
	"ai-platform/operations/internal/platform"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// This is opt-in on a disposable Linux Docker runner. It tests the F2 adapters,
// not host/WSL installation or GPU qualification. No host path is mounted.
func TestAccessWithRealDocker(t *testing.T) {
	if os.Getenv("PROVISION_ACCESS_INTEGRATION") != "1" {
		t.Skip("requires an explicitly enabled disposable Docker CI host")
	}
	if runtime.GOOS != "linux" {
		t.Fatal("access integration requires a disposable Linux runner")
	}
	program, err := exec.LookPath("docker")
	if err != nil {
		t.Fatal(err)
	}
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	id, err := randomIdentity()
	if err != nil {
		t.Fatal(err)
	}
	o := Options{Action: "install", Phase: "access", InstallationID: "access-ci-" + id[:12], Profile: "dell-gb10", OperationID: id, Pool: "10.248.0.0/16", RuntimeMode: "external", IdentityPort: 28082, SecretStorePort: 28200, ControlRoot: filepath.Join(root, "control"), DataRoot: filepath.Join(root, "data"), DefinitionDigest: digest([]byte("isolated-access-ci"))}
	for _, path := range []string{o.ControlRoot, o.DataRoot} {
		if err = os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	diagnosed := false
	e := Engine{Host: Host{OS: "linux", Arch: runtime.GOARCH, Actor: "uid:" + itoa(os.Geteuid())}, Now: time.Now, Runner: realNetworkRunner{docker: program, beforeStop: func(ctx context.Context) {
		if !diagnosed {
			diagnosed = true
			logIsolatedAccessState(t, ctx, program, o)
		}
	}}}
	o.OriginPort = 29443
	o.GrafanaPort = 29444
	o.HubPort = 29445
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 90*time.Second)
		defer stop()
		if err := cleanupIsolatedHub(cleanupCtx, &e, o, audit); err != nil {
			t.Error(err)
			return
		}
		if err := cleanupIsolatedObservability(cleanupCtx, &e, o, audit); err != nil {
			t.Error(err)
			return
		}
		if err := cleanupIsolatedOrigin(cleanupCtx, &e, o, audit); err != nil {
			t.Error(err)
			return
		}
		seed, readErr := readAccessSeed(o)
		if readErr == nil {
			s := e.accessSpec(o, seed)
			step := Step{"PLATFORM_ACCESS_ISOLATED_TEST_REMOVED", "ACCEPTED", "REQUESTED", s.Digest, "NOT_OBSERVED", "DISPOSABLE_TEST_CLEANUP"}
			if err := audit.append(step); err != nil {
				t.Error(err)
				return
			}
			if err := e.cleanupAccessHelper(cleanupCtx, o, s); err != nil {
				t.Error(err)
				return
			}
			for key := range s.Services {
				c, err := e.readAccessContainer(cleanupCtx, o, s.Project+"-"+key)
				if err != nil {
					t.Error(err)
					return
				}
				if c == nil {
					continue
				}
				if !e.ownsAccessContainer(o, s, key, c) {
					t.Error("test refuses foreign container cleanup")
					return
				}
				if _, err = e.docker(cleanupCtx, o, "container", "rm", "--force", c.ID); err != nil {
					t.Error(err)
					return
				}
			}
			for key, v := range s.Volumes {
				r, err := e.dockerResponse(cleanupCtx, o, "volume", "inspect", v.Name)
				if err != nil {
					t.Error(err)
					return
				}
				if r.ExitCode != 0 {
					continue
				}
				var values []struct{ Labels map[string]string }
				if json.Unmarshal([]byte(r.Output), &values) != nil || len(values) != 1 {
					t.Error("volume cleanup inspection invalid")
					return
				}
				for name, wanted := range volumeLabels(o, s, key, v) {
					if values[0].Labels[name] != wanted {
						t.Error("test refuses foreign volume cleanup")
						return
					}
				}
				if _, err = e.docker(cleanupCtx, o, "volume", "rm", v.Name); err != nil {
					t.Error(err)
					return
				}
			}
			step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", "ABSENT", "DISPOSABLE_TEST_REMOVAL_CONFIRMED"
			if err := audit.append(step); err != nil {
				t.Error(err)
			}
		} else if !os.IsNotExist(readErr) {
			t.Error(readErr)
			return
		}
		owner, readErr := os.ReadFile(filepath.Join(o.DataRoot, "network.owner"))
		if os.IsNotExist(readErr) {
			return
		}
		if readErr != nil {
			t.Error(readErr)
			return
		}
		if err := e.cleanupNetworkProbes(cleanupCtx, o, string(owner)); err != nil {
			t.Error(err)
			return
		}
		all, err := e.networkInventory(cleanupCtx, o)
		if err != nil {
			t.Error(err)
			return
		}
		created := map[string]string{}
		for _, v := range e.networkViews(o) {
			if n, exists := all[v.Name]; exists {
				if !e.ownsNetwork(o, v, n, string(owner)) {
					t.Error("test refuses foreign network cleanup")
					return
				}
				created[v.Name] = n.ID
			}
		}
		if err = e.restoreCandidateNetworks(cleanupCtx, o, string(owner), e.networkViews(o), created, map[string]networkState{}); err != nil {
			t.Error(err)
		}
	})
	actions := []string{"PLATFORM_NETWORK_PROBE_IMAGE_PREPARED", "PLATFORM_NETWORKS_PREPARED", "PLATFORM_ACCESS_CREDENTIALS_PREPARED", "PLATFORM_ACCESS_IMAGES_PREPARED", "PLATFORM_ACCESS_SERVICES_PREPARED", "PLATFORM_SECRET_STORE_BOOTSTRAPPED", "PLATFORM_ORIGIN_IMAGE_PREPARED", "PLATFORM_ORIGIN_TLS_MATERIAL_PREPARED", "PLATFORM_ORIGIN_TLS_SERVICE_PREPARED"}
	for pass := 0; pass < 2; pass++ {
		for _, action := range actions {
			t.Logf("access pass=%d action=%s", pass+1, action)
			before, err := e.fingerprint(ctx, action, o)
			if err != nil {
				t.Fatalf("%s before: %v", action, err)
			}
			step := Step{action, "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "REQUEST_ACCEPTED"}
			if err = audit.append(step); err != nil {
				t.Fatal(err)
			}
			after, reason, err := e.apply(ctx, action, o)
			if err != nil {
				t.Fatalf("%s apply: %v", action, err)
			}
			step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", after, reason
			if before == after {
				step.Outcome = "NO_CHANGE"
			}
			if err = audit.append(step); err != nil {
				t.Fatal(err)
			}
		}
	}
	var state baoState
	if err = accessPrivateRead(o, "access-recovery.json", &state); err != nil || !state.Complete || state.RootToken != "" {
		t.Fatal("root token retained or bootstrap not complete", err)
	}
	o.OriginRevision = "ci-rotation"
	for _, action := range []string{"PLATFORM_ORIGIN_TLS_MATERIAL_PREPARED", "PLATFORM_ORIGIN_TLS_SERVICE_PREPARED"} {
		before, err := e.fingerprint(ctx, action, o)
		if err != nil {
			t.Fatal(err)
		}
		step := Step{action, "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "REQUEST_ACCEPTED"}
		if err = audit.append(step); err != nil {
			t.Fatal(err)
		}
		after, reason, err := e.apply(ctx, action, o)
		if err != nil {
			t.Fatal(err)
		}
		step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", after, reason
		if err = audit.append(step); err != nil {
			t.Fatal(err)
		}
	}
	o.Ingress = &platform.IngressSettings{Revision: "ingress-ci", DirectPort: 30443, TunnelPort: 30444}
	o.IngressHostname = "gateway.ingress-ci.invalid"
	before, err := ingressFingerprint(o)
	if err != nil {
		t.Fatal(err)
	}
	step := Step{"PLATFORM_INGRESS_BUNDLE_PREPARED", "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "REQUEST_ACCEPTED"}
	if err = audit.append(step); err != nil {
		t.Fatal(err)
	}
	after, reason, err := e.apply(ctx, step.Action, o)
	if err != nil {
		t.Fatal(err)
	}
	step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", after, reason
	if err = audit.append(step); err != nil {
		t.Fatal(err)
	}
	if err = validateIsolatedIngress(ctx, &e, o, audit); err != nil {
		t.Fatal(err)
	}
	if err = exerciseIsolatedDailyOperations(ctx, &e, o); err != nil {
		t.Fatal(err)
	}
	obs := o
	obs.Phase = "observability"
	obs.OriginRevision = ""
	for _, action := range []string{"PLATFORM_OBSERVABILITY_CREDENTIALS_PREPARED", "PLATFORM_OBSERVABILITY_IMAGES_PREPARED", "PLATFORM_OBSERVABILITY_SERVICES_PREPARED"} {
		before, err := e.fingerprint(ctx, action, obs)
		if err != nil {
			t.Fatal(err)
		}
		step := Step{action, "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "ISOLATED_OBSERVABILITY_PREPARATION"}
		if err = audit.append(step); err != nil {
			t.Fatal(err)
		}
		after, reason, err := e.apply(ctx, action, obs)
		if err != nil {
			t.Fatal(err)
		}
		step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", after, reason
		if err = audit.append(step); err != nil {
			t.Fatal(err)
		}
	}
	seed, err := readObservabilitySeed(obs)
	if err != nil {
		t.Fatal(err)
	}
	if err = e.verifyObservability(ctx, obs, seed); err != nil {
		t.Fatal(err)
	}
	// This proves end-to-end data arrival, separately from ready backends.
	// No business data or agent content is submitted to produce these signals.
	signalCtx, stopSignals := context.WithTimeout(ctx, 2*time.Minute)
	defer stopSignals()
	for {
		rows := e.observeSignals(signalCtx, obs, seed)
		ready := len(rows) == 6
		for _, row := range rows {
			ready = ready && (row.State == "HEALTHY" || row.State == "OBSERVED")
		}
		if ready {
			break
		}
		select {
		case <-signalCtx.Done():
			t.Fatal("real HTTP/JVM signal evidence did not become ready", rows)
		case <-time.After(time.Second):
		}
	}
	hub := obs
	hub.Phase = "hub"
	for _, action := range []string{"PLATFORM_HUB_IDENTITY_PREPARED", "PLATFORM_HUB_IMAGE_PREPARED", "PLATFORM_HUB_SERVICE_PREPARED"} {
		before, err := e.fingerprint(ctx, action, hub)
		if err != nil {
			t.Fatal(err)
		}
		step := Step{action, "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "ISOLATED_HUB_PREPARATION"}
		if err = audit.append(step); err != nil {
			t.Fatal(err)
		}
		after, reason, err := e.apply(ctx, action, hub)
		if err != nil {
			t.Fatal(err)
		}
		step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", after, reason
		if err = audit.append(step); err != nil {
			t.Fatal(err)
		}
	}
	if err = e.verifyHub(ctx, hub); err != nil {
		t.Fatal(err)
	}
}

// Keep provider payloads private. Only state and fixed diagnostic categories
// from these disposable containers are projected into public CI logs.
func logIsolatedAccessState(t *testing.T, ctx context.Context, program string, o Options) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
	defer cancel()
	seed, err := readAccessSeed(o)
	if err != nil {
		return
	}
	s := (&Engine{}).accessSpec(o, seed)
	for _, key := range []string{"identity-db", "identity", "secret-store", "edge"} {
		name := s.Project + "-" + key
		response, err := (systemRunner{}).Run(ctx, Command{Program: program, Args: []string{"--host", "unix:///var/run/docker.sock", "container", "inspect", name}})
		var containers []accessContainer
		if err != nil || response.ExitCode != 0 || json.Unmarshal([]byte(response.Output), &containers) != nil || len(containers) != 1 || containers[0].Config.Labels["ai.platform.owner"] != seed.Owner {
			t.Logf("service=%s state=NOT_OBSERVED", key)
			continue
		}
		c := containers[0]
		t.Logf("service=%s status=%s running=%t exit=%d oom=%t", key, c.State.Status, c.State.Running, c.State.ExitCode, c.State.OOMKilled)
		response, err = (systemRunner{}).Run(ctx, Command{Program: program, Args: []string{"--host", "unix:///var/run/docker.sock", "container", "logs", "--tail", "100", name}})
		if err != nil || response.ExitCode != 0 {
			continue
		}
		for _, category := range []string{"permission denied", "connection refused", "no such file", "read-only file system", "failed", "error", "fatal", "mlock", "key material", "trust", "started", "listening"} {
			if strings.Contains(strings.ToLower(response.Output), category) {
				t.Logf("service=%s diagnostic=%q", key, category)
			}
		}
	}
	for _, probe := range []struct{ endpoint, path string }{
		{"identity", "/realms/platform/.well-known/openid-configuration"},
		{"secret_store", "/v1/sys/health"},
	} {
		_, status, err := (&Engine{}).accessRequest(ctx, o, probe.endpoint, "GET", probe.path, "", nil)
		t.Logf("endpoint=%s status=%d reason=%s", probe.endpoint, status, code(err))
	}
}

func cleanupIsolatedHub(ctx context.Context, e *Engine, o Options, audit recorder) (finalErr error) {
	identity, err := readHubIdentity(o)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	s, err := e.hubSpec(o, identity)
	if err != nil {
		return err
	}
	step := Step{"PLATFORM_HUB_ISOLATED_TEST_REMOVED", "ACCEPTED", "REQUESTED", s.Digest, "NOT_OBSERVED", "DISPOSABLE_OWNED_RESOURCE_CLEANUP"}
	if err = audit.append(step); err != nil {
		return err
	}
	defer func() {
		if finalErr != nil {
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(finalErr)
		} else {
			step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", "ABSENT", "OWNED_RESOURCES_REMOVAL_CONFIRMED"
		}
		if err := audit.append(step); err != nil {
			finalErr = err
		}
	}()
	if err = e.cleanupAccessHelper(ctx, o, s); err != nil {
		return err
	}
	c, err := e.readAccessContainer(ctx, o, s.Project+"-homepage")
	if err != nil {
		return err
	}
	if c != nil {
		if err = e.validateAccessContainer(o, s, "homepage", c); err != nil {
			return err
		}
		if _, err = e.docker(ctx, o, "container", "rm", "--force", c.ID); err != nil {
			return err
		}
		if remaining, readErr := e.readAccessContainer(ctx, o, s.Project+"-homepage"); readErr != nil || remaining != nil {
			return codedError("PLATFORM_HUB_TEST_CLEANUP_UNCONFIRMED")
		}
	}
	v := s.Volumes["hub-config"]
	r, err := e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
	if err != nil {
		return err
	}
	if r.ExitCode != 0 {
		if strings.Contains(strings.ToLower(r.Output), "no such volume:") {
			return nil
		}
		return codedError("PLATFORM_HUB_TEST_VOLUME_UNCONFIRMED")
	}
	var volumes []struct {
		Name, Driver, Scope string
		Labels, Options     map[string]string
	}
	if json.Unmarshal([]byte(r.Output), &volumes) != nil || len(volumes) != 1 || volumes[0].Name != v.Name || volumes[0].Driver != "local" || volumes[0].Scope != "local" || len(volumes[0].Options) != 0 {
		return codedError("PLATFORM_HUB_TEST_VOLUME_UNCONFIRMED")
	}
	for key, value := range volumeLabels(o, s, "hub-config", v) {
		if volumes[0].Labels[key] != value {
			return codedError("PLATFORM_HUB_TEST_VOLUME_UNCONFIRMED")
		}
	}
	if _, err = e.docker(ctx, o, "volume", "rm", v.Name); err != nil {
		return err
	}
	r, err = e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
	if err != nil || r.ExitCode == 0 || !strings.Contains(strings.ToLower(r.Output), "no such volume:") {
		return codedError("PLATFORM_HUB_TEST_CLEANUP_UNCONFIRMED")
	}
	return nil
}

func cleanupIsolatedObservability(ctx context.Context, e *Engine, o Options, audit recorder) error {
	seed, err := readObservabilitySeed(o)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	s, err := e.observabilitySpec(o, seed)
	if err != nil {
		return err
	}
	step := Step{"PLATFORM_OBSERVABILITY_ISOLATED_TEST_REMOVED", "ACCEPTED", "REQUESTED", s.Digest, "NOT_OBSERVED", "OWNED_DISPOSABLE_TEST_CLEANUP"}
	if err = audit.append(step); err != nil {
		return err
	}
	if err = e.cleanupObservabilityValidation(ctx, o, s); err != nil {
		return err
	}
	helper := o
	helper.Phase = "observability"
	if err = e.cleanupAccessHelper(ctx, helper, s); err != nil {
		return err
	}
	for _, key := range observabilityServices {
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
		remaining, err := e.readAccessContainer(ctx, o, s.Project+"-"+key)
		if err != nil || remaining != nil {
			return codedError("PLATFORM_OBSERVABILITY_TEST_CLEANUP_UNCONFIRMED")
		}
	}
	for key, v := range s.Volumes {
		r, err := e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
		if err != nil {
			return err
		}
		if r.ExitCode != 0 {
			if strings.Contains(strings.ToLower(r.Output), "no such volume:") {
				continue
			}
			return codedError("PLATFORM_OBSERVABILITY_TEST_VOLUME_UNCONFIRMED")
		}
		var volumes []struct{ Labels map[string]string }
		if json.Unmarshal([]byte(r.Output), &volumes) != nil || len(volumes) != 1 {
			return codedError("PLATFORM_OBSERVABILITY_TEST_VOLUME_UNCONFIRMED")
		}
		for k, value := range volumeLabels(o, s, key, v) {
			if volumes[0].Labels[k] != value {
				return codedError("PLATFORM_OBSERVABILITY_TEST_FOREIGN_VOLUME")
			}
		}
		if _, err = e.docker(ctx, o, "volume", "rm", v.Name); err != nil {
			return err
		}
		r, err = e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
		if err != nil || r.ExitCode == 0 || !strings.Contains(strings.ToLower(r.Output), "no such volume:") {
			return codedError("PLATFORM_OBSERVABILITY_TEST_CLEANUP_UNCONFIRMED")
		}
	}
	step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", "ABSENT", "OWNED_TEST_CONTAINERS_AND_VOLUMES_REMOVED"
	return audit.append(step)
}

// Exercises the real Docker adapters, not host setup, WSL transport or the full
// RunOperation prerequisite checks. Those use independent provider fixtures.
func exerciseIsolatedDailyOperations(ctx context.Context, e *Engine, o Options) (finalErr error) {
	seed, err := readAccessSeed(o)
	if err != nil {
		return err
	}
	spec := e.accessSpec(o, seed)
	c, err := e.readAccessContainer(ctx, o, spec.Project+"-edge")
	if err != nil {
		return err
	}
	if c == nil {
		return codedError("PLATFORM_OPERATION_RESOURCE_NOT_CONFIRMED")
	}
	p := OperationOptions{Options: o, Component: "edge", Tail: 20}
	for _, command := range []string{"stop", "start", "restart"} {
		p.Command = command
		p.RequestID, err = randomIdentity()
		if err != nil {
			return err
		}
		p.MaintenanceID = p.RequestID
		s := operationSnapshot{runtime: true, network: true, services: map[string]liveService{"edge": {observeContainer("edge", c), c}}}
		targets, err := newOperationTargets(p, s)
		if err != nil {
			return err
		}
		v := operationIntent{Schema: 1, Installation: o.InstallationID, Profile: o.Profile, MaintenanceID: p.RequestID, Command: command, Component: "edge", Mode: "APPLYING", Targets: targets}
		audit := recorder{o.ControlRoot, p.Options, e.Host, e.Now}
		step := Step{operationCatalog[command].Action, "ACCEPTED", "REQUESTED", operationProcessDigest(s, targets), "NOT_OBSERVED", "DISPOSABLE_ADAPTER_TEST"}
		if err = audit.append(step); err != nil {
			return err
		}
		applyErr := func() error {
			if err := saveOperationIntent(o, v); err != nil {
				return err
			}
			if err := e.applyOperationTargets(ctx, p, &v); err != nil {
				return err
			}
			var err error
			c, err = e.operationService(ctx, o, "edge", c.ID)
			if err != nil {
				return err
			}
			if c.State.Running != (command != "stop") {
				return codedError("PLATFORM_SERVICE_PROCESS_UNCONFIRMED")
			}
			return nil
		}()
		if applyErr != nil {
			audit.diagnostic(step.Action, applyErr)
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(applyErr)
			_ = audit.append(step)
			return applyErr
		}
		s.services["edge"] = liveService{observeContainer("edge", c), c}
		step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", operationProcessDigest(s, targets), "OWNED_PROCESS_STATE_OBSERVED"
		if err = audit.append(step); err != nil {
			return err
		}
		if err = os.Remove(filepath.Join(o.DataRoot, "operation.intent.json")); err != nil {
			return err
		}
	}
	p.Command = "logs"
	p.RequestID, err = randomIdentity()
	if err != nil {
		return err
	}
	s := operationSnapshot{runtime: true, network: true, services: map[string]liveService{"edge": {observeContainer("edge", c), c}}}
	r := OperationResult{}
	if err = e.exportOperationLogs(ctx, p, &r, s); err != nil {
		return err
	}
	if r.Export == nil || r.Export.CapturedBytes > 262144 {
		return codedError("PLATFORM_LOG_EXPORT_CONTENT_UNCONFIRMED")
	}
	if err = e.exportOperationLogs(ctx, p, &r, s); err != nil {
		return err
	}
	if r.Outcome != "NO_CHANGE" {
		return codedError("PLATFORM_LOG_EXPORT_CONTENT_UNCONFIRMED")
	}
	return nil
}

// Parser-only validation: no listener, port, ACME request or public tunnel.
func validateIsolatedIngress(ctx context.Context, e *Engine, o Options, audit recorder) error {
	b, err := readIngressBundle(o)
	if err != nil {
		return err
	}
	m, err := e.readOriginMaterial(o, false)
	if err != nil {
		return err
	}
	step := Step{"PLATFORM_INGRESS_ISOLATED_VALIDATED", "ACCEPTED", "REQUESTED", b.ID, "NOT_OBSERVED", "DISPOSABLE_TEST_VALIDATION"}
	if err = audit.append(step); err != nil {
		return err
	}
	project := "ai-platform-" + e.shortID(o) + "-ingress-validate"
	v := accessVolume{Name: project + "-config", UID: 1000, Files: map[string]accessFile{".platform-owner": {[]byte(m.Owner), 0400}}}
	for name := range b.Files {
		data, err := os.ReadFile(filepath.Join(ingressBundleDirectory(o, b.Revision), name))
		if err != nil {
			return err
		}
		v.Files[name] = accessFile{data, 0400}
	}
	s := accessSpec{Project: project, Owner: m.Owner, Volumes: map[string]accessVolume{"validation": v}}
	helper := o
	helper.Phase = "ingress"
	if err = e.ensureAccessVolume(ctx, helper, s, "validation", v); err != nil {
		return err
	}
	for index, file := range []string{"Caddyfile.direct", "Caddyfile.tunnel"} {
		name := project + "-" + itoa(index)
		_, err = e.docker(ctx, o, "run", "--rm", "--name", name, "--network", "none", "--read-only", "--user", "1000:1000", "--cap-drop", "ALL", "--security-opt", "no-new-privileges=true", "--pids-limit", "128", "--memory", "128m", "--mount", "type=volume,source="+v.Name+",target=/bundle,readonly", "--workdir", "/bundle", "--entrypoint", "caddy", accessReleases()["caddy"].Platforms[e.Host.Arch].Reference, "adapt", "--config", file, "--adapter", "caddyfile")
		if err != nil {
			return err
		}
		remaining, err := e.readAccessContainer(ctx, o, name)
		if err != nil || remaining != nil {
			return codedError("PLATFORM_INGRESS_TEST_CONTAINER_CLEANUP_UNCONFIRMED")
		}
	}
	response, err := e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
	if err != nil || response.ExitCode != 0 {
		return codedError("PLATFORM_INGRESS_TEST_VOLUME_UNCONFIRMED")
	}
	var volumes []struct{ Labels map[string]string }
	if json.Unmarshal([]byte(response.Output), &volumes) != nil || len(volumes) != 1 {
		return codedError("PLATFORM_INGRESS_TEST_VOLUME_UNCONFIRMED")
	}
	for key, value := range volumeLabels(o, s, "validation", v) {
		if volumes[0].Labels[key] != value {
			return codedError("PLATFORM_INGRESS_TEST_VOLUME_UNCONFIRMED")
		}
	}
	if _, err = e.docker(ctx, o, "volume", "rm", v.Name); err != nil {
		return err
	}
	response, err = e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
	if err != nil || response.ExitCode == 0 || !strings.Contains(strings.ToLower(response.Output), "no such volume:") {
		return codedError("PLATFORM_INGRESS_TEST_VOLUME_CLEANUP_UNCONFIRMED")
	}
	step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", b.ID, "PARSER_VALIDATION_AND_OWNED_CLEANUP_CONFIRMED"
	return audit.append(step)
}

func cleanupIsolatedOrigin(ctx context.Context, e *Engine, o Options, audit recorder) error {
	m, err := e.workingOriginMaterial(o)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var record originRecord
	var intent originIntent
	if err = networkControl(o, "origin.resources.json", &record); err != nil {
		return err
	}
	if err = networkControl(o, "origin.intent.json", &intent); err != nil {
		return err
	}
	resources := append(append([]originResource{}, record.Retained...), record.Active, intent.Candidate)
	step := Step{"PLATFORM_ORIGIN_ISOLATED_TEST_REMOVED", "ACCEPTED", "REQUESTED", digest(jsonBytes(resources)), "NOT_OBSERVED", "DISPOSABLE_TEST_CLEANUP"}
	if err = audit.append(step); err != nil {
		return err
	}
	_, s, _ := e.originSpec(o, m)
	helper := o
	helper.Phase = "origin"
	if err = e.cleanupAccessHelper(ctx, helper, s); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, resource := range resources {
		if resource.Name == "" || seen[resource.Name] {
			continue
		}
		seen[resource.Name] = true
		c, err := e.originContainer(ctx, o, resource, m)
		if err != nil {
			return err
		}
		if c != nil {
			if _, err = e.docker(ctx, o, "container", "rm", "--force", c.ID); err != nil {
				return err
			}
			remaining, err := e.readAccessContainer(ctx, o, resource.Name)
			if err != nil || remaining != nil {
				return codedError("PLATFORM_ORIGIN_TEST_CLEANUP_UNCONFIRMED")
			}
		}
		response, err := e.dockerResponse(ctx, o, "volume", "inspect", resource.Volume)
		if err != nil {
			return err
		}
		if response.ExitCode != 0 {
			if strings.Contains(strings.ToLower(response.Output), "no such volume:") {
				continue
			}
			return codedError("PLATFORM_ORIGIN_TEST_VOLUME_INSPECTION_FAILED")
		}
		var volumes []struct{ Labels map[string]string }
		if json.Unmarshal([]byte(response.Output), &volumes) != nil || len(volumes) != 1 {
			return codedError("PLATFORM_ORIGIN_TEST_VOLUME_INSPECTION_FAILED")
		}
		for key, value := range map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.owner": m.Owner, "ai.platform.component": "access-volume", "ai.platform.volume": "origin", "ai.platform.spec": resource.VolumeSpec} {
			if volumes[0].Labels[key] != value {
				return codedError("PLATFORM_ORIGIN_TEST_FOREIGN_VOLUME")
			}
		}
		if _, err = e.docker(ctx, o, "volume", "rm", resource.Volume); err != nil {
			return err
		}
		response, err = e.dockerResponse(ctx, o, "volume", "inspect", resource.Volume)
		if err != nil || response.ExitCode == 0 || !strings.Contains(strings.ToLower(response.Output), "no such volume:") {
			return codedError("PLATFORM_ORIGIN_TEST_CLEANUP_UNCONFIRMED")
		}
	}
	step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", "ABSENT", "DISPOSABLE_TEST_REMOVAL_CONFIRMED"
	return audit.append(step)
}
