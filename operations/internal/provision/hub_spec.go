package provision

import (
	"ai-platform/operations/blueprints"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type hubIdentity struct {
	Schema                       int
	Installation, Profile, Owner string
}

func hubRelease() accessRelease {
	data, _ := sources.ReadFile("middleware-images.json")
	var releases map[string]accessRelease
	_ = json.Unmarshal(data, &releases)
	return releases["homepage"]
}
func hubURL(o Options) string { return fmt.Sprintf("http://home.localhost:%d", o.HubPort) }
func readHubIdentity(o Options) (hubIdentity, error) {
	var v hubIdentity
	if err := accessPrivateRead(o, "hub-owner.json", &v); err != nil {
		return v, err
	}
	if v.Schema != 1 || v.Installation != o.InstallationID || v.Profile != o.Profile || len(v.Owner) != 32 || !operationPattern.MatchString(v.Owner) {
		return v, codedError("PLATFORM_HUB_IDENTITY_INVALID")
	}
	return v, nil
}
func prepareHubIdentity(o Options) ([]byte, error) {
	v, err := readHubIdentity(o)
	if os.IsNotExist(err) {
		v = hubIdentity{Schema: 1, Installation: o.InstallationID, Profile: o.Profile}
		v.Owner, err = randomIdentity()
		if err != nil {
			return nil, err
		}
		err = atomicFile(filepath.Join(o.ControlRoot, "hub-owner.json"), jsonBytes(v), 0600)
	}
	if err != nil {
		return nil, err
	}
	return jsonBytes(v), nil
}

func (e *Engine) hubSpec(o Options, identity hubIdentity) (accessSpec, error) {
	project := "ai-platform-" + e.shortID(o) + "-hub"
	var preset struct {
		Schema       int `json:"schema_version"`
		User, Memory string
		CPUs         float64
	}
	data, err := blueprints.Files.ReadFile("middleware/homepage.json")
	if err != nil || json.Unmarshal(data, &preset) != nil || preset.Schema != 1 || preset.User != "1000:1000" {
		return accessSpec{}, codedError("PLATFORM_HUB_BLUEPRINT_INVALID")
	}
	settings, err := blueprints.Files.ReadFile("hub/settings.json")
	if err != nil {
		return accessSpec{}, err
	}
	urls := accessEndpoints(o)
	card := func(name, link, description string) any {
		return map[string]any{name: map[string]string{"href": link, "description": description}}
	}
	services := []any{
		map[string]any{"Acessos": []any{card("Keycloak", urls["identity"]+"/admin/", "Identidades e permissões"), card("OpenBao", urls["secret_store"]+"/ui/", "Segredos técnicos")}},
		map[string]any{"Observabilidade": []any{card("Grafana", observabilityURL(o)+"/d/platform-foundation", "Métricas, fontes e diagnóstico da fundação")}},
	}
	file := func(b []byte) accessFile { return accessFile{b, 0400} }
	files := map[string]accessFile{
		".platform-owner": file([]byte(identity.Owner)), "settings.yaml": file(settings), "services.yaml": file(jsonBytes(services)),
		"widgets.yaml": file([]byte("[]")), "bookmarks.yaml": file([]byte("[]")), "docker.yaml": file([]byte("{}")), "kubernetes.yaml": file([]byte(`{"mode":"disabled"}`)), "proxmox.yaml": file([]byte("{}")), "custom.css": file([]byte{}), "custom.js": file([]byte{}),
	}
	volumes := map[string]accessVolume{"hub-config": {Name: project + "-config", UID: 1000, Files: files}}
	service := map[string]any{
		"image": hubRelease().Platforms[e.Host.Arch].Reference, "user": preset.User, "read_only": true, "restart": "unless-stopped", "cap_drop": []string{"ALL"}, "security_opt": []string{"no-new-privileges:true"}, "pids_limit": 128, "mem_limit": preset.Memory, "cpus": preset.CPUs,
		"tmpfs":          []string{"/tmp:rw,nosuid,noexec,uid=1000,gid=1000,mode=0700,size=33554432", "/app/.next/cache:rw,nosuid,noexec,uid=1000,gid=1000,mode=0700,size=33554432"},
		"container_name": project + "-homepage", "networks": map[string]any{"services": map[string]any{}},
		"environment": map[string]string{"HOMEPAGE_ALLOWED_HOSTS": fmt.Sprintf("home.localhost:%d", o.HubPort), "HOSTNAME": "0.0.0.0", "PORT": "3000", "PUID": "1000", "PGID": "1000", "LOG_TARGETS": "stdout", "LOG_LEVEL": "warn", "NEXT_TELEMETRY_DISABLED": "1"},
		"ports":       []any{map[string]any{"target": 3000, "published": fmt.Sprint(o.HubPort), "host_ip": "127.0.0.1", "protocol": "tcp"}},
		"volumes":     []any{map[string]any{"type": "volume", "source": "hub-config", "target": "/app/config", "read_only": true}},
		"labels":      map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.owner": identity.Owner, "ai.platform.component": "hub", "ai.platform.service": "homepage"},
	}
	networks := map[string]any{}
	for _, v := range e.networkViews(o) {
		if v.Role == "services" {
			networks[v.Role] = map[string]any{"name": v.Name, "external": true}
		}
	}
	policy, err := blueprints.DigestOf("middleware/homepage.json", "hub")
	if err != nil {
		return accessSpec{}, err
	}
	spec := digest(jsonBytes(map[string]any{"service": service, "volumes": volumes, "networks": networks, "policy": policy}))
	service["labels"].(map[string]string)["ai.platform.spec"] = spec
	all := map[string]map[string]any{"homepage": service}
	compose := jsonBytes(map[string]any{"name": project, "services": all, "volumes": map[string]any{"hub-config": map[string]any{"name": volumes["hub-config"].Name, "external": true}}, "networks": networks})
	return accessSpec{Project: project, Owner: identity.Owner, Digest: spec, Volumes: volumes, Services: all, Compose: compose}, nil
}
