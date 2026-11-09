package provision

import (
	"ai-platform/operations/blueprints"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

const ciRunnerComponent = "gitlab-runner"

var ciRunnerServices = []string{ciRunnerComponent}
var ciRunnerTokenPattern = regexp.MustCompile(`^glrt-[A-Za-z0-9_.~+=/-]{16,500}$`)

type ciRunnerIdentity struct {
	Schema                       int
	Installation, Profile, Owner string
	ID                           int64
	Token                        string
}

func ciRunnerRelease() accessRelease {
	data, _ := sources.ReadFile("ci-runner-images.json")
	var releases map[string]accessRelease
	_ = json.Unmarshal(data, &releases)
	return releases[ciRunnerComponent]
}
func readCIRunnerIdentity(o Options) (ciRunnerIdentity, error) {
	var v ciRunnerIdentity
	if err := accessPrivateRead(o, "ci-runner-identity.json", &v); err != nil {
		return v, err
	}
	if v.Schema != 1 || v.Installation != o.InstallationID || v.Profile != o.Profile || !operationPattern.MatchString(v.Owner) || v.ID < 0 || (v.ID == 0) != (v.Token == "") || v.Token != "" && !ciRunnerTokenPattern.MatchString(v.Token) {
		return v, codedError("PLATFORM_CI_RUNNER_IDENTITY_INVALID")
	}
	return v, nil
}
func ciRunnerIdentityProof(v ciRunnerIdentity) []byte {
	return jsonBytes(map[string]any{"owner": v.Owner, "installation": v.Installation, "profile": v.Profile})
}
func prepareCIRunnerIdentity(o Options) ([]byte, error) {
	v, err := readCIRunnerIdentity(o)
	if os.IsNotExist(err) {
		for _, name := range []string{"ci-runner.resources.json", "ci-runner.intent.json"} {
			path := filepath.Join(o.DataRoot, name)
			if err := plain(path); err != nil {
				return nil, err
			}
			if _, err := os.Stat(path); err == nil {
				return nil, &restoredError{cause: codedError("PLATFORM_CI_RUNNER_IDENTITY_MISSING_EXISTING_RESOURCES"), after: "ABSENT"}
			} else if !os.IsNotExist(err) {
				return nil, err
			}
		}
		v = ciRunnerIdentity{Schema: 1, Installation: o.InstallationID, Profile: o.Profile}
		v.Owner, err = randomIdentity()
		if err != nil {
			return nil, err
		}
		err = atomicFile(filepath.Join(o.ControlRoot, "ci-runner-identity.json"), jsonBytes(v), 0600)
	}
	if err != nil {
		return nil, err
	}
	return ciRunnerIdentityProof(v), nil
}
func ciRunnerAdminURL(o Options, id int64) string {
	return fmt.Sprintf("%s/admin/runners/%d", gitlabURL(o), id)
}
func (e *Engine) ciRunnerSpec(o Options, v ciRunnerIdentity) (accessSpec, error) {
	if v.ID <= 0 || !ciRunnerTokenPattern.MatchString(v.Token) {
		return accessSpec{}, codedError("PLATFORM_CI_RUNNER_REGISTRATION_REQUIRED")
	}
	var preset struct {
		Schema                 int `json:"schema_version"`
		Profile, Scope, Memory string
		CPUs                   float64
		Jobs                   bool `json:"jobs_enabled"`
	}
	raw, err := blueprints.Files.ReadFile("middleware/runner-control.json")
	if err != nil || json.Unmarshal(raw, &preset) != nil || preset.Schema != 1 || preset.Profile != "precision-windows" || preset.Scope != "REGISTERED_PAUSED_CONTROL_ONLY" || preset.Jobs {
		return accessSpec{}, codedError("PLATFORM_CI_RUNNER_BLUEPRINT_INVALID")
	}
	image, ok := ciRunnerRelease().Platforms[e.Host.Arch]
	if !ok {
		return accessSpec{}, codedError("PLATFORM_CI_RUNNER_PROFILE_NOT_QUALIFIED")
	}
	project := "ai-platform-" + e.shortID(o) + "-ci-runner"
	// The nonexistent Unix endpoint is a second gate. No daemon socket, host path,
	// helper image or shell executor is provided by the control-only phase.
	config := fmt.Sprintf(`concurrent = 1
check_interval = 10
log_level = "warning"
shutdown_timeout = 30
[[runners]]
  name = "ai-platform-control"
  url = "http://gitlab:%d"
  id = %d
  token = %q
  executor = "docker"
  request_concurrency = 1
  [runners.docker]
    host = "unix:///run/ai-platform-executor/disabled.sock"
    image = "executor-not-configured.invalid/disabled:pending"
    privileged = false
    disable_cache = true
    services_limit = 0
    cap_drop = ["ALL"]
    security_opt = ["no-new-privileges:true"]
    volumes = []
`, o.GitlabPort, v.ID, v.Token)
	volumes := map[string]accessVolume{"runner-config": {Name: project + "-config", UID: 1000, Files: map[string]accessFile{".platform-owner": {[]byte(v.Owner), 0400}, "config.toml": {[]byte(config), 0400}, ".runner_system_id": {[]byte("s_" + v.Owner[:12]), 0400}}}}
	labels := map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.owner": v.Owner, "ai.platform.component": "runner-control", "ai.platform.service": ciRunnerComponent}
	service := map[string]any{"image": image.Reference, "container_name": project + "-" + ciRunnerComponent, "user": "1000:1000", "read_only": true, "restart": "unless-stopped", "cap_drop": []string{"ALL"}, "security_opt": []string{"no-new-privileges:true"}, "pids_limit": 64, "mem_limit": preset.Memory, "cpus": preset.CPUs, "entrypoint": []string{"/usr/bin/gitlab-runner"}, "command": []string{"run", "--config", "/etc/gitlab-runner/config.toml", "--working-directory", "/tmp"}, "environment": map[string]string{"PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"}, "networks": map[string]any{"services": map[string]any{}}, "volumes": []any{map[string]any{"type": "volume", "source": "runner-config", "target": "/etc/gitlab-runner", "read_only": true}}, "tmpfs": []string{"/tmp:rw,nosuid,nodev,noexec,uid=1000,gid=1000,size=16777216", "/home/gitlab-runner:rw,nosuid,nodev,noexec,uid=1000,gid=1000,size=16777216"}, "labels": labels}
	networks := map[string]any{}
	for _, n := range e.networkViews(o) {
		if n.Role == "services" {
			networks[n.Role] = map[string]any{"name": n.Name, "external": true}
		}
	}
	policy, err := blueprints.DigestOf("middleware/runner-control.json")
	if err != nil {
		return accessSpec{}, err
	}
	services := map[string]map[string]any{ciRunnerComponent: service}
	spec := digest(jsonBytes(map[string]any{"services": services, "volumes": volumes, "networks": networks, "policy": policy}))
	labels["ai.platform.spec"] = spec
	compose := jsonBytes(map[string]any{"name": project, "services": services, "volumes": map[string]any{"runner-config": map[string]any{"name": volumes["runner-config"].Name, "external": true}}, "networks": networks})
	return accessSpec{Project: project, Owner: v.Owner, Digest: spec, Volumes: volumes, Services: services, Compose: compose}, nil
}
