package provision

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

// Opt-in CI integration of the network adapter only. No apt, driver, WSL,
// systemd or default-daemon reconfiguration. The daemon must already exist.
func TestNetworkWithRealDocker(t *testing.T) {
	if os.Getenv("PROVISION_NETWORK_INTEGRATION") != "1" {
		t.Skip("requires an explicitly enabled disposable Docker CI host")
	}
	if runtime.GOOS != "linux" {
		t.Fatal("real network integration requires a disposable Linux runner")
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
	o := Options{Action: "install", Phase: "network", InstallationID: "network-ci-" + id[:12], Profile: "dell-gb10", OperationID: id, Pool: "10.248.0.0/16", RuntimeMode: "external", ControlRoot: filepath.Join(root, "control"), DataRoot: filepath.Join(root, "data"), DefinitionDigest: digest([]byte("isolated-network-ci"))}
	for _, path := range []string{o.ControlRoot, o.DataRoot} {
		if err = os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	e := Engine{Host: Host{OS: "linux", Arch: runtime.GOARCH, Actor: "uid:" + itoa(os.Geteuid())}, Now: time.Now, Runner: realNetworkRunner{docker: program}}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	views := e.networkViews(o)
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		owner, readErr := os.ReadFile(filepath.Join(o.DataRoot, "network.owner"))
		if os.IsNotExist(readErr) {
			return
		}
		if readErr != nil {
			t.Error(readErr)
			return
		}
		if cleanupErr := e.cleanupNetworkProbes(cleanupCtx, o, string(owner)); cleanupErr != nil {
			t.Error(cleanupErr)
			return
		}
		all, listErr := e.networkInventory(cleanupCtx, o)
		if listErr != nil {
			t.Error(listErr)
			return
		}
		created := map[string]string{}
		for _, view := range views {
			if n, exists := all[view.Name]; exists {
				if !e.matchesNetwork(o, view, n, string(owner)) {
					t.Error("CI refuses foreign network cleanup")
					return
				}
				created[view.Name] = n.ID
			}
		}
		if cleanupErr := e.restoreCandidateNetworks(cleanupCtx, o, string(owner), views, created, map[string]networkState{}); cleanupErr != nil {
			t.Error(cleanupErr)
		}
	})
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	for _, action := range []string{"PLATFORM_NETWORK_PROBE_IMAGE_PREPARED", "PLATFORM_NETWORKS_PREPARED"} {
		before, err := e.fingerprint(ctx, action, o)
		if err != nil {
			t.Fatal(err)
		}
		step := Step{action, "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "REQUEST_ACCEPTED"}
		if err = audit.append(step); err != nil {
			t.Fatal(err)
		}
		after, reason, err := e.apply(ctx, action, o)
		if err != nil {
			t.Fatal(err)
		}
		step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", after, reason
		if err = audit.append(step); err != nil {
			t.Fatal(err)
		}
	}
	// A second pass exercises real observation, reuse and probe cleanup.
	before, err := e.networkFingerprint(ctx, o)
	if err != nil {
		t.Fatal(err)
	}
	step := Step{"PLATFORM_NETWORKS_PREPARED", "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "REQUEST_ACCEPTED"}
	if err = audit.append(step); err != nil {
		t.Fatal(err)
	}
	proof, err := e.prepareNetworks(ctx, o)
	if err != nil {
		t.Fatal(err)
	}
	if before != digest(proof) {
		t.Fatal("retry changed the network topology")
	}
	step.Outcome, step.Phase, step.After, step.Reason = "NO_CHANGE", "COMPLETED", digest(proof), "VERIFIED"
	if err = audit.append(step); err != nil {
		t.Fatal(err)
	}
}

type realNetworkRunner struct {
	docker     string
	beforeStop func(context.Context)
}

func (r realNetworkRunner) Run(ctx context.Context, c Command) (Response, error) {
	if filepath.Base(c.Program) == "docker" {
		if r.beforeStop != nil && len(c.Args) > 3 && c.Args[2] == "container" && c.Args[3] == "stop" {
			r.beforeStop(ctx)
		}
		// The test uses only the runner's local socket, never a user-selected remote.
		c.Program = r.docker
		c.Args = append([]string{"--host", "unix:///var/run/docker.sock"}, c.Args[2:]...)
	}
	return (systemRunner{}).Run(ctx, c)
}
