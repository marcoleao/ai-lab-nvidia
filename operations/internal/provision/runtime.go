package provision

import (
	"context"
	"encoding/json"
	"fmt"
	"net/netip"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func (e *Engine) prepareRuntime(ctx context.Context, o Options) (proof []byte, finalErr error) {
	defer func() {
		if finalErr == nil {
			finalErr = atomicFile(filepath.Join(o.DataRoot, "runtime.mode"), []byte(o.RuntimeMode), 0600)
		}
	}()
	if err := verifyToolFiles(filepath.Join(o.DataRoot, "tools")); err != nil {
		return nil, err
	}
	if o.RuntimeMode == "external" {
		return e.runtimeProof(ctx, o, map[string][]byte{})
	}
	if e.Host.OS == "darwin" {
		return e.prepareColima(ctx, o)
	}
	// No default bridge and no TCP endpoint. Future stacks get private user-defined
	// networks from the configured pool; check host routes without touching them.
	configPath := filepath.Join(o.DataRoot, "daemon.json")
	oldConfig, _ := os.ReadFile(configPath)
	samePool := strings.Contains(string(oldConfig), `"base":"`+o.Pool+`"`)
	routes, err := e.command(ctx, Command{Program: "/usr/sbin/ip", Args: []string{"-j", "route", "show"}})
	if err != nil {
		return nil, err
	}
	var routeList []struct {
		Destination string `json:"dst"`
	}
	if json.Unmarshal([]byte(routes.Output), &routeList) != nil {
		return nil, codedError("PLATFORM_ROUTE_PROBE_INVALID")
	}
	pool, _ := netip.ParsePrefix(o.Pool)
	for _, route := range routeList {
		if route.Destination == "default" || samePool {
			continue
		}
		prefix, err := netip.ParsePrefix(route.Destination)
		if err != nil {
			if address, parseErr := netip.ParseAddr(route.Destination); parseErr == nil {
				prefix = netip.PrefixFrom(address, address.BitLen())
				err = nil
			}
		}
		if err == nil && prefix.Overlaps(pool) {
			return nil, codedError("PLATFORM_RUNTIME_NETWORK_CONFLICT")
		}
	}
	runDir := e.path("/run/ai-platform-" + e.shortID(o))
	dataDir := filepath.Join(o.DataRoot, "docker")
	configuration := map[string]any{"hosts": []string{e.endpoint(o)}, "group": "root", "data-root": dataDir, "exec-root": filepath.Join(runDir, "exec"), "pidfile": filepath.Join(runDir, "docker.pid"), "bridge": "none", "iptables": false, "ip6tables": false, "ip-forward": false, "ip-masq": false, "containerd-namespace": "ai-platform-" + e.shortID(o), "containerd-plugins-namespace": "ai-platform-plugins-" + e.shortID(o), "default-address-pools": []map[string]any{{"base": o.Pool, "size": 24}}, "cdi-spec-dirs": []string{filepath.Join(o.DataRoot, "cdi")}, "features": map[string]bool{"cdi": true}, "log-driver": "local", "log-opts": map[string]string{"max-size": "10m", "max-file": "3"}}
	unitName := "ai-platform-docker-" + e.shortID(o) + ".service"
	unitPath := e.path("/etc/systemd/system/" + unitName)
	quote := func(s string) string { return strconv.Quote(strings.ReplaceAll(s, "%", "%%")) }
	unit := fmt.Sprintf("[Unit]\nDescription=AI Platform owned container runtime\nAfter=network-online.target\n[Service]\nType=notify\nEnvironment=PATH=%s\nExecStart=%s --config-file=%s\nRuntimeDirectory=ai-platform-%s\nRuntimeDirectoryMode=0700\nRestart=on-failure\nTimeoutStartSec=120\nDelegate=yes\n[Install]\nWantedBy=multi-user.target\n", quote(filepath.Join(o.DataRoot, "tools", "bin")+":/usr/sbin:/usr/bin:/sbin:/bin"), quote(filepath.Join(o.DataRoot, "tools", "bin", "dockerd")), quote(configPath), e.shortID(o))
	active, activeErr := e.Runner.Run(ctx, Command{Program: "/usr/bin/systemctl", Args: []string{"is-active", "--quiet", unitName}})
	wasActive := activeErr == nil && active.ExitCode == 0
	if wasActive && !runtimeClaimed(o) {
		return nil, codedError("PLATFORM_RUNTIME_FOREIGN_SERVICE")
	}
	enabled, enabledErr := e.Runner.Run(ctx, Command{Program: "/usr/bin/systemctl", Args: []string{"is-enabled", "--quiet", unitName}})
	wasEnabled := enabledErr == nil && enabled.ExitCode == 0
	if wasEnabled && !runtimeClaimed(o) {
		return nil, codedError("PLATFORM_RUNTIME_FOREIGN_SERVICE")
	}
	files := map[string][]byte{configPath: jsonBytes(configuration), unitPath: []byte(unit)}
	matching := filesMatch(files)
	if wasActive && wasEnabled && matching && resourcesCommitted(o, files) {
		return e.runtimeProof(ctx, o, files)
	}
	enableAttempted := false
	err = e.configureRuntime(ctx, o, files, func() error {
		if _, err := e.command(ctx, Command{Program: filepath.Join(o.DataRoot, "tools", "bin", "dockerd"), Args: []string{"--validate", "--config-file=" + configPath}}); err != nil {
			return err
		}
		if !wasActive || !matching {
			if _, err := e.command(ctx, Command{Program: "/usr/bin/systemctl", Args: []string{"daemon-reload"}}); err != nil {
				return err
			}
			operation := "start"
			if wasActive {
				operation = "restart"
			}
			if _, err := e.command(ctx, Command{Program: "/usr/bin/systemctl", Args: []string{operation, unitName}}); err != nil {
				return err
			}
		}
		if _, err := e.runtimeProof(ctx, o, files); err != nil {
			return err
		}
		if !wasEnabled {
			enableAttempted = true
			_, err := e.command(ctx, Command{Program: "/usr/bin/systemctl", Args: []string{"enable", unitName}})
			return err
		}
		return nil
	}, func() error {
		// A partial enable must not leave a new boot-time dependency after rollback.
		if enableAttempted {
			if _, err := e.command(ctx, Command{Program: "/usr/bin/systemctl", Args: []string{"disable", unitName}}); err != nil {
				return err
			}
		}
		if _, err := e.command(ctx, Command{Program: "/usr/bin/systemctl", Args: []string{"daemon-reload"}}); err != nil {
			return err
		}
		operation := "stop"
		if wasActive {
			operation = "restart"
		}
		_, err := e.command(ctx, Command{Program: "/usr/bin/systemctl", Args: []string{operation, unitName}})
		return err
	})
	if err != nil {
		return nil, err
	}
	return e.runtimeProof(ctx, o, files)
}
func (e *Engine) runtimeProof(ctx context.Context, o Options, files map[string][]byte) ([]byte, error) {
	info, err := e.docker(ctx, o, "info", "--format", "{{json .}}")
	if err != nil {
		return nil, err
	}
	var details struct {
		OSType        string
		Architecture  string
		DockerRootDir string
		ServerVersion string
	}
	if json.Unmarshal([]byte(info.Output), &details) != nil || details.OSType != "linux" || details.ServerVersion == "" {
		return nil, codedError("PLATFORM_DOCKER_INFO_INVALID")
	}
	if e.Host.Arch == "arm64" && details.Architecture != "arm64" && details.Architecture != "aarch64" || e.Host.Arch == "amd64" && details.Architecture != "amd64" && details.Architecture != "x86_64" {
		return nil, codedError("PLATFORM_DOCKER_ARCHITECTURE_MISMATCH")
	}
	if e.Host.OS == "linux" && o.RuntimeMode != "external" && details.DockerRootDir != filepath.Join(o.DataRoot, "docker") {
		return nil, codedError("PLATFORM_DOCKER_SCOPE_MISMATCH")
	}
	if e.Host.OS == "linux" && o.RuntimeMode != "external" && details.ServerVersion != e.assets()["docker-linux-"+e.Host.Arch].Version {
		return nil, codedError("PLATFORM_DOCKER_VERSION_MISMATCH")
	}
	compose, err := e.docker(ctx, o, "compose", "version", "--short")
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(compose.Output) == "" {
		return nil, codedError("PLATFORM_COMPOSE_NOT_OBSERVED")
	}
	if strings.TrimPrefix(strings.TrimSpace(compose.Output), "v") != strings.TrimPrefix(e.assets()["compose-"+e.Host.OS+"-"+e.Host.Arch].Version, "v") {
		return nil, codedError("PLATFORM_COMPOSE_VERSION_MISMATCH")
	}
	return statusProof(map[string]any{"configuration_digest": digest(jsonBytes(files)), "server_version": details.ServerVersion, "compose_version": strings.TrimSpace(compose.Output), "active": true, "managed": o.RuntimeMode}), nil
}
func (e *Engine) prepareColima(ctx context.Context, o Options) ([]byte, error) {
	if err := os.MkdirAll(filepath.Join(o.DataRoot, "workspace"), 0700); err != nil {
		return nil, err
	}
	profile := e.profileName(o)
	configuration := map[string]any{"cpu": o.CPUs, "memory": o.MemoryGiB, "disk": o.DiskGiB, "arch": "aarch64", "runtime": "docker", "vmType": "vz", "mountType": "virtiofs", "autoActivate": false, "sshConfig": false, "binfmt": false, "rosetta": false, "nestedVirtualization": false, "network": map[string]bool{"address": false}, "kubernetes": map[string]bool{"enabled": false}, "forwardAgent": false, "mounts": []map[string]any{{"location": filepath.Join(o.DataRoot, "workspace"), "writable": true}}}
	configPath := filepath.Join(o.DataRoot, "colima", profile, "colima.yaml")
	files := map[string][]byte{configPath: jsonBytes(configuration)}
	env := e.runtimeEnv(o)
	colima := filepath.Join(o.DataRoot, "tools", "bin", "colima")
	status, statusErr := e.Runner.Run(ctx, Command{Program: colima, Args: []string{"status", "--profile", profile}, Env: env})
	wasActive := statusErr == nil && status.ExitCode == 0
	if wasActive && !runtimeClaimed(o) {
		return nil, codedError("PLATFORM_RUNTIME_FOREIGN_SERVICE")
	}
	matching := filesMatch(files)
	if wasActive && matching && resourcesCommitted(o, files) {
		return e.runtimeProof(ctx, o, files)
	}
	if old, err := os.ReadFile(configPath); err == nil {
		var previous struct {
			Disk int `json:"disk"`
		}
		if json.Unmarshal(old, &previous) == nil && previous.Disk > o.DiskGiB {
			return nil, codedError("PLATFORM_COLIMA_DISK_SHRINK_UNSUPPORTED")
		}
	}
	err := e.configureRuntime(ctx, o, files, func() error {
		if wasActive && matching {
			_, err := e.runtimeProof(ctx, o, files)
			return err
		}
		// Colima owns this private profile only; autoActivate=false plus DOCKER_CONFIG
		// prevent a change to the user's Docker/Kubernetes context or home mounts.
		if wasActive {
			if _, err := e.command(ctx, Command{Program: colima, Args: []string{"stop", "--profile", profile}, Env: env}); err != nil {
				return err
			}
		}
		if _, err := e.command(ctx, Command{Program: colima, Args: []string{"start", "--profile", profile}, Env: env}); err != nil {
			return err
		}
		_, err := e.runtimeProof(ctx, o, files)
		return err
	}, func() error {
		args := []string{"stop", "--profile", profile}
		if wasActive {
			args = []string{"start", "--profile", profile}
		}
		_, err := e.command(ctx, Command{Program: colima, Args: args, Env: env})
		return err
	})
	if err != nil {
		return nil, err
	}
	return e.runtimeProof(ctx, o, files)
}

// A name alone cannot claim an already active service/profile. An interrupted
// owned transaction has an intent; a completed transaction has a manifest.
func runtimeClaimed(o Options) bool {
	for _, name := range []string{"runtime.resources.json", "runtime.intent.json"} {
		path := filepath.Join(o.DataRoot, name)
		if plain(path) == nil {
			if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
				return true
			}
		}
	}
	return false
}
func filesMatch(files map[string][]byte) bool {
	for path, expected := range files {
		if plain(path) != nil {
			return false
		}
		data, err := os.ReadFile(path)
		if err != nil || string(data) != string(expected) {
			return false
		}
	}
	return true
}
func resourcesCommitted(o Options, files map[string][]byte) bool {
	manifest := filepath.Join(o.DataRoot, "runtime.resources.json")
	if plain(manifest) != nil {
		return false
	}
	data, err := os.ReadFile(manifest)
	if err != nil {
		return false
	}
	var known map[string]string
	if json.Unmarshal(data, &known) != nil || len(known) != len(files) {
		return false
	}
	for path, content := range files {
		if known[path] != digest(content) {
			return false
		}
	}
	_, err = os.Lstat(filepath.Join(o.DataRoot, "runtime.intent.json"))
	return os.IsNotExist(err)
}
func (e *Engine) runtimeFingerprint(ctx context.Context, o Options) (string, error) {
	if o.RuntimeMode == "external" {
		proof, err := e.runtimeProof(ctx, o, map[string][]byte{})
		if err != nil {
			return "NOT_RUNNING", nil
		}
		return digest(proof), nil
	}
	files := map[string][]byte{}
	paths := []string{filepath.Join(o.DataRoot, "colima", e.profileName(o), "colima.yaml")}
	if e.Host.OS == "linux" {
		paths = []string{filepath.Join(o.DataRoot, "daemon.json"), e.path("/etc/systemd/system/ai-platform-docker-" + e.shortID(o) + ".service")}
	}
	for _, path := range paths {
		if err := plain(path); err != nil {
			return "", err
		}
		data, err := os.ReadFile(path)
		if os.IsNotExist(err) {
			return "ABSENT", nil
		}
		if err != nil {
			return "", err
		}
		files[path] = data
	}
	proof, err := e.runtimeProof(ctx, o, files)
	if err != nil {
		return "NOT_RUNNING", nil
	}
	return digest(proof), nil
}
