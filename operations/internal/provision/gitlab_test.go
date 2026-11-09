package provision

import (
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

type fakeGitlab struct {
	*fakeObservability
	o                            Options
	created                      int
	failStart, failStop, badHTTP bool
}

func gitlabFixture(t *testing.T) (*Engine, *fakeGitlab, Options) {
	e, f, o := observabilityFixture(t, "precision-windows")
	o.Phase = "gitlab"
	if err := e.defaults(&o); err != nil {
		t.Fatal(err)
	}
	g := &fakeGitlab{fakeObservability: f, o: o}
	e.Runner = g
	e.HTTP = g
	return e, g, o
}
func (g *fakeGitlab) specGitlab() accessSpec {
	seed, err := readGitlabSeed(g.o)
	if err != nil {
		g.t.Fatal(err)
	}
	s, err := g.e.gitlabSpec(g.o, seed)
	if err != nil {
		g.t.Fatal(err)
	}
	return s
}
func (g *fakeGitlab) Run(ctx context.Context, c Command) (Response, error) {
	if filepath.Base(c.Program) != "docker" || len(c.Args) < 3 {
		return g.fakeObservability.Run(ctx, c)
	}
	a := c.Args[2:]
	image := gitlabRelease().Platforms[g.e.Host.Arch]
	if (a[0] == "pull" || a[0] == "image" && a[1] == "inspect") && a[len(a)-1] == image.Reference {
		if a[0] == "pull" {
			g.images[image.Reference] = true
			return Response{}, nil
		}
		if !g.images[image.Reference] {
			return Response{ExitCode: 1, Output: "No such image: fixture"}, nil
		}
		return Response{Output: string(jsonBytes([]any{map[string]any{"Id": image.Config, "Os": "linux", "Architecture": g.e.Host.Arch, "RepoDigests": []string{image.Reference}}}))}, nil
	}
	if a[0] == "run" && option(a, "--network") == "none" && strings.Contains(option(a, "--mount"), "-gitlab-") {
		if _, err := g.fakeAccess.Run(ctx, c); err != nil {
			return Response{}, err
		}
		volume := strings.TrimPrefix(strings.Split(option(a, "--mount"), ",")[1], "source=")
		var wanted accessVolume
		for _, v := range g.specGitlab().Volumes {
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
			fmt.Fprintf(&output, "%s  %s\n", digest(g.files[volume][name]), name)
		}
		return Response{Output: output.String()}, nil
	}
	if a[0] == "compose" && strings.HasSuffix(option(a, "--project-name"), "-gitlab") {
		s := g.specGitlab()
		for _, key := range gitlabServices {
			service := s.Services[key]
			name := s.Project + "-" + key
			if old := g.containers[name]; old != nil {
				old.State.Running = true
				continue
			}
			v := &accessContainer{ID: digest([]byte(name)), Name: "/" + name}
			v.Image = serviceRelease(key).Platforms[g.e.Host.Arch].Config
			v.Config.Image = service["image"].(string)
			v.Config.User = service["user"].(string)
			v.Config.Entrypoint = service["entrypoint"].([]string)
			v.Config.Cmd = service["command"].([]string)
			v.Config.Labels = map[string]string{}
			for k, value := range service["labels"].(map[string]string) {
				v.Config.Labels[k] = value
			}
			v.Config.Labels["com.docker.compose.project"] = s.Project
			v.Config.Labels["com.docker.compose.service"] = key
			for k, value := range service["environment"].(map[string]string) {
				v.Config.Env = append(v.Config.Env, k+"="+value)
			}
			v.HostConfig.ReadonlyRootfs = service["read_only"].(bool)
			v.HostConfig.CapDrop = []string{"ALL"}
			v.HostConfig.SecurityOpt = []string{"no-new-privileges:true"}
			if key == "gitlab" {
				v.HostConfig.CapAdd = append([]string{}, gitlabCapabilities...)
			}
			v.NetworkSettings.Networks = map[string]accessNetwork{}
			for _, network := range g.e.networkViews(g.o) {
				if _, ok := service["networks"].(map[string]any)[network.Role]; ok {
					v.NetworkSettings.Networks[network.Name] = accessNetwork{}
				}
			}
			for _, entry := range service["volumes"].([]any) {
				m := entry.(map[string]any)
				v.Mounts = append(v.Mounts, struct {
					Type, Name, Destination string
					RW                      bool
				}{"volume", s.Volumes[m["source"].(string)].Name, m["target"].(string), !m["read_only"].(bool)})
			}
			if key == "gitlab-web" {
				v.HostConfig.PortBindings = map[string][]struct{ HostIp, HostPort string }{fmt.Sprint(g.o.GitlabPort) + "/tcp": {{"127.0.0.1", fmt.Sprint(g.o.GitlabPort)}}}
				v.NetworkSettings.Ports = v.HostConfig.PortBindings
			}
			v.State.Running = true
			g.containers[name] = v
			g.created++
		}
		if g.failStart {
			return Response{ExitCode: 1, Output: "private-gitlab-provider-error"}, nil
		}
		return Response{}, nil
	}
	if a[0] == "container" && a[1] == "exec" {
		if c := g.containers[g.specGitlab().Project+"-gitlab"]; c != nil && c.ID == a[2] {
			return Response{Output: `{"status":"ok"}`}, nil
		}
	}
	if a[0] == "container" && a[1] == "stop" && g.failStop {
		return Response{ExitCode: 1, Output: "private-gitlab-stop-error"}, nil
	}
	return g.fakeObservability.Run(ctx, c)
}
func (g *fakeGitlab) Do(r *http.Request) (*http.Response, error) {
	if r.URL.Hostname() != "git.localhost" {
		return g.fakeObservability.Do(r)
	}
	if r.Header.Get("Authorization") != "" || r.URL.User != nil {
		g.t.Fatal("login probe received credentials")
	}
	status, body := 200, "GitLab sign in"
	if g.badHTTP {
		status, body = 503, "private-gitlab-http-content"
	}
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body))}, nil
}
func TestGitlabPreparationRetryAndOperations(t *testing.T) {
	e, g, o := gitlabFixture(t)
	before := treeContents(t, o.ControlRoot, o.DataRoot)
	plan := o
	plan.Action = "plan"
	if r, err := e.Run(context.Background(), plan); err != nil || len(r.Steps) != 3 || r.GitlabReady || !equalTree(before, treeContents(t, o.ControlRoot, o.DataRoot)) {
		t.Fatal(r, err)
	}
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.GitlabReady || r.InstallationReady || r.PublicationReady || r.SSOQualified || g.created != 2 {
		t.Fatal(r, err)
	}
	seed, _ := readGitlabSeed(o)
	spec := g.specGitlab()
	g.files[spec.Volumes["gitlab-data"].Name]["repository.fixture"] = []byte("existing repository data")
	if r, err = e.Run(context.Background(), o); err != nil || !r.GitlabReady || g.created != 2 || string(g.files[spec.Volumes["gitlab-data"].Name]["repository.fixture"]) != "existing repository data" {
		t.Fatal(r, err)
	}
	again, _ := readGitlabSeed(o)
	if seed != again {
		t.Fatal("retry rotated credentials")
	}
	op := OperationOptions{Options: o, Command: "doctor", Component: "gitlab"}
	reading, err := e.RunOperation(context.Background(), op)
	if err != nil || reading.ExitCode != 0 || reading.Gitlab == nil || reading.Gitlab.APIReady == nil || !*reading.Gitlab.APIReady || bytes.Contains(jsonBytes(reading), []byte(seed.RootPassword)) {
		t.Fatal(reading, err)
	}
	g.badHTTP = true
	reading, err = e.RunOperation(context.Background(), op)
	if err != nil || reading.ExitCode != 2 || bytes.Contains(jsonBytes(reading), []byte("private-gitlab-http-content")) {
		t.Fatal(reading, err)
	}
	g.badHTTP = false
	op.Command = "stop"
	if r, err := e.RunOperation(context.Background(), op); err != nil || r.Outcome != "SUCCEEDED" {
		t.Fatal(r, err)
	}
	for _, key := range gitlabServices {
		if g.containers[spec.Project+"-"+key].State.Running {
			t.Fatal("group stop left a process running")
		}
	}
	op.Command = "start"
	if r, err := e.RunOperation(context.Background(), op); err != nil || r.Outcome != "SUCCEEDED" {
		t.Fatal(r, err)
	}
	op.Command = "restart"
	op.RequestID = strings.Repeat("c", 32)
	if _, err = e.RunOperation(context.Background(), op); err != nil {
		t.Fatal(err)
	}
	if r, err := e.RunOperation(context.Background(), op); err != nil || r.Outcome != "NO_CHANGE" {
		t.Fatal(r, err)
	}
}
func TestGitlabStartupCompensationAndDrift(t *testing.T) {
	for _, uncertain := range []bool{false, true} {
		t.Run(fmt.Sprint(uncertain), func(t *testing.T) {
			e, g, o := gitlabFixture(t)
			g.failStart = true
			g.failStop = uncertain
			r, err := e.Run(context.Background(), o)
			wanted := "FAILED"
			if uncertain {
				wanted = "UNKNOWN"
			}
			if err != nil || r.Outcome != wanted || r.GitlabReady || bytes.Contains(jsonBytes(r), []byte("private-gitlab")) {
				t.Fatal(r, err)
			}
			if !uncertain {
				g.failStart = false
				if r, err = e.Run(context.Background(), o); err != nil || !r.GitlabReady || g.created != 2 {
					t.Fatal(r, err)
				}
			}
		})
	}
	for _, change := range []string{"capability", "host-pid", "environment", "public-binding", "record", "mount", "network"} {
		t.Run(change, func(t *testing.T) {
			e, g, o := gitlabFixture(t)
			if r, err := e.Run(context.Background(), o); err != nil || !r.GitlabReady {
				t.Fatal(r, err)
			}
			s := g.specGitlab()
			c := g.containers[s.Project+"-gitlab"]
			switch change {
			case "capability":
				c.HostConfig.CapAdd = append(c.HostConfig.CapAdd, "SYS_ADMIN")
			case "host-pid":
				c.HostConfig.PidMode = "host"
			case "environment":
				c.Config.Env = append(c.Config.Env, "RUBYOPT=private-injection")
			case "public-binding":
				proxy := g.containers[s.Project+"-gitlab-web"]
				proxy.HostConfig.PortBindings[fmt.Sprint(o.GitlabPort)+"/tcp"][0].HostIp = "0.0.0.0"
			case "record":
				c.ID = strings.Repeat("f", 64)
			case "mount":
				c.Mounts[0].Type = "bind"
			case "network":
				c.NetworkSettings.Networks["foreign"] = accessNetwork{}
			}
			r, err := e.RunOperation(context.Background(), OperationOptions{Options: o, Command: "doctor", Component: "gitlab"})
			if err != nil || r.ExitCode != 2 || r.Gitlab.State != "CONFLICT" {
				t.Fatal(r, err)
			}
		})
	}
}
func TestGitlabBacklogAndPreflight(t *testing.T) {
	for _, profile := range []string{"dell-gb10", "macos-m3-max"} {
		e, _, _, o := fixtureEngine(t, profile)
		o.Phase = "gitlab"
		before := treeContents(t, o.ControlRoot, o.DataRoot)
		r, err := e.Run(context.Background(), o)
		if err != nil || r.ExitCode != 42 || !equalTree(before, treeContents(t, o.ControlRoot, o.DataRoot)) {
			t.Fatal(r, err)
		}
	}
	e, _, o := gitlabFixture(t)
	o.GitlabPort = o.IdentityPort
	if _, err := e.Run(context.Background(), o); code(err) != "PLATFORM_GITLAB_PORT_INVALID" {
		t.Fatal(err)
	}
	e, _, o = gitlabFixture(t)
	e.PortAvailable = func(int) error { return fmt.Errorf("private occupied port") }
	r, err := e.Run(context.Background(), o)
	if err != nil || r.Outcome != "FAILED" || r.GitlabReady {
		t.Fatal(r, err)
	}
	if _, err = os.Stat(filepath.Join(o.DataRoot, "gitlab.intent.json")); !os.IsNotExist(err) {
		t.Fatal("port conflict wrote startup intent")
	}
}

func TestGitlabLinkPreservesExistingHub(t *testing.T) {
	e, _, o := hubFixture(t, "precision-windows")
	if r, err := e.Run(context.Background(), o); err != nil || !r.HubReady {
		t.Fatal(r, err)
	}
	identity, err := readHubIdentity(o)
	if err != nil {
		t.Fatal(err)
	}
	oldSpec, err := e.hubSpec(o, identity)
	if err != nil {
		t.Fatal(err)
	}
	// Simulate a separate preparation receipt only in this disposable fixture.
	if err = atomicFile(filepath.Join(o.DataRoot, "gitlab.resources.json"), jsonBytes(accessRecord{Spec: digest([]byte("isolated-gitlab"))}), 0600); err != nil {
		t.Fatal(err)
	}
	newSpec, err := e.hubSpec(o, identity)
	if err != nil || newSpec.Digest == oldSpec.Digest || !bytes.Contains(newSpec.Volumes["hub-config"].Files["services.yaml"].Data, []byte(gitlabURL(o))) {
		t.Fatal("native hub configuration did not include the prepared GitLab", err)
	}
	r, err := e.Run(context.Background(), o)
	if r.HubReady || err == nil && r.ExitCode == 0 {
		t.Fatal("existing hub was silently migrated", r, err)
	}
	var record accessRecord
	if err = networkControl(o, "hub.resources.json", &record); err != nil || record.Spec != oldSpec.Digest {
		t.Fatal("existing hub receipt changed", err)
	}
}
