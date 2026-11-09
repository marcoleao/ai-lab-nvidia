package provision

import (
	"ai-platform/operations/blueprints"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

var gitlabServices = []string{"gitlab", "gitlab-web"}
var gitlabCapabilities = []string{"CHOWN", "DAC_OVERRIDE", "FOWNER", "FSETID", "KILL", "SETGID", "SETUID", "SETPCAP", "SYS_CHROOT", "NET_BIND_SERVICE", "AUDIT_WRITE"}

type gitlabSeed struct {
	Schema                                     int
	Installation, Profile, Owner, RootPassword string
}

func isGitlabService(id string) bool { return id == "gitlab" || id == "gitlab-web" }
func gitlabRelease() accessRelease {
	data, _ := sources.ReadFile("gitlab-images.json")
	var values map[string]accessRelease
	_ = json.Unmarshal(data, &values)
	return values["gitlab"]
}
func gitlabURL(o Options) string { return fmt.Sprintf("http://git.localhost:%d", o.GitlabPort) }
func readGitlabSeed(o Options) (gitlabSeed, error) {
	var seed gitlabSeed
	if err := accessPrivateRead(o, "gitlab-seed.json", &seed); err != nil {
		return seed, err
	}
	if seed.Schema != 1 || seed.Installation != o.InstallationID || seed.Profile != o.Profile || !operationPattern.MatchString(seed.Owner) || !hashPattern.MatchString(seed.RootPassword) {
		return seed, codedError("PLATFORM_GITLAB_CREDENTIAL_INVALID")
	}
	return seed, nil
}
func prepareGitlabSeed(o Options) ([]byte, error) {
	seed, err := readGitlabSeed(o)
	if os.IsNotExist(err) {
		seed = gitlabSeed{Schema: 1, Installation: o.InstallationID, Profile: o.Profile}
		seed.Owner, err = randomIdentity()
		if err != nil {
			return nil, err
		}
		a, err := randomIdentity()
		if err != nil {
			return nil, err
		}
		b, err := randomIdentity()
		if err != nil {
			return nil, err
		}
		seed.RootPassword = a + b
		if err = atomicFile(filepath.Join(o.ControlRoot, "gitlab-seed.json"), jsonBytes(seed), 0600); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	return gitlabCredentialProof(seed), nil
}
func (e *Engine) gitlabSpec(o Options, seed gitlabSeed) (accessSpec, error) {
	var preset struct {
		Schema  int `json:"schema_version"`
		Memory  string
		CPUs    float64
		Profile string
	}
	raw, err := blueprints.Files.ReadFile("middleware/gitlab.json")
	if err != nil || json.Unmarshal(raw, &preset) != nil || preset.Schema != 1 || preset.Profile != "precision-windows" {
		return accessSpec{}, codedError("PLATFORM_GITLAB_BLUEPRINT_INVALID")
	}
	image, ok := gitlabRelease().Platforms[e.Host.Arch]
	if !ok {
		return accessSpec{}, codedError("PLATFORM_GITLAB_PROFILE_NOT_QUALIFIED")
	}
	project := "ai-platform-" + e.shortID(o) + "-gitlab"
	marker := map[string]accessFile{".platform-owner": {[]byte(seed.Owner), 0400}}
	volumes := map[string]accessVolume{}
	for _, key := range []string{"gitlab-config", "gitlab-data", "gitlab-logs"} {
		volumes[key] = accessVolume{Name: project + "-" + key, UID: 0, Files: marker, Persistent: true}
	}
	volumes["gitlab-bootstrap"] = accessVolume{Name: project + "-bootstrap", UID: 0, Files: map[string]accessFile{".platform-owner": {[]byte(seed.Owner), 0400}, "root-password": {[]byte(seed.RootPassword), 0400}}}
	caddy := fmt.Sprintf("{ admin off\n auto_https off\n}\n:%d {\n reverse_proxy gitlab:%d\n}\n", o.GitlabPort, o.GitlabPort)
	volumes["gitlab-proxy"] = accessVolume{Name: project + "-proxy", UID: 1000, Files: map[string]accessFile{".platform-owner": {[]byte(seed.Owner), 0400}, "Caddyfile": {[]byte(caddy), 0400}}}
	mount := func(source, target string, ro bool) any {
		return map[string]any{"type": "volume", "source": source, "target": target, "read_only": ro}
	}
	labels := func(key string) map[string]string {
		return map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.owner": seed.Owner, "ai.platform.component": "gitlab", "ai.platform.service": key}
	}
	config := fmt.Sprintf(`external_url '%s'
nginx['listen_port'] = %d
nginx['listen_https'] = false
gitlab_rails['initial_root_password'] = File.read('/run/ai-platform-gitlab/root-password').strip
gitlab_rails['usage_ping_enabled'] = false
gitlab_rails['smtp_enable'] = false
gitlab_rails['gitlab_shell_ssh_port'] = 0
letsencrypt['enable'] = false
prometheus_monitoring['enable'] = false
puma['worker_processes'] = 2
sidekiq['concurrency'] = 5
`, gitlabURL(o), o.GitlabPort)
	services := map[string]map[string]any{
		"gitlab":     {"image": image.Reference, "container_name": project + "-gitlab", "hostname": "gitlab", "user": "0:0", "read_only": false, "restart": "unless-stopped", "cap_drop": []string{"ALL"}, "cap_add": gitlabCapabilities, "security_opt": []string{"no-new-privileges:true"}, "pids_limit": 2048, "mem_limit": preset.Memory, "cpus": preset.CPUs, "shm_size": "256m", "entrypoint": []string{"/assets/init-container"}, "command": []string{}, "environment": map[string]string{"GITLAB_OMNIBUS_CONFIG": config, "PATH": "/opt/gitlab/embedded/bin:/opt/gitlab/bin:/assets:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8", "EDITOR": "/bin/vi", "GITLAB_ALLOW_SHA1_RSA": "false", "TERM": "xterm"}, "networks": map[string]any{"services": map[string]any{}}, "volumes": []any{mount("gitlab-config", "/etc/gitlab", false), mount("gitlab-data", "/var/opt/gitlab", false), mount("gitlab-logs", "/var/log/gitlab", false), mount("gitlab-bootstrap", "/run/ai-platform-gitlab", true)}, "tmpfs": []string{"/tmp:rw,nosuid,nodev,size=268435456"}, "labels": labels("gitlab")},
		"gitlab-web": {"image": accessReleases()["caddy"].Platforms[e.Host.Arch].Reference, "container_name": project + "-gitlab-web", "user": "1000:1000", "read_only": true, "restart": "unless-stopped", "cap_drop": []string{"ALL"}, "security_opt": []string{"no-new-privileges:true"}, "pids_limit": 64, "mem_limit": "128m", "cpus": 0.5, "entrypoint": []string{"caddy"}, "command": []string{"run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"}, "environment": map[string]string{}, "networks": map[string]any{"services": map[string]any{}, "edge": map[string]any{}}, "ports": []any{map[string]any{"target": o.GitlabPort, "published": fmt.Sprint(o.GitlabPort), "host_ip": "127.0.0.1", "protocol": "tcp"}}, "volumes": []any{mount("gitlab-proxy", "/etc/caddy", true)}, "tmpfs": []string{"/data:rw,nosuid,noexec,uid=1000,gid=1000,size=16777216", "/config:rw,nosuid,noexec,uid=1000,gid=1000,size=16777216"}, "labels": labels("gitlab-web")},
	}
	networks := map[string]any{}
	for _, v := range e.networkViews(o) {
		if v.Role == "services" || v.Role == "edge" {
			networks[v.Role] = map[string]any{"name": v.Name, "external": true}
		}
	}
	policy, err := blueprints.DigestOf("middleware/gitlab.json")
	if err != nil {
		return accessSpec{}, err
	}
	spec := digest(jsonBytes(map[string]any{"services": services, "volumes": volumes, "networks": networks, "policy": policy}))
	for _, v := range services {
		v["labels"].(map[string]string)["ai.platform.spec"] = spec
	}
	named := map[string]any{}
	for key, v := range volumes {
		named[key] = map[string]any{"name": v.Name, "external": true}
	}
	compose := jsonBytes(map[string]any{"name": project, "services": services, "volumes": named, "networks": networks})
	return accessSpec{Project: project, Owner: seed.Owner, Digest: spec, Volumes: volumes, Services: services, Compose: compose}, nil
}
