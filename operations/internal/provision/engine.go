package provision

import (
	"ai-platform/operations/internal/platform"
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (e *Engine) defaults(o *Options) error {
	if e.Runner == nil {
		e.Runner = systemRunner{}
	}
	if e.Downloader == nil {
		e.Downloader = httpDownloader{}
	}
	if e.Now == nil {
		e.Now = time.Now
	}
	if o.Action == "" {
		o.Action = "plan"
	}
	if o.Phase == "" {
		o.Phase = "all"
	}
	if o.Action != "plan" && o.Action != "install" {
		return codedError("PLATFORM_SETUP_ACTION_INVALID")
	}
	if o.Phase != "all" && o.Phase != "infrastructure" && o.Phase != "access" && o.Phase != "origin" && o.Phase != "ingress" && o.Phase != "observability" && o.Phase != "hub" && o.Phase != "host" && o.Phase != "runtime" && o.Phase != "network" {
		return codedError("PLATFORM_SETUP_PHASE_INVALID")
	}
	if !validID(o.InstallationID) {
		return codedError("PLATFORM_IDENTITY_INVALID")
	}
	if o.OperationID == "" {
		var id [16]byte
		if _, err := rand.Read(id[:]); err != nil {
			return err
		}
		o.OperationID = hex.EncodeToString(id[:])
	}
	if !operationPattern.MatchString(o.OperationID) {
		return codedError("PLATFORM_CORRELATION_INVALID")
	}
	if o.IdentityPort == 0 {
		o.IdentityPort = 8082
	}
	if o.SecretStorePort == 0 {
		o.SecretStorePort = 8200
	}
	if o.OriginPort == 0 {
		o.OriginPort = 9443
	}
	if o.GrafanaPort == 0 {
		o.GrafanaPort = 3001
	}
	if o.HubPort == 0 {
		o.HubPort = 3300
	}
	if o.HubPort < 1024 || o.HubPort > 65535 || o.Phase == "hub" && (o.HubPort == o.GrafanaPort || o.HubPort == o.IdentityPort || o.HubPort == o.SecretStorePort || o.HubPort == o.OriginPort) {
		return codedError("PLATFORM_HUB_PORT_INVALID")
	}
	if o.GrafanaPort < 1024 || o.GrafanaPort > 65535 || o.GrafanaPort == o.OriginPort || o.GrafanaPort == o.IdentityPort || o.GrafanaPort == o.SecretStorePort {
		return codedError("PLATFORM_OBSERVABILITY_PORT_INVALID")
	}
	if o.OriginPort < 1024 || o.OriginPort > 65535 || o.OriginPort == o.IdentityPort || o.OriginPort == o.SecretStorePort {
		return codedError("PLATFORM_ORIGIN_PORT_INVALID")
	}
	if o.OriginRevision != "" && (!validID(o.OriginRevision) || o.Phase != "origin") {
		return codedError("PLATFORM_ORIGIN_REVISION_INVALID")
	}
	if s := o.Ingress; s != nil && o.Phase == "ingress" {
		if !validID(s.Revision) || s.DirectPort < 1024 || s.DirectPort > 65535 || s.TunnelPort < 1024 || s.TunnelPort > 65535 || s.DirectPort == s.TunnelPort || s.DirectPort == o.OriginPort || s.TunnelPort == o.OriginPort {
			return codedError("PLATFORM_INGRESS_SETTINGS_INVALID")
		}
	}
	if o.IdentityPort < 1024 || o.IdentityPort > 65535 || o.SecretStorePort < 1024 || o.SecretStorePort > 65535 || o.IdentityPort == o.SecretStorePort {
		return codedError("PLATFORM_ACCESS_PORTS_INVALID")
	}
	if (o.Phase == "access" || o.Phase == "all" || o.Phase == "origin") && o.PublicationMode != "" && o.PublicationMode != "local" {
		return codedError("PLATFORM_EXTERNAL_PUBLICATION_NOT_QUALIFIED")
	}
	switch o.Profile {
	case "precision-windows":
		if e.Host.OS != "linux" || e.Host.Arch != "amd64" || !e.Host.WSL {
			return codedError("PLATFORM_SETUP_PROFILE_MISMATCH")
		}
	case "dell-gb10":
		if e.Host.OS != "linux" || e.Host.Arch != "arm64" || e.Host.WSL {
			return codedError("PLATFORM_SETUP_PROFILE_MISMATCH")
		}
	case "macos-m3-max":
		if e.Host.OS != "darwin" || e.Host.Arch != "arm64" {
			return codedError("PLATFORM_SETUP_PROFILE_MISMATCH")
		}
	default:
		return codedError("PLATFORM_SETUP_PROFILE_MISMATCH")
	}
	if e.Host.OS == "linux" && (e.Host.Distribution != "ubuntu" || e.Host.Codename != "noble") {
		return codedError("PLATFORM_UBUNTU_NOBLE_REQUIRED")
	}
	if o.Action == "install" && e.Host.OS == "linux" && !e.Host.Root {
		return codedError("PLATFORM_ROOT_REQUIRED")
	}
	if e.Host.OS == "darwin" && e.Host.Root {
		return codedError("PLATFORM_MACOS_USER_REQUIRED")
	}
	if o.ControlRoot == "" {
		if e.Host.OS == "darwin" {
			o.ControlRoot = filepath.Join(e.Host.Home, "Library", "Application Support", "AIPlatform", "control", o.InstallationID)
		} else {
			o.ControlRoot = e.path("/var/lib/ai-platform-control/" + o.InstallationID)
		}
	}
	if o.DataRoot == "" {
		if e.Host.OS == "darwin" {
			o.DataRoot = filepath.Join(e.Host.Home, "Library", "Application Support", "AIPlatform", "data", o.InstallationID)
		} else {
			o.DataRoot = e.path("/var/lib/ai-platform/" + o.InstallationID)
		}
	}
	if overlap(o.ControlRoot, o.DataRoot) {
		return codedError("PLATFORM_CONTROL_MUST_BE_EXTERNAL")
	}
	for _, p := range []string{o.ControlRoot, o.DataRoot} {
		if err := plain(p); err != nil {
			return err
		}
		if strings.ContainsAny(p, "\r\n\x00\t") {
			return codedError("PLATFORM_PROVISION_PATH_INVALID")
		}
	}
	if o.Pool == "" {
		o.Pool = "10.248.0.0/16"
	}
	if o.RuntimeMode == "" {
		o.RuntimeMode = "auto"
	}
	if o.RuntimeMode != "auto" && o.RuntimeMode != "owned" && o.RuntimeMode != "external" {
		return codedError("PLATFORM_RUNTIME_MODE_INVALID")
	}
	modePath := filepath.Join(o.DataRoot, "runtime.mode")
	if err := plain(modePath); err != nil {
		return err
	}
	previousMode, modeErr := os.ReadFile(modePath)
	if modeErr != nil && !os.IsNotExist(modeErr) {
		return modeErr
	}
	if modeErr == nil {
		saved := string(previousMode)
		if saved != "owned" && saved != "external" {
			return codedError("PLATFORM_RUNTIME_MODE_INVALID")
		}
		if o.RuntimeMode != "auto" && o.RuntimeMode != saved {
			return codedError("PLATFORM_RUNTIME_MODE_MIGRATION_REQUIRED")
		}
		o.RuntimeMode = saved
	}
	if o.RuntimeMode == "auto" {
		o.RuntimeMode = "owned"
		if e.Host.OS == "linux" {
			if _, err := os.Stat(filepath.Join(o.DataRoot, "runtime.resources.json")); os.IsNotExist(err) {
				if info, err := os.Stat(e.path("/var/run/docker.sock")); err == nil && info.Mode()&os.ModeSocket != 0 {
					o.RuntimeMode = "external"
				}
			}
		}
	}
	if e.Host.OS == "darwin" && o.RuntimeMode != "owned" {
		return codedError("PLATFORM_COLIMA_OWNED_PROFILE_REQUIRED")
	}
	prefix, err := netip.ParsePrefix(o.Pool)
	if err != nil || !prefix.Addr().Is4() || !prefix.Addr().IsPrivate() || prefix.Bits() < 16 || prefix.Bits() > 24 || prefix != prefix.Masked() {
		return codedError("PLATFORM_RUNTIME_POOL_INVALID")
	}
	if o.MemoryGiB == 0 {
		o.MemoryGiB = 16
	}
	if o.CPUs == 0 {
		o.CPUs = 4
	}
	if o.DiskGiB == 0 {
		o.DiskGiB = 80
	}
	if o.MemoryGiB < 4 || o.MemoryGiB > 64 || o.CPUs < 2 || o.CPUs > 32 || o.DiskGiB < 20 || o.DiskGiB > 1024 {
		return codedError("PLATFORM_RUNTIME_CAPACITY_INVALID")
	}
	return nil
}
func (e *Engine) Run(ctx context.Context, options Options) (Result, error) {
	r := Result{SchemaVersion: 1, InstallationID: options.InstallationID, Profile: options.Profile, Decision: "NOT_APPLICABLE", Outcome: "SUCCEEDED", Phase: "COMPLETED", Steps: []Step{}, Limitations: []string{"HOST_OS_KERNEL_FIRMWARE_EXTERNALLY_MANAGED", "GPU_COMPUTE_AND_CONTAINER_NOT_QUALIFIED", "APPLICATIONS_AND_PUBLICATION_PENDING"}}
	if err := e.defaults(&options); err != nil {
		r.OperationID = options.OperationID
		return r, err
	}
	r.OperationID = options.OperationID
	r.RuntimeMode = options.RuntimeMode
	r.Planned = options.Action == "plan"
	selected := []string{}
	if options.Phase == "all" || options.Phase == "infrastructure" || options.Phase == "host" {
		selected = append(selected, "PLATFORM_OS_PACKAGES_PREPARED", "PLATFORM_GPU_ACCESS_VERIFIED")
	}
	if options.Phase == "all" || options.Phase == "infrastructure" || options.Phase == "runtime" {
		selected = append(selected, "PLATFORM_RUNTIME_ARTIFACTS_PREPARED")
		if e.Host.OS == "linux" {
			selected = append(selected, "PLATFORM_NVIDIA_CDI_PREPARED")
		}
		selected = append(selected, "PLATFORM_CONTAINER_RUNTIME_PREPARED")
	}
	if options.Phase == "all" || options.Phase == "infrastructure" || options.Phase == "network" {
		selected = append(selected, "PLATFORM_NETWORK_PROBE_IMAGE_PREPARED", "PLATFORM_NETWORKS_PREPARED")
		r.Networks = e.networkViews(options)
	}
	if options.Phase == "all" || options.Phase == "access" {
		selected = append(selected, "PLATFORM_ACCESS_CREDENTIALS_PREPARED", "PLATFORM_ACCESS_IMAGES_PREPARED", "PLATFORM_ACCESS_SERVICES_PREPARED", "PLATFORM_SECRET_STORE_BOOTSTRAPPED")
		r.AccessEndpoints = accessEndpoints(options)
	}
	if options.Phase == "all" || options.Phase == "origin" {
		selected = append(selected, "PLATFORM_ORIGIN_IMAGE_PREPARED", "PLATFORM_ORIGIN_TLS_MATERIAL_PREPARED", "PLATFORM_ORIGIN_TLS_SERVICE_PREPARED")
		r.OriginEndpoint = originURL(options)
		r.Limitations = append(r.Limitations, "ORIGIN_MTLS_LOOPBACK_ONLY_NO_PUBLIC_ROUTES", "WINDOWS_ORIGIN_FORWARDING_NOT_QUALIFIED")
	}
	if options.Phase == "ingress" {
		selected = append(selected, "PLATFORM_INGRESS_BUNDLE_PREPARED")
		r.Limitations = append(r.Limitations, "INGRESS_CONFIGURATION_ONLY_NOT_ACTIVATED", "APPLICATION_ROUTES_AND_CONNECTORS_NOT_IMPLEMENTED")
	}
	if options.Phase == "observability" {
		selected = append(selected, "PLATFORM_OBSERVABILITY_CREDENTIALS_PREPARED", "PLATFORM_OBSERVABILITY_IMAGES_PREPARED", "PLATFORM_OBSERVABILITY_SERVICES_PREPARED")
		r.GrafanaEndpoint = observabilityURL(options)
		r.DashboardUID = "platform-foundation"
		r.Limitations = append(r.Limitations, "OBSERVABILITY_HTTP_IDENTITY_JVM_ONLY", "LOGS_BACKEND_NO_INGESTION_PIPELINE", "GRAFANA_LOCAL_BOOTSTRAP_NO_SSO_PUBLICATION", "HOST_GPU_AGENTS_APPLICATIONS_NOT_COLLECTED")
	}
	if options.Phase == "hub" {
		selected = append(selected, "PLATFORM_HUB_IDENTITY_PREPARED", "PLATFORM_HUB_IMAGE_PREPARED", "PLATFORM_HUB_SERVICE_PREPARED")
		r.HubEndpoint = hubURL(options)
		r.Limitations = append(r.Limitations, "HUB_LOCAL_LINKS_NO_SSO_PUBLICATION", "HUB_NO_RUNTIME_HEALTH_WIDGETS")
	}
	if r.Planned {
		for _, a := range selected {
			r.Steps = append(r.Steps, Step{a, "PLANNED", "NOT_STARTED", "NOT_OBSERVED", "NOT_OBSERVED", "EXPLICIT_INSTALL_REQUIRED"})
		}
		return r, nil
	}
	if options.Phase == "ingress" && (options.Ingress == nil || !platform.PublicDNSHostname(options.IngressHostname)) {
		r.Outcome, r.Phase, r.Reason, r.ExitCode = "DEFERRED", "WAITING", "PLATFORM_INGRESS_PUBLIC_SETTINGS_REQUIRED", 42
		return r, nil
	}
	identity := options.InstallationID + ":" + options.Profile + ":" + e.Host.Actor
	if err := ownedDirectory(options.ControlRoot, identity); err != nil {
		return r, err
	}
	unlock, err := lockFile(filepath.Join(options.ControlRoot, "installation.lock"))
	if err != nil {
		return r, err
	}
	defer unlock()
	audit := recorder{options.ControlRoot, options, e.Host, e.Now}
	if err = ownedDirectory(options.DataRoot, identity+":control:"+digest([]byte(options.ControlRoot))); err != nil {
		return r, err
	}
	if options.Phase == "runtime" {
		for _, name := range []string{"platform_os_packages_prepared.state", "platform_gpu_access_verified.state"} {
			if _, err = os.ReadFile(filepath.Join(options.ControlRoot, name)); err != nil {
				return r, codedError("PLATFORM_HOST_PREPARATION_REQUIRED")
			}
		}
		if _, err = e.verifyGPU(ctx, options); err != nil {
			return r, err
		}
		r.HostReady = true
	}
	if options.Phase == "network" || options.Phase == "access" || options.Phase == "origin" || options.Phase == "ingress" || options.Phase == "observability" || options.Phase == "hub" {
		if _, err = os.ReadFile(filepath.Join(options.ControlRoot, "platform_container_runtime_prepared.state")); err != nil {
			return r, codedError("PLATFORM_RUNTIME_PREPARATION_REQUIRED")
		}
		if _, err = e.runtimeProof(ctx, options, map[string][]byte{}); err != nil {
			return r, err
		}
		r.RuntimeReady = true
		r.Endpoint = e.endpoint(options)
	}
	if options.Phase == "access" || options.Phase == "origin" || options.Phase == "ingress" || options.Phase == "observability" || options.Phase == "hub" {
		if err = e.requireAccessNetworks(ctx, options); err != nil {
			return r, err
		}
		r.NetworkReady = true
	}
	if options.Phase == "observability" || options.Phase == "hub" {
		if _, err = os.Stat(filepath.Join(options.ControlRoot, "platform_secret_store_bootstrapped.state")); err != nil {
			return r, codedError("PLATFORM_ACCESS_PREPARATION_REQUIRED")
		}
		for _, name := range []string{"operation.intent.json", "runtime-operation.intent.json"} {
			v, err := readOperationIntent(options, name)
			if err != nil {
				return r, err
			}
			if v.Schema != 0 {
				return r, codedError("PLATFORM_OPERATION_PENDING")
			}
		}
	}
	if options.Phase == "hub" {
		seed, readErr := readObservabilitySeed(options)
		if readErr != nil {
			return r, codedError("PLATFORM_HUB_OBSERVABILITY_REQUIRED")
		}
		spec, readErr := e.observabilitySpec(options, seed)
		var record accessRecord
		if readErr != nil {
			return r, readErr
		}
		if readErr = networkControl(options, "observability.resources.json", &record); readErr != nil || record.Spec != spec.Digest {
			return r, codedError("PLATFORM_HUB_OBSERVABILITY_REQUIRED")
		}
	}
	for _, action := range selected {
		before, err := e.fingerprint(ctx, action, options)
		if err != nil {
			return r, err
		}
		step := Step{action, "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "REQUEST_ACCEPTED"}
		if err = audit.append(step); err != nil {
			return r, err
		}
		r.effectsStarted = true
		after, reason, runErr := e.apply(ctx, action, options)
		step.After, step.Reason = after, reason
		if runErr != nil {
			audit.diagnostic(action, runErr)
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(runErr)
			if knownRestored(runErr) {
				step.Outcome, step.Phase, step.After = "FAILED", "COMPLETED", restoredFingerprint(runErr, before)
			}
			if err = audit.append(step); err != nil {
				return r, err
			}
			r.Steps = append(r.Steps, step)
			r.Outcome, r.Phase, r.Reason, r.ExitCode = step.Outcome, step.Phase, code(runErr), 1
			return r, nil
		}
		if reason == "REBOOT_REQUIRED" || reason == "CLT_REQUIRED" {
			step.Outcome, step.Phase = "DEFERRED", "WAITING"
		} else if before == after {
			step.Outcome, step.Phase = "NO_CHANGE", "COMPLETED"
		} else {
			step.Outcome, step.Phase = "SUCCEEDED", "COMPLETED"
		}
		if err = audit.append(step); err != nil {
			return r, err
		}
		r.Steps = append(r.Steps, step)
		if step.Phase == "WAITING" {
			r.Outcome, r.Phase, r.Reason, r.ExitCode = "DEFERRED", "WAITING", reason, 42
			return r, nil
		}
		switch action {
		case "PLATFORM_GPU_ACCESS_VERIFIED":
			r.HostReady = true
		case "PLATFORM_CONTAINER_RUNTIME_PREPARED":
			r.RuntimeReady = true
			r.Endpoint = e.endpoint(options)
		case "PLATFORM_NETWORKS_PREPARED":
			r.NetworkReady = true
		case "PLATFORM_ACCESS_SERVICES_PREPARED":
			r.IdentityReady = true
			r.EdgeReady = true
		case "PLATFORM_SECRET_STORE_BOOTSTRAPPED":
			r.SecretStoreReady = true
			r.AccessReady = true
		case "PLATFORM_ORIGIN_TLS_SERVICE_PREPARED":
			material, readErr := e.readOriginMaterial(options, false)
			if readErr != nil {
				return r, readErr
			}
			cert, readErr := originCert(material.Server)
			if readErr != nil {
				return r, readErr
			}
			r.OriginCertificateNotAfter = cert.NotAfter.UTC().Format(time.RFC3339)
			r.OriginCertificateSHA256 = digest(cert.Raw)
			r.OriginTLSReady = true
		case "PLATFORM_INGRESS_BUNDLE_PREPARED":
			bundle, readErr := readIngressBundle(options)
			if readErr != nil {
				return r, readErr
			}
			r.IngressArtifactsPrepared = true
			r.IngressBundleID = bundle.ID
			r.IngressBundleRevision = bundle.Revision
			r.IngressAdapters = bundle.Adapters
		case "PLATFORM_HUB_SERVICE_PREPARED":
			r.HubReady = true
		case "PLATFORM_OBSERVABILITY_SERVICES_PREPARED":
			r.ObservabilityReady = true
		}
	}
	r.HostReady = r.HostReady || options.Phase == "all" || options.Phase == "infrastructure" || options.Phase == "host"
	r.RuntimeReady = r.RuntimeReady || options.Phase == "all" || options.Phase == "infrastructure" || options.Phase == "runtime"
	r.NetworkReady = r.NetworkReady || options.Phase == "all" || options.Phase == "infrastructure" || options.Phase == "network"
	if r.RuntimeReady {
		r.Endpoint = e.endpoint(options)
	}
	return r, nil
}
func (e *Engine) fingerprint(ctx context.Context, action string, o Options) (string, error) {
	if strings.HasPrefix(action, "PLATFORM_HUB_") {
		return e.hubFingerprint(ctx, action, o)
	}
	if strings.HasPrefix(action, "PLATFORM_OBSERVABILITY_") {
		return e.observabilityFingerprint(ctx, action, o)
	}
	if action == "PLATFORM_INGRESS_BUNDLE_PREPARED" {
		return ingressFingerprint(o)
	}
	if originAction(action) {
		return e.originFingerprint(ctx, action, o)
	}
	if strings.HasPrefix(action, "PLATFORM_ACCESS_") || action == "PLATFORM_SECRET_STORE_BOOTSTRAPPED" {
		return e.accessFingerprint(ctx, action, o)
	}
	if action == "PLATFORM_NETWORK_PROBE_IMAGE_PREPARED" {
		return e.networkImageFingerprint(ctx, o)
	}
	if action == "PLATFORM_NETWORKS_PREPARED" {
		return e.networkFingerprint(ctx, o)
	}
	if action == "PLATFORM_GPU_ACCESS_VERIFIED" {
		return "NOT_APPLICABLE_READ_ONLY", nil
	}
	if action == "PLATFORM_NVIDIA_CDI_PREPARED" {
		if o.RuntimeMode == "external" {
			return "NOT_APPLICABLE_READ_ONLY", nil
		}
		data, err := os.ReadFile(filepath.Join(o.DataRoot, "cdi", "nvidia.yaml"))
		if os.IsNotExist(err) {
			return "ABSENT", nil
		}
		if err != nil {
			return "", err
		}
		return digest(data), nil
	}
	if action == "PLATFORM_RUNTIME_ARTIFACTS_PREPARED" {
		root := filepath.Join(o.DataRoot, "tools")
		if _, err := os.Stat(root); os.IsNotExist(err) {
			return "ABSENT", nil
		}
		if err := verifyToolFiles(root); err != nil {
			return "", err
		}
		data, err := os.ReadFile(filepath.Join(root, "assets.json"))
		return digest(data), err
	}
	if action == "PLATFORM_CONTAINER_RUNTIME_PREPARED" {
		return e.runtimeFingerprint(ctx, o)
	}
	if action == "PLATFORM_OS_PACKAGES_PREPARED" && e.Host.OS == "linux" {
		r, err := e.command(ctx, Command{Program: "/usr/bin/dpkg-query", Args: []string{"-W", "-f=${Package}=${Version}\\n"}})
		if err != nil {
			return "", err
		}
		return digest([]byte(r.Output)), nil
	}
	state := filepath.Join(o.ControlRoot, strings.ToLower(action)+".state")
	if err := plain(state); err != nil {
		return "", err
	}
	data, err := os.ReadFile(state)
	if os.IsNotExist(err) {
		return "ABSENT", nil
	}
	if err != nil {
		return "", err
	}
	return digest(data), nil
}
func (e *Engine) apply(ctx context.Context, action string, o Options) (string, string, error) {
	var proof []byte
	var err error
	reason := "VERIFIED"
	switch action {
	case "PLATFORM_HUB_IDENTITY_PREPARED":
		proof, err = prepareHubIdentity(o)
	case "PLATFORM_HUB_IMAGE_PREPARED":
		proof, err = e.prepareHubImage(ctx, o)
	case "PLATFORM_HUB_SERVICE_PREPARED":
		proof, err = e.prepareHub(ctx, o)
	case "PLATFORM_OBSERVABILITY_CREDENTIALS_PREPARED":
		proof, err = e.prepareObservabilityCredentials(o)
	case "PLATFORM_OBSERVABILITY_IMAGES_PREPARED":
		proof, err = e.prepareObservabilityImages(ctx, o)
	case "PLATFORM_OBSERVABILITY_SERVICES_PREPARED":
		proof, err = e.prepareObservabilityServices(ctx, o)
	case "PLATFORM_OS_PACKAGES_PREPARED":
		proof, reason, err = e.prepareOS(ctx, o)
	case "PLATFORM_GPU_ACCESS_VERIFIED":
		proof, err = e.verifyGPU(ctx, o)
	case "PLATFORM_RUNTIME_ARTIFACTS_PREPARED":
		proof, err = e.prepareArtifacts(ctx, o)
	case "PLATFORM_NVIDIA_CDI_PREPARED":
		proof, err = e.prepareCDI(ctx, o)
	case "PLATFORM_CONTAINER_RUNTIME_PREPARED":
		proof, err = e.prepareRuntime(ctx, o)
	case "PLATFORM_NETWORK_PROBE_IMAGE_PREPARED":
		proof, err = e.prepareNetworkImage(ctx, o)
	case "PLATFORM_NETWORKS_PREPARED":
		proof, err = e.prepareNetworks(ctx, o)
	case "PLATFORM_ACCESS_CREDENTIALS_PREPARED":
		proof, err = e.prepareAccessCredentials(o)
	case "PLATFORM_ACCESS_IMAGES_PREPARED":
		proof, err = e.prepareAccessImages(ctx, o)
	case "PLATFORM_ACCESS_SERVICES_PREPARED":
		proof, err = e.prepareAccessServices(ctx, o)
	case "PLATFORM_SECRET_STORE_BOOTSTRAPPED":
		proof, err = e.bootstrapSecretStore(ctx, o)
	case "PLATFORM_ORIGIN_IMAGE_PREPARED":
		proof, err = e.prepareOriginImage(ctx, o)
	case "PLATFORM_ORIGIN_TLS_MATERIAL_PREPARED":
		proof, err = e.prepareOriginMaterial(o)
	case "PLATFORM_ORIGIN_TLS_SERVICE_PREPARED":
		proof, err = e.prepareOriginService(ctx, o)
	case "PLATFORM_INGRESS_BUNDLE_PREPARED":
		proof, err = e.prepareIngressBundle(ctx, o)
	default:
		err = codedError("PLATFORM_SETUP_ACTION_UNKNOWN")
	}
	if err != nil {
		return "", "", err
	}
	if len(proof) == 0 {
		proof = []byte(reason)
	}
	state := filepath.Join(o.ControlRoot, strings.ToLower(action)+".state")
	if err = atomicFile(state, proof, 0600); err != nil {
		return "", "", err
	}
	if action == "PLATFORM_OS_PACKAGES_PREPARED" && e.Host.OS == "linux" {
		after, err := e.fingerprint(ctx, action, o)
		return after, reason, err
	}
	return digest(proof), reason, nil
}
func (e *Engine) endpoint(o Options) string {
	if o.RuntimeMode == "external" {
		return "unix://" + e.path("/var/run/docker.sock")
	}
	if e.Host.OS == "darwin" {
		return "unix://" + filepath.Join(o.DataRoot, "colima", e.profileName(o), "docker.sock")
	}
	return "unix://" + e.path("/run/ai-platform-"+e.shortID(o)+"/docker.sock")
}
func (e *Engine) shortID(o Options) string     { return digest([]byte(o.InstallationID))[:12] }
func (e *Engine) profileName(o Options) string { return "ai-platform-" + e.shortID(o) }
func (e *Engine) runtimeEnv(o Options) map[string]string {
	return map[string]string{"PATH": filepath.Join(o.DataRoot, "tools", "bin") + string(os.PathListSeparator) + "/usr/sbin:/usr/bin:/sbin:/bin", "DOCKER_CONFIG": filepath.Join(o.DataRoot, "client"), "DOCKER_HOST": e.endpoint(o), "DOCKER_CONTEXT": "", "DOCKER_TLS_VERIFY": "", "DOCKER_CERT_PATH": "", "DOCKER_API_VERSION": "", "COLIMA_HOME": filepath.Join(o.DataRoot, "colima"), "LIMA_HOME": filepath.Join(o.DataRoot, "lima"), "LC_ALL": "C"}
}
func (e *Engine) docker(ctx context.Context, o Options, args ...string) (Response, error) {
	return e.command(ctx, Command{Program: filepath.Join(o.DataRoot, "tools", "bin", "docker"), Args: append([]string{"--host", e.endpoint(o)}, args...), Env: e.runtimeEnv(o)})
}
func statusProof(data any) []byte { return jsonBytes(data) }
