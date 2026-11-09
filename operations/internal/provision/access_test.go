package provision

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

type fakeAccess struct {
	t                                                         *testing.T
	e                                                         *Engine
	o                                                         Options
	base                                                      Runner
	volumes                                                   map[string]map[string]any
	missingVolumeResponse                                     *Response
	files                                                     map[string]map[string][]byte
	containers                                                map[string]*accessContainer
	images                                                    map[string]bool
	objects                                                   map[string]map[string]any
	groups                                                    map[string]map[string]any
	tokens                                                    map[string]string
	kv                                                        map[string]any
	initialized, sealed, rootRevoked                          bool
	manifestIDs                                               bool
	initLost, rootReplyLost, badIssuer, startFails, stopFails bool
	starts, initCalls, secretWrites                           int
}

func accessFixture(t *testing.T, profile string) (*Engine, *fakeAccess, Options) {
	e, _, _, o := fixtureEngine(t, profile)
	o.IdentityPort = 8082
	o.SecretStorePort = 8200
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.NetworkReady {
		t.Fatal("infrastructure fixture", r, err)
	}
	f := &fakeAccess{t: t, e: e, o: o, base: e.Runner, volumes: map[string]map[string]any{}, files: map[string]map[string][]byte{}, containers: map[string]*accessContainer{}, images: map[string]bool{}, objects: map[string]map[string]any{"sys/mounts": {}, "sys/auth": {}, "sys/audit": {}}, groups: map[string]map[string]any{}, tokens: map[string]string{}, kv: map[string]any{}, sealed: true}
	e.Runner = f
	e.HTTP = f
	e.PortAvailable = func(int) error { return nil }
	o.Phase = "access"
	f.o = o
	return e, f, o
}
func (f *fakeAccess) spec() accessSpec {
	seed, err := readAccessSeed(f.o)
	if err != nil {
		f.t.Fatal(err)
	}
	return f.e.accessSpec(f.o, seed)
}
func (f *fakeAccess) Run(ctx context.Context, c Command) (Response, error) {
	if filepath.Base(c.Program) != "docker" || len(c.Args) < 3 {
		return f.base.Run(ctx, c)
	}
	args := c.Args[2:]
	if args[0] == "compose" && len(args) > 1 && args[1] == "version" {
		return f.base.Run(ctx, c)
	}
	result := func(value any) (Response, error) { return Response{Output: string(jsonBytes(value))}, nil }
	if args[0] == "pull" {
		for _, release := range accessReleases() {
			image := release.Platforms[f.e.Host.Arch]
			if args[len(args)-1] == image.Reference {
				f.images[image.Reference] = true
				return Response{}, nil
			}
		}
	}
	if args[0] == "image" && args[1] == "inspect" {
		for _, release := range accessReleases() {
			image := release.Platforms[f.e.Host.Arch]
			if args[2] == image.Reference {
				if !f.images[image.Reference] {
					return Response{ExitCode: 1, Output: "No such image: fixture"}, nil
				}
				return result([]map[string]any{{"Id": f.imageID(image), "Os": "linux", "Architecture": f.e.Host.Arch, "RepoDigests": []string{image.Reference}}})
			}
		}
	}
	if args[0] == "volume" {
		if args[1] == "inspect" {
			if v, exists := f.volumes[args[2]]; exists {
				return result([]any{v})
			}
			if f.missingVolumeResponse != nil {
				return *f.missingVolumeResponse, nil
			}
			return Response{ExitCode: 1, Output: "[]\nError response from daemon: get " + args[2] + ": no such volume"}, nil
		}
		if args[1] == "create" {
			name := args[len(args)-1]
			f.volumes[name] = map[string]any{"Name": name, "Driver": "local", "Scope": "local", "Labels": repeated(args, "--label")}
			f.files[name] = map[string][]byte{}
			return Response{Output: name}, nil
		}
	}
	if args[0] == "run" && option(args, "--network") == "none" {
		if !contains(args, "--read-only") || contains(args, "--privileged") || option(args, "--cap-drop") != "ALL" || !strings.HasPrefix(option(args, "--mount"), "type=volume,source=") {
			f.t.Fatal("unsafe volume transport", args)
		}
		parts := strings.Split(option(args, "--mount"), ",")
		volume := strings.TrimPrefix(parts[1], "source=")
		files := f.files[volume]
		if len(files) == 0 {
			reader := tar.NewReader(bytes.NewReader(c.Stdin))
			for {
				header, err := reader.Next()
				if err == io.EOF {
					break
				}
				if err != nil {
					f.t.Fatal(err)
				}
				if header.Typeflag == tar.TypeDir {
					continue
				}
				if filepath.IsAbs(header.Name) || strings.Contains(header.Name, "/") || header.Typeflag != tar.TypeReg {
					f.t.Fatal("unsafe config archive")
				}
				data, err := io.ReadAll(reader)
				if err != nil {
					f.t.Fatal(err)
				}
				files[header.Name] = data
			}
		}
		spec := f.spec()
		var wanted accessVolume
		for _, v := range spec.Volumes {
			if v.Name == volume {
				wanted = v
			}
		}
		names := []string{}
		for name := range wanted.Files {
			names = append(names, name)
		}
		sort.Strings(names)
		var output strings.Builder
		for _, name := range names {
			fmt.Fprintf(&output, "%s  %s\n", digest(files[name]), name)
		}
		return Response{Output: output.String()}, nil
	}
	if args[0] == "compose" {
		f.starts++
		s := f.spec()
		for key, service := range s.Services {
			name := s.Project + "-" + key
			if c, exists := f.containers[name]; exists {
				c.State.Running = true
				continue
			}
			c := &accessContainer{ID: digest([]byte(name)), Name: "/" + name}
			c.Config.Image = service["image"].(string)
			c.Config.User = service["user"].(string)
			c.Config.Labels = map[string]string{}
			for k, v := range service["labels"].(map[string]string) {
				c.Config.Labels[k] = v
			}
			c.Config.Labels["com.docker.compose.project"] = s.Project
			c.Config.Labels["com.docker.compose.service"] = key
			product := map[string]string{"identity-db": "postgres", "identity": "keycloak", "secret-store": "openbao", "edge": "caddy"}[key]
			if key == "secret-store" {
				f.objects["sys/audit"]["platform/"] = map[string]any{"type": "file", "options": map[string]string{"file_path": "/openbao/audit/events.jsonl", "log_raw": "false"}}
			}
			c.Image = f.imageID(accessReleases()[product].Platforms[f.e.Host.Arch])
			c.State.Running = true
			c.HostConfig.ReadonlyRootfs = service["read_only"].(bool)
			c.HostConfig.CapDrop = []string{"ALL"}
			c.HostConfig.SecurityOpt = []string{"no-new-privileges:true"}
			c.NetworkSettings.Networks = map[string]accessNetwork{}
			for role := range service["networks"].(map[string]any) {
				for _, v := range f.e.networkViews(f.o) {
					if v.Role == role {
						ip := ""
						if key == "edge" && role == "services" {
							ip = s.ProxyIP
						}
						attachment := accessNetwork{IPAddress: ip}
						if key == "edge" && role == "services" {
							attachment.IPAMConfig = &accessIPAM{IPv4Address: ip}
						}
						c.NetworkSettings.Networks[v.Name] = attachment
					}
				}
			}
			for _, raw := range service["volumes"].([]any) {
				mount := raw.(map[string]any)
				c.Mounts = append(c.Mounts, struct {
					Type, Name, Destination string
					RW                      bool
				}{"volume", s.Volumes[mount["source"].(string)].Name, mount["target"].(string), !mount["read_only"].(bool)})
			}
			if key == "edge" {
				c.HostConfig.PortBindings = map[string][]struct{ HostIp, HostPort string }{}
				for _, port := range []int{f.o.IdentityPort, f.o.SecretStorePort} {
					c.HostConfig.PortBindings[fmt.Sprint(port)+"/tcp"] = []struct{ HostIp, HostPort string }{{"127.0.0.1", fmt.Sprint(port)}}
				}
			}
			c.NetworkSettings.Ports = c.HostConfig.PortBindings
			f.containers[name] = c
		}
		if f.startFails {
			return Response{ExitCode: 1, Output: "private startup fixture"}, nil
		}
		return Response{}, nil
	}
	if args[0] == "container" {
		if args[1] == "inspect" {
			if c, exists := f.containers[args[2]]; exists {
				return result([]any{c})
			}
			if strings.Contains(args[2], "-access-") {
				return Response{ExitCode: 1, Output: "No such container: fixture"}, nil
			}
		}
		if args[1] == "stop" {
			if f.stopFails {
				return Response{ExitCode: 1}, nil
			}
			for _, c := range f.containers {
				if c.ID == args[len(args)-1] {
					c.State.Running = false
					return Response{}, nil
				}
			}
		}
	}
	return f.base.Run(ctx, c)
}
func (f *fakeAccess) Do(req *http.Request) (*http.Response, error) {
	if strings.HasPrefix(req.URL.Path, "/ui/") || strings.HasPrefix(req.URL.Path, "/admin/") {
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"text/html"}}, Body: io.NopCloser(strings.NewReader("<!doctype html><html><body>Native product fixture</body></html>"))}, nil
	}
	payload := map[string]any{}
	if req.Body != nil {
		data, err := io.ReadAll(req.Body)
		if err != nil {
			return nil, err
		}
		if len(data) > 0 {
			if err = json.Unmarshal(data, &payload); err != nil {
				f.t.Fatal(err)
			}
		}
	}
	respond := func(code int, value any) (*http.Response, error) {
		return &http.Response{StatusCode: code, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(jsonBytes(value)))}, nil
	}
	data := func(value any) (*http.Response, error) { return respond(200, map[string]any{"data": value}) }
	if req.URL.Hostname() == "auth.localhost" {
		issuer := accessEndpoints(f.o)["identity"] + "/realms/platform"
		if f.badIssuer {
			issuer = "http://wrong.invalid/realms/platform"
		}
		return respond(200, map[string]string{"issuer": issuer, "authorization_endpoint": issuer + "/protocol/openid-connect/auth", "token_endpoint": issuer + "/protocol/openid-connect/token", "jwks_uri": issuer + "/protocol/openid-connect/certs"})
	}
	path := strings.TrimPrefix(req.URL.Path, "/v1/")
	method := req.Method
	token := req.Header.Get("X-Vault-Token")
	policy, valid := f.tokens[token]
	if path == "sys/health" {
		status := 200
		if !f.initialized {
			status = 501
		} else if f.sealed {
			status = 503
		}
		return respond(status, map[string]any{"initialized": f.initialized, "sealed": f.sealed})
	}
	if path == "sys/init" {
		f.initCalls++
		if f.initialized {
			return respond(400, map[string]any{})
		}
		f.initialized = true
		f.tokens["root-fixture-private"] = "root"
		if f.initLost {
			return nil, errors.New("lost init response")
		}
		return respond(200, map[string]any{"keys_base64": []string{"unseal-fixture-private"}, "root_token": "root-fixture-private"})
	}
	if path == "sys/unseal" {
		if payload["key"] != "unseal-fixture-private" {
			return respond(400, map[string]any{})
		}
		f.sealed = false
		return respond(200, map[string]any{"sealed": false})
	}
	if path == "auth/approle/login" {
		if payload["role_id"] != "role-fixture-private" || payload["secret_id"] != "secret-id-fixture-private" {
			return respond(403, map[string]any{})
		}
		f.tokens["installer-token-private"] = "platform-installer"
		return respond(200, map[string]any{"auth": map[string]string{"client_token": "installer-token-private"}})
	}
	if path == "auth/oidc/oidc/auth_url" {
		return data(map[string]string{"auth_url": accessEndpoints(f.o)["identity"] + "/realms/platform/protocol/openid-connect/auth?client_id=openbao&redirect_uri=" + url.QueryEscape(payload["redirect_uri"].(string))})
	}
	if !valid {
		return respond(403, map[string]any{"errors": []string{"permission denied"}})
	}
	if path == "auth/token/lookup-self" {
		return data(map[string]any{"policies": []string{policy}})
	}
	if path == "auth/token/create" {
		roles := payload["policies"].([]any)
		role := roles[0].(string)
		value := role + "-token-private"
		f.tokens[value] = role
		return respond(200, map[string]any{"auth": map[string]string{"client_token": value}})
	}
	if path == "auth/token/revoke" {
		delete(f.tokens, payload["token"].(string))
		return respond(204, nil)
	}
	if path == "auth/token/revoke-self" {
		delete(f.tokens, token)
		if token == "root-fixture-private" {
			f.rootRevoked = true
			if f.rootReplyLost {
				return nil, errors.New("root revocation response lost")
			}
		}
		return respond(204, nil)
	}
	if path == "sys/capabilities-self" {
		caps := []string{"deny"}
		if policy == "platform-operator" || policy == "platform-installer" {
			caps = []string{"create", "read", "update", "delete"}
		}
		return data(map[string]any{"capabilities": caps})
	}
	if strings.HasPrefix(path, "platform/data/services/") {
		if method == "GET" {
			if value, exists := f.kv[path]; exists {
				return data(map[string]any{"data": value})
			}
			return respond(404, map[string]any{})
		}
		f.secretWrites++
		f.kv[path] = payload["data"]
		return data(map[string]any{"version": 1})
	}
	if path == "sys/mounts" || path == "sys/auth" || path == "sys/audit" {
		return data(f.objects[path])
	}
	for _, base := range []string{"sys/mounts", "sys/auth", "sys/audit"} {
		if strings.HasPrefix(path, base+"/") {
			if base == "sys/audit" {
				return respond(400, map[string]any{}) // API audit creation is disabled.
			}
			key := strings.TrimPrefix(path, base+"/") + "/"
			entry := map[string]any{}
			for k, v := range payload {
				entry[k] = v
			}
			if base == "sys/auth" {
				entry["accessor"] = "auth-" + strings.TrimSuffix(key, "/")
			}
			f.objects[base][key] = entry
			return respond(204, nil)
		}
	}
	if path == "auth/approle/role/platform-installer/role-id" {
		return data(map[string]string{"role_id": "role-fixture-private"})
	}
	if path == "auth/approle/role/platform-installer/secret-id" {
		return data(map[string]string{"secret_id": "secret-id-fixture-private"})
	}
	if path == "identity/group" {
		name := payload["name"].(string)
		payload["id"] = "group-" + name
		f.groups[name] = payload
		return data(map[string]any{"id": payload["id"]})
	}
	if strings.HasPrefix(path, "identity/group/name/") {
		name := strings.TrimPrefix(path, "identity/group/name/")
		if group, exists := f.groups[name]; exists {
			return data(group)
		}
		return respond(404, map[string]any{})
	}
	if path == "identity/group-alias" {
		name := payload["name"].(string)
		payload["id"] = "alias-" + name
		f.groups[name]["alias"] = payload
		return data(payload)
	}
	if method == "GET" {
		if object, exists := f.objects[path]; exists {
			return data(object)
		}
		if path == "auth/oidc/config" {
			return data(map[string]string{"oidc_client_id": "", "oidc_discovery_url": ""})
		}
		return respond(404, map[string]any{})
	}
	f.objects[path] = payload
	return respond(204, nil)
}

func (f *fakeAccess) imageID(image accessImage) string {
	if f.manifestIDs {
		_, manifest, _ := strings.Cut(image.Reference, "@")
		return manifest
	}
	return image.Config
}

func TestAccessApprovedImageIDs(t *testing.T) {
	for product, release := range accessReleases() {
		for arch, image := range release.Platforms {
			_, manifest, _ := strings.Cut(image.Reference, "@")
			if !image.matchesID(image.Config) || !image.matchesID(manifest) || image.matchesID(release.Index) || image.matchesID("sha256:"+digest([]byte("foreign"))) {
				t.Fatalf("unexpected image identity acceptance: %s/%s", product, arch)
			}
		}
	}
}

func TestAccessContainerdImageStoreAndRetry(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, f, o := accessFixture(t, profile)
			f.manifestIDs = true
			for attempt := 0; attempt < 2; attempt++ {
				r, err := e.Run(context.Background(), o)
				if err != nil || !r.AccessReady || !f.rootRevoked || f.initCalls != 1 || f.secretWrites != 2 {
					t.Fatalf("containerd attempt %d: %+v %v", attempt, r, err)
				}
			}
		})
	}
}

func TestAccessLocalAllProfilesAndRetry(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, f, o := accessFixture(t, profile)
			r, err := e.Run(context.Background(), o)
			if err != nil || !r.AccessReady || !r.IdentityReady || !r.SecretStoreReady || !r.EdgeReady || r.PublicationReady || r.SSOQualified || r.InstallationReady {
				t.Fatalf("local access: %+v %v", r, err)
			}
			if !f.rootRevoked || f.initCalls != 1 || f.secretWrites != 2 {
				t.Fatal("root revocation/bootstrap missing")
			}
			var recovery baoState
			if err = accessPrivateRead(o, "access-recovery.json", &recovery); err != nil || recovery.RootToken != "" || !recovery.Complete {
				t.Fatal("root credential retained", err)
			}
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.AccessReady || f.initCalls != 1 || f.secretWrites != 2 {
				t.Fatalf("retry changed durable state: %+v %v writes=%d", r, err, f.secretWrites)
			}
			ledger, err := os.ReadFile(filepath.Join(o.ControlRoot, "admin.jsonl"))
			if err != nil {
				t.Fatal(err)
			}
			seed, _ := readAccessSeed(o)
			for _, secret := range []string{seed.OperatorPassword, seed.DatabasePassword, seed.OIDCSecret, "root-fixture-private", "unseal-fixture-private", "secret-id-fixture-private"} {
				if bytes.Contains(ledger, []byte(secret)) || bytes.Contains(jsonBytes(r), []byte(secret)) {
					t.Fatal("credential leaked to projection")
				}
			}
		})
	}
}
func TestAccessStartupCompensationAndRetry(t *testing.T) {
	e, f, o := accessFixture(t, "precision-windows")
	f.startFails = true
	r, err := e.Run(context.Background(), o)
	if err != nil || r.Outcome != "FAILED" || r.AccessReady {
		t.Fatal(r, err)
	}
	for _, c := range f.containers {
		if c.State.Running {
			t.Fatal("new start not compensated")
		}
	}
	if len(f.volumes) != 7 {
		t.Fatal("durable state removed")
	}
	f.startFails = false
	r, err = e.Run(context.Background(), o)
	if err != nil || !r.AccessReady {
		t.Fatal("startup retry", r, err)
	}
}
func TestAccessUnknownCompensationAndLostInitialization(t *testing.T) {
	for _, mode := range []string{"stop", "init"} {
		t.Run(mode, func(t *testing.T) {
			e, f, o := accessFixture(t, "precision-windows")
			if mode == "stop" {
				f.startFails = true
				f.stopFails = true
			} else {
				f.initLost = true
			}
			r, err := e.Run(context.Background(), o)
			if err != nil || r.Outcome != "UNKNOWN" || r.AccessReady {
				t.Fatal(r, err)
			}
			if mode == "init" {
				f.initLost = false
				r, err = e.Run(context.Background(), o)
				if err != nil || r.Reason != "PLATFORM_SECRET_STORE_RECOVERY_MATERIAL_MISSING" || f.initCalls != 1 {
					t.Fatal("unrecoverable initialization was reset/retried", r, err)
				}
			}
		})
	}
}
func TestAccessDriftAndExternalPublicationFailClosed(t *testing.T) {
	for _, mode := range []string{"public", "owner", "binding", "image", "secret", "policy", "audit"} {
		t.Run(mode, func(t *testing.T) {
			e, f, o := accessFixture(t, "precision-windows")
			if mode == "public" {
				o.PublicationMode = "tunnel"
				r, err := e.Run(context.Background(), o)
				if code(err) != "PLATFORM_EXTERNAL_PUBLICATION_NOT_QUALIFIED" || r.AccessReady || f.starts != 0 {
					t.Fatal(r, err)
				}
				return
			}
			r, err := e.Run(context.Background(), o)
			if err != nil || !r.AccessReady {
				t.Fatal(r, err)
			}
			name := f.spec().Project + "-edge"
			switch mode {
			case "owner":
				f.containers[name].Config.Labels["ai.platform.owner"] = "foreign"
			case "binding":
				bindings := f.containers[name].HostConfig.PortBindings["8082/tcp"]
				bindings[0].HostIp = "0.0.0.0"
				f.containers[name].HostConfig.PortBindings["8082/tcp"] = bindings
			case "image":
				f.containers[name].Image = "sha256:" + digest([]byte("foreign"))
			case "secret":
				f.kv["platform/data/services/identity/database"] = map[string]string{"password": "rotated-elsewhere"}
			case "policy":
				f.objects["sys/policies/acl/platform-viewer"]["policy"] = "changed"
			case "audit":
				delete(f.objects["sys/audit"], "platform/")
			}
			r, err = e.Run(context.Background(), o)
			if r.AccessReady || err == nil && r.Outcome == "SUCCEEDED" {
				t.Fatal("drift was silently adopted/repaired", r, err)
			}
		})
	}
}
func TestAccessLostRootReplyAndSealedRestart(t *testing.T) {
	e, f, o := accessFixture(t, "macos-m3-max")
	f.rootReplyLost = true
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.AccessReady {
		t.Fatal("root reply reconciliation", r, err)
	}
	f.sealed = true
	r, err = e.Run(context.Background(), o)
	if err != nil || !r.AccessReady || f.sealed || f.initCalls != 1 {
		t.Fatal("unseal retry recreated cofre", r, err)
	}
}
func TestAccessPlanRequiresNoCredentialsOrProviders(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "dell-gb10")
	o.Phase = "access"
	o.Action = "plan"
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.Planned || r.AccessReady || len(runner.calls) != 0 || len(r.Steps) != 4 {
		t.Fatal(r, err)
	}
	if _, err = os.Stat(filepath.Join(o.ControlRoot, "access-seed.json")); !os.IsNotExist(err) {
		t.Fatal("plan generated credentials")
	}
}

func TestAccessVolumeAbsenceAndProviderFailures(t *testing.T) {
	for _, test := range []struct {
		name     string
		response Response
		missing  bool
	}{
		{"legacy-client", Response{ExitCode: 1, Output: "No such volume: fixture"}, true},
		{"daemon", Response{ExitCode: 1, Output: "[]\nError response from daemon: get fixture: no such volume"}, true},
		{"permission-denied", Response{ExitCode: 1, Output: "permission denied while connecting to Docker"}, false},
		{"daemon-unavailable", Response{ExitCode: 1, Output: "Cannot connect to the Docker daemon"}, false},
		{"empty-response", Response{ExitCode: 1}, false},
		{"truncated", Response{ExitCode: 1, Output: "no such volume", Truncated: true}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			e, f, o := accessFixture(t, "dell-gb10")
			f.missingVolumeResponse = &test.response
			r, err := e.Run(context.Background(), o)
			if test.missing {
				if err != nil || !r.AccessReady {
					t.Fatal(r, err)
				}
				// Normal retry must reuse the owned volumes and preserve secrets.
				writes := f.secretWrites
				if r, err = e.Run(context.Background(), o); err != nil || !r.AccessReady || f.secretWrites != writes {
					t.Fatal("retry did not preserve owned state", r, err)
				}
			} else if r.AccessReady || len(f.volumes) != 0 || f.starts != 0 || err == nil && r.Outcome == "SUCCEEDED" {
				t.Fatal("provider failure was treated as volume absence", r, err)
			}
		})
	}
}

func TestStoppedAccessProxyRetainsConfiguredAddress(t *testing.T) {
	e, f, o := accessFixture(t, "dell-gb10")
	if r, err := e.Run(context.Background(), o); err != nil || !r.AccessReady {
		t.Fatal(r, err)
	}
	s := f.spec()
	c := f.containers[s.Project+"-edge"]
	for _, view := range e.networkViews(o) {
		if view.Role != "services" {
			continue
		}
		c.State.Running = false
		attachment := c.NetworkSettings.Networks[view.Name]
		attachment.IPAddress = ""
		c.NetworkSettings.Networks[view.Name] = attachment
		if err := e.validateAccessContainer(o, s, "edge", c); err != nil {
			t.Fatal("stopped proxy with unchanged static address was rejected", err)
		}
		c.State.Running = true
		if err := e.validateAccessContainer(o, s, "edge", c); code(err) != "PLATFORM_ACCESS_PROXY_ADDRESS_CHANGED" {
			t.Fatal("running proxy without its address was accepted", err)
		}
		c.State.Running = false
		attachment.IPAMConfig = &accessIPAM{IPv4Address: "10.0.0.2"}
		c.NetworkSettings.Networks[view.Name] = attachment
		if err := e.validateAccessContainer(o, s, "edge", c); code(err) != "PLATFORM_ACCESS_PROXY_ADDRESS_CHANGED" {
			t.Fatal("stopped proxy with a changed static address was accepted", err)
		}
	}
}

func TestRequestedPortWithoutActiveDockerMappingIsRejected(t *testing.T) {
	e, f, o := accessFixture(t, "dell-gb10")
	if r, err := e.Run(context.Background(), o); err != nil || !r.AccessReady {
		t.Fatal(r, err)
	}
	s := f.spec()
	c := f.containers[s.Project+"-edge"]
	c.NetworkSettings.Ports = nil
	if err := e.validateAccessContainer(o, s, "edge", c); code(err) != "PLATFORM_ACCESS_PORT_PUBLICATION_UNCONFIRMED" {
		t.Fatal("inactive requested port was reported as published", err)
	}
}
