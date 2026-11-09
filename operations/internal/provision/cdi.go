package provision

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

func (e *Engine) prepareCDI(ctx context.Context, o Options) ([]byte, error) {
	if o.RuntimeMode == "external" {
		info, err := e.docker(ctx, o, "info", "--format", "{{json .}}")
		if err != nil {
			return nil, err
		}
		var details struct {
			Runtimes    map[string]any
			CDISpecDirs []string
		}
		if json.Unmarshal([]byte(info.Output), &details) != nil {
			return nil, codedError("PLATFORM_DOCKER_INFO_INVALID")
		}
		if _, ok := details.Runtimes["nvidia"]; !ok && len(details.CDISpecDirs) == 0 {
			return nil, codedError("PLATFORM_EXTERNAL_GPU_RUNTIME_CONFIGURATION_REQUIRED")
		}
		return jsonBytes(map[string]any{"managed": "EXTERNAL", "nvidia_runtime": details.Runtimes["nvidia"] != nil, "cdi_directories": len(details.CDISpecDirs)}), nil
	}
	// Preserve the appliance's existing driver/toolkit. Install only the CDI base
	// tooling when absent, with signed repository metadata and exact package versions.
	probe, err := e.Runner.Run(ctx, Command{Program: "/usr/bin/nvidia-ctk", Args: []string{"--version"}})
	if err != nil || probe.ExitCode != 0 {
		key, err := e.asset(ctx, "nvidia-key", filepath.Join(o.ControlRoot, "cache"))
		if err != nil {
			return nil, err
		}
		keyData, err := os.ReadFile(key)
		if err != nil {
			return nil, err
		}
		keyPath := e.path("/etc/apt/keyrings/ai-platform-nvidia-" + e.shortID(o) + ".asc")
		if err = os.MkdirAll(filepath.Dir(keyPath), 0755); err != nil {
			return nil, err
		}
		if err = writeOwned(keyPath, keyData); err != nil {
			return nil, err
		}
		if err = os.Chmod(keyPath, 0644); err != nil {
			return nil, err
		}
		repoPath := e.path("/etc/apt/sources.list.d/ai-platform-nvidia-" + e.shortID(o) + ".list")
		if err = os.MkdirAll(filepath.Dir(repoPath), 0755); err != nil {
			return nil, err
		}
		repo := []byte("deb [signed-by=" + keyPath + "] https://nvidia.github.io/libnvidia-container/stable/deb/$(ARCH) /\n")
		if err = writeOwned(repoPath, repo); err != nil {
			return nil, err
		}
		if err = os.Chmod(repoPath, 0644); err != nil {
			return nil, err
		}
		if _, err = e.command(ctx, Command{Program: "/usr/bin/apt-get", Args: []string{"update"}}); err != nil {
			return nil, err
		}
		if _, err = e.command(ctx, Command{Program: "/usr/bin/apt-get", Args: []string{"install", "-y", "--no-install-recommends", "nvidia-container-toolkit-base=1.20.1-1", "libnvidia-container-tools=1.20.1-1", "libnvidia-container1=1.20.1-1"}, Env: map[string]string{"DEBIAN_FRONTEND": "noninteractive", "NEEDRESTART_MODE": "l"}}); err != nil {
			return nil, err
		}
	}
	cdiDir := filepath.Join(o.DataRoot, "cdi")
	if err = os.MkdirAll(cdiDir, 0700); err != nil {
		return nil, err
	}
	generated := filepath.Join(cdiDir, "nvidia.next.yaml")
	if err = plain(generated); err != nil {
		return nil, err
	}
	if _, err = e.command(ctx, Command{Program: "/usr/bin/nvidia-ctk", Args: []string{"cdi", "generate", "--output=" + generated}}); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(generated)
	if err != nil || !strings.Contains(string(data), "nvidia.com/gpu") {
		return nil, codedError("PLATFORM_CDI_UNCONFIRMED")
	}
	destination := filepath.Join(cdiDir, "nvidia.yaml")
	if err = atomicFile(destination, data, 0600); err != nil {
		return nil, err
	}
	_ = os.Remove(generated)
	return data, nil
}
