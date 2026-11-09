package provision

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/netip"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"
)

type accessContainer struct {
	ID, Name, Image string
	Config          struct {
		Image, User          string
		Labels               map[string]string
		Env, Entrypoint, Cmd []string
	}
	State struct {
		Running, Paused, Restarting, OOMKilled bool
		StartedAt, Status                      string
		ExitCode                               int
	}
	HostConfig struct {
		NetworkMode                  string
		Privileged, ReadonlyRootfs   bool
		CapDrop, CapAdd, SecurityOpt []string
		Tmpfs                        map[string]string
		PortBindings                 map[string][]struct{ HostIp, HostPort string }
	}
	Mounts []struct {
		Type, Name, Destination string
		RW                      bool
	}
	NetworkSettings struct {
		Networks map[string]accessNetwork
		Ports    map[string][]struct{ HostIp, HostPort string }
	}
}

type accessNetwork struct {
	IPAddress  string
	IPAMConfig *accessIPAM
}
type accessIPAM struct{ IPv4Address string }
type accessRecord struct {
	Spec       string
	Containers map[string]string
}
type accessHelper struct{ Name, Nonce, Volume string }

func (e *Engine) requireAccessNetworks(ctx context.Context, o Options) error {
	if _, err := os.ReadFile(filepath.Join(o.ControlRoot, "platform_networks_prepared.state")); err != nil {
		return codedError("PLATFORM_NETWORK_PREPARATION_REQUIRED")
	}
	owner, err := os.ReadFile(filepath.Join(o.DataRoot, "network.owner"))
	if err != nil {
		return err
	}
	known := map[string]networkResource{}
	if err = networkControl(o, "network.resources.json", &known); err != nil {
		return err
	}
	all, err := e.networkInventory(ctx, o)
	if err != nil {
		return err
	}
	for _, v := range e.networkViews(o) {
		n, exists := all[v.Name]
		if !exists || known[v.Name].ID != n.ID || !e.matchesNetwork(o, v, n, string(owner)) {
			return codedError("PLATFORM_ACCESS_NETWORK_CHANGED")
		}
	}
	return nil
}
func (e *Engine) accessImageProof(ctx context.Context, o Options, product string) ([]byte, error) {
	image := accessReleases()[product].Platforms[e.Host.Arch]
	return e.managedImageProof(ctx, o, image)
}
func (e *Engine) managedImageProof(ctx context.Context, o Options, image accessImage) ([]byte, error) {
	r, err := e.dockerResponse(ctx, o, "image", "inspect", image.Reference)
	if err != nil {
		return nil, err
	}
	if r.ExitCode != 0 {
		if strings.Contains(strings.ToLower(r.Output), "no such image:") {
			return nil, nil
		}
		return nil, codedError("PLATFORM_ACCESS_IMAGE_INSPECTION_FAILED")
	}
	var values []struct {
		ID, Architecture, Os string
		RepoDigests          []string
	}
	if json.Unmarshal([]byte(r.Output), &values) != nil || len(values) != 1 || !image.matchesID(values[0].ID) || values[0].Os != "linux" || values[0].Architecture != e.Host.Arch {
		return nil, codedError("PLATFORM_ACCESS_IMAGE_INVALID")
	}
	for _, ref := range values[0].RepoDigests {
		if familiarProbeImage(ref) == familiarProbeImage(image.Reference) {
			return jsonBytes(image), nil
		}
	}
	return nil, codedError("PLATFORM_ACCESS_IMAGE_DIGEST_MISMATCH")
}

func (image accessImage) matchesID(id string) bool {
	// The classic store reports the config digest, while the containerd store
	// reports its target descriptor. We pull the approved platform manifest,
	// so only these two reviewed digests are valid; never accept its parent
	// multi-platform index or an arbitrary locally observed ID.
	_, manifest, ok := strings.Cut(image.Reference, "@")
	return id == image.Config || ok && id == manifest
}

func (e *Engine) prepareAccessImages(ctx context.Context, o Options) ([]byte, error) {
	proof := map[string]string{}
	for _, product := range []string{"postgres", "keycloak", "openbao", "caddy"} {
		data, err := e.accessImageProof(ctx, o, product)
		if err != nil {
			return nil, err
		}
		if data == nil {
			image := accessReleases()[product].Platforms[e.Host.Arch]
			if _, err = e.docker(ctx, o, "pull", "--platform", "linux/"+e.Host.Arch, image.Reference); err != nil {
				return nil, err
			}
			data, err = e.accessImageProof(ctx, o, product)
			if err != nil || data == nil {
				return nil, codedError("PLATFORM_ACCESS_IMAGE_UNCONFIRMED")
			}
		}
		proof[product] = digest(data)
	}
	return jsonBytes(proof), nil
}
func (e *Engine) readAccessContainer(ctx context.Context, o Options, name string) (*accessContainer, error) {
	r, err := e.dockerResponse(ctx, o, "container", "inspect", name)
	if err != nil {
		return nil, err
	}
	if r.ExitCode != 0 {
		if strings.Contains(strings.ToLower(r.Output), "no such container:") || strings.Contains(strings.ToLower(r.Output), "no such object:") {
			return nil, nil
		}
		return nil, codedError("PLATFORM_ACCESS_CONTAINER_INSPECTION_FAILED")
	}
	var values []accessContainer
	if json.Unmarshal([]byte(r.Output), &values) != nil || len(values) != 1 || !hashPattern.MatchString(values[0].ID) {
		return nil, codedError("PLATFORM_ACCESS_CONTAINER_INVALID")
	}
	return &values[0], nil
}
func (e *Engine) ownsAccessContainer(o Options, s accessSpec, key string, c *accessContainer) bool {
	if c.Name != "/"+s.Project+"-"+key {
		return false
	}
	for label, value := range s.Services[key]["labels"].(map[string]string) {
		if c.Config.Labels[label] != value {
			return false
		}
	}
	return c.Config.Labels["com.docker.compose.project"] == s.Project && c.Config.Labels["com.docker.compose.service"] == key
}
func (e *Engine) validateAccessContainer(o Options, s accessSpec, key string, c *accessContainer) error {
	service := s.Services[key]
	if !e.ownsAccessContainer(o, s, key, c) || c.HostConfig.Privileged || len(c.HostConfig.CapAdd) != 0 || c.Config.User != service["user"] || c.HostConfig.ReadonlyRootfs != service["read_only"] {
		return codedError("PLATFORM_ACCESS_CONTAINER_OWNERSHIP_CONFLICT")
	}
	ref := service["image"].(string)
	if !serviceRelease(key).Platforms[e.Host.Arch].matchesID(c.Image) || familiarProbeImage(c.Config.Image) != familiarProbeImage(ref) {
		return codedError("PLATFORM_ACCESS_CONTAINER_IMAGE_CHANGED")
	}
	if !containsString(c.HostConfig.CapDrop, "ALL") || !noNewPrivilegesEnabled(c.HostConfig.SecurityOpt) {
		return codedError("PLATFORM_ACCESS_CONTAINER_PRIVILEGES_CHANGED")
	}
	allowed := map[string]bool{}
	for role := range service["networks"].(map[string]any) {
		for _, view := range e.networkViews(o) {
			if view.Role == role {
				allowed[view.Name] = true
			}
		}
	}
	if len(allowed) != len(c.NetworkSettings.Networks) {
		return codedError("PLATFORM_ACCESS_CONTAINER_NETWORK_CHANGED")
	}
	for name := range c.NetworkSettings.Networks {
		if !allowed[name] {
			return codedError("PLATFORM_ACCESS_CONTAINER_NETWORK_CHANGED")
		}
	}
	if key == "edge" {
		if len(c.HostConfig.PortBindings) != 2 {
			return codedError("PLATFORM_ACCESS_PUBLIC_BINDING_REJECTED")
		}
		for _, port := range []int{o.IdentityPort, o.SecretStorePort} {
			bindings := c.HostConfig.PortBindings[fmt.Sprint(port)+"/tcp"]
			if len(bindings) != 1 || bindings[0].HostIp != "127.0.0.1" || bindings[0].HostPort != fmt.Sprint(port) {
				return codedError("PLATFORM_ACCESS_PUBLIC_BINDING_REJECTED")
			}
		}
		for _, view := range e.networkViews(o) {
			if view.Role == "services" {
				network := c.NetworkSettings.Networks[view.Name]
				if network.IPAMConfig != nil && network.IPAMConfig.IPv4Address != s.ProxyIP {
					return codedError("PLATFORM_ACCESS_PROXY_ADDRESS_CHANGED")
				}
				if network.IPAddress != s.ProxyIP && (c.State.Running || network.IPAddress != "" || network.IPAMConfig == nil || network.IPAMConfig.IPv4Address != s.ProxyIP) {
					return codedError("PLATFORM_ACCESS_PROXY_ADDRESS_CHANGED")
				}
			}
		}
	} else if key == "grafana" || key == "homepage" {
		port, reason := o.GrafanaPort, "PLATFORM_OBSERVABILITY_PUBLIC_BINDING_REJECTED"
		if key == "homepage" {
			port, reason = o.HubPort, "PLATFORM_HUB_PUBLIC_BINDING_REJECTED"
			if !slices.Equal(c.Config.Entrypoint, []string{"docker-entrypoint.sh"}) || !slices.Equal(c.Config.Cmd, []string{"node", "server.js"}) {
				return codedError("PLATFORM_HUB_COMMAND_CHANGED")
			}
			expected := service["environment"].(map[string]string)
			actual := map[string]string{}
			for _, entry := range c.Config.Env {
				name, value, ok := strings.Cut(entry, "=")
				if !ok {
					return codedError("PLATFORM_HUB_ENVIRONMENT_CHANGED")
				}
				if _, duplicate := actual[name]; duplicate {
					return codedError("PLATFORM_HUB_ENVIRONMENT_CHANGED")
				}
				actual[name] = value
				if _, exists := expected[name]; !exists && (strings.HasPrefix(name, "HOMEPAGE_") || strings.HasPrefix(name, "NEXTAUTH_") || name == "NODE_OPTIONS") {
					return codedError("PLATFORM_HUB_ENVIRONMENT_CHANGED")
				}
			}
			for name, wanted := range expected {
				if actual[name] != wanted {
					return codedError("PLATFORM_HUB_ENVIRONMENT_CHANGED")
				}
			}
		}
		bindings := c.HostConfig.PortBindings["3000/tcp"]
		if len(c.HostConfig.PortBindings) != 1 || len(bindings) != 1 || bindings[0].HostIp != "127.0.0.1" || bindings[0].HostPort != fmt.Sprint(port) {
			return codedError(reason)
		}
	} else if len(c.HostConfig.PortBindings) != 0 {
		return codedError("PLATFORM_ACCESS_PUBLIC_BINDING_REJECTED")
	}
	if c.State.Running {
		// HostConfig records intent even when Docker omits the actual mapping.
		for port, requested := range c.HostConfig.PortBindings {
			if !slices.Equal(requested, c.NetworkSettings.Ports[port]) {
				return codedError("PLATFORM_ACCESS_PORT_PUBLICATION_UNCONFIRMED")
			}
		}
		for port, actual := range c.NetworkSettings.Ports {
			if len(actual) > 0 && !slices.Equal(actual, c.HostConfig.PortBindings[port]) {
				return codedError("PLATFORM_ACCESS_PUBLIC_BINDING_REJECTED")
			}
		}
	}
	expected := map[string]struct {
		Name string
		RW   bool
	}{}
	for _, raw := range service["volumes"].([]any) {
		mount := raw.(map[string]any)
		expected[mount["target"].(string)] = struct {
			Name string
			RW   bool
		}{s.Volumes[mount["source"].(string)].Name, !mount["read_only"].(bool)}
	}
	tmpfs := map[string]bool{}
	for _, entry := range service["tmpfs"].([]string) {
		path, _, _ := strings.Cut(entry, ":")
		tmpfs[path] = true
	}
	seen := 0
	for _, mount := range c.Mounts {
		if mount.Type == "tmpfs" && tmpfs[mount.Destination] {
			continue
		}
		wanted, exists := expected[mount.Destination]
		if !exists || mount.Type != "volume" || mount.Name != wanted.Name || mount.RW != wanted.RW {
			return codedError("PLATFORM_ACCESS_UNMANAGED_MOUNT")
		}
		seen++
	}
	if seen != len(expected) {
		return codedError("PLATFORM_ACCESS_UNMANAGED_MOUNT")
	}
	return nil
}
func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func noNewPrivilegesEnabled(options []string) bool {
	enabled := false
	for _, option := range options {
		switch option {
		case "no-new-privileges", "no-new-privileges:true", "no-new-privileges=true":
			enabled = true
		default:
			if strings.HasPrefix(option, "no-new-privileges") {
				return false
			}
		}
	}
	return enabled
}
func (e *Engine) accessState(ctx context.Context, o Options, s accessSpec) (map[string]map[string]any, error) {
	state := map[string]map[string]any{}
	for _, key := range []string{"identity-db", "identity", "secret-store", "edge"} {
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
func (e *Engine) accessFingerprint(ctx context.Context, action string, o Options) (string, error) {
	switch action {
	case "PLATFORM_ACCESS_CREDENTIALS_PREPARED":
		seed, err := readAccessSeed(o)
		if os.IsNotExist(err) {
			return "ABSENT", nil
		}
		if err != nil {
			return "", err
		}
		return digest(jsonBytes(map[string]string{"credential_receipt": digest(jsonBytes(seed)), "delivery": "PRIVATE_CONTROL_FILE"})), nil
	case "PLATFORM_ACCESS_IMAGES_PREPARED":
		proof := map[string]string{}
		for _, product := range []string{"postgres", "keycloak", "openbao", "caddy"} {
			data, err := e.accessImageProof(ctx, o, product)
			if err != nil {
				return "", err
			}
			if data != nil {
				proof[product] = digest(data)
			}
		}
		return digest(jsonBytes(proof)), nil
	case "PLATFORM_SECRET_STORE_BOOTSTRAPPED":
		var state baoState
		err := accessPrivateRead(o, "access-recovery.json", &state)
		if err != nil && !os.IsNotExist(err) {
			return "", err
		}
		proof, err := e.baoLiveReceipt(ctx, o, state)
		return digest(proof), err
	default:
		seed, err := readAccessSeed(o)
		if err != nil {
			return "", err
		}
		s := e.accessSpec(o, seed)
		state, err := e.accessState(ctx, o, s)
		return digest(jsonBytes(state)), err
	}
}
func volumeLabels(o Options, s accessSpec, key string, v accessVolume) map[string]string {
	kind := "access-volume"
	if strings.HasSuffix(s.Project, "-observability") {
		kind = "observability-volume"
	}
	if strings.HasSuffix(s.Project, "-hub") {
		kind = "hub-volume"
	}
	return map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.owner": s.Owner, "ai.platform.component": kind, "ai.platform.volume": key, "ai.platform.spec": digest(jsonBytes(v))}
}

func dockerVolumeAbsent(response Response) bool {
	return response.ExitCode != 0 && !response.Truncated && strings.Contains(strings.ToLower(response.Output), "no such volume")
}

func (e *Engine) ensureAccessVolume(ctx context.Context, o Options, s accessSpec, key string, v accessVolume) error {
	r, err := e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
	if err != nil {
		return err
	}
	if r.ExitCode != 0 {
		// The daemon reports "get NAME: no such volume"; older clients used
		// "No such volume: NAME". Other provider failures are not absence.
		if !dockerVolumeAbsent(r) {
			return codedError("PLATFORM_ACCESS_VOLUME_INSPECTION_FAILED")
		}
		args := []string{"volume", "create", "--driver", "local"}
		labels := volumeLabels(o, s, key, v)
		keys := []string{}
		for key := range labels {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			args = append(args, "--label", key+"="+labels[key])
		}
		args = append(args, v.Name)
		_, createErr := e.docker(ctx, o, args...)
		r, err = e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
		if err != nil || r.ExitCode != 0 {
			if createErr != nil {
				return createErr
			}
			return codedError("PLATFORM_ACCESS_VOLUME_CREATION_UNCONFIRMED")
		}
	}
	var values []struct {
		Name, Driver, Scope string
		Labels, Options     map[string]string
	}
	if json.Unmarshal([]byte(r.Output), &values) != nil || len(values) != 1 || values[0].Name != v.Name || values[0].Driver != "local" || values[0].Scope != "local" || len(values[0].Options) != 0 {
		return codedError("PLATFORM_ACCESS_VOLUME_INVALID")
	}
	for key, value := range volumeLabels(o, s, key, v) {
		if values[0].Labels[key] != value {
			return codedError("PLATFORM_ACCESS_VOLUME_OWNERSHIP_CONFLICT")
		}
	}
	// The marker stays at the volume root. Config volumes are sealed by exact
	// file hashes; durable application contents and native layouts stay intact.
	var archive bytes.Buffer
	writer := tar.NewWriter(&archive)
	if err = writer.WriteHeader(&tar.Header{Name: ".", Typeflag: tar.TypeDir, Mode: 0700, Uid: v.UID, Gid: v.UID}); err != nil {
		return err
	}
	names := []string{}
	for name := range v.Files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		file := v.Files[name]
		if err = writer.WriteHeader(&tar.Header{Name: name, Mode: file.Mode, Size: int64(len(file.Data)), Uid: v.UID, Gid: v.UID, Typeflag: tar.TypeReg}); err != nil {
			return err
		}
		if _, err = writer.Write(file.Data); err != nil {
			return err
		}
	}
	if err = writer.Close(); err != nil {
		return err
	}
	for _, name := range names {
		if !regexp.MustCompile(`^[A-Za-z0-9._-]+$`).MatchString(name) {
			return codedError("PLATFORM_ACCESS_ARCHIVE_PATH_INVALID")
		}
	}
	mode := "sealed"
	if v.Persistent {
		mode = "data"
	}
	script := `set -eu; owner=$1; mode=$2; shift 2; cd /payload; needs=0
if [ -e .platform-owner ]; then [ ! -L .platform-owner ] && [ "$(cat .platform-owner)" = "$owner" ] || exit 22;
 if [ "$mode" = sealed ]; then
  for p in * .[!.]* ..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; case "$p" in ` + strings.Join(names, "|") + `) ;; *) exit 21 ;; esac; done
  check_existing() { while [ "$#" -gt 0 ]; do p=$1; h=$2; shift 2; if [ -e "$p" ]; then [ -f "$p" ] && [ ! -L "$p" ] && [ "$(sha256sum "$p" | cut -d ' ' -f 1)" = "$h" ] || exit 22; else needs=1; fi; done; }
  check_existing "$@"
 fi
else [ -z "$(ls -A .)" ]; needs=1; fi
if [ "$needs" -eq 1 ]; then tar -xpf - -C /payload; fi
while [ "$#" -gt 0 ]; do p=$1; shift 2; [ -f "$p" ] && [ ! -L "$p" ] || exit 22; sha256sum "$p"; done`
	args := []string{s.Owner, mode}
	for _, name := range names {
		args = append(args, name, digest(v.Files[name].Data))
	}
	r, err = e.accessVolumeJob(ctx, o, s, v, archive.Bytes(), script, args...)
	if err != nil {
		return err
	}
	seen := map[string]string{}
	for _, line := range strings.Split(strings.TrimSpace(r.Output), "\n") {
		parts := strings.Fields(line)
		if len(parts) != 2 || !hashPattern.MatchString(parts[0]) {
			return codedError("PLATFORM_ACCESS_VOLUME_CONTENT_UNCONFIRMED")
		}
		seen[parts[1]] = parts[0]
	}
	for name, file := range v.Files {
		if seen[name] != digest(file.Data) {
			return codedError("PLATFORM_ACCESS_VOLUME_CONTENT_CONFLICT")
		}
	}
	if len(seen) != len(v.Files) {
		return codedError("PLATFORM_ACCESS_VOLUME_CONTENT_CONFLICT")
	}
	return nil
}
func (e *Engine) cleanupAccessHelper(ctx context.Context, o Options, s accessSpec) error {
	var pending accessHelper
	if err := networkControl(o, accessHelperFile(o), &pending); err != nil {
		return err
	}
	if pending.Name == "" {
		return nil
	}
	validVolume := false
	for _, v := range s.Volumes {
		if v.Name == pending.Volume {
			validVolume = true
		}
	}
	if !validID(pending.Name) || !strings.HasPrefix(pending.Name, s.Project+"-helper-") || len(pending.Nonce) != 32 || !operationPattern.MatchString(pending.Nonce) || !validVolume {
		return codedError("PLATFORM_ACCESS_HELPER_INTENT_INVALID")
	}
	c, err := e.readAccessContainer(ctx, o, pending.Name)
	if err != nil {
		return err
	}
	if c != nil {
		labels := c.Config.Labels
		if c.Name != "/"+pending.Name || c.HostConfig.NetworkMode != "none" || labels["ai.platform.owner"] != s.Owner || labels["ai.platform.helper"] != pending.Nonce || labels["ai.platform.component"] != "access-helper" || familiarProbeImage(c.Config.Image) != familiarProbeImage(e.networkImage()) || len(c.Mounts) != 1 || c.Mounts[0].Type != "volume" || c.Mounts[0].Name != pending.Volume || c.Mounts[0].Destination != "/payload" {
			return codedError("PLATFORM_ACCESS_HELPER_OWNERSHIP_CONFLICT")
		}
		_, removeErr := e.docker(ctx, o, "container", "rm", "--force", c.ID)
		remaining, err := e.readAccessContainer(ctx, o, pending.Name)
		if err != nil || remaining != nil {
			if removeErr != nil {
				return removeErr
			}
			return codedError("PLATFORM_ACCESS_HELPER_CLEANUP_UNCONFIRMED")
		}
	}
	return os.Remove(filepath.Join(o.DataRoot, accessHelperFile(o)))
}
func (e *Engine) accessVolumeJob(ctx context.Context, o Options, s accessSpec, v accessVolume, input []byte, script string, args ...string) (Response, error) {
	if err := e.cleanupAccessHelper(ctx, o, s); err != nil {
		return Response{}, err
	}
	nonce, err := randomIdentity()
	if err != nil {
		return Response{}, err
	}
	name := s.Project + "-helper-" + nonce[:12]
	if err = atomicFile(filepath.Join(o.DataRoot, accessHelperFile(o)), jsonBytes(accessHelper{name, nonce, v.Name}), 0600); err != nil {
		return Response{}, err
	}
	arguments := []string{"run", "--rm", "--interactive", "--pull", "never", "--name", name, "--network", "none", "--read-only", "--cap-drop", "ALL", "--cap-add", "CHOWN", "--cap-add", "FOWNER", "--cap-add", "DAC_OVERRIDE", "--security-opt", "no-new-privileges=true", "--mount", "type=volume,source=" + v.Name + ",target=/payload", "--label", "ai.platform.owner=" + s.Owner, "--label", "ai.platform.component=access-helper", "--label", "ai.platform.helper=" + nonce, e.networkImage(), "sh", "-c", script, "sh"}
	arguments = append(arguments, args...)
	r, runErr := e.command(ctx, Command{Program: filepath.Join(o.DataRoot, "tools", "bin", "docker"), Args: append([]string{"--host", e.endpoint(o)}, arguments...), Env: e.runtimeEnv(o), Stdin: input})
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()
	if err = e.cleanupAccessHelper(cleanupCtx, o, s); err != nil {
		return r, err
	}
	return r, runErr
}
func (e *Engine) composeAccess(ctx context.Context, o Options, s accessSpec, args ...string) (Response, error) {
	command := []string{"compose", "--project-name", s.Project, "--env-file", filepath.Join(o.DataRoot, "access", "empty.env"), "--file", filepath.Join(o.DataRoot, "access", "compose.json")}
	command = append(command, args...)
	return e.docker(ctx, o, command...)
}
func (e *Engine) prepareAccessServices(ctx context.Context, o Options) ([]byte, error) {
	if err := e.requireAccessNetworks(ctx, o); err != nil {
		return nil, err
	}
	seed, err := readAccessSeed(o)
	if err != nil {
		return nil, err
	}
	s := e.accessSpec(o, seed)
	var record accessRecord
	if err = networkControl(o, "access.resources.json", &record); err != nil {
		return nil, err
	}
	if record.Spec != "" && record.Spec != s.Digest {
		return nil, codedError("PLATFORM_ACCESS_MIGRATION_REQUIRED")
	}
	var intent accessRecord
	if err = networkControl(o, "access.intent.json", &intent); err != nil {
		return nil, err
	}
	if intent.Spec != "" && intent.Spec != s.Digest {
		return nil, codedError("PLATFORM_ACCESS_PENDING_CONFIGURATION")
	}
	before, err := e.accessState(ctx, o, s)
	if err != nil {
		return nil, err
	}
	for key, state := range before {
		if id, exists := state["id"]; exists {
			if record.Containers[key] != "" && record.Containers[key] != id || record.Containers[key] == "" && intent.Spec != s.Digest {
				return nil, codedError("PLATFORM_ACCESS_UNCLAIMED_CONTAINER")
			}
		}
	}
	if _, exists := before["edge"]["id"]; !exists {
		for _, port := range []int{o.IdentityPort, o.SecretStorePort} {
			if e.PortAvailable != nil {
				if err = e.PortAvailable(port); err != nil {
					return nil, err
				}
				continue
			}
			listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
			if err != nil {
				return nil, codedError("PLATFORM_ACCESS_PORT_IN_USE")
			}
			_ = listener.Close()
		}
	}
	all, err := e.networkInventory(ctx, o)
	if err != nil {
		return nil, err
	}
	for _, view := range e.networkViews(o) {
		if view.Role == "services" {
			for _, raw := range all[view.Name].Containers {
				var endpoint struct{ Name, IPv4Address string }
				if json.Unmarshal(raw, &endpoint) != nil {
					return nil, codedError("PLATFORM_ACCESS_NETWORK_ENDPOINT_INVALID")
				}
				if endpoint.IPv4Address == "" {
					continue
				}
				prefix, err := netip.ParsePrefix(endpoint.IPv4Address)
				if err != nil {
					return nil, codedError("PLATFORM_ACCESS_NETWORK_ENDPOINT_INVALID")
				}
				if prefix.Addr().String() == s.ProxyIP && endpoint.Name != s.Project+"-edge" {
					return nil, codedError("PLATFORM_ACCESS_PROXY_ADDRESS_IN_USE")
				}
			}
		}
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "access.intent.json"), jsonBytes(accessRecord{Spec: s.Digest}), 0600); err != nil {
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
	if err = writeOwned(filepath.Join(o.DataRoot, "access", "compose.json"), s.Compose); err != nil {
		return nil, err
	}
	if err = writeOwned(filepath.Join(o.DataRoot, "access", "empty.env"), []byte("# No ambient environment file.\n")); err != nil {
		return nil, err
	}
	_, startErr := e.composeAccess(ctx, o, s, "up", "--detach", "--no-build", "--no-recreate", "--pull", "never", "--wait", "--wait-timeout", "180")
	after, inspectErr := e.accessState(ctx, o, s)
	if startErr == nil && inspectErr != nil {
		startErr = inspectErr
	}
	if startErr == nil {
		startErr = e.waitAccessHTTP(ctx, o)
	}
	if startErr == nil {
		for _, state := range after {
			if state["running"] != true {
				startErr = codedError("PLATFORM_ACCESS_SERVICE_NOT_RUNNING")
			}
		}
	}
	if startErr != nil {
		if err = e.compensateAccessStartup(ctx, o, s, before); err != nil {
			return nil, fmt.Errorf("%w: initial=%v", err, startErr)
		}
		after, err = e.accessState(ctx, o, s)
		if err != nil {
			return nil, err
		}
		return nil, &restoredError{cause: startErr, after: digest(jsonBytes(after))}
	}
	ids := map[string]string{}
	for key, state := range after {
		ids[key] = state["id"].(string)
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "access.resources.json"), jsonBytes(accessRecord{s.Digest, ids}), 0600); err != nil {
		return nil, err
	}
	if err = os.Remove(filepath.Join(o.DataRoot, "access.intent.json")); err != nil {
		return nil, err
	}
	return jsonBytes(after), nil
}
func (e *Engine) compensateAccessStartup(ctx context.Context, o Options, s accessSpec, before map[string]map[string]any) error {
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	step := Step{"PLATFORM_ACCESS_STARTUP_COMPENSATED", "ACCEPTED", "REQUESTED", digest(jsonBytes(before)), "NOT_OBSERVED", "COMPENSATION_REQUESTED"}
	if err := audit.append(step); err != nil {
		return err
	}
	err := func() error {
		for _, key := range []string{"edge", "secret-store", "identity", "identity-db"} {
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
				if _, err = e.docker(ctx, o, "container", "stop", "--time", "15", c.ID); err != nil {
					return err
				}
			}
		}
		after, err := e.accessState(ctx, o, s)
		if err != nil {
			return err
		}
		for key, state := range after {
			if before[key]["running"] != true && state["running"] == true {
				return codedError("PLATFORM_ACCESS_COMPENSATION_UNCONFIRMED")
			}
		}
		step.After = digest(jsonBytes(after))
		return nil
	}()
	if err != nil {
		step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(err)
	} else {
		step.Outcome, step.Phase, step.Reason = "SUCCEEDED", "COMPLETED", "NEW_STARTS_STOPPED_DURABLE_STATE_PRESERVED"
	}
	if auditErr := audit.append(step); auditErr != nil {
		return auditErr
	}
	return err
}
