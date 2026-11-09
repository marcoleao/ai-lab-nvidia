package provision

import (
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"time"
)

func (e *Engine) prepareObservabilityImages(ctx context.Context, o Options) ([]byte, error) {
	proof := map[string]string{}
	for _, product := range []string{"prometheus", "loki", "collector", "grafana"} {
		image := observabilityReleases()[product].Platforms[e.Host.Arch]
		data, err := e.managedImageProof(ctx, o, image)
		if err != nil {
			return nil, err
		}
		if data == nil {
			if _, err = e.docker(ctx, o, "pull", "--platform", "linux/"+e.Host.Arch, image.Reference); err != nil {
				return nil, err
			}
			data, err = e.managedImageProof(ctx, o, image)
			if err != nil || data == nil {
				return nil, codedError("PLATFORM_OBSERVABILITY_IMAGE_UNCONFIRMED")
			}
		}
		proof[product] = digest(data)
	}
	return jsonBytes(proof), nil
}
func (e *Engine) observabilityState(ctx context.Context, o Options, s accessSpec) (map[string]map[string]any, error) {
	state := map[string]map[string]any{}
	for _, key := range observabilityServices {
		c, err := e.readAccessContainer(ctx, o, s.Project+"-"+key)
		if err != nil {
			return nil, err
		}
		if c == nil {
			state[key] = map[string]any{"state": "ABSENT"}
			continue
		}
		if err = e.validateAccessContainer(o, s, key, c); err != nil {
			return nil, err
		}
		state[key] = map[string]any{"id": c.ID, "running": c.State.Running}
	}
	return state, nil
}
func (e *Engine) observabilityFingerprint(ctx context.Context, action string, o Options) (string, error) {
	if action == "PLATFORM_OBSERVABILITY_CREDENTIALS_PREPARED" {
		seed, err := readObservabilitySeed(o)
		if os.IsNotExist(err) {
			return "ABSENT", nil
		}
		if err != nil {
			return "", err
		}
		return digest(observabilityCredentialReceipt(seed)), nil
	}
	if action == "PLATFORM_OBSERVABILITY_IMAGES_PREPARED" {
		proof := map[string]string{}
		for product, release := range observabilityReleases() {
			data, err := e.managedImageProof(ctx, o, release.Platforms[e.Host.Arch])
			if err != nil {
				return "", err
			}
			if data != nil {
				proof[product] = digest(data)
			}
		}
		return digest(jsonBytes(proof)), nil
	}
	seed, err := readObservabilitySeed(o)
	if err != nil {
		return "", err
	}
	s, err := e.observabilitySpec(o, seed)
	if err != nil {
		return "", err
	}
	state, err := e.observabilityState(ctx, o, s)
	return digest(jsonBytes(state)), err
}
func (e *Engine) composeObservability(ctx context.Context, o Options, s accessSpec, args ...string) (Response, error) {
	command := []string{"compose", "--project-name", s.Project, "--env-file", filepath.Join(o.DataRoot, "observability", "empty.env"), "--file", filepath.Join(o.DataRoot, "observability", "compose.json")}
	return e.docker(ctx, o, append(command, args...)...)
}
func (e *Engine) prepareObservabilityServices(ctx context.Context, o Options) ([]byte, error) {
	if err := e.requireAccessNetworks(ctx, o); err != nil {
		return nil, err
	}
	seed, err := readObservabilitySeed(o)
	if err != nil {
		return nil, err
	}
	s, err := e.observabilitySpec(o, seed)
	if err != nil {
		return nil, err
	}
	var record, intent accessRecord
	if err = networkControl(o, "observability.resources.json", &record); err != nil {
		return nil, err
	}
	if err = networkControl(o, "observability.intent.json", &intent); err != nil {
		return nil, err
	}
	if record.Spec != "" && record.Spec != s.Digest {
		return nil, codedError("PLATFORM_OBSERVABILITY_MIGRATION_REQUIRED")
	}
	if intent.Spec != "" && intent.Spec != s.Digest {
		return nil, codedError("PLATFORM_OBSERVABILITY_PENDING_CONFIGURATION")
	}
	before, err := e.observabilityState(ctx, o, s)
	if err != nil {
		return nil, err
	}
	for key, state := range before {
		if id, ok := state["id"]; ok {
			if record.Containers[key] != "" && record.Containers[key] != id || record.Containers[key] == "" && intent.Spec != s.Digest {
				return nil, codedError("PLATFORM_OBSERVABILITY_UNCLAIMED_CONTAINER")
			}
		}
	}
	if _, ok := before["grafana"]["id"]; !ok {
		if e.PortAvailable != nil {
			if err = e.PortAvailable(o.GrafanaPort); err != nil {
				return nil, &restoredError{cause: err, after: digest(jsonBytes(before))}
			}
		} else {
			l, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", o.GrafanaPort))
			if err != nil {
				return nil, &restoredError{cause: codedError("PLATFORM_OBSERVABILITY_PORT_IN_USE"), after: digest(jsonBytes(before))}
			}
			l.Close()
		}
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "observability.intent.json"), jsonBytes(accessRecord{Spec: s.Digest}), 0600); err != nil {
		return nil, err
	}
	if err = e.cleanupAccessHelper(ctx, o, s); err != nil {
		return nil, err
	}
	keys := []string{}
	for key := range s.Volumes {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if err = e.ensureAccessVolume(ctx, o, s, key, s.Volumes[key]); err != nil {
			return nil, err
		}
	}
	if err = e.validateObservabilityConfiguration(ctx, o, s); err != nil {
		if knownRestored(err) {
			after, readErr := e.observabilityState(ctx, o, s)
			if readErr != nil {
				return nil, readErr
			}
			return nil, &restoredError{cause: err, after: digest(jsonBytes(after))}
		}
		return nil, err
	}
	if err = writeOwned(filepath.Join(o.DataRoot, "observability", "compose.json"), s.Compose); err != nil {
		return nil, err
	}
	if err = writeOwned(filepath.Join(o.DataRoot, "observability", "empty.env"), []byte("# No ambient environment file.\n")); err != nil {
		return nil, err
	}
	_, startErr := e.composeObservability(ctx, o, s, "up", "--detach", "--no-build", "--no-recreate", "--pull", "never", "--wait", "--wait-timeout", "180")
	if startErr == nil {
		startErr = e.waitObservability(ctx, o, seed)
	}
	after, inspectErr := e.observabilityState(ctx, o, s)
	if startErr == nil && inspectErr != nil {
		startErr = inspectErr
	}
	if startErr == nil {
		for _, v := range after {
			if v["running"] != true {
				startErr = codedError("PLATFORM_OBSERVABILITY_SERVICE_NOT_RUNNING")
			}
		}
	}
	if startErr != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 90*time.Second)
		defer cancel()
		if err = e.compensateObservability(cleanupCtx, o, s, before); err != nil {
			return nil, fmt.Errorf("%w: initial=%v", err, startErr)
		}
		after, err = e.observabilityState(cleanupCtx, o, s)
		if err != nil {
			return nil, err
		}
		return nil, &restoredError{cause: startErr, after: digest(jsonBytes(after))}
	}
	ids := map[string]string{}
	for key, state := range after {
		ids[key] = state["id"].(string)
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "observability.resources.json"), jsonBytes(accessRecord{s.Digest, ids}), 0600); err != nil {
		return nil, err
	}
	if err = os.Remove(filepath.Join(o.DataRoot, "observability.intent.json")); err != nil {
		return nil, err
	}
	return jsonBytes(after), nil
}
func (e *Engine) compensateObservability(ctx context.Context, o Options, s accessSpec, before map[string]map[string]any) error {
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	step := Step{"PLATFORM_OBSERVABILITY_STARTUP_COMPENSATED", "ACCEPTED", "REQUESTED", digest(jsonBytes(before)), "NOT_OBSERVED", "STOP_NEW_STARTS_PRESERVE_DURABLE_DATA"}
	if err := audit.append(step); err != nil {
		return err
	}
	err := func() error {
		for i := len(observabilityServices) - 1; i >= 0; i-- {
			key := observabilityServices[i]
			if before[key]["running"] == true {
				continue
			}
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
			if c.State.Running {
				if _, err = e.docker(ctx, o, "container", "stop", "--timeout", "30", c.ID); err != nil {
					return err
				}
			}
		}
		after, err := e.observabilityState(ctx, o, s)
		if err != nil {
			return err
		}
		for key, v := range after {
			if before[key]["running"] != true && v["running"] == true {
				return codedError("PLATFORM_OBSERVABILITY_COMPENSATION_UNCONFIRMED")
			}
		}
		step.After = digest(jsonBytes(after))
		return nil
	}()
	if err != nil {
		step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(err)
		_ = audit.append(step)
		return err
	}
	step.Outcome, step.Phase, step.Reason = "SUCCEEDED", "COMPLETED", "NEW_STARTS_STOPPED_DURABLE_DATA_PRESERVED"
	return audit.append(step)
}
