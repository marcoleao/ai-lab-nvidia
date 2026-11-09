package provision

import (
	"ai-platform/operations/blueprints"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

type fakeHub struct {
	*fakeObservability
	o                                            Options
	created                                      int
	failStart, failStop, wrongPage, dropExisting bool
}

func hubFixture(t *testing.T, profile string) (*Engine, *fakeHub, Options) {
	e, f, o := observabilityFixture(t, profile)
	if r, err := e.Run(context.Background(), o); err != nil || !r.ObservabilityReady {
		t.Fatal(r, err)
	}
	o.Phase = "hub"
	if err := e.defaults(&o); err != nil {
		t.Fatal(err)
	}
	h := &fakeHub{fakeObservability: f, o: o}
	e.Runner = h
	e.HTTP = h
	return e, h, o
}
func (h *fakeHub) spec() accessSpec {
	v, err := readHubIdentity(h.o)
	if err != nil {
		h.t.Fatal(err)
	}
	s, err := h.e.hubSpec(h.o, v)
	if err != nil {
		h.t.Fatal(err)
	}
	return s
}
func (h *fakeHub) Run(ctx context.Context, c Command) (Response, error) {
	if filepath.Base(c.Program) != "docker" || len(c.Args) < 3 {
		return h.fakeObservability.Run(ctx, c)
	}
	a := c.Args[2:]
	image := hubRelease().Platforms[h.e.Host.Arch]
	if (a[0] == "pull" || a[0] == "image" && a[1] == "inspect") && a[len(a)-1] == image.Reference {
		if a[0] == "pull" {
			h.images[image.Reference] = true
			return Response{}, nil
		}
		if !h.images[image.Reference] {
			return Response{ExitCode: 1, Output: "No such image: fixture"}, nil
		}
		return Response{Output: string(jsonBytes([]any{map[string]any{"Id": image.Config, "Os": "linux", "Architecture": h.e.Host.Arch, "RepoDigests": []string{image.Reference}}}))}, nil
	}
	if a[0] == "run" && option(a, "--network") == "none" && strings.Contains(option(a, "--mount"), "-hub-") {
		if _, err := h.fakeAccess.Run(ctx, c); err != nil {
			return Response{}, err
		}
		v := h.spec().Volumes["hub-config"]
		names := []string{}
		for key := range v.Files {
			names = append(names, key)
		}
		sort.Strings(names)
		var out strings.Builder
		for _, name := range names {
			fmt.Fprintf(&out, "%s  %s\n", digest(h.files[v.Name][name]), name)
		}
		return Response{Output: out.String()}, nil
	}
	if a[0] == "compose" && strings.HasSuffix(option(a, "--project-name"), "-hub") {
		s := h.spec()
		service := s.Services["homepage"]
		name := s.Project + "-homepage"
		if old := h.containers[name]; old != nil {
			old.State.Running = true
			if h.dropExisting {
				old.State.Running = false
			}
		} else {
			v := &accessContainer{ID: digest([]byte(name)), Name: "/" + name}
			v.Config.Image = image.Reference
			v.Image = image.Config
			v.Config.User = "1000:1000"
			v.Config.Entrypoint = []string{"docker-entrypoint.sh"}
			v.Config.Cmd = []string{"node", "server.js"}
			for key, value := range service["environment"].(map[string]string) {
				v.Config.Env = append(v.Config.Env, key+"="+value)
			}
			v.Config.Labels = map[string]string{}
			for key, value := range service["labels"].(map[string]string) {
				v.Config.Labels[key] = value
			}
			v.Config.Labels["com.docker.compose.project"] = s.Project
			v.Config.Labels["com.docker.compose.service"] = "homepage"
			v.HostConfig.ReadonlyRootfs = true
			v.HostConfig.CapDrop = []string{"ALL"}
			v.HostConfig.SecurityOpt = []string{"no-new-privileges:true"}
			v.HostConfig.PortBindings = map[string][]struct{ HostIp, HostPort string }{"3000/tcp": {{"127.0.0.1", fmt.Sprint(h.o.HubPort)}}}
			v.NetworkSettings.Networks = map[string]accessNetwork{}
			for _, network := range h.e.networkViews(h.o) {
				if network.Role == "services" {
					v.NetworkSettings.Networks[network.Name] = accessNetwork{}
				}
			}
			v.Mounts = append(v.Mounts, struct {
				Type, Name, Destination string
				RW                      bool
			}{"volume", s.Volumes["hub-config"].Name, "/app/config", false})
			v.State.Running = true
			h.containers[name] = v
			h.created++
		}
		if h.failStart {
			return Response{ExitCode: 1, Output: "private-hub-start-error"}, nil
		}
		return Response{}, nil
	}
	if a[0] == "container" && a[1] == "stop" && h.failStop {
		if v := h.containers[h.spec().Project+"-homepage"]; v != nil && v.ID == a[len(a)-1] {
			return Response{ExitCode: 1, Output: "private-hub-stop-error"}, nil
		}
	}
	return h.fakeObservability.Run(ctx, c)
}
func (h *fakeHub) Do(req *http.Request) (*http.Response, error) {
	if req.URL.Hostname() != "home.localhost" {
		return h.fakeObservability.Do(req)
	}
	if req.Header.Get("Authorization") != "" || req.URL.User != nil {
		h.t.Fatal("hub received private API credentials")
	}
	value := "up"
	if req.URL.Path == "/" {
		urls := accessEndpoints(h.o)
		value = urls["identity"] + "/admin/ " + urls["secret_store"] + "/ui/ " + observabilityURL(h.o) + "/d/platform-foundation"
		if h.wrongPage {
			value = "private-hub-html-content"
		}
	}
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(value))}, nil
}

func TestHubAllProfilesPreparationAndDailyOperations(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, h, o := hubFixture(t, profile)
			before := treeContents(t, o.ControlRoot, o.DataRoot)
			plan := o
			plan.Action = "plan"
			r, err := e.Run(context.Background(), plan)
			if err != nil || len(r.Steps) != 3 || r.HubReady || !equalTree(before, treeContents(t, o.ControlRoot, o.DataRoot)) {
				t.Fatal("plan had effects", r, err)
			}
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.HubReady || h.created != 1 || r.PublicationReady || r.SSOQualified || r.InstallationReady {
				t.Fatal(r, err)
			}
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.HubReady || h.created != 1 {
				t.Fatal("retry recreated hub", r, err)
			}
			p := OperationOptions{Options: o, Component: "homepage"}
			before = treeContents(t, o.ControlRoot, o.DataRoot)
			query := runDaily(t, e, p, "doctor")
			if query.Hub == nil || query.Hub.APIReady == nil || !*query.Hub.APIReady || query.ScopeReady == nil || !*query.ScopeReady || len(query.Services) != 5 || len(query.Observability.Services) != 4 {
				t.Fatal(query)
			}
			if !equalTree(before, treeContents(t, o.ControlRoot, o.DataRoot)) {
				t.Fatal("hub diagnosis wrote controls or data")
			}
			runDaily(t, e, p, "stop")
			runDaily(t, e, p, "start")
			runDaily(t, e, p, "restart")
			query = runDaily(t, e, p, "logs")
			if query.Export == nil || query.Export.Component != "homepage" {
				t.Fatal(query)
			}
			seed, _ := readAccessSeed(o)
			obsSeed, _ := readObservabilitySeed(o)
			ledger, _ := os.ReadFile(filepath.Join(o.ControlRoot, "admin.jsonl"))
			for _, value := range [][]byte{ledger, jsonBytes(r), jsonBytes(query), h.spec().Compose} {
				for _, secret := range []string{seed.MasterPassword, obsSeed.AdminPassword, obsSeed.SecretKey, "private-observability-log"} {
					if bytes.Contains(value, []byte(secret)) {
						t.Fatal("hub leaked credentials or logs")
					}
				}
			}
			if h.initCalls != 1 || h.secretWrites != 2 {
				t.Fatal("hub changed access bootstrap")
			}
		})
	}
}
func TestHubCompensationOwnershipAndMaintenance(t *testing.T) {
	for _, scenario := range []string{"confirmed", "unknown", "port", "binding", "environment", "command", "receipt", "page", "drift", "pending", "existing-crash"} {
		t.Run(scenario, func(t *testing.T) {
			e, h, o := hubFixture(t, "dell-gb10")
			if scenario == "pending" {
				intent := operationIntent{Schema: 1, Installation: o.InstallationID, Profile: o.Profile, MaintenanceID: strings.Repeat("a", 32), Command: "restart", Component: "edge", Mode: "APPLYING", Targets: []operationTarget{{Component: "edge", ID: strings.Repeat("b", 64), Stage: "PENDING"}}}
				if err := saveOperationIntent(o, intent); err != nil {
					t.Fatal(err)
				}
				_, err := e.Run(context.Background(), o)
				if code(err) != "PLATFORM_OPERATION_PENDING" || h.created != 0 {
					t.Fatal(err)
				}
				return
			}
			if scenario == "confirmed" || scenario == "unknown" {
				h.failStart = true
				h.failStop = scenario == "unknown"
				r, err := e.Run(context.Background(), o)
				wanted := "FAILED"
				if h.failStop {
					wanted = "UNKNOWN"
				}
				if err != nil || r.Outcome != wanted || r.HubReady {
					t.Fatal(r, err)
				}
				if !h.failStop {
					h.failStart = false
					r, err = e.Run(context.Background(), o)
					if err != nil || !r.HubReady || h.created != 1 {
						t.Fatal("compensated retry failed", r, err)
					}
				}
				return
			}
			if scenario == "port" {
				e.PortAvailable = func(int) error { return codedError("PLATFORM_TEST_OCCUPIED") }
				r, err := e.Run(context.Background(), o)
				if err != nil || r.Outcome != "FAILED" || h.created != 0 {
					t.Fatal(r, err)
				}
				return
			}
			if r, err := e.Run(context.Background(), o); err != nil || !r.HubReady {
				t.Fatal(r, err)
			}
			switch scenario {
			case "existing-crash":
				h.failStart, h.dropExisting = true, true
				r, err := e.Run(context.Background(), o)
				if err != nil || r.Outcome != "UNKNOWN" || r.HubReady {
					t.Fatal("lost existing running state was claimed restored", r, err)
				}
			case "environment":
				h.containers[h.spec().Project+"-homepage"].Config.Env = append(h.containers[h.spec().Project+"-homepage"].Config.Env, "HOMEPAGE_VAR_TOKEN=private-fixture-token")
				_, err := e.Run(context.Background(), o)
				if code(err) != "PLATFORM_HUB_ENVIRONMENT_CHANGED" {
					t.Fatal(err)
				}
			case "command":
				h.containers[h.spec().Project+"-homepage"].Config.Cmd = []string{"sh"}
				_, err := e.Run(context.Background(), o)
				if code(err) != "PLATFORM_HUB_COMMAND_CHANGED" {
					t.Fatal(err)
				}
			case "binding":
				h.containers[h.spec().Project+"-homepage"].HostConfig.PortBindings["3000/tcp"][0].HostIp = "0.0.0.0"
				_, err := e.Run(context.Background(), o)
				if code(err) != "PLATFORM_HUB_PUBLIC_BINDING_REJECTED" {
					t.Fatal(err)
				}
			case "receipt":
				var record accessRecord
				_ = networkControl(o, "hub.resources.json", &record)
				record.Containers["homepage"] = strings.Repeat("e", 64)
				_ = atomicFile(filepath.Join(o.DataRoot, "hub.resources.json"), jsonBytes(record), 0600)
				if _, err := e.hubOperationService(context.Background(), o); code(err) != "PLATFORM_HUB_RESOURCE_CHANGED" {
					t.Fatal(err)
				}
			case "page":
				h.wrongPage = true
				p := OperationOptions{Options: o, Command: "doctor", Component: "homepage"}
				r, err := e.RunOperation(context.Background(), p)
				if err != nil || r.ExitCode != 2 || r.Hub.APIReady == nil || *r.Hub.APIReady || bytes.Contains(jsonBytes(r), []byte("private-hub-html-content")) {
					t.Fatal(r, err)
				}
			case "drift":
				o.HubPort += 10
				_, err := e.Run(context.Background(), o)
				if err == nil {
					t.Fatal("changed hub port silently adopted")
				}
			}
		})
	}
}
func TestHubConfigurationIsolationAndLegacyObservabilityIdentity(t *testing.T) {
	legacy, err := blueprints.DigestOf("middleware/observability.json", "observability")
	if err != nil || legacy != "50205a5b9625f63e64b748333929f44d3521a81d8d98e8fb553f5ae5c6d2b362" {
		t.Fatal("pre-hub observability policy identity changed; explicit migration required", legacy, err)
	}
	if legacy == blueprints.Digest() {
		t.Fatal("unrelated new tool failed to change overall source evidence")
	}
	e, h, o := hubFixture(t, "precision-windows")
	if _, err = e.Run(context.Background(), o); err != nil {
		t.Fatal(err)
	}
	s := h.spec()
	v := s.Services["homepage"]
	if v["user"] != "1000:1000" || v["read_only"] != true || len(s.Volumes) != 1 {
		t.Fatal("unsafe hub runtime", v)
	}
	files := s.Volumes["hub-config"].Files
	for _, name := range []string{"widgets.yaml", "bookmarks.yaml"} {
		if string(files[name].Data) != "[]" {
			t.Fatal("unapproved integration", name)
		}
	}
	for _, name := range []string{"custom.css", "custom.js"} {
		if len(files[name].Data) != 0 {
			t.Fatal("native UI overwritten", name)
		}
	}
	if string(files["docker.yaml"].Data) != "{}" || string(files["proxmox.yaml"].Data) != "{}" {
		t.Fatal("automatic discovery enabled")
	}
}
