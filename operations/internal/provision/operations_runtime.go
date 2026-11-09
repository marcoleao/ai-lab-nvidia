package provision

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

const runtimeComponent = "container-runtime"

var runtimeOperationCatalog = map[string]operationSpec{
	"start":   {"PLATFORM_RUNTIME_STARTED", "owned_runtime_lifecycle", "runtime_process_digest", "external_native_ledger"},
	"stop":    {"PLATFORM_RUNTIME_STOPPED", "owned_runtime_lifecycle", "runtime_process_digest", "external_native_ledger"},
	"restart": {"PLATFORM_RUNTIME_RESTARTED", "owned_runtime_lifecycle", "runtime_process_digest", "external_native_ledger"},
}

type RuntimeObservation struct {
	Mode          string `json:"mode"`
	Controller    string `json:"controller"`
	State         string `json:"state"`
	Owned         bool   `json:"owned"`
	APIReady      bool   `json:"api_ready"`
	Configuration string `json:"configuration_sha256,omitempty"`
	Incarnation   string `json:"incarnation_sha256,omitempty"`
	Reason        string `json:"reason_code,omitempty"`
	NextAction    string `json:"next_action,omitempty"`
}

func operationComponents() []string {
	return append([]string{"all", runtimeComponent}, managedOperationServices()...)
}

// Read only the exact configuration files committed by the installer. Never
// adopt arbitrary manifest paths or reconcile a partial setup transaction here.
func (e *Engine) ownedRuntimeConfiguration(o Options) (string, error) {
	if o.RuntimeMode != "owned" {
		return "", codedError("PLATFORM_RUNTIME_EXTERNAL_MANAGEMENT_REQUIRED")
	}
	if _, err := os.Stat(filepath.Join(o.ControlRoot, "platform_container_runtime_prepared.state")); err != nil {
		return "", codedError("PLATFORM_RUNTIME_PREPARATION_REQUIRED")
	}
	if err := verifyToolFiles(filepath.Join(o.DataRoot, "tools")); err != nil {
		return "", err
	}
	if err := plain(filepath.Join(o.DataRoot, "runtime.intent.json")); err != nil {
		return "", err
	}
	if _, err := os.Lstat(filepath.Join(o.DataRoot, "runtime.intent.json")); !os.IsNotExist(err) {
		return "", codedError("PLATFORM_RUNTIME_PENDING_CONFIGURATION")
	}
	var manifest map[string]string
	if err := networkControl(o, "runtime.resources.json", &manifest); err != nil {
		return "", err
	}
	paths := []string{filepath.Join(o.DataRoot, "daemon.json"), e.path("/etc/systemd/system/" + e.runtimeUnit(o))}
	if e.Host.OS == "darwin" {
		paths = []string{filepath.Join(o.DataRoot, "colima", e.profileName(o), "colima.yaml")}
	}
	if len(manifest) != len(paths) {
		return "", codedError("PLATFORM_RUNTIME_MANIFEST_INVALID")
	}
	for _, path := range paths {
		if err := plain(path); err != nil {
			return "", err
		}
		info, err := os.Lstat(path)
		if err != nil {
			return "", err
		}
		if !info.Mode().IsRegular() || info.Size() > 1<<20 {
			return "", codedError("PLATFORM_RUNTIME_MANIFEST_INVALID")
		}
		f, err := os.Open(path)
		if err != nil {
			return "", err
		}
		err = regularSingleLink(f)
		f.Close()
		if err != nil {
			return "", err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return "", err
		}
		if !hashPattern.MatchString(manifest[path]) || digest(data) != manifest[path] {
			return "", codedError("PLATFORM_RUNTIME_CONFIGURATION_CHANGED")
		}
	}
	return digest(jsonBytes(manifest)), nil
}

func (e *Engine) runtimeUnit(o Options) string {
	return "ai-platform-docker-" + e.shortID(o) + ".service"
}

func parseRuntimeProperties(output string) (map[string]string, error) {
	values := map[string]string{}
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		key, value, ok := strings.Cut(line, "=")
		if !ok || key == "" {
			return nil, codedError("PLATFORM_RUNTIME_CONTROLLER_INVALID")
		}
		if _, exists := values[key]; exists {
			return nil, codedError("PLATFORM_RUNTIME_CONTROLLER_INVALID")
		}
		values[key] = value
	}
	return values, nil
}

func (e *Engine) runtimeController(ctx context.Context, o Options) (RuntimeObservation, error) {
	v := RuntimeObservation{Mode: o.RuntimeMode, State: "UNKNOWN"}
	if e.Host.OS == "linux" {
		v.Controller = "systemd"
		response, err := e.command(ctx, Command{Program: "/usr/bin/systemctl", Args: []string{"show", e.runtimeUnit(o), "--no-pager", "--property=Id,LoadState,ActiveState,SubState,FragmentPath,DropInPaths,NeedDaemonReload,Transient,InvocationID"}, Env: map[string]string{"LC_ALL": "C"}})
		if err != nil {
			return v, err
		}
		if response.Truncated {
			return v, codedError("PLATFORM_RUNTIME_CONTROLLER_INVALID")
		}
		p, err := parseRuntimeProperties(response.Output)
		if err != nil {
			return v, err
		}
		for _, key := range []string{"Id", "LoadState", "ActiveState", "SubState", "FragmentPath", "DropInPaths", "NeedDaemonReload", "Transient", "InvocationID"} {
			if _, ok := p[key]; !ok {
				return v, codedError("PLATFORM_RUNTIME_CONTROLLER_INVALID")
			}
		}
		if p["Id"] != e.runtimeUnit(o) || p["LoadState"] != "loaded" || p["FragmentPath"] != e.path("/etc/systemd/system/"+e.runtimeUnit(o)) || p["DropInPaths"] != "" || p["NeedDaemonReload"] != "no" || p["Transient"] != "no" {
			return v, codedError("PLATFORM_RUNTIME_CONTROLLER_CONFLICT")
		}
		if p["InvocationID"] != "" && (len(p["InvocationID"]) != 32 || !operationPattern.MatchString(p["InvocationID"])) {
			return v, codedError("PLATFORM_RUNTIME_CONTROLLER_INVALID")
		}
		if p["InvocationID"] != "" {
			v.Incarnation = digest([]byte(p["InvocationID"]))
		}
		switch {
		case p["ActiveState"] == "active" && p["SubState"] == "running":
			v.State = "RUNNING"
		case p["ActiveState"] == "inactive" && p["SubState"] == "dead":
			v.State = "STOPPED"
		case p["ActiveState"] == "failed" && p["SubState"] == "failed":
			v.State = "STOPPED"
			v.Reason = "PLATFORM_RUNTIME_CONTROLLER_FAILED"
		case slices.Contains([]string{"activating", "deactivating", "reloading"}, p["ActiveState"]):
			v.State = "TRANSITION"
		default:
			return v, codedError("PLATFORM_RUNTIME_CONTROLLER_INVALID")
		}
	} else {
		v.Controller = "colima"
		name := "colima-" + e.profileName(o)
		dir := filepath.Join(o.DataRoot, "lima", name)
		// A missing instance is an installation problem, not permission to create
		// a VM or obtain a new disk image during daily operation.
		for _, leaf := range []string{"lima.yaml", "basedisk", "diffdisk"} {
			path := filepath.Join(dir, leaf)
			if err := plain(path); err != nil {
				return v, err
			}
			info, err := os.Lstat(path)
			if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
				return v, codedError("PLATFORM_RUNTIME_VM_PREPARATION_REQUIRED")
			}
			f, err := os.Open(path)
			if err != nil {
				return v, codedError("PLATFORM_RUNTIME_VM_PREPARATION_REQUIRED")
			}
			err = regularSingleLink(f)
			info, statErr := f.Stat()
			f.Close()
			if err != nil {
				return v, err
			}
			if statErr != nil || info.Size() == 0 {
				return v, codedError("PLATFORM_RUNTIME_VM_PREPARATION_REQUIRED")
			}
		}
		response, err := e.command(ctx, Command{Program: filepath.Join(o.DataRoot, "tools", "bin", "limactl"), Args: []string{"list", name, "--json"}, Env: e.runtimeEnv(o)})
		if err != nil {
			return v, err
		}
		var instance struct {
			Name, Dir, Status, Arch string
			HostAgentPID            int `json:"hostAgentPID"`
		}
		if response.Truncated || json.Unmarshal([]byte(response.Output), &instance) != nil || instance.Name != name || instance.Dir != dir || instance.Arch != "aarch64" || instance.HostAgentPID < 0 {
			return v, codedError("PLATFORM_RUNTIME_VM_IDENTITY_CONFLICT")
		}
		switch instance.Status {
		case "Running":
			v.State = "RUNNING"
		case "Stopped":
			v.State = "STOPPED"
		default:
			v.State = "TRANSITION"
		}
		if instance.HostAgentPID > 0 {
			v.Incarnation = digest([]byte(itoa(instance.HostAgentPID)))
		}
	}
	return v, nil
}

func (e *Engine) observeRuntimeOperation(ctx context.Context, o Options) RuntimeObservation {
	v := RuntimeObservation{Mode: o.RuntimeMode, State: "NOT_PREPARED", NextAction: "setup install --phase runtime"}
	if o.RuntimeMode == "external" {
		v.Controller = "external"
		v.State = "UNAVAILABLE"
		v.NextAction = "restore the externally managed Docker service"
		if err := verifyToolFiles(filepath.Join(o.DataRoot, "tools")); err != nil {
			v.Reason = code(err)
			return v
		}
		if _, err := e.runtimeProof(ctx, o, map[string][]byte{}); err == nil {
			v.State = "RUNNING"
			v.APIReady = true
			v.NextAction = ""
		} else {
			v.Reason = code(err)
		}
		return v
	}
	configuration, err := e.ownedRuntimeConfiguration(o)
	if err != nil {
		v.State = "CONFLICT"
		v.Reason = code(err)
		return v
	}
	v, err = e.runtimeController(ctx, o)
	v.Configuration = configuration
	v.Owned = err == nil
	if err != nil {
		v.State = "CONFLICT"
		v.Reason = code(err)
		v.NextAction = "verify the committed runtime and its controller"
		return v
	}
	if v.State == "RUNNING" {
		if _, err = e.runtimeProof(ctx, o, map[string][]byte{}); err == nil {
			v.APIReady = true
		} else {
			v.Reason = code(err)
			v.NextAction = "doctor: inspect the owned runtime; do not reinstall or reset it"
		}
	} else {
		v.NextAction = "start --component container-runtime"
		if v.State == "STOPPED" {
			if _, err := e.runtimeProof(ctx, o, map[string][]byte{}); err == nil {
				v.State = "CONFLICT"
				v.Owned = false
				v.Reason = "PLATFORM_RUNTIME_CONTROLLER_ENDPOINT_CONFLICT"
				v.NextAction = "verify the endpoint: a stopped controller must not have a responding engine"
			}
		}
	}
	return v
}

func runtimeProcessDigest(v RuntimeObservation) string {
	return digest(jsonBytes(map[string]any{"mode": v.Mode, "controller": v.Controller, "state": v.State, "owned": v.Owned, "api_ready": v.APIReady, "configuration": v.Configuration, "incarnation": v.Incarnation}))
}

func (e *Engine) requireRuntimeIdle(ctx context.Context, o Options) error {
	swarm, err := e.docker(ctx, o, "info", "--format", "{{.Swarm.LocalNodeState}}")
	if err != nil {
		return err
	}
	if swarm.Truncated || strings.TrimSpace(swarm.Output) != "inactive" {
		return codedError("PLATFORM_RUNTIME_WORKLOADS_UNCONFIRMED")
	}
	response, err := e.docker(ctx, o, "container", "ls", "--all", "--no-trunc", "--format", "{{.ID}} {{.State}}")
	if err != nil {
		return err
	}
	if response.Truncated {
		return codedError("PLATFORM_RUNTIME_WORKLOADS_UNCONFIRMED")
	}
	for _, line := range strings.Split(strings.TrimSpace(response.Output), "\n") {
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) != 2 || !hashPattern.MatchString(fields[0]) {
			return codedError("PLATFORM_RUNTIME_WORKLOADS_UNCONFIRMED")
		}
		if !slices.Contains([]string{"created", "exited"}, fields[1]) {
			return codedError("PLATFORM_RUNTIME_RUNNING_CONTAINERS")
		}
	}
	return nil
}

func (e *Engine) setRuntimeRunning(ctx context.Context, o Options, wanted bool, configuration string) error {
	v := e.observeRuntimeOperation(ctx, o)
	if !v.Owned || v.Configuration != configuration || v.State == "TRANSITION" || v.State == "CONFLICT" {
		return codedError("PLATFORM_RUNTIME_OWNERSHIP_NOT_CONFIRMED")
	}
	if (v.State == "RUNNING") == wanted {
		if wanted && !v.APIReady {
			return codedError("PLATFORM_RUNTIME_API_UNAVAILABLE")
		}
		return nil
	}
	if !wanted {
		if !v.APIReady {
			return codedError("PLATFORM_RUNTIME_WORKLOADS_UNCONFIRMED")
		}
		if err := e.requireRuntimeIdle(ctx, o); err != nil {
			return err
		}
	}
	verb := "start"
	if !wanted {
		verb = "stop"
	}
	c := Command{Program: "/usr/bin/systemctl", Args: []string{verb, e.runtimeUnit(o)}}
	if e.Host.OS == "darwin" {
		c = Command{Program: filepath.Join(o.DataRoot, "tools", "bin", "colima"), Args: []string{verb, "--profile", e.profileName(o)}, Env: e.runtimeEnv(o)}
		if wanted {
			c.Args = append(c.Args, "--save-config=false")
		}
	}
	_, callErr := e.command(ctx, c)
	v = e.observeRuntimeOperation(ctx, o)
	if v.Owned && v.Configuration == configuration && ((wanted && v.State == "RUNNING" && v.APIReady) || (!wanted && v.State == "STOPPED")) {
		return nil
	}
	if callErr != nil {
		return callErr
	}
	return codedError("PLATFORM_RUNTIME_PROCESS_UNCONFIRMED")
}
