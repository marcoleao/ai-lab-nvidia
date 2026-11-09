package provision

import (
	"ai-platform/operations/blueprints"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

var observabilityServices = []string{"metrics", "logs", "telemetry", "grafana"}

func isObservabilityService(id string) bool {
	for _, v := range observabilityServices {
		if v == id {
			return true
		}
	}
	return false
}
func observabilityReleases() map[string]accessRelease {
	data, _ := sources.ReadFile("observability-images.json")
	var releases map[string]accessRelease
	_ = json.Unmarshal(data, &releases)
	return releases
}
func containerRelease(key string) string {
	return map[string]string{"identity-db": "postgres", "identity": "keycloak", "secret-store": "openbao", "edge": "caddy", "metrics": "prometheus", "logs": "loki", "telemetry": "collector", "grafana": "grafana"}[key]
}
func serviceRelease(key string) accessRelease {
	if key == ciRunnerComponent {
		return ciRunnerRelease()
	}
	if key == "gitlab" {
		return gitlabRelease()
	}
	if key == "gitlab-web" {
		return accessReleases()["caddy"]
	}
	if key == "homepage" {
		return hubRelease()
	}
	if isObservabilityService(key) {
		return observabilityReleases()[containerRelease(key)]
	}
	return accessReleases()[containerRelease(key)]
}

type observabilitySeed struct {
	Schema                                                 int
	Installation, Profile, Owner, AdminPassword, SecretKey string
}

type observabilityPreset struct {
	Product, User, Memory string
	DataPath              string `json:"data_path"`
	CPUs                  float64
	Command               []string
}

func readObservabilitySeed(o Options) (observabilitySeed, error) {
	var v observabilitySeed
	if err := accessPrivateRead(o, "observability-seed.json", &v); err != nil {
		return v, err
	}
	if v.Schema != 1 || v.Installation != o.InstallationID || v.Profile != o.Profile || len(v.Owner) != 32 || !operationPattern.MatchString(v.Owner) || !hashPattern.MatchString(v.AdminPassword) || !hashPattern.MatchString(v.SecretKey) {
		return v, codedError("PLATFORM_OBSERVABILITY_CREDENTIALS_INVALID")
	}
	return v, nil
}
func observabilityCredentialReceipt(v observabilitySeed) []byte {
	return jsonBytes(map[string]string{"credential_receipt": digest(jsonBytes(v)), "delivery": "PRIVATE_CONTROL_FILE"})
}
func (e *Engine) prepareObservabilityCredentials(o Options) ([]byte, error) {
	v, err := readObservabilitySeed(o)
	if os.IsNotExist(err) {
		v = observabilitySeed{Schema: 1, Installation: o.InstallationID, Profile: o.Profile}
		v.Owner, err = randomIdentity()
		if err != nil {
			return nil, err
		}
		for _, target := range []*string{&v.AdminPassword, &v.SecretKey} {
			a, err := randomIdentity()
			if err != nil {
				return nil, err
			}
			b, err := randomIdentity()
			if err != nil {
				return nil, err
			}
			*target = a + b
		}
		if err = atomicFile(o.ControlRoot+string(os.PathSeparator)+"observability-seed.json", jsonBytes(v), 0600); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	return observabilityCredentialReceipt(v), nil
}

func observabilityURL(o Options) string {
	return fmt.Sprintf("http://grafana.localhost:%d", o.GrafanaPort)
}
func observabilityBlueprint(name string, o Options) ([]byte, error) {
	data, err := blueprints.Files.ReadFile(name)
	if err != nil {
		return nil, codedError("PLATFORM_OBSERVABILITY_BLUEPRINT_INVALID")
	}
	data = bytes.ReplaceAll(data, []byte("@INSTALLATION@"), []byte(o.InstallationID))
	data = bytes.ReplaceAll(data, []byte("@PROFILE@"), []byte(o.Profile))
	return data, nil
}

func (e *Engine) observabilitySpec(o Options, seed observabilitySeed) (accessSpec, error) {
	project := "ai-platform-" + e.shortID(o) + "-observability"
	data, err := observabilityBlueprint("middleware/observability.json", o)
	if err != nil {
		return accessSpec{}, err
	}
	var blueprint struct {
		Schema   int `json:"schema_version"`
		Services map[string]observabilityPreset
	}
	if json.Unmarshal(data, &blueprint) != nil || blueprint.Schema != 1 || len(blueprint.Services) != len(observabilityServices) {
		return accessSpec{}, codedError("PLATFORM_OBSERVABILITY_BLUEPRINT_INVALID")
	}
	volumes := map[string]accessVolume{}
	newVolume := func(key string, uid int, persistent bool, files map[string]accessFile) {
		if files == nil {
			files = map[string]accessFile{}
		}
		files[".platform-owner"] = accessFile{[]byte(seed.Owner), 0400}
		volumes[key] = accessVolume{Name: project + "-" + key, UID: uid, Persistent: persistent, Files: files}
	}
	configs := map[string]string{"metrics": "prometheus.json", "logs": "loki.json", "telemetry": "collector.json"}
	for key, name := range configs {
		uid := 10001
		if key == "metrics" {
			uid = 65534
		}
		b, err := observabilityBlueprint("observability/"+name, o)
		if err != nil {
			return accessSpec{}, err
		}
		files := map[string]accessFile{"config.json": {b, 0400}}
		if key == "metrics" {
			rules, err := observabilityBlueprint("observability/rules.json", o)
			if err != nil {
				return accessSpec{}, err
			}
			files["rules.json"] = accessFile{rules, 0400}
		}
		newVolume(key+"-config", uid, false, files)
		if key != "telemetry" {
			newVolume(key+"-data", uid, true, nil)
		}
	}
	for key, name := range map[string]string{"grafana-datasources": "datasources.json", "grafana-providers": "providers.json", "grafana-dashboards": "foundation.json"} {
		b, err := observabilityBlueprint("observability/"+name, o)
		if err != nil {
			return accessSpec{}, err
		}
		file := "default.yaml"
		if key == "grafana-dashboards" {
			file = "foundation.json"
		}
		newVolume(key, 472, false, map[string]accessFile{file: {b, 0400}})
	}
	ini := "[server]\nhttp_addr = 0.0.0.0\nhttp_port = 3000\ndomain = grafana.localhost\nroot_url = " + observabilityURL(o) + "/\n[security]\nadmin_user = platform-admin\ncookie_samesite = strict\n[auth.anonymous]\nenabled = false\n[users]\nallow_sign_up = false\nallow_org_create = false\n[analytics]\nreporting_enabled = false\ncheck_for_updates = false\ncheck_for_plugin_updates = false\n[plugins]\npreinstall_disabled = true\npreinstall_auto_update = false\nplugin_admin_enabled = false\n[log]\nmode = console\nlevel = warn\n"
	newVolume("grafana-config", 472, false, map[string]accessFile{"grafana.ini": {[]byte(ini), 0400}, "admin.password": {[]byte(seed.AdminPassword), 0400}, "secret.key": {[]byte(seed.SecretKey), 0400}})
	newVolume("grafana-data", 472, true, nil)
	mount := func(key, path string, ro bool) map[string]any {
		return map[string]any{"type": "volume", "source": key, "target": path, "read_only": ro}
	}
	services := map[string]map[string]any{}
	for _, key := range observabilityServices {
		p, ok := blueprint.Services[key]
		if !ok || p.Product != containerRelease(key) {
			return accessSpec{}, codedError("PLATFORM_OBSERVABILITY_BLUEPRINT_INVALID")
		}
		uid, _, _ := strings.Cut(p.User, ":")
		service := map[string]any{"image": observabilityReleases()[p.Product].Platforms[e.Host.Arch].Reference, "user": p.User, "read_only": true, "restart": "unless-stopped", "cap_drop": []string{"ALL"}, "security_opt": []string{"no-new-privileges:true"}, "mem_limit": p.Memory, "cpus": p.CPUs, "pids_limit": 128, "tmpfs": []string{"/tmp:rw,nosuid,noexec,uid=" + uid + ",mode=0700,size=33554432"}, "networks": map[string]any{"services": map[string]any{}}, "container_name": project + "-" + key, "labels": map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.owner": seed.Owner, "ai.platform.component": "observability", "ai.platform.service": key}}
		service["command"] = p.Command
		mounts := []any{mount(key+"-config", "/etc/platform", true)}
		if p.DataPath != "" {
			mounts = append(mounts, mount(key+"-data", p.DataPath, false))
		}
		if key == "grafana" {
			service["networks"].(map[string]any)["edge"] = map[string]any{}
			mounts = append(mounts, mount("grafana-datasources", "/etc/grafana/provisioning/datasources", true), mount("grafana-providers", "/etc/grafana/provisioning/dashboards", true), mount("grafana-dashboards", "/etc/platform-dashboards", true))
			service["environment"] = map[string]string{"GF_PATHS_CONFIG": "/etc/platform/grafana.ini", "GF_PATHS_DATA": "/var/lib/grafana", "GF_PATHS_LOGS": "/var/lib/grafana/log", "GF_PATHS_PLUGINS": "/var/lib/grafana/plugins", "GF_SECURITY_ADMIN_PASSWORD__FILE": "/etc/platform/admin.password", "GF_SECURITY_SECRET_KEY__FILE": "/etc/platform/secret.key"}
			service["ports"] = []any{map[string]any{"target": 3000, "published": fmt.Sprint(o.GrafanaPort), "host_ip": "127.0.0.1", "protocol": "tcp"}}
		}
		service["volumes"] = mounts
		services[key] = service
	}
	networks := map[string]any{}
	for _, v := range e.networkViews(o) {
		if v.Role == "services" || v.Role == "edge" {
			networks[v.Role] = map[string]any{"name": v.Name, "external": true}
		}
	}
	defs := map[string]any{}
	for key, v := range volumes {
		defs[key] = map[string]any{"name": v.Name, "external": true}
	}
	policyDigest, err := blueprints.DigestOf("middleware/observability.json", "observability")
	if err != nil {
		return accessSpec{}, err
	}
	spec := digest(jsonBytes(map[string]any{"services": services, "volumes": volumes, "networks": networks, "blueprints": policyDigest}))
	for _, s := range services {
		s["labels"].(map[string]string)["ai.platform.spec"] = spec
	}
	compose := jsonBytes(map[string]any{"name": project, "services": services, "volumes": defs, "networks": networks})
	return accessSpec{Project: project, Owner: seed.Owner, Digest: spec, Volumes: volumes, Services: services, Compose: compose}, nil
}
