package provision

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type ciRunnerRegistration struct {
	ID          int64  `json:"id"`
	Paused      bool   `json:"paused"`
	Protected   bool   `json:"protected"`
	RunUntagged bool   `json:"run_untagged"`
	Scope       string `json:"scope"`
	TokenSHA256 string `json:"token_sha256"`
	Token       string `json:"token,omitempty"`
}

func ciRunnerRegistrationProof(v *ciRunnerRegistration) []byte {
	if v == nil {
		return []byte("null")
	}
	copy := *v
	copy.Token = ""
	return jsonBytes(copy)
}

// This adapter is tied to the pinned GitLab image. A read invokes only SELECTs;
// creation uses GitLab's own creation service inside its CI database transaction.
// Input is stdin, output is bounded/private, and no administrator PAT is created.
func (e *Engine) ciRunnerRegistration(ctx context.Context, o Options, v ciRunnerIdentity, create bool) (*ciRunnerRegistration, error) {
	gitlab, err := e.gitlabOperationService(ctx, o, "gitlab")
	if err != nil {
		return nil, err
	}
	if !gitlab.State.Running {
		return nil, codedError("PLATFORM_CI_RUNNER_GITLAB_STOPPED")
	}
	data, _ := sources.ReadFile("ci-runner-registration.rb")
	payload := base64.StdEncoding.EncodeToString(jsonBytes(map[string]any{"owner": v.Owner, "id": v.ID, "create": create}))
	stdin := []byte("require 'json'\nrequire 'base64'\nrequire 'digest'\nv = JSON.parse(Base64.strict_decode64(" + strconv.Quote(payload) + "))\n" + string(data))
	callCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	r, err := e.command(callCtx, Command{Program: filepath.Join(o.DataRoot, "tools", "bin", "docker"), Args: []string{"--host", e.endpoint(o), "container", "exec", "--interactive", gitlab.ID, "gitlab-rails", "runner", "-"}, Env: e.runtimeEnv(o), Stdin: stdin})
	if err != nil {
		for _, reason := range []string{"PLATFORM_CI_RUNNER_REGISTRATION_CONFLICT", "PLATFORM_CI_RUNNER_REGISTRATION_CHANGED", "PLATFORM_CI_RUNNER_POLICY_CHANGED"} {
			if strings.Contains(r.Output, reason) {
				return nil, codedError(reason)
			}
		}
		return nil, codedError("PLATFORM_CI_RUNNER_REGISTRATION_UNCONFIRMED")
	}
	lines := []string{}
	for _, line := range strings.Split(r.Output, "\n") {
		if strings.HasPrefix(line, "PLATFORM_RUNNER_JSON=") {
			lines = append(lines, strings.TrimPrefix(line, "PLATFORM_RUNNER_JSON="))
		}
	}
	if len(lines) != 1 {
		return nil, codedError("PLATFORM_CI_RUNNER_REGISTRATION_INVALID")
	}
	var reply *ciRunnerRegistration
	if json.Unmarshal([]byte(lines[0]), &reply) != nil {
		return nil, codedError("PLATFORM_CI_RUNNER_REGISTRATION_INVALID")
	}
	if reply == nil {
		if create || v.ID > 0 {
			return nil, codedError("PLATFORM_CI_RUNNER_REGISTRATION_MISSING")
		}
		return nil, nil
	}
	if reply.ID <= 0 || !reply.Paused || !reply.Protected || reply.RunUntagged || reply.Scope != "instance_type" || !hashPattern.MatchString(reply.TokenSHA256) || v.ID > 0 && (reply.ID != v.ID || reply.TokenSHA256 != digest([]byte(v.Token))) || create && (!ciRunnerTokenPattern.MatchString(reply.Token) || digest([]byte(reply.Token)) != reply.TokenSHA256) || !create && reply.Token != "" {
		return nil, codedError("PLATFORM_CI_RUNNER_POLICY_OR_CREDENTIAL_CHANGED")
	}
	return reply, nil
}
func (e *Engine) prepareCIRunnerRegistration(ctx context.Context, o Options) ([]byte, error) {
	v, err := readCIRunnerIdentity(o)
	if err != nil {
		return nil, err
	}
	reply, err := e.ciRunnerRegistration(ctx, o, v, true)
	if err != nil {
		return nil, err
	}
	v.ID, v.Token = reply.ID, reply.Token
	if err = atomicFile(filepath.Join(o.ControlRoot, "ci-runner-identity.json"), jsonBytes(v), 0600); err != nil {
		return nil, err
	}
	return ciRunnerRegistrationProof(reply), nil
}
func (e *Engine) ciRunnerImage(ctx context.Context, o Options, pull bool) ([]byte, error) {
	image := ciRunnerRelease().Platforms[e.Host.Arch]
	proof, err := e.managedImageProof(ctx, o, image)
	if err != nil {
		return nil, err
	}
	if proof == nil && pull {
		if _, err = e.docker(ctx, o, "pull", "--platform", "linux/"+e.Host.Arch, image.Reference); err != nil {
			return nil, err
		}
		proof, err = e.managedImageProof(ctx, o, image)
		if err == nil && proof == nil {
			err = codedError("PLATFORM_CI_RUNNER_IMAGE_UNCONFIRMED")
		}
	}
	return proof, err
}
func (e *Engine) ciRunnerFingerprint(ctx context.Context, action string, o Options) (string, error) {
	if action == "PLATFORM_CI_RUNNER_IMAGE_PREPARED" {
		proof, err := e.ciRunnerImage(ctx, o, false)
		return digest(proof), err
	}
	v, err := readCIRunnerIdentity(o)
	if os.IsNotExist(err) {
		return "ABSENT", nil
	}
	if err != nil {
		return "", err
	}
	if action == "PLATFORM_CI_RUNNER_IDENTITY_PREPARED" {
		return digest(ciRunnerIdentityProof(v)), nil
	}
	if action == "PLATFORM_CI_RUNNER_REGISTRATION_PREPARED" {
		r, err := e.ciRunnerRegistration(ctx, o, v, false)
		return digest(ciRunnerRegistrationProof(r)), err
	}
	s, err := e.ciRunnerSpec(o, v)
	if err != nil {
		return "", err
	}
	state, err := e.ciRunnerState(ctx, o, s)
	return digest(jsonBytes(state)), err
}
