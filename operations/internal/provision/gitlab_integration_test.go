package provision

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// Opt-in on a disposable Linux Docker host; never installs WSL or host packages.
func TestGitlabWithRealDocker(t *testing.T) {
	if os.Getenv("PROVISION_GITLAB_INTEGRATION") != "1" {
		t.Skip("requires explicitly enabled disposable Docker CI host")
	}
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		t.Fatal("requires Linux AMD64 disposable runner")
	}
	program, err := exec.LookPath("docker")
	if err != nil {
		t.Fatal(err)
	}
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	id, err := randomIdentity()
	if err != nil {
		t.Fatal(err)
	}
	o := Options{Action: "install", Phase: "gitlab", InstallationID: "gitlab-ci-" + id[:12], Profile: "precision-windows", OperationID: id, Pool: "10.247.0.0/16", RuntimeMode: "external", GitlabPort: 29380, ControlRoot: filepath.Join(root, "control"), DataRoot: filepath.Join(root, "data"), DefinitionDigest: digest([]byte("isolated-gitlab-ci"))}
	for _, path := range []string{o.ControlRoot, o.DataRoot} {
		if err = os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	e := Engine{Host: Host{OS: "linux", Arch: runtime.GOARCH, Actor: "uid:" + itoa(os.Geteuid())}, Now: time.Now, Runner: realNetworkRunner{docker: program}}
	ctx, cancel := context.WithTimeout(context.Background(), 18*time.Minute)
	defer cancel()
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	t.Cleanup(func() {
		if t.Failed() {
			logIsolatedGitlabState(t, &e, o)
		}
		cleanupCtx, stop := context.WithTimeout(context.Background(), 2*time.Minute)
		defer stop()
		if err := cleanupIsolatedGitlab(cleanupCtx, &e, o, audit); err != nil {
			t.Error(err)
			return
		}
		owner, readErr := os.ReadFile(filepath.Join(o.DataRoot, "network.owner"))
		if os.IsNotExist(readErr) {
			return
		}
		if readErr != nil {
			t.Error(readErr)
			return
		}
		if err := e.cleanupNetworkProbes(cleanupCtx, o, string(owner)); err != nil {
			t.Error(err)
			return
		}
		all, err := e.networkInventory(cleanupCtx, o)
		if err != nil {
			t.Error(err)
			return
		}
		created := map[string]string{}
		for _, v := range e.networkViews(o) {
			if n, exists := all[v.Name]; exists {
				if !e.ownsNetwork(o, v, n, string(owner)) {
					t.Error("test refuses foreign network cleanup")
					return
				}
				created[v.Name] = n.ID
			}
		}
		if err = e.restoreCandidateNetworks(cleanupCtx, o, string(owner), e.networkViews(o), created, map[string]networkState{}); err != nil {
			t.Error(err)
		}
	})
	var firstSeed gitlabSeed
	var firstState string
	actions := []string{"PLATFORM_NETWORK_PROBE_IMAGE_PREPARED", "PLATFORM_NETWORKS_PREPARED", "PLATFORM_GITLAB_CREDENTIALS_PREPARED", "PLATFORM_GITLAB_IMAGES_PREPARED", "PLATFORM_GITLAB_SERVICES_PREPARED"}
	for pass := 0; pass < 2; pass++ {
		for _, action := range actions {
			t.Logf("gitlab pass=%d action=%s", pass+1, action)
			before, err := e.fingerprint(ctx, action, o)
			if err != nil {
				t.Fatal(action, err)
			}
			step := Step{action, "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "REQUEST_ACCEPTED"}
			if err = audit.append(step); err != nil {
				t.Fatal(err)
			}
			after, reason, err := e.apply(ctx, action, o)
			if err != nil {
				t.Fatal(action, err)
			}
			step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", after, reason
			if before == after {
				step.Outcome = "NO_CHANGE"
			}
			if err = audit.append(step); err != nil {
				t.Fatal(err)
			}
		}
		seed, err := readGitlabSeed(o)
		if err != nil {
			t.Fatal(err)
		}
		spec, err := e.gitlabSpec(o, seed)
		if err != nil {
			t.Fatal(err)
		}
		state, err := e.gitlabState(ctx, o, spec)
		if err != nil {
			t.Fatal(err)
		}
		if err = e.verifyGitlab(ctx, o, spec); err != nil {
			t.Fatal(err)
		}
		if pass == 0 {
			firstSeed, firstState = seed, digest(jsonBytes(state))
		} else if seed != firstSeed || digest(jsonBytes(state)) != firstState {
			t.Fatal("retry replaced credentials or container identity")
		}
	}
}

func cleanupIsolatedGitlab(ctx context.Context, e *Engine, o Options, audit recorder) (finalErr error) {
	seed, err := readGitlabSeed(o)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	s, err := e.gitlabSpec(o, seed)
	if err != nil {
		return err
	}
	step := Step{"PLATFORM_GITLAB_ISOLATED_TEST_REMOVED", "ACCEPTED", "REQUESTED", s.Digest, "NOT_OBSERVED", "DISPOSABLE_OWNED_RESOURCE_CLEANUP"}
	if err = audit.append(step); err != nil {
		return err
	}
	defer func() {
		step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", "ABSENT", "OWNED_RESOURCES_REMOVAL_CONFIRMED"
		if finalErr != nil {
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(finalErr)
		}
		if err := audit.append(step); err != nil {
			finalErr = err
		}
	}()
	if err = e.cleanupAccessHelper(ctx, o, s); err != nil {
		return err
	}
	for i := len(gitlabServices) - 1; i >= 0; i-- {
		key := gitlabServices[i]
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
		if _, err = e.docker(ctx, o, "container", "rm", "--force", c.ID); err != nil {
			return err
		}
		if remaining, err := e.readAccessContainer(ctx, o, s.Project+"-"+key); err != nil || remaining != nil {
			return codedError("PLATFORM_GITLAB_TEST_CLEANUP_UNCONFIRMED")
		}
	}
	for key, v := range s.Volumes {
		r, err := e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
		if err != nil {
			return err
		}
		if r.ExitCode != 0 {
			if dockerVolumeAbsent(r) {
				continue
			}
			return codedError("PLATFORM_GITLAB_TEST_VOLUME_UNCONFIRMED")
		}
		var values []struct {
			Name, Driver, Scope string
			Labels, Options     map[string]string
		}
		if json.Unmarshal([]byte(r.Output), &values) != nil || len(values) != 1 || values[0].Name != v.Name || values[0].Driver != "local" || values[0].Scope != "local" || len(values[0].Options) != 0 {
			return codedError("PLATFORM_GITLAB_TEST_VOLUME_UNCONFIRMED")
		}
		for name, wanted := range volumeLabels(o, s, key, v) {
			if values[0].Labels[name] != wanted {
				return codedError("PLATFORM_GITLAB_TEST_VOLUME_UNCONFIRMED")
			}
		}
		if _, err = e.docker(ctx, o, "volume", "rm", v.Name); err != nil {
			return err
		}
		r, err = e.dockerResponse(ctx, o, "volume", "inspect", v.Name)
		if err != nil || r.ExitCode == 0 || !dockerVolumeAbsent(r) {
			return codedError("PLATFORM_GITLAB_TEST_CLEANUP_UNCONFIRMED")
		}
	}
	return nil
}

// Only fixed diagnostic categories enter public CI logs; raw product logs stay private.
func logIsolatedGitlabState(t *testing.T, e *Engine, o Options) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	seed, err := readGitlabSeed(o)
	if err != nil {
		return
	}
	s, err := e.gitlabSpec(o, seed)
	if err != nil {
		return
	}
	for _, key := range gitlabServices {
		c, err := e.readAccessContainer(ctx, o, s.Project+"-"+key)
		if err != nil || c == nil {
			t.Logf("%s inspection unavailable", key)
			continue
		}
		if err = e.validateAccessContainer(o, s, key, c); err != nil {
			t.Logf("%s validation=%s", key, code(err))
			continue
		}
		t.Logf("%s running=%t exit=%d oom=%t", key, c.State.Running, c.State.ExitCode, c.State.OOMKilled)
		r, err := e.dockerResponse(ctx, o, "container", "logs", "--tail", "300", c.ID)
		if err != nil {
			continue
		}
		lower := strings.ToLower(r.Output)
		for _, category := range []string{"permission denied", "operation not permitted", "error executing action", "unknown config", "configuration file", "runit", "gitlab reconfigured", "exception", "fatal"} {
			if strings.Contains(lower, category) {
				t.Logf("%s log category=%s", key, category)
			}
		}
	}
}
