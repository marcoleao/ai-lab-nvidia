package provision

import (
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type originResource struct {
	Name, ID, Volume, Spec, VolumeSpec, Generation, Revision string
	Port                                                     int
}
type originRecord struct {
	Active   originResource
	Retained []originResource
}
type originIntent struct{ Candidate originResource }

func (e *Engine) originSpec(o Options, m originMaterial) (originResource, accessSpec, accessVolume) {
	project := "ai-platform-" + e.shortID(o) + "-origin"
	r := originResource{Name: project + "-" + m.Generation[:12], Volume: project + "-" + m.Generation + "-config", Generation: m.Generation, Revision: m.Revision, Port: o.OriginPort}
	config := fmt.Sprintf("{\n admin off\n auto_https off\n persist_config off\n servers {\n  protocols h1 h2\n  strict_sni_host on\n }\n}\nhttps://gateway.localhost:%d {\n tls /origin/server.pem /origin/server-key.pem {\n  protocols tls1.3\n  client_auth {\n   mode require_and_verify\n   trust_pool file /origin/ca.pem\n  }\n }\n handle /readyz {\n  respond %q 200\n }\n handle {\n  respond 404\n }\n}\n", o.OriginPort, m.Generation)
	v := accessVolume{Name: r.Volume, UID: 1000, Files: map[string]accessFile{".platform-owner": {[]byte(m.Owner), 0400}, "Caddyfile": {[]byte(config), 0400}, "ca.pem": {m.CA, 0400}, "server.pem": {m.Server, 0400}, "server-key.pem": {m.ServerKey, 0400}}}
	r.VolumeSpec = digest(jsonBytes(v))
	r.Spec = digest(jsonBytes(map[string]any{"resource": r, "volume": v, "image": accessReleases()["caddy"].Platforms[e.Host.Arch], "network": e.originNetwork(o)}))
	s := accessSpec{Project: project, Owner: m.Owner, Volumes: map[string]accessVolume{"origin": v}}
	return r, s, v
}
func (e *Engine) originNetwork(o Options) string {
	for _, n := range e.networkViews(o) {
		if n.Role == "edge" {
			return n.Name
		}
	}
	return ""
}
func (e *Engine) originLabels(o Options, r originResource, m originMaterial) map[string]string {
	return map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.owner": m.Owner, "ai.platform.component": "origin-tls", "ai.platform.generation": r.Generation, "ai.platform.spec": r.Spec}
}
func (e *Engine) validateOriginContainer(o Options, r originResource, m originMaterial, c *accessContainer) error {
	if c.Name != "/"+r.Name || r.ID != "" && c.ID != r.ID || c.Config.User != "1000:1000" || !c.HostConfig.ReadonlyRootfs || c.HostConfig.Privileged || len(c.HostConfig.CapAdd) != 0 || !containsString(c.HostConfig.CapDrop, "ALL") || !(containsString(c.HostConfig.SecurityOpt, "no-new-privileges:true") || containsString(c.HostConfig.SecurityOpt, "no-new-privileges")) {
		return codedError("PLATFORM_ORIGIN_CONTAINER_CHANGED")
	}
	image := accessReleases()["caddy"].Platforms[e.Host.Arch]
	if !image.matchesID(c.Image) || familiarProbeImage(c.Config.Image) != familiarProbeImage(image.Reference) {
		return codedError("PLATFORM_ORIGIN_IMAGE_CHANGED")
	}
	for k, v := range e.originLabels(o, r, m) {
		if c.Config.Labels[k] != v {
			return codedError("PLATFORM_ORIGIN_OWNERSHIP_CONFLICT")
		}
	}
	if len(c.NetworkSettings.Networks) != 1 {
		return codedError("PLATFORM_ORIGIN_NETWORK_CHANGED")
	}
	if _, ok := c.NetworkSettings.Networks[e.originNetwork(o)]; !ok {
		return codedError("PLATFORM_ORIGIN_NETWORK_CHANGED")
	}
	bindings := c.HostConfig.PortBindings[fmt.Sprint(r.Port)+"/tcp"]
	if len(c.HostConfig.PortBindings) != 1 || len(bindings) != 1 || bindings[0].HostIp != "127.0.0.1" || bindings[0].HostPort != fmt.Sprint(r.Port) {
		return codedError("PLATFORM_ORIGIN_PUBLIC_BINDING_REJECTED")
	}
	seen := 0
	for _, mount := range c.Mounts {
		if mount.Type == "tmpfs" && containsString([]string{"/tmp", "/data", "/config"}, mount.Destination) {
			continue
		}
		if mount.Type != "volume" || mount.Name != r.Volume || mount.Destination != "/origin" || mount.RW {
			return codedError("PLATFORM_ORIGIN_MOUNT_CHANGED")
		}
		seen++
	}
	if seen != 1 {
		return codedError("PLATFORM_ORIGIN_MOUNT_CHANGED")
	}
	return nil
}
func (e *Engine) originContainer(ctx context.Context, o Options, r originResource, m originMaterial) (*accessContainer, error) {
	if r.Name == "" {
		return nil, nil
	}
	c, err := e.readAccessContainer(ctx, o, r.Name)
	if err != nil {
		return nil, err
	}
	if c == nil {
		if r.ID != "" {
			return nil, codedError("PLATFORM_ORIGIN_RESOURCE_MISSING")
		}
		return nil, nil
	}
	if err = e.validateOriginContainer(o, r, m, c); err != nil {
		return nil, err
	}
	return c, nil
}
func (e *Engine) originServiceProof(ctx context.Context, o Options) ([]byte, error) {
	var record originRecord
	if err := networkControl(o, "origin.resources.json", &record); err != nil {
		return nil, err
	}
	m, err := e.workingOriginMaterial(o)
	if err != nil {
		return nil, err
	}
	proof := map[string]any{"active": record.Active, "active_running": false}
	if record.Active.Name != "" {
		c, err := e.originContainer(ctx, o, record.Active, m)
		if err != nil {
			return nil, err
		}
		proof["active_running"] = c.State.Running
	}
	r, _, _ := e.originSpec(o, m)
	if record.Active.Generation != r.Generation {
		c, err := e.originContainer(ctx, o, r, m)
		if err != nil {
			return nil, err
		}
		if c != nil {
			var intent originIntent
			if err = networkControl(o, "origin.intent.json", &intent); err != nil {
				return nil, err
			}
			if intent.Candidate.Spec != r.Spec || intent.Candidate.ID != "" && intent.Candidate.ID != c.ID {
				return nil, codedError("PLATFORM_ORIGIN_UNCLAIMED_CONTAINER")
			}
			proof["candidate"] = map[string]any{"id": c.ID, "running": c.State.Running, "spec": r.Spec}
		}
	}
	return jsonBytes(proof), nil
}
func (e *Engine) originFingerprint(ctx context.Context, action string, o Options) (string, error) {
	if action == "PLATFORM_ORIGIN_IMAGE_PREPARED" {
		data, err := e.accessImageProof(ctx, o, "caddy")
		return digest(data), err
	}
	if action == "PLATFORM_ORIGIN_TLS_MATERIAL_PREPARED" {
		m, err := e.workingOriginMaterial(o)
		if os.IsNotExist(err) {
			return "ABSENT", nil
		}
		return digest(jsonBytes(map[string]string{"material_digest": digest(jsonBytes(m))})), err
	}
	data, err := e.originServiceProof(ctx, o)
	return digest(data), err
}
func (e *Engine) prepareOriginImage(ctx context.Context, o Options) ([]byte, error) {
	data, err := e.accessImageProof(ctx, o, "caddy")
	if err != nil || data != nil {
		return data, err
	}
	if _, err = e.docker(ctx, o, "pull", "--platform", "linux/"+e.Host.Arch, accessReleases()["caddy"].Platforms[e.Host.Arch].Reference); err != nil {
		return nil, err
	}
	data, err = e.accessImageProof(ctx, o, "caddy")
	if err == nil && data == nil {
		err = codedError("PLATFORM_ORIGIN_IMAGE_UNCONFIRMED")
	}
	return data, err
}
func (e *Engine) setOriginRunning(ctx context.Context, o Options, r originResource, m originMaterial, running bool) error {
	c, err := e.originContainer(ctx, o, r, m)
	if err != nil || c == nil {
		if err == nil {
			err = codedError("PLATFORM_ORIGIN_RESOURCE_MISSING")
		}
		return err
	}
	if c.State.Running == running {
		return nil
	}
	args := []string{"container", "start", c.ID}
	if !running {
		args = []string{"container", "stop", "--time", "10", c.ID}
	}
	_, runErr := e.docker(ctx, o, args...)
	c, err = e.originContainer(ctx, o, r, m)
	if err != nil || c == nil || c.State.Running != running {
		if runErr != nil {
			return runErr
		}
		return codedError("PLATFORM_ORIGIN_PROCESS_UNCONFIRMED")
	}
	return nil
}
func (e *Engine) prepareOriginService(ctx context.Context, o Options) ([]byte, error) {
	if err := e.requireAccessNetworks(ctx, o); err != nil {
		return nil, err
	}
	m, err := e.workingOriginMaterial(o)
	if err != nil {
		return nil, err
	}
	if err = verifyOriginMaterial(m, e.Now()); err != nil {
		return nil, err
	}
	r, s, v := e.originSpec(o, m)
	var record originRecord
	if err = networkControl(o, "origin.resources.json", &record); err != nil {
		return nil, err
	}
	var intent originIntent
	if err = networkControl(o, "origin.intent.json", &intent); err != nil {
		return nil, err
	}
	if intent.Candidate.Name != "" && intent.Candidate.Spec != r.Spec {
		return nil, codedError("PLATFORM_ORIGIN_PENDING_CONFIGURATION")
	}
	if record.Active.Generation == r.Generation && record.Active.Spec != r.Spec {
		return nil, codedError("PLATFORM_ORIGIN_PORT_MIGRATION_REQUIRED")
	}
	old, err := e.originContainer(ctx, o, record.Active, m)
	if err != nil {
		return nil, err
	}
	oldRunning := old != nil && old.State.Running
	if record.Active.Generation == r.Generation {
		r.ID = record.Active.ID
	} else if intent.Candidate.Spec == r.Spec {
		r.ID = intent.Candidate.ID
	}
	candidate, err := e.originContainer(ctx, o, r, m)
	if err != nil {
		return nil, err
	}
	if candidate != nil && r.ID == "" && intent.Candidate.Spec != r.Spec {
		return nil, codedError("PLATFORM_ORIGIN_UNCLAIMED_CONTAINER")
	}
	wasRunning := candidate != nil && candidate.State.Running
	if candidate == nil && !oldRunning {
		check := e.PortAvailable
		if check == nil {
			check = func(port int) error {
				listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
				if err == nil {
					listener.Close()
				}
				return err
			}
		}
		if err = check(o.OriginPort); err != nil {
			return nil, codedError("PLATFORM_ORIGIN_PORT_UNAVAILABLE")
		}
	}
	intent.Candidate = r
	if err = atomicFile(filepath.Join(o.DataRoot, "origin.intent.json"), jsonBytes(intent), 0600); err != nil {
		return nil, err
	}
	helperOptions := o
	helperOptions.Phase = "origin"
	if err = e.ensureAccessVolume(ctx, helperOptions, s, "origin", v); err != nil {
		return nil, err
	}
	startErr := func() error {
		if oldRunning && record.Active.Generation != r.Generation {
			if err := e.setOriginRunning(ctx, o, record.Active, m, false); err != nil {
				return err
			}
		}
		if candidate == nil {
			args := []string{"container", "create", "--name", r.Name, "--pull", "never", "--user", "1000:1000", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges=true", "--restart", "unless-stopped", "--pids-limit", "128", "--memory", "128m", "--cpus", "0.5", "--network", e.originNetwork(o), "--publish", fmt.Sprintf("127.0.0.1:%d:%d/tcp", o.OriginPort, o.OriginPort), "--mount", "type=volume,source=" + r.Volume + ",target=/origin,readonly"}
			for _, path := range []string{"/tmp", "/data", "/config"} {
				args = append(args, "--tmpfs", path+":rw,nosuid,noexec,uid=1000,mode=0700,size=8388608")
			}
			labels := e.originLabels(o, r, m)
			keys := []string{}
			for k := range labels {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				args = append(args, "--label", k+"="+labels[k])
			}
			args = append(args, "--entrypoint", "caddy", accessReleases()["caddy"].Platforms[e.Host.Arch].Reference, "run", "--config", "/origin/Caddyfile", "--adapter", "caddyfile")
			_, createErr := e.docker(ctx, o, args...)
			candidate, err = e.originContainer(ctx, o, r, m)
			if err != nil {
				return err
			}
			if candidate == nil {
				if createErr != nil {
					return createErr
				}
				return codedError("PLATFORM_ORIGIN_CREATION_UNCONFIRMED")
			}
		}
		r.ID = candidate.ID
		intent.Candidate = r
		if err := atomicFile(filepath.Join(o.DataRoot, "origin.intent.json"), jsonBytes(intent), 0600); err != nil {
			return err
		}
		if err := e.setOriginRunning(ctx, o, r, m, true); err != nil {
			return err
		}
		waitCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		for {
			probeErr := e.verifyOrigin(waitCtx, o, m)
			if probeErr == nil {
				if record.Active.Generation != "" && record.Active.Generation != m.Generation && e.originProbe == nil {
					retired, err := e.readOriginMaterial(o, false)
					if err != nil {
						return err
					}
					if retired.Generation != record.Active.Generation {
						return codedError("PLATFORM_ORIGIN_ACTIVE_MATERIAL_MISMATCH")
					}
					if err = probeRetiredOriginClient(waitCtx, o, m, retired); err != nil {
						return err
					}
				}
				return nil
			}
			if code(probeErr) != "PLATFORM_ORIGIN_TLS_UNAVAILABLE" {
				return probeErr
			}
			select {
			case <-waitCtx.Done():
				return probeErr
			case <-time.After(250 * time.Millisecond):
			}
		}
	}()
	if startErr != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		beforeCompensation, observeErr := e.originServiceProof(cleanupCtx, o)
		if observeErr != nil {
			return nil, observeErr
		}
		audit := recorder{o.ControlRoot, o, e.Host, e.Now}
		step := Step{"PLATFORM_ORIGIN_TLS_COMPENSATED", "ACCEPTED", "REQUESTED", digest(beforeCompensation), "NOT_OBSERVED", "COMPENSATION_REQUESTED"}
		if err = audit.append(step); err != nil {
			return nil, err
		}
		rollbackErr := func() error {
			current, err := e.originContainer(cleanupCtx, o, r, m)
			if err != nil {
				return err
			}
			if current != nil && !wasRunning {
				r.ID = current.ID
				if err = e.setOriginRunning(cleanupCtx, o, r, m, false); err != nil {
					return err
				}
			}
			if oldRunning {
				if err = e.setOriginRunning(cleanupCtx, o, record.Active, m, true); err != nil {
					return err
				}
			}
			return nil
		}()
		if rollbackErr != nil {
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(rollbackErr)
			_ = audit.append(step)
			return nil, rollbackErr
		}
		after, err := e.originServiceProof(cleanupCtx, o)
		if err != nil {
			return nil, err
		}
		step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", digest(after), "PREVIOUS_PROCESS_STATE_RESTORED"
		if err = audit.append(step); err != nil {
			return nil, err
		}
		return nil, &restoredError{cause: startErr, after: digest(after)}
	}
	if record.Active.Name != "" && record.Active.Generation != r.Generation {
		record.Retained = append(record.Retained, record.Active)
	}
	record.Active = r
	if err = atomicFile(filepath.Join(o.DataRoot, "origin.resources.json"), jsonBytes(record), 0600); err != nil {
		return nil, err
	}
	if err = atomicFile(filepath.Join(o.ControlRoot, "origin-material.json"), jsonBytes(m), 0600); err != nil {
		return nil, err
	}
	for _, path := range []string{filepath.Join(o.ControlRoot, "origin-pending-material.json"), filepath.Join(o.DataRoot, "origin.intent.json")} {
		if err = os.Remove(path); err != nil && !os.IsNotExist(err) {
			return nil, err
		}
	}
	return e.originServiceProof(ctx, o)
}

func accessHelperFile(o Options) string {
	if o.Phase == "ingress" {
		return "ingress.helper.json"
	}
	if o.Phase == "origin" {
		return "origin.helper.json"
	}
	return "access.helper.json"
}

func originAction(action string) bool { return strings.HasPrefix(action, "PLATFORM_ORIGIN_") }
