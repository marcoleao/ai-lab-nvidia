package provision

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func (e *Engine) prepareOS(ctx context.Context, o Options) ([]byte, string, error) {
	if e.Host.OS == "darwin" {
		// Apple owns macOS/Metal updates. Do not silently upgrade the host OS or
		// accept a software license. Record the actual OS, and check native tools.
		version, err := e.command(ctx, Command{Program: "/usr/bin/sw_vers", Args: []string{"-productVersion"}})
		if err != nil {
			return nil, "", err
		}
		major, _ := strconv.Atoi(strings.Split(strings.TrimSpace(version.Output), ".")[0])
		if major < 14 {
			return nil, "", codedError("PLATFORM_MACOS_14_REQUIRED")
		}
		virtualization, err := e.command(ctx, Command{Program: "/usr/sbin/sysctl", Args: []string{"-n", "kern.hv_support"}})
		if err != nil || strings.TrimSpace(virtualization.Output) != "1" {
			return nil, "", codedError("PLATFORM_MACOS_VIRTUALIZATION_UNAVAILABLE")
		}
		return statusProof(map[string]string{"os": strings.TrimSpace(version.Output), "updates": "APPLE_MANAGED", "virtualization": "AVAILABLE"}), "VERIFIED", nil
	}
	// Only named Ubuntu prerequisites; no kernel, firmware or NVIDIA driver package.
	if _, err := e.command(ctx, Command{Program: "/usr/bin/apt-get", Args: []string{"update"}, Env: map[string]string{"DEBIAN_FRONTEND": "noninteractive"}}); err != nil {
		return nil, "", err
	}
	if _, err := e.command(ctx, Command{Program: "/usr/bin/apt-get", Args: []string{"install", "-y", "--no-install-recommends", "python3-apt", "ca-certificates", "iproute2", "iptables"}, Env: map[string]string{"DEBIAN_FRONTEND": "noninteractive", "NEEDRESTART_MODE": "l"}}); err != nil {
		return nil, "", err
	}
	script, _ := sources.ReadFile("security-update.py")
	file := filepath.Join(o.ControlRoot, "security-update.py")
	if err := atomicFile(file, script, 0600); err != nil {
		return nil, "", err
	}
	receipt := filepath.Join(o.ControlRoot, "security-"+o.OperationID+".json")
	if err := plain(receipt); err != nil {
		return nil, "", err
	}
	if err := os.Remove(receipt); err != nil && !os.IsNotExist(err) {
		return nil, "", err
	}
	_, err := e.command(ctx, Command{Program: "/usr/bin/python3", Args: []string{file, receipt}, Env: map[string]string{"DEBIAN_FRONTEND": "noninteractive", "NEEDRESTART_MODE": "l"}})
	if err != nil {
		return nil, "", err
	}
	var proof struct {
		Before string `json:"before"`
		After  string `json:"after"`
		Count  int    `json:"count"`
	}
	data, readErr := os.ReadFile(receipt)
	if readErr != nil || json.Unmarshal(data, &proof) != nil || !hashPattern.MatchString(proof.After) {
		return nil, "", codedError("PLATFORM_SECURITY_EFFECT_UNCONFIRMED")
	}
	reason := "VERIFIED"
	if _, err := os.Stat(e.path("/var/run/reboot-required")); err == nil {
		reason = "REBOOT_REQUIRED"
	}
	return data, reason, nil
}
func (e *Engine) verifyGPU(ctx context.Context, o Options) ([]byte, error) {
	if e.Host.OS == "darwin" {
		r, err := e.command(ctx, Command{Program: "/usr/sbin/system_profiler", Args: []string{"SPDisplaysDataType", "-json"}, Env: map[string]string{"LC_ALL": "C"}})
		if err != nil {
			return nil, err
		}
		var data map[string]any
		if json.Unmarshal([]byte(r.Output), &data) != nil {
			return nil, codedError("PLATFORM_METAL_PROBE_INVALID")
		}
		// Presence is a hardware/API observation, never a benchmark or model qualification.
		if !metalSupported(data) {
			return nil, codedError("PLATFORM_METAL_NOT_OBSERVED")
		}
		return []byte(r.Output), nil
	}
	binary := "/usr/bin/nvidia-smi"
	if e.Host.WSL {
		binary = "/usr/lib/wsl/lib/nvidia-smi"
	}
	r, err := e.command(ctx, Command{Program: binary, Args: []string{"--query-gpu=driver_version", "--format=csv,noheader"}})
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(r.Output) == "" {
		return nil, codedError("PLATFORM_GPU_NOT_OBSERVED")
	}
	return []byte(strings.TrimSpace(r.Output)), nil
}
func metalSupported(value any) bool {
	switch data := value.(type) {
	case map[string]any:
		for key, value := range data {
			if strings.Contains(strings.ToLower(key), "metal") {
				if text, ok := value.(string); ok {
					normalized := strings.ToLower(text)
					if strings.Contains(normalized, "metal") && !strings.Contains(normalized, "unsupported") && !strings.Contains(normalized, "not_supported") && !strings.Contains(normalized, "not supported") {
						return true
					}
				}
			}
			if metalSupported(value) {
				return true
			}
		}
	case []any:
		for _, item := range data {
			if metalSupported(item) {
				return true
			}
		}
	}
	return false
}
