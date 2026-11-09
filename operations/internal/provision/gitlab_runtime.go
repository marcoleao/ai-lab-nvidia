package provision

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func (e *Engine) gitlabState(ctx context.Context, o Options, s accessSpec) (map[string]map[string]any, error) {
	state := map[string]map[string]any{}
	for _, key := range gitlabServices {
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
func gitlabCredentialProof(seed gitlabSeed) []byte {
	return jsonBytes(map[string]string{"credential_receipt": digest(jsonBytes(seed)), "delivery": "PRIVATE_CONTROL_FILE"})
}
func (e *Engine) gitlabImages(ctx context.Context, o Options, pull bool) ([]byte, error) {
	values := map[string]json.RawMessage{}
	for _, key := range gitlabServices {
		image := serviceRelease(key).Platforms[e.Host.Arch]
		proof, err := e.managedImageProof(ctx, o, image)
		if err != nil {
			return nil, err
		}
		if proof == nil && pull {
			if _, err = e.docker(ctx, o, "pull", "--platform", "linux/"+e.Host.Arch, image.Reference); err != nil {
				return nil, err
			}
			proof, err = e.managedImageProof(ctx, o, image)
			if err != nil {
				return nil, err
			}
			if proof == nil {
				return nil, codedError("PLATFORM_GITLAB_IMAGE_UNCONFIRMED")
			}
		}
		if proof == nil {
			values[key] = json.RawMessage(`null`)
		} else {
			values[key] = proof
		}
	}
	return jsonBytes(values), nil
}
func (e *Engine) gitlabFingerprint(ctx context.Context, action string, o Options) (string, error) {
	if action == "PLATFORM_GITLAB_IMAGES_PREPARED" {
		v, err := e.gitlabImages(ctx, o, false)
		return digest(v), err
	}
	seed, err := readGitlabSeed(o)
	if os.IsNotExist(err) {
		return "ABSENT", nil
	}
	if err != nil {
		return "", err
	}
	if action == "PLATFORM_GITLAB_CREDENTIALS_PREPARED" {
		return digest(gitlabCredentialProof(seed)), nil
	}
	spec, err := e.gitlabSpec(o, seed)
	if err != nil {
		return "", err
	}
	state, err := e.gitlabState(ctx, o, spec)
	return digest(jsonBytes(state)), err
}
func (e *Engine) gitlabRequest(ctx context.Context, o Options) (string, error) {
	client := e.HTTP
	if client == nil {
		host := fmt.Sprintf("git.localhost:%d", o.GitlabPort)
		transport := &http.Transport{Proxy: nil, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			if address != host {
				return nil, codedError("PLATFORM_GITLAB_HTTP_TARGET_REJECTED")
			}
			return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "tcp4", fmt.Sprintf("127.0.0.1:%d", o.GitlabPort))
		}}
		local := &http.Client{Transport: transport, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		defer local.CloseIdleConnections()
		client = local
	}
	request, err := http.NewRequestWithContext(ctx, "GET", gitlabURL(o)+"/users/sign_in", nil)
	if err != nil {
		return "", err
	}
	response, err := client.Do(request)
	if err != nil {
		return "", codedError("PLATFORM_GITLAB_HTTP_UNAVAILABLE")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", codedError("PLATFORM_GITLAB_HTTP_UNCONFIRMED")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (2<<20)+1))
	if err != nil || len(data) > 2<<20 {
		return "", codedError("PLATFORM_GITLAB_HTTP_INVALID")
	}
	if !strings.Contains(string(data), "GitLab") {
		return "", codedError("PLATFORM_GITLAB_UI_UNCONFIRMED")
	}
	return string(data), nil
}
func (e *Engine) verifyGitlab(ctx context.Context, o Options, s accessSpec) error {
	c, err := e.readAccessContainer(ctx, o, s.Project+"-gitlab")
	if err != nil {
		return err
	}
	if c == nil || !c.State.Running {
		return codedError("PLATFORM_GITLAB_PROCESS_UNCONFIRMED")
	}
	if err = e.validateAccessContainer(o, s, "gitlab", c); err != nil {
		return err
	}
	reply, err := e.docker(ctx, o, "container", "exec", c.ID, "/opt/gitlab/embedded/bin/curl", "--fail", "--silent", "--max-time", "10", fmt.Sprintf("http://127.0.0.1:%d/-/readiness?all=1", o.GitlabPort))
	if err != nil {
		return codedError("PLATFORM_GITLAB_READINESS_UNCONFIRMED")
	}
	var value struct{ Status string }
	if json.Unmarshal([]byte(reply.Output), &value) != nil || value.Status != "ok" {
		return codedError("PLATFORM_GITLAB_READINESS_UNCONFIRMED")
	}
	_, err = e.gitlabRequest(ctx, o)
	return err
}
func (e *Engine) prepareGitlab(ctx context.Context, o Options) ([]byte, error) {
	seed, err := readGitlabSeed(o)
	if err != nil {
		return nil, err
	}
	s, err := e.gitlabSpec(o, seed)
	if err != nil {
		return nil, err
	}
	var record, intent accessRecord
	if err = networkControl(o, "gitlab.resources.json", &record); err != nil {
		return nil, err
	}
	if err = networkControl(o, "gitlab.intent.json", &intent); err != nil {
		return nil, err
	}
	if record.Spec != "" && record.Spec != s.Digest || intent.Spec != "" && intent.Spec != s.Digest {
		return nil, codedError("PLATFORM_GITLAB_MIGRATION_REQUIRED")
	}
	before, err := e.gitlabState(ctx, o, s)
	if err != nil {
		return nil, err
	}
	for _, key := range gitlabServices {
		if id, exists := before[key]["id"]; exists {
			if record.Containers[key] != "" && record.Containers[key] != id || record.Containers[key] == "" && intent.Spec != s.Digest {
				return nil, codedError("PLATFORM_GITLAB_UNCLAIMED_CONTAINER")
			}
		}
	}
	if before["gitlab-web"]["id"] == nil {
		if e.PortAvailable != nil {
			err = e.PortAvailable(o.GitlabPort)
		} else {
			var listener net.Listener
			listener, err = net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", o.GitlabPort))
			if err == nil {
				listener.Close()
			}
		}
		if err != nil {
			return nil, &restoredError{cause: codedError("PLATFORM_GITLAB_PORT_IN_USE"), after: digest(jsonBytes(before))}
		}
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "gitlab.intent.json"), jsonBytes(accessRecord{Spec: s.Digest}), 0600); err != nil {
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
	for name, data := range map[string][]byte{"compose.json": s.Compose, "empty.env": []byte("# No ambient environment file.\n")} {
		if err = writeOwned(filepath.Join(o.DataRoot, "gitlab", name), data); err != nil {
			return nil, err
		}
	}
	_, startErr := e.docker(ctx, o, "compose", "--project-name", s.Project, "--env-file", filepath.Join(o.DataRoot, "gitlab", "empty.env"), "--file", filepath.Join(o.DataRoot, "gitlab", "compose.json"), "up", "--detach", "--no-build", "--no-recreate", "--pull", "never")
	if startErr == nil {
		waitCtx, cancel := context.WithTimeout(ctx, 7*time.Minute)
		for {
			if e.verifyGitlab(waitCtx, o, s) == nil {
				break
			}
			select {
			case <-waitCtx.Done():
				startErr = codedError("PLATFORM_GITLAB_HEALTH_TIMEOUT")
			case <-time.After(2 * time.Second):
			}
			if startErr != nil {
				break
			}
		}
		cancel()
	}
	after, inspectErr := e.gitlabState(ctx, o, s)
	if startErr == nil {
		startErr = inspectErr
		for _, key := range gitlabServices {
			if startErr == nil && after[key]["running"] != true {
				startErr = codedError("PLATFORM_GITLAB_PROCESS_UNCONFIRMED")
			}
		}
	}
	if startErr != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Minute)
		defer cancel()
		if err = e.compensateGitlab(cleanupCtx, o, s, before); err != nil {
			return nil, err
		}
		after, err = e.gitlabState(cleanupCtx, o, s)
		if err != nil {
			return nil, err
		}
		return nil, &restoredError{cause: startErr, after: digest(jsonBytes(after))}
	}
	ids := map[string]string{}
	for _, key := range gitlabServices {
		ids[key] = after[key]["id"].(string)
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "gitlab.resources.json"), jsonBytes(accessRecord{Spec: s.Digest, Containers: ids}), 0600); err != nil {
		return nil, err
	}
	if err = os.Remove(filepath.Join(o.DataRoot, "gitlab.intent.json")); err != nil {
		return nil, err
	}
	return jsonBytes(after), nil
}
func (e *Engine) compensateGitlab(ctx context.Context, o Options, s accessSpec, before map[string]map[string]any) (finalErr error) {
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	step := Step{"PLATFORM_GITLAB_STARTUP_COMPENSATED", "ACCEPTED", "REQUESTED", digest(jsonBytes(before)), "NOT_OBSERVED", "STOP_NEW_START_PRESERVE_DATA"}
	if err := audit.append(step); err != nil {
		return err
	}
	defer func() {
		step.Outcome, step.Phase, step.Reason = "SUCCEEDED", "COMPLETED", "PROCESS_FLAGS_RESTORED_DATA_PRESERVED"
		if finalErr != nil {
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(finalErr)
		}
		if err := audit.append(step); err != nil {
			finalErr = err
		}
	}()
	for i := len(gitlabServices) - 1; i >= 0; i-- {
		key := gitlabServices[i]
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
		if before[key]["running"] != true && c.State.Running {
			if _, err = e.docker(ctx, o, "container", "stop", "--timeout", "60", c.ID); err != nil {
				return err
			}
		}
	}
	after, err := e.gitlabState(ctx, o, s)
	if err != nil {
		return err
	}
	for _, key := range gitlabServices {
		if (before[key]["running"] == true) != (after[key]["running"] == true) {
			return codedError("PLATFORM_GITLAB_COMPENSATION_UNCONFIRMED")
		}
	}
	step.After = digest(jsonBytes(after))
	return nil
}
