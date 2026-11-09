package provision

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

type fakeCIRunner struct {
	*fakeGitlab
	o                                      Options
	remote                                 *ciRunnerRegistration
	created, registered, verificationCalls int
	failStart, failStop, lostRegistration  bool
}

func ciRunnerFixture(t *testing.T) (*Engine, *fakeCIRunner, Options) {
	e, g, o := gitlabFixture(t)
	if r, err := e.Run(context.Background(), o); err != nil || !r.GitlabReady {
		t.Fatal(r, err)
	}
	o.Phase = "runner-control"
	f := &fakeCIRunner{fakeGitlab: g, o: o}
	e.Runner = f
	e.HTTP = f
	return e, f, o
}
func (f *fakeCIRunner) specCI() accessSpec {
	v, err := readCIRunnerIdentity(f.o)
	if err != nil {
		f.t.Fatal(err)
	}
	s, err := f.e.ciRunnerSpec(f.o, v)
	if err != nil {
		f.t.Fatal(err)
	}
	return s
}
func (f *fakeCIRunner) Run(ctx context.Context, c Command) (Response, error) {
	if filepath.Base(c.Program) != "docker" || len(c.Args) < 3 {
		return f.fakeGitlab.Run(ctx, c)
	}
	a := c.Args[2:]
	image := ciRunnerRelease().Platforms[f.e.Host.Arch]
	if (a[0] == "pull" || a[0] == "image" && a[1] == "inspect") && a[len(a)-1] == image.Reference {
		if a[0] == "pull" {
			f.images[image.Reference] = true
			return Response{}, nil
		}
		if !f.images[image.Reference] {
			return Response{ExitCode: 1, Output: "No such image: fixture"}, nil
		}
		return Response{Output: string(jsonBytes([]any{map[string]any{"Id": image.Config, "Os": "linux", "Architecture": f.e.Host.Arch, "RepoDigests": []string{image.Reference}}}))}, nil
	}
	if a[0] == "container" && a[1] == "exec" && contains(a, "gitlab-rails") {
		if a[len(a)-1] != "-" || !contains(a, "--interactive") {
			f.t.Fatal("registration adapter lost stdin boundary")
		}
		match := regexp.MustCompile(`Base64.strict_decode64\("([A-Za-z0-9+/=]+)"\)`).FindSubmatch(c.Stdin)
		if len(match) != 2 {
			f.t.Fatal("adapter input invalid")
		}
		raw, err := base64.StdEncoding.DecodeString(string(match[1]))
		if err != nil {
			f.t.Fatal(err)
		}
		var args struct {
			Owner  string
			ID     int64
			Create bool
		}
		if json.Unmarshal(raw, &args) != nil {
			f.t.Fatal("adapter args invalid")
		}
		if args.Create && f.remote == nil {
			token := "glrt-" + strings.Repeat("fixturePrivateRunnerToken", 3)
			f.remote = &ciRunnerRegistration{ID: 17, Paused: true, Protected: true, Scope: "instance_type", Token: token, TokenSHA256: digest([]byte(token))}
			f.registered++
			if f.lostRegistration {
				f.lostRegistration = false
				return Response{ExitCode: 1, Output: "private-lost-registration-response " + token}, nil
			}
		}
		if f.remote == nil {
			return Response{Output: "PLATFORM_RUNNER_JSON=null\n"}, nil
		}
		copy := *f.remote
		if !args.Create {
			copy.Token = ""
		}
		for _, arg := range c.Args {
			if strings.Contains(arg, f.remote.Token) {
				f.t.Fatal("token passed in command argument")
			}
		}
		return Response{Output: "PLATFORM_RUNNER_JSON=" + string(jsonBytes(copy)) + "\n"}, nil
	}
	if a[0] == "run" && option(a, "--network") == "none" && strings.Contains(option(a, "--mount"), "-ci-runner-") {
		if _, err := f.fakeAccess.Run(ctx, c); err != nil {
			return Response{}, err
		}
		volume := strings.TrimPrefix(strings.Split(option(a, "--mount"), ",")[1], "source=")
		var wanted accessVolume
		for _, v := range f.specCI().Volumes {
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
			fmt.Fprintf(&output, "%s  %s\n", digest(f.files[volume][name]), name)
		}
		return Response{Output: output.String()}, nil
	}
	if a[0] == "compose" && strings.HasSuffix(option(a, "--project-name"), "-ci-runner") {
		s := f.specCI()
		key := ciRunnerComponent
		service := s.Services[key]
		name := s.Project + "-" + key
		if old := f.containers[name]; old != nil {
			old.State.Running = true
		} else {
			v := &accessContainer{ID: digest([]byte(name)), Name: "/" + name}
			v.Image = image.Config
			v.Config.Image = image.Reference
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
			v.HostConfig.ReadonlyRootfs = true
			v.HostConfig.CapDrop = []string{"ALL"}
			v.HostConfig.SecurityOpt = []string{"no-new-privileges:true"}
			v.NetworkSettings.Networks = map[string]accessNetwork{}
			for _, n := range f.e.networkViews(f.o) {
				if n.Role == "services" {
					v.NetworkSettings.Networks[n.Name] = accessNetwork{}
				}
			}
			for _, entry := range service["volumes"].([]any) {
				m := entry.(map[string]any)
				v.Mounts = append(v.Mounts, struct {
					Type, Name, Destination string
					RW                      bool
				}{"volume", s.Volumes[m["source"].(string)].Name, m["target"].(string), false})
			}
			v.State.Running = true
			f.containers[name] = v
			f.created++
		}
		if f.failStart {
			return Response{ExitCode: 1, Output: "private-runner-startup-error"}, nil
		}
		return Response{}, nil
	}
	if a[0] == "container" && a[1] == "exec" && contains(a, "/usr/bin/gitlab-runner") {
		if contains(a, "verify") {
			f.verificationCalls++
			return Response{}, nil
		}
	}
	if a[0] == "container" && a[1] == "stop" && f.failStop {
		return Response{ExitCode: 1, Output: "private-runner-stop-error"}, nil
	}
	return f.fakeGitlab.Run(ctx, c)
}
func TestCIRunnerPausedPreparationRetryAndMaintenance(t *testing.T) {
	e, f, o := ciRunnerFixture(t)
	before := treeContents(t, o.ControlRoot, o.DataRoot)
	plan := o
	plan.Action = "plan"
	if r, err := e.Run(context.Background(), plan); err != nil || len(r.Steps) != 4 || r.RunnerControlReady || !equalTree(before, treeContents(t, o.ControlRoot, o.DataRoot)) {
		t.Fatal(r, err)
	}
	for pass := 0; pass < 2; pass++ {
		r, err := e.Run(context.Background(), o)
		if err != nil || !r.RunnerControlReady || r.RunnerExecutionReady || r.InstallationReady || r.PublicationReady || f.created != 1 || f.registered != 1 {
			t.Fatal(r, err)
		}
	}
	v, err := readCIRunnerIdentity(o)
	if err != nil {
		t.Fatal(err)
	}
	s := f.specCI()
	config := s.Volumes["runner-config"].Files["config.toml"].Data
	if !bytes.Contains(config, []byte("disabled.sock")) || bytes.Contains(s.Compose, []byte(v.Token)) || bytes.Contains(config, []byte("executor = \"shell\"")) {
		t.Fatal("unsafe control-only configuration")
	}
	before = treeContents(t, o.ControlRoot, o.DataRoot)
	calls := f.verificationCalls
	p := OperationOptions{Options: o, Command: "doctor", Component: ciRunnerComponent}
	r, err := e.RunOperation(context.Background(), p)
	if err != nil || r.ExitCode != 0 || r.CIRunner == nil || r.CIRunner.ExecutionReady || r.CIRunner.Paused == nil || !*r.CIRunner.Paused || r.CIRunner.ExecutorState != "NOT_PROVISIONED" || f.verificationCalls != calls || !equalTree(before, treeContents(t, o.ControlRoot, o.DataRoot)) {
		t.Fatal(r, err)
	}
	for _, command := range []string{"stop", "start", "restart", "logs"} {
		p.Command = command
		if r, err = e.RunOperation(context.Background(), p); err != nil || r.ExitCode != 0 {
			t.Fatal(r, err)
		}
	}
	ledger, _ := os.ReadFile(filepath.Join(o.ControlRoot, "admin.jsonl"))
	if bytes.Contains(ledger, []byte(v.Token)) || bytes.Contains(jsonBytes(r), []byte(v.Token)) {
		t.Fatal("private credential in public result")
	}
	f.remote.Paused = false
	p.Command = "doctor"
	if r, err = e.RunOperation(context.Background(), p); err != nil || r.ExitCode != 2 || r.CIRunner.ControlReady == nil || *r.CIRunner.ControlReady {
		t.Fatal("unpaused remote policy accepted", r, err)
	}
}
func TestCIRunnerLostResponseAndStartupCompensation(t *testing.T) {
	for _, mode := range []string{"lost-registration", "startup", "uncertain"} {
		t.Run(mode, func(t *testing.T) {
			e, f, o := ciRunnerFixture(t)
			f.lostRegistration = mode == "lost-registration"
			f.failStart = mode != "lost-registration"
			f.failStop = mode == "uncertain"
			r, err := e.Run(context.Background(), o)
			want := "UNKNOWN"
			if mode == "startup" {
				want = "FAILED"
			}
			if err != nil || r.Outcome != want || r.RunnerControlReady || f.registered != 1 || !f.remote.Paused {
				t.Fatal(r, err)
			}
			if mode == "uncertain" {
				return
			}
			if mode == "lost-registration" {
				path := filepath.Join(o.ControlRoot, "diagnostic-"+o.OperationID+"-PLATFORM_CI_RUNNER_REGISTRATION_PREPARED.json")
				detail, readErr := os.ReadFile(path)
				if readErr != nil || !bytes.Contains(detail, []byte(f.remote.Token)) || bytes.Contains(jsonBytes(r), []byte(f.remote.Token)) {
					t.Fatal("private diagnostic was lost or projected", readErr)
				}
				publicErr := &privateProviderError{reason: codedError("PLATFORM_CI_RUNNER_REGISTRATION_UNCONFIRMED"), detail: f.remote.Token}
				if publicErr.Error() != code(publicErr) || strings.Contains(fmt.Sprint(publicErr), f.remote.Token) {
					t.Fatal("provider error exposed its private detail")
				}
			}
			f.failStart = false
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.RunnerControlReady || r.RunnerExecutionReady || f.registered != 1 || f.created != 1 {
				t.Fatal("retry duplicated runner or enabled execution", r, err)
			}
			if mode == "lost-registration" && r.Steps[1].Outcome != "SUCCEEDED" {
				t.Fatal("private receipt recovery was reported as no change", r.Steps)
			}
		})
	}
}
func TestCIRunnerRefusesContainerDriftAndBacklog(t *testing.T) {
	for _, change := range []string{"socket", "capability", "pid", "command", "environment", "record", "network"} {
		t.Run(change, func(t *testing.T) {
			e, f, o := ciRunnerFixture(t)
			if r, err := e.Run(context.Background(), o); err != nil || !r.RunnerControlReady {
				t.Fatal(r, err)
			}
			s := f.specCI()
			c := f.containers[s.Project+"-"+ciRunnerComponent]
			switch change {
			case "socket":
				c.Mounts[0].Type = "bind"
				c.Mounts[0].Destination = "/var/run/docker.sock"
			case "capability":
				c.HostConfig.CapAdd = []string{"SYS_ADMIN"}
			case "pid":
				c.HostConfig.PidMode = "host"
			case "command":
				c.Config.Cmd = []string{"run", "--config", "/tmp/other.toml"}
			case "environment":
				c.Config.Env = append(c.Config.Env, "DOCKER_HOST=unix:///var/run/docker.sock")
			case "record":
				c.ID = strings.Repeat("f", 64)
			case "network":
				c.NetworkSettings.Networks["foreign"] = accessNetwork{}
			}
			r, err := e.RunOperation(context.Background(), OperationOptions{Options: o, Command: "doctor", Component: ciRunnerComponent})
			if err != nil || r.ExitCode != 2 || r.CIRunner.State != "CONFLICT" {
				t.Fatal(r, err)
			}
		})
	}
	for _, profile := range []string{"dell-gb10", "macos-m3-max"} {
		e, _, _, o := fixtureEngine(t, profile)
		o.Phase = "runner-control"
		before := treeContents(t, o.ControlRoot, o.DataRoot)
		r, err := e.Run(context.Background(), o)
		if err != nil || r.ExitCode != 42 || !equalTree(before, treeContents(t, o.ControlRoot, o.DataRoot)) {
			t.Fatal(r, err)
		}
	}
}

func TestCIRunnerLostIdentityDoesNotCreateAnotherRegistration(t *testing.T) {
	e, f, o := ciRunnerFixture(t)
	if r, err := e.Run(context.Background(), o); err != nil || !r.RunnerControlReady {
		t.Fatal(r, err)
	}
	path := filepath.Join(o.ControlRoot, "ci-runner-identity.json")
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	r, err := e.Run(context.Background(), o)
	if err != nil || r.Outcome != "FAILED" || r.Reason != "PLATFORM_CI_RUNNER_IDENTITY_MISSING_EXISTING_RESOURCES" || f.registered != 1 {
		t.Fatal(r, err)
	}
	if _, err = os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("lost identity was silently replaced")
	}
}
