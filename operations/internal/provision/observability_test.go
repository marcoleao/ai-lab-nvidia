package provision

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

type fakeObservability struct {
	*fakeAccess
	options                                                     Options
	creates, obsStarts                                          int
	failStart, failStop, badSeries, staleSeries, failValidation bool
	commands                                                    []string
	signalCase, coreCase                                        string
	signalQueries                                               int
}

func observabilityFixture(t *testing.T, profile string) (*Engine, *fakeObservability, Options) {
	t.Helper()
	e, f, o := accessFixture(t, profile)
	if r, err := e.Run(context.Background(), o); err != nil || !r.AccessReady {
		t.Fatal(r, err)
	}
	o.Phase = "observability"
	if err := e.defaults(&o); err != nil {
		t.Fatal(err)
	}
	w := &fakeObservability{fakeAccess: f, options: o}
	e.Runner = w
	e.HTTP = w
	return e, w, o
}
func (f *fakeObservability) specObs() accessSpec {
	v, err := readObservabilitySeed(f.options)
	if err != nil {
		f.t.Fatal(err)
	}
	s, err := f.e.observabilitySpec(f.options, v)
	if err != nil {
		f.t.Fatal(err)
	}
	return s
}
func (f *fakeObservability) Run(ctx context.Context, c Command) (Response, error) {
	if filepath.Base(c.Program) != "docker" || len(c.Args) < 3 {
		return f.fakeAccess.Run(ctx, c)
	}
	a := c.Args[2:]
	if a[0] == "run" && strings.Contains(option(a, "--name"), "-observability-validate-") {
		if option(a, "--network") != "none" || !contains(a, "--read-only") || option(a, "--cap-drop") != "ALL" || option(a, "--pull") != "never" {
			f.t.Fatal("unsafe native configuration check", a)
		}
		if f.failValidation {
			return Response{ExitCode: 1, Output: "private-native-validation-detail"}, nil
		}
		return Response{}, nil
	}
	if a[0] == "run" && option(a, "--network") == "none" && strings.Contains(option(a, "--mount"), "-observability-") {
		if _, err := f.fakeAccess.Run(ctx, c); err != nil {
			return Response{}, err
		}
		parts := strings.Split(option(a, "--mount"), ",")
		name := strings.TrimPrefix(parts[1], "source=")
		spec := f.specObs()
		var wanted accessVolume
		for _, v := range spec.Volumes {
			if v.Name == name {
				wanted = v
			}
		}
		names := []string{}
		for key := range wanted.Files {
			names = append(names, key)
		}
		sort.Strings(names)
		var out strings.Builder
		for _, key := range names {
			fmt.Fprintf(&out, "%s  %s\n", digest(f.files[name][key]), key)
		}
		return Response{Output: out.String()}, nil
	}
	if a[0] == "pull" || a[0] == "image" && a[1] == "inspect" {
		for _, release := range observabilityReleases() {
			image := release.Platforms[f.e.Host.Arch]
			if a[len(a)-1] != image.Reference {
				continue
			}
			if a[0] == "pull" {
				f.images[image.Reference] = true
				return Response{}, nil
			}
			if !f.images[image.Reference] {
				return Response{ExitCode: 1, Output: "No such image: fixture"}, nil
			}
			return Response{Output: string(jsonBytes([]any{map[string]any{"Id": image.Config, "Os": "linux", "Architecture": f.e.Host.Arch, "RepoDigests": []string{image.Reference}}}))}, nil
		}
	}
	if a[0] == "compose" && strings.Contains(option(a, "--project-name"), "-observability") {
		f.obsStarts++
		s := f.specObs()
		for key, service := range s.Services {
			name := s.Project + "-" + key
			if old := f.containers[name]; old != nil {
				old.State.Running = true
				continue
			}
			v := &accessContainer{ID: digest([]byte(name)), Name: "/" + name}
			v.Config.Image = service["image"].(string)
			v.Image = serviceRelease(key).Platforms[f.e.Host.Arch].Config
			v.Config.User = service["user"].(string)
			v.Config.Labels = map[string]string{}
			for k, value := range service["labels"].(map[string]string) {
				v.Config.Labels[k] = value
			}
			v.Config.Labels["com.docker.compose.project"] = s.Project
			v.Config.Labels["com.docker.compose.service"] = key
			v.State.Running = true
			v.State.StartedAt = time.Unix(90, 0).UTC().Format(time.RFC3339Nano)
			v.HostConfig.ReadonlyRootfs = true
			v.HostConfig.CapDrop = []string{"ALL"}
			v.HostConfig.SecurityOpt = []string{"no-new-privileges:true"}
			v.NetworkSettings.Networks = map[string]accessNetwork{}
			for _, network := range f.e.networkViews(f.options) {
				if _, attached := service["networks"].(map[string]any)[network.Role]; attached {
					v.NetworkSettings.Networks[network.Name] = accessNetwork{}
				}
			}
			for _, raw := range service["volumes"].([]any) {
				m := raw.(map[string]any)
				v.Mounts = append(v.Mounts, struct {
					Type, Name, Destination string
					RW                      bool
				}{"volume", s.Volumes[m["source"].(string)].Name, m["target"].(string), !m["read_only"].(bool)})
			}
			if key == "grafana" {
				v.HostConfig.PortBindings = map[string][]struct{ HostIp, HostPort string }{"3000/tcp": {{"127.0.0.1", fmt.Sprint(f.options.GrafanaPort)}}}
			}
			v.NetworkSettings.Ports = v.HostConfig.PortBindings
			f.containers[name] = v
			f.creates++
		}
		if f.failStart {
			return Response{ExitCode: 1, Output: "private-observability-startup"}, nil
		}
		return Response{}, nil
	}
	if a[0] == "container" {
		if a[1] == "inspect" && strings.Contains(a[2], "-observability-") {
			if v := f.containers[a[2]]; v != nil {
				return Response{Output: string(jsonBytes([]any{v}))}, nil
			}
			return Response{ExitCode: 1, Output: "No such container: fixture"}, nil
		}
		if a[1] == "logs" {
			return Response{Output: "private-observability-log"}, nil
		}
		if a[1] == "start" || a[1] == "stop" {
			for _, v := range f.containers {
				if v.ID != a[len(a)-1] {
					continue
				}
				f.commands = append(f.commands, a[1]+":"+v.Name)
				if f.failStop && a[1] == "stop" && strings.Contains(v.Name, "-observability-") {
					return Response{ExitCode: 1}, nil
				}
				v.State.Running = a[1] == "start"
				return Response{}, nil
			}
		}
	}
	return f.fakeAccess.Run(ctx, c)
}
func (f *fakeObservability) Do(req *http.Request) (*http.Response, error) {
	if req.URL.Hostname() != "grafana.localhost" {
		return f.fakeAccess.Do(req)
	}
	seed, err := readObservabilitySeed(f.options)
	if err != nil {
		f.t.Fatal(err)
	}
	user, password, ok := req.BasicAuth()
	if !ok || user != "platform-admin" || password != seed.AdminPassword {
		f.t.Fatal("incorrect private Grafana authentication")
	}
	value := map[string]any{}
	status := 200
	switch req.URL.Path {
	case "/api/health":
		value["database"] = "ok"
	case "/api/datasources/uid/platform-metrics":
		value = map[string]any{"uid": "platform-metrics", "type": "prometheus", "url": "http://metrics:9090"}
	case "/api/datasources/uid/platform-logs":
		value = map[string]any{"uid": "platform-logs", "type": "loki", "url": "http://logs:3100"}
	case "/api/datasources/uid/platform-metrics/health", "/api/datasources/uid/platform-logs/health":
		value["status"] = "OK"
	case "/api/dashboards/uid/platform-foundation":
		value["dashboard"] = map[string]any{"uid": "platform-foundation"}
	case "/api/datasources/proxy/uid/platform-metrics/api/v1/query":
		value = f.prometheusReply(req)

	default:
		status = 404
	}
	return &http.Response{StatusCode: status, Body: io.NopCloser(bytes.NewReader(jsonBytes(value)))}, nil
}

func TestObservabilityAllProfilesPreparationAndOperations(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, f, o := observabilityFixture(t, profile)
			plan := o
			plan.Action = "plan"
			before := treeContents(t, o.ControlRoot, o.DataRoot)
			r, err := e.Run(context.Background(), plan)
			if err != nil || len(r.Steps) != 3 || r.ObservabilityReady || !r.Planned {
				t.Fatal(r, err)
			}
			if !equalTree(before, treeContents(t, o.ControlRoot, o.DataRoot)) {
				t.Fatal("plan wrote controls")
			}
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.ObservabilityReady || r.SSOQualified || r.PublicationReady || r.InstallationReady || f.creates != 4 {
				t.Fatal(r, err)
			}
			seed, err := readObservabilitySeed(o)
			if err != nil {
				t.Fatal(err)
			}
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.ObservabilityReady || f.creates != 4 {
				t.Fatal("retry recreated tools", r, err)
			}
			p := OperationOptions{Options: o, Command: "status", Component: "all"}
			query := runDaily(t, e, p, "status")
			if query.Observability == nil || !query.Observability.Prepared || len(query.Observability.Services) != 4 || len(query.Services) != 5 {
				t.Fatal(query)
			}
			p.Component = "grafana"
			query = runDaily(t, e, p, "doctor")
			if query.ScopeReady == nil || !*query.ScopeReady || query.Observability.APIReady == nil || !*query.Observability.APIReady {
				t.Fatal(query)
			}
			runDaily(t, e, p, "stop")
			runDaily(t, e, p, "start")
			p.Command = "logs"
			query = runDaily(t, e, p, "logs")
			if query.Export == nil {
				t.Fatal(query)
			}
			ledger, _ := os.ReadFile(filepath.Join(o.ControlRoot, "admin.jsonl"))
			for _, data := range [][]byte{ledger, jsonBytes(r), jsonBytes(query)} {
				for _, secret := range []string{seed.AdminPassword, seed.SecretKey, "private-observability-log"} {
					if bytes.Contains(data, []byte(secret)) {
						t.Fatal("observability secret/log leaked")
					}
				}
			}
			if f.initCalls != 1 || f.secretWrites != 2 {
				t.Fatal("observability changed access bootstrap")
			}
		})
	}
}
func equalTree(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for key, v := range a {
		if b[key] != v {
			return false
		}
	}
	return true
}

func TestObservabilityCompensationAndOwnership(t *testing.T) {
	for _, scenario := range []string{"confirmed", "uncertain", "binding", "stale", "missing-series", "port", "validation"} {
		t.Run(scenario, func(t *testing.T) {
			e, f, o := observabilityFixture(t, "dell-gb10")
			if scenario == "validation" {
				f.failValidation = true
				r, err := e.Run(context.Background(), o)
				if err != nil || r.Outcome != "FAILED" || f.creates != 0 {
					t.Fatal(r, err)
				}
				ledger, _ := os.ReadFile(filepath.Join(o.ControlRoot, "admin.jsonl"))
				if bytes.Contains(ledger, []byte("private-native-validation-detail")) {
					t.Fatal("validator output leaked")
				}
				f.failValidation = false
				r, err = e.Run(context.Background(), o)
				if err != nil || !r.ObservabilityReady || f.creates != 4 {
					t.Fatal("validator retry failed", r, err)
				}
				return
			}
			if scenario == "confirmed" || scenario == "uncertain" {
				f.failStart = true
				f.failStop = scenario == "uncertain"
				r, err := e.Run(context.Background(), o)
				wanted := "FAILED"
				if f.failStop {
					wanted = "UNKNOWN"
				}
				if err != nil || r.Outcome != wanted {
					t.Fatal(r, err)
				}
				if scenario == "confirmed" {
					for name, c := range f.containers {
						if strings.Contains(name, "-observability-") && c.State.Running {
							t.Fatal("new tool still running")
						}
					}
				}
				return
			}
			if scenario == "port" {
				e.PortAvailable = func(int) error { return codedError("PLATFORM_TEST_PORT_OCCUPIED") }
				r, err := e.Run(context.Background(), o)
				if err != nil || r.Outcome != "FAILED" || r.ObservabilityReady || f.creates != 0 {
					t.Fatal(r, err)
				}
				return
			}
			r, err := e.Run(context.Background(), o)
			if err != nil || !r.ObservabilityReady {
				t.Fatal(r, err)
			}
			switch scenario {
			case "binding":
				f.containers[f.specObs().Project+"-grafana"].HostConfig.PortBindings["3000/tcp"][0].HostIp = "0.0.0.0"
				_, err = e.Run(context.Background(), o)
				if code(err) != "PLATFORM_OBSERVABILITY_PUBLIC_BINDING_REJECTED" {
					t.Fatal(err)
				}
			case "stale":
				f.staleSeries = true
				seed, _ := readObservabilitySeed(o)
				if code(e.verifyObservability(context.Background(), o, seed)) != "PLATFORM_OBSERVABILITY_COLLECTION_UNCONFIRMED" {
					t.Fatal("stale series accepted")
				}
			case "missing-series":
				f.badSeries = true
				seed, _ := readObservabilitySeed(o)
				if code(e.verifyObservability(context.Background(), o, seed)) != "PLATFORM_OBSERVABILITY_COLLECTION_UNCONFIRMED" {
					t.Fatal("partial collection accepted")
				}
			}
		})
	}
}

func TestObservabilityBlueprintsAreBoundedAndPrivate(t *testing.T) {
	e, f, o := observabilityFixture(t, "precision-windows")
	if _, err := e.Run(context.Background(), o); err != nil {
		t.Fatal(err)
	}
	s := f.specObs()
	for id, service := range s.Services {
		if service["user"] == "0:0" || service["read_only"] != true {
			t.Fatal(id, service)
		}
		if id != "grafana" && service["ports"] != nil {
			t.Fatal("backend port published", id)
		}
	}
	var collector map[string]any
	if json.Unmarshal(s.Volumes["telemetry-config"].Files["config.json"].Data, &collector) != nil {
		t.Fatal("invalid collector JSON")
	}
	pipelines := collector["service"].(map[string]any)["pipelines"].(map[string]any)
	if len(pipelines) != 1 || pipelines["metrics"] == nil {
		t.Fatal("unapproved payload pipeline")
	}
	var dashboard map[string]any
	if json.Unmarshal(s.Volumes["grafana-dashboards"].Files["foundation.json"].Data, &dashboard) != nil {
		t.Fatal("invalid dashboard")
	}
	for _, p := range dashboard["panels"].([]any) {
		panel := p.(map[string]any)
		if panel["type"] == "stat" {
			for _, target := range panel["targets"].([]any) {
				if target.(map[string]any)["instant"] != true {
					t.Fatal("stat could display historical healthy sample")
				}
			}
		}
	}
}
