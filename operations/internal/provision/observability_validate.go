package provision

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type observabilityValidation struct{ Name, Nonce, Service, Volume string }

func (e *Engine) cleanupObservabilityValidation(ctx context.Context, o Options, s accessSpec) error {
	var v observabilityValidation
	if err := networkControl(o, "observability.validation.json", &v); err != nil {
		return err
	}
	if v.Name == "" {
		return nil
	}
	if v.Service != "metrics" && v.Service != "logs" && v.Service != "telemetry" || !strings.HasPrefix(v.Name, s.Project+"-validate-") || !operationPattern.MatchString(v.Nonce) || v.Volume != s.Volumes[v.Service+"-config"].Name {
		return codedError("PLATFORM_OBSERVABILITY_VALIDATION_INTENT_INVALID")
	}
	c, err := e.readAccessContainer(ctx, o, v.Name)
	if err != nil {
		return err
	}
	if c != nil {
		if c.Config.Labels["ai.platform.owner"] != s.Owner || c.Config.Labels["ai.platform.validation"] != v.Nonce || c.Config.Labels["ai.platform.component"] != "observability-validation" || c.Config.User != s.Services[v.Service]["user"] || !serviceRelease(v.Service).Platforms[e.Host.Arch].matchesID(c.Image) || c.HostConfig.NetworkMode != "none" || !c.HostConfig.ReadonlyRootfs || c.HostConfig.Privileged || len(c.HostConfig.CapAdd) != 0 || !containsString(c.HostConfig.CapDrop, "ALL") || !noNewPrivilegesEnabled(c.HostConfig.SecurityOpt) || len(c.HostConfig.PortBindings) != 0 {
			return codedError("PLATFORM_OBSERVABILITY_VALIDATION_OWNERSHIP_CONFLICT")
		}
		seen := false
		for _, mount := range c.Mounts {
			if mount.Type == "tmpfs" && v.Service == "metrics" && mount.Destination == "/prometheus" {
				continue
			}
			if seen || mount.Type != "volume" || mount.Name != v.Volume || mount.Destination != "/etc/platform" || mount.RW {
				return codedError("PLATFORM_OBSERVABILITY_VALIDATION_OWNERSHIP_CONFLICT")
			}
			seen = true
		}
		if !seen {
			return codedError("PLATFORM_OBSERVABILITY_VALIDATION_OWNERSHIP_CONFLICT")
		}
		if c.State.Running {
			if _, err = e.docker(ctx, o, "container", "stop", "--timeout", "10", c.ID); err != nil {
				return err
			}
		}
		if _, err = e.docker(ctx, o, "container", "rm", c.ID); err != nil {
			return err
		}
		remaining, err := e.readAccessContainer(ctx, o, v.Name)
		if err != nil || remaining != nil {
			return codedError("PLATFORM_OBSERVABILITY_VALIDATION_CLEANUP_UNCONFIRMED")
		}
	}
	return os.Remove(filepath.Join(o.DataRoot, "observability.validation.json"))
}
func (e *Engine) validateObservabilityConfiguration(ctx context.Context, o Options, s accessSpec) (finalErr error) {
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	step := Step{"PLATFORM_OBSERVABILITY_CONFIG_VALIDATED", "ACCEPTED", "REQUESTED", s.Digest, "NOT_OBSERVED", "NATIVE_OFFLINE_CONFIGURATION_CHECK"}
	if err := audit.append(step); err != nil {
		return err
	}
	defer func() {
		if finalErr != nil {
			audit.diagnostic(step.Action, finalErr)
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(finalErr)
			if knownRestored(finalErr) {
				step.Outcome, step.Phase, step.After = "FAILED", "COMPLETED", s.Digest
			}
			if err := audit.append(step); err != nil {
				finalErr = err
			}
		}
	}()
	if err := e.cleanupObservabilityValidation(ctx, o, s); err != nil {
		return err
	}
	for _, item := range []struct {
		key, entry string
		args       []string
	}{{"metrics", "/bin/promtool", []string{"check", "config", "/etc/platform/config.json"}}, {"logs", "/usr/bin/loki", []string{"-verify-config=true", "-config.file=/etc/platform/config.json"}}, {"telemetry", "/otelcol-contrib", []string{"validate", "--config=/etc/platform/config.json"}}} {
		nonce, err := randomIdentity()
		if err != nil {
			return err
		}
		v := observabilityValidation{Name: s.Project + "-validate-" + nonce[:12], Nonce: nonce, Service: item.key, Volume: s.Volumes[item.key+"-config"].Name}
		if err = atomicFile(filepath.Join(o.DataRoot, "observability.validation.json"), jsonBytes(v), 0600); err != nil {
			return err
		}
		args := []string{"run", "--rm", "--pull", "never", "--name", v.Name, "--network", "none", "--read-only", "--user", s.Services[item.key]["user"].(string), "--cap-drop", "ALL", "--security-opt", "no-new-privileges=true", "--pids-limit", "64", "--memory", "256m", "--label", "ai.platform.owner=" + s.Owner, "--label", "ai.platform.validation=" + nonce, "--label", "ai.platform.component=observability-validation", "--mount", "type=volume,source=" + v.Volume + ",target=/etc/platform,readonly", "--entrypoint", item.entry, s.Services[item.key]["image"].(string)}
		if item.key == "metrics" {
			args = append(args[:1], append([]string{"--tmpfs", "/prometheus:rw,nosuid,noexec,uid=65534,gid=65534,mode=0700,size=8388608"}, args[1:]...)...)
		}
		_, runErr := e.docker(ctx, o, append(args, item.args...)...)
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		cleanupErr := e.cleanupObservabilityValidation(cleanupCtx, o, s)
		cancel()
		if cleanupErr != nil {
			return cleanupErr
		}
		if runErr != nil {
			return &restoredError{cause: runErr, after: s.Digest}
		}
	}
	step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", s.Digest, "NATIVE_CONFIG_CHECKS_AND_CLEANUP_CONFIRMED"
	return audit.append(step)
}
