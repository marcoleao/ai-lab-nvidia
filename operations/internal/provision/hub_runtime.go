package provision

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (e *Engine) hubState(ctx context.Context, o Options, s accessSpec) (map[string]any, error) {
	c, err := e.readAccessContainer(ctx, o, s.Project+"-homepage")
	if err != nil {
		return nil, err
	}
	if c == nil {
		return map[string]any{"state": "ABSENT"}, nil
	}
	if err = e.validateAccessContainer(o, s, "homepage", c); err != nil {
		return nil, err
	}
	return map[string]any{"id": c.ID, "running": c.State.Running}, nil
}
func (e *Engine) hubFingerprint(ctx context.Context, action string, o Options) (string, error) {
	if action == "PLATFORM_HUB_IMAGE_PREPARED" {
		data, err := e.managedImageProof(ctx, o, hubRelease().Platforms[e.Host.Arch])
		return digest(data), err
	}
	identity, err := readHubIdentity(o)
	if os.IsNotExist(err) {
		return "ABSENT", nil
	}
	if err != nil {
		return "", err
	}
	if action == "PLATFORM_HUB_IDENTITY_PREPARED" {
		return digest(jsonBytes(identity)), nil
	}
	s, err := e.hubSpec(o, identity)
	if err != nil {
		return "", err
	}
	state, err := e.hubState(ctx, o, s)
	return digest(jsonBytes(state)), err
}
func (e *Engine) prepareHubImage(ctx context.Context, o Options) ([]byte, error) {
	image := hubRelease().Platforms[e.Host.Arch]
	proof, err := e.managedImageProof(ctx, o, image)
	if err != nil {
		return nil, err
	}
	if proof == nil {
		if _, err = e.docker(ctx, o, "pull", "--platform", "linux/"+e.Host.Arch, image.Reference); err != nil {
			return nil, err
		}
		proof, err = e.managedImageProof(ctx, o, image)
		if err == nil && proof == nil {
			err = codedError("PLATFORM_HUB_IMAGE_UNCONFIRMED")
		}
	}
	return proof, err
}
func (e *Engine) hubRequest(ctx context.Context, o Options, path string) (string, error) {
	client := e.HTTP
	if client == nil {
		host := fmt.Sprintf("home.localhost:%d", o.HubPort)
		transport := &http.Transport{Proxy: nil, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			if address != host {
				return nil, codedError("PLATFORM_HUB_HTTP_TARGET_REJECTED")
			}
			return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "tcp4", fmt.Sprintf("127.0.0.1:%d", o.HubPort))
		}}
		local := &http.Client{Transport: transport, Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		defer local.CloseIdleConnections()
		client = local
	}
	req, err := http.NewRequestWithContext(ctx, "GET", hubURL(o)+path, nil)
	if err != nil {
		return "", codedError("PLATFORM_HUB_HTTP_INVALID")
	}
	reply, err := client.Do(req)
	if err != nil {
		return "", codedError("PLATFORM_HUB_HTTP_UNAVAILABLE")
	}
	defer reply.Body.Close()
	if reply.StatusCode != 200 {
		return "", codedError("PLATFORM_HUB_HTTP_UNCONFIRMED")
	}
	data, err := io.ReadAll(io.LimitReader(reply.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return "", codedError("PLATFORM_HUB_HTTP_INVALID")
	}
	return string(data), nil
}
func (e *Engine) verifyHub(ctx context.Context, o Options) error {
	health, err := e.hubRequest(ctx, o, "/api/healthcheck")
	if err != nil {
		return err
	}
	if strings.TrimSpace(health) != "up" {
		return codedError("PLATFORM_HUB_HEALTH_UNCONFIRMED")
	}
	page, err := e.hubRequest(ctx, o, "/")
	if err != nil {
		return err
	}
	urls := accessEndpoints(o)
	for _, link := range []string{urls["identity"] + "/admin/", urls["secret_store"] + "/ui/", observabilityURL(o) + "/d/platform-foundation"} {
		if !strings.Contains(page, link) {
			return codedError("PLATFORM_HUB_LINKS_UNCONFIRMED")
		}
	}
	return nil
}
func (e *Engine) prepareHub(ctx context.Context, o Options) ([]byte, error) {
	identity, err := readHubIdentity(o)
	if err != nil {
		return nil, err
	}
	s, err := e.hubSpec(o, identity)
	if err != nil {
		return nil, err
	}
	var record, intent accessRecord
	if err = networkControl(o, "hub.resources.json", &record); err != nil {
		return nil, err
	}
	if err = networkControl(o, "hub.intent.json", &intent); err != nil {
		return nil, err
	}
	if record.Spec != "" && record.Spec != s.Digest || intent.Spec != "" && intent.Spec != s.Digest {
		return nil, codedError("PLATFORM_HUB_MIGRATION_REQUIRED")
	}
	before, err := e.hubState(ctx, o, s)
	if err != nil {
		return nil, err
	}
	if id, exists := before["id"]; exists {
		if record.Containers["homepage"] != "" && record.Containers["homepage"] != id || record.Containers["homepage"] == "" && intent.Spec != s.Digest {
			return nil, codedError("PLATFORM_HUB_UNCLAIMED_CONTAINER")
		}
	} else {
		if e.PortAvailable != nil {
			err = e.PortAvailable(o.HubPort)
		} else {
			var listener net.Listener
			listener, err = net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", o.HubPort))
			if err == nil {
				listener.Close()
			}
		}
		if err != nil {
			return nil, &restoredError{cause: codedError("PLATFORM_HUB_PORT_IN_USE"), after: digest(jsonBytes(before))}
		}
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "hub.intent.json"), jsonBytes(accessRecord{Spec: s.Digest}), 0600); err != nil {
		return nil, err
	}
	if err = e.cleanupAccessHelper(ctx, o, s); err != nil {
		return nil, err
	}
	if err = e.ensureAccessVolume(ctx, o, s, "hub-config", s.Volumes["hub-config"]); err != nil {
		return nil, err
	}
	for name, data := range map[string][]byte{"compose.json": s.Compose, "empty.env": []byte("# No ambient environment file.\n")} {
		if err = writeOwned(filepath.Join(o.DataRoot, "hub", name), data); err != nil {
			return nil, err
		}
	}
	_, startErr := e.docker(ctx, o, "compose", "--project-name", s.Project, "--env-file", filepath.Join(o.DataRoot, "hub", "empty.env"), "--file", filepath.Join(o.DataRoot, "hub", "compose.json"), "up", "--detach", "--no-build", "--no-recreate", "--pull", "never", "--wait", "--wait-timeout", "120")
	if startErr == nil {
		waitCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		for {
			if e.verifyHub(waitCtx, o) == nil {
				break
			}
			select {
			case <-waitCtx.Done():
				startErr = codedError("PLATFORM_HUB_HEALTH_TIMEOUT")
			case <-time.After(500 * time.Millisecond):
			}
			if startErr != nil {
				break
			}
		}
		cancel()
	}
	after, inspectErr := e.hubState(ctx, o, s)
	if startErr == nil {
		startErr = inspectErr
		if startErr == nil && after["running"] != true {
			startErr = codedError("PLATFORM_HUB_PROCESS_UNCONFIRMED")
		}
	}
	if startErr != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 45*time.Second)
		defer cancel()
		if err = e.compensateHub(cleanupCtx, o, s, before); err != nil {
			return nil, err
		}
		after, err = e.hubState(cleanupCtx, o, s)
		if err != nil {
			return nil, err
		}
		return nil, &restoredError{cause: startErr, after: digest(jsonBytes(after))}
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "hub.resources.json"), jsonBytes(accessRecord{Spec: s.Digest, Containers: map[string]string{"homepage": after["id"].(string)}}), 0600); err != nil {
		return nil, err
	}
	if err = os.Remove(filepath.Join(o.DataRoot, "hub.intent.json")); err != nil {
		return nil, err
	}
	return jsonBytes(after), nil
}
func (e *Engine) compensateHub(ctx context.Context, o Options, s accessSpec, before map[string]any) (finalErr error) {
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	step := Step{"PLATFORM_HUB_STARTUP_COMPENSATED", "ACCEPTED", "REQUESTED", digest(jsonBytes(before)), "NOT_OBSERVED", "STOP_NEW_START_PRESERVE_CONFIG"}
	if err := audit.append(step); err != nil {
		return err
	}
	defer func() {
		step.Outcome, step.Phase, step.Reason = "SUCCEEDED", "COMPLETED", "NEW_START_STOPPED_CONFIGURATION_PRESERVED"
		if finalErr != nil {
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(finalErr)
		}
		if err := audit.append(step); err != nil {
			finalErr = err
		}
	}()
	c, err := e.readAccessContainer(ctx, o, s.Project+"-homepage")
	if err != nil {
		return err
	}
	if c != nil {
		if err = e.validateAccessContainer(o, s, "homepage", c); err != nil {
			return err
		}
		if before["running"] != true && c.State.Running {
			if _, err = e.docker(ctx, o, "container", "stop", "--timeout", "30", c.ID); err != nil {
				return err
			}
		}
	}
	after, err := e.hubState(ctx, o, s)
	if err != nil {
		return err
	}
	if before["running"] != true && after["running"] == true {
		return codedError("PLATFORM_HUB_COMPENSATION_UNCONFIRMED")
	}
	if before["running"] == true && after["running"] != true {
		return codedError("PLATFORM_HUB_COMPENSATION_UNCONFIRMED")
	}
	step.After = digest(jsonBytes(after))
	return nil
}
