package provision

import (
	"context"
	"encoding/json"
	"fmt"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

type fakeNetworkEngine struct {
	badCreatedOptions                                                                 bool
	base                                                                              *fakeRunner
	networks                                                                          map[string]networkState
	containers                                                                        map[string]probeContainer
	markers                                                                           map[string]string
	image                                                                             bool
	pulls, creates, removes, allowed, denied                                          int
	failCreateAt                                                                      int
	lostReply, allowCross, egress, foreignEndpoint, cleanupFail, wrongArch, denyCrash bool
	macRoutes                                                                         string
}

func newFakeNetworkEngine(base *fakeRunner) *fakeNetworkEngine {
	return &fakeNetworkEngine{base: base, networks: map[string]networkState{}, containers: map[string]probeContainer{}, markers: map[string]string{}}
}
func option(args []string, name string) string {
	for i, a := range args {
		if a == name && i+1 < len(args) {
			return args[i+1]
		}
	}
	return ""
}
func repeated(args []string, name string) map[string]string {
	result := map[string]string{}
	for i, a := range args {
		if a == name && i+1 < len(args) {
			key, value, _ := strings.Cut(args[i+1], "=")
			result[key] = value
		}
	}
	return result
}
func (f *fakeNetworkEngine) run(args []string) (Response, error) {
	encoded := func(value any) (Response, error) { return Response{Output: string(jsonBytes(value))}, nil }
	switch args[0] {
	case "image":
		if !f.image {
			return Response{ExitCode: 1, Output: "Error: No such image: fixture"}, nil
		}
		arch := f.base.e.Host.Arch
		if f.wrongArch {
			arch = "wrong"
		}
		return encoded([]map[string]any{{"Id": "sha256:" + digest([]byte("image-config")), "Os": "linux", "Architecture": arch, "RepoDigests": []string{f.base.e.networkImage()}}})
	case "pull":
		f.pulls++
		f.image = true
		return Response{}, nil
	case "network":
		switch args[1] {
		case "ls":
			ids := []string{}
			for _, n := range f.networks {
				ids = append(ids, n.ID)
			}
			sort.Strings(ids)
			return Response{Output: strings.Join(ids, "\n")}, nil
		case "inspect":
			for _, n := range f.networks {
				if n.ID == args[2] {
					return encoded([]networkState{n})
				}
			}
			return Response{ExitCode: 1}, nil
		case "create":
			f.creates++
			if f.failCreateAt == f.creates {
				return Response{ExitCode: 9, Output: "private network creation failure"}, nil
			}
			name := args[len(args)-1]
			n := networkState{Name: name, ID: digest([]byte(fmt.Sprint(name, f.creates))), Driver: option(args, "--driver"), Scope: "local", Internal: contains(args, "--internal"), Labels: repeated(args, "--label"), Options: repeated(args, "--opt"), Containers: map[string]json.RawMessage{}}
			n.IPAM.Driver = option(args, "--ipam-driver")
			prefix, _ := netip.ParsePrefix(option(args, "--subnet"))
			n.IPAM.Config = append(n.IPAM.Config, struct{ Subnet, Gateway string }{prefix.String(), option(args, "--gateway")})
			if f.badCreatedOptions {
				n.Options["com.docker.network.bridge.host_binding_ipv4"] = "0.0.0.0"
			}
			f.networks[name] = n
			if f.lostReply {
				f.lostReply = false
				return Response{ExitCode: 1, Output: "response lost after creation"}, nil
			}
			return Response{Output: n.ID}, nil
		case "rm":
			for name, n := range f.networks {
				if n.ID == args[2] {
					if len(n.Containers) != 0 {
						f.base.t.Fatal("disconnected a live endpoint")
					}
					delete(f.networks, name)
					f.removes++
					return Response{}, nil
				}
			}
		}
	case "container":
		switch args[1] {
		case "inspect":
			if c, ok := f.containers[args[2]]; ok {
				return encoded([]probeContainer{c})
			}
			return Response{ExitCode: 1, Output: "Error: No such container: fixture"}, nil
		case "rm":
			if f.cleanupFail {
				return Response{ExitCode: 1}, nil
			}
			id := args[len(args)-1]
			for name, c := range f.containers {
				if c.ID == id {
					for network, n := range f.networks {
						delete(n.Containers, id)
						f.networks[network] = n
					}
					delete(f.containers, name)
					delete(f.markers, name)
					return Response{}, nil
				}
			}
		}
	case "run":
		name := option(args, "--name")
		network := option(args, "--network")
		n, exists := f.networks[network]
		if !exists {
			return Response{ExitCode: 125}, nil
		}
		if option(args, "--pull") != "never" || !contains(args, "--read-only") || option(args, "--cap-drop") != "ALL" || option(args, "--user") != "65534:65534" || option(args, "--security-opt") != "no-new-privileges=true" || contains(args, "--privileged") || strings.Contains(strings.Join(args, " "), "--publish") || contains(args, "--volume") || contains(args, "-v") || contains(args, "--mount") {
			f.base.t.Fatal("unsafe network probe", args)
		}
		imageIndex := -1
		for i, a := range args {
			if a == f.base.e.networkImage() {
				imageIndex = i
				break
			}
		}
		if imageIndex < 0 {
			f.base.t.Fatal("unpinned probe image")
		}
		command := args[imageIndex+1:]
		if option(args, "--detach") != "" || contains(args, "--detach") {
			c := probeContainer{ID: digest([]byte(name)), Name: "/" + name}
			c.Config.Image = familiarProbeImage(f.base.e.networkImage())
			c.Config.Labels = repeated(args, "--label")
			c.HostConfig.NetworkMode = network
			c.State.Running = true
			prefix, _ := netip.ParsePrefix(n.IPAM.Config[0].Subnet)
			ip := prefix.Addr().Next().Next().String()
			c.NetworkSettings.Networks = map[string]struct{ IPAddress string }{network: {ip}}
			f.containers[name] = c
			f.markers[name] = command[len(command)-1]
			n.Containers[c.ID] = json.RawMessage(`{}`)
			f.networks[network] = n
			return Response{Output: c.ID}, nil
		}
		if command[0] == "ip" {
			if !f.networks[network].Internal {
				return Response{Output: "default via " + f.networks[network].IPAM.Config[0].Gateway + " dev eth0\n"}, nil
			}
			if f.egress {
				return Response{Output: "default via 10.248.0.1\n"}, nil
			}
			return Response{}, nil
		}
		if command[0] == "wget" {
			u, _ := url.Parse(command[len(command)-1])
			host := u.Hostname()
			for target, c := range f.containers {
				if target == host {
					if c.HostConfig.NetworkMode != network {
						f.base.t.Fatal("same-network request lost scope")
					}
					f.allowed++
					return Response{Output: f.markers[target]}, nil
				}
				for _, attachment := range c.NetworkSettings.Networks {
					if attachment.IPAddress == host {
						f.denied++
						if f.foreignEndpoint {
							n := f.networks[network]
							n.Containers["foreign"] = json.RawMessage(`{}`)
							f.networks[network] = n
						}
						if f.allowCross {
							return Response{Output: f.markers[target]}, nil
						}
						if f.denyCrash {
							return Response{ExitCode: 125}, nil
						}
						return Response{ExitCode: 1}, nil
					}
				}
			}
		}
	}
	return Response{}, fmt.Errorf("unexpected fixture network command: %v", args)
}
func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}

func networkFixture(t *testing.T, profile string) (*Engine, *fakeNetworkEngine, Options) {
	e, runner, _, o := fixtureEngine(t, profile)
	n := newFakeNetworkEngine(runner)
	runner.network = n
	return e, n, o
}
func TestPrivateNetworksAllProfilesAndRetry(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, n, o := networkFixture(t, profile)
			r, err := e.Run(context.Background(), o)
			if err != nil || !r.NetworkReady || !r.RuntimeReady || r.InstallationReady || len(r.Networks) != 4 {
				t.Fatalf("network install: %+v %v", r, err)
			}
			if n.creates != 4 || n.pulls != 1 || n.denied != 12 || n.allowed != 8 || len(n.containers) != 0 {
				t.Fatalf("proof/cleanup incomplete: %+v", n)
			}
			for _, v := range r.Networks {
				if v.Internal != (v.Role != "edge") || v.DefaultHostBinding != "127.0.0.1" {
					t.Fatal("network exposed", v)
				}
			}
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.NetworkReady || n.creates != 4 || n.pulls != 1 || n.denied != 24 {
				t.Fatalf("retry: %+v %v", r, err)
			}
			if rows := readLedger(t, o); !strings.Contains(rows[len(rows)-1].Record, `"outcome":"NO_CHANGE"`) {
				t.Fatal("unchanged topology not observed")
			}
		})
	}
}
func TestNetworkPlanNoEffectsAndSmallPool(t *testing.T) {
	e, n, o := networkFixture(t, "dell-gb10")
	o.Action = "plan"
	o.Pool = "10.248.0.0/24"
	r, err := e.Run(context.Background(), o)
	if err != nil || r.NetworkReady || !r.Planned || len(n.base.calls) != 0 || len(r.Networks) != 4 {
		t.Fatal(r, err)
	}
	if r.Networks[3].Subnet != "10.248.0.192/26" {
		t.Fatal("small pool not partitioned", r.Networks)
	}
}
func TestNetworkCreateFailureRollbackAndLostReply(t *testing.T) {
	e, n, o := networkFixture(t, "precision-windows")
	n.failCreateAt = 3
	r, err := e.Run(context.Background(), o)
	if err != nil || r.Outcome != "FAILED" || r.NetworkReady || !r.RuntimeReady || len(n.networks) != 0 || n.removes != 2 {
		t.Fatal(r, err, n.networks)
	}
	n.failCreateAt = 0
	n.lostReply = true
	r, err = e.Run(context.Background(), o)
	if err != nil || !r.NetworkReady || len(n.networks) != 4 {
		t.Fatal("lost reply not reconciled", r, err)
	}
}
func TestIsolationFailureIsNeverReadiness(t *testing.T) {
	for _, mode := range []string{"cross", "egress", "crash", "foreign-endpoint", "cleanup"} {
		t.Run(mode, func(t *testing.T) {
			e, n, o := networkFixture(t, "precision-windows")
			switch mode {
			case "cross":
				n.allowCross = true
			case "egress":
				n.egress = true
			case "crash":
				n.denyCrash = true
			case "foreign-endpoint":
				n.allowCross = true
				n.foreignEndpoint = true
			case "cleanup":
				n.cleanupFail = true
			}
			r, err := e.Run(context.Background(), o)
			if err != nil || r.NetworkReady || r.Outcome == "SUCCEEDED" {
				t.Fatal("bad isolation qualified", r, err)
			}
			if mode == "foreign-endpoint" || mode == "cleanup" {
				if r.Outcome != "UNKNOWN" || len(n.networks) == 0 {
					t.Fatal("unconfirmed compensation lost", r)
				}
			} else if r.Outcome != "FAILED" || len(n.networks) != 0 {
				t.Fatal("candidate rollback failed", r)
			}
		})
	}
}
func TestNetworkOwnershipDriftAndSubnetConflict(t *testing.T) {
	for _, mode := range []string{"owner", "options", "internal", "id", "subnet", "route", "mac-vpn"} {
		t.Run(mode, func(t *testing.T) {
			profile := "precision-windows"
			if mode == "mac-vpn" {
				profile = "macos-m3-max"
			}
			e, n, o := networkFixture(t, profile)
			r, err := e.Run(context.Background(), o)
			if err != nil || !r.NetworkReady {
				t.Fatal(r, err)
			}
			v := e.networkViews(o)[0]
			net := n.networks[v.Name]
			switch mode {
			case "owner":
				net.Labels["ai.platform.owner"] = "foreign"
				n.networks[v.Name] = net
			case "options":
				net.Options["com.docker.network.bridge.host_binding_ipv4"] = "0.0.0.0"
				n.networks[v.Name] = net
			case "internal":
				net.Internal = true
				n.networks[v.Name] = net
			case "id":
				net.ID = digest([]byte("replacement"))
				n.networks[v.Name] = net
			case "subnet":
				net.Name = "foreign"
				net.ID = digest([]byte("foreign"))
				n.networks[net.Name] = net
			case "route":
				n.base.route = `[{"dst":"10.0.0.0/8","dev":"vpn0"}]`
			case "mac-vpn":
				n.macRoutes = "Routing tables\nInternet:\nDestination Gateway Flags Netif\n10/8 192.168.5.1 UGSc utun0\n"
			}
			o.Phase = "network"
			r, err = e.Run(context.Background(), o)
			if err != nil || r.NetworkReady || r.Outcome == "SUCCEEDED" || n.creates != 4 {
				t.Fatal("drift adopted or recreated", r, err)
			}
		})
	}
}
func TestNetworkStageRequiresObservedRuntime(t *testing.T) {
	e, n, o := networkFixture(t, "precision-windows")
	o.Phase = "network"
	if _, err := e.Run(context.Background(), o); code(err) != "PLATFORM_RUNTIME_PREPARATION_REQUIRED" || n.creates != 0 || n.pulls != 0 {
		t.Fatal("runtime prerequisite ignored", err)
	}
}
func TestNetworkPoolMigrationDoesNotDestroyData(t *testing.T) {
	e, n, o := networkFixture(t, "precision-windows")
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.NetworkReady {
		t.Fatal(r, err)
	}
	o.Phase = "network"
	o.Pool = "10.247.0.0/16"
	n.base.o = o
	r, err = e.Run(context.Background(), o)
	if err != nil || r.NetworkReady || n.removes != 0 || n.creates != 4 {
		t.Fatal("destructive subnet migration", r, err)
	}
	if _, err = os.Stat(filepath.Join(o.DataRoot, "network.resources.json")); err != nil {
		t.Fatal("manifest lost", err)
	}
}

func TestNetworkIsolationFailurePreservesCommittedEndpoints(t *testing.T) {
	e, n, o := networkFixture(t, "precision-windows")
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.NetworkReady {
		t.Fatal(r, err)
	}
	v := e.networkViews(o)[0]
	net := n.networks[v.Name]
	net.Containers["application-fixture"] = json.RawMessage(`{}`)
	n.networks[v.Name] = net
	n.allowCross = true
	o.Phase = "network"
	r, err = e.Run(context.Background(), o)
	if err != nil || r.NetworkReady || r.Outcome != "FAILED" || n.removes != 0 || len(n.networks[v.Name].Containers) != 1 {
		t.Fatal("existing application endpoint changed", r, err)
	}
}
func TestWrongNetworkImageArchitectureCannotCreateNetworks(t *testing.T) {
	e, n, o := networkFixture(t, "precision-windows")
	n.wrongArch = true
	r, err := e.Run(context.Background(), o)
	if err != nil || r.NetworkReady || n.creates != 0 || r.Reason != "PLATFORM_NETWORK_IMAGE_INVALID" {
		t.Fatal("wrong image used", r, err)
	}
}
func TestOwnedBridgeRouteIsRecognized(t *testing.T) {
	e, n, o := networkFixture(t, "precision-windows")
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.NetworkReady {
		t.Fatal(r, err)
	}
	v := e.networkViews(o)[0]
	net := n.networks[v.Name]
	n.base.route = string(jsonBytes([]map[string]string{{"dst": v.Subnet, "dev": "br-" + net.ID[:12]}}))
	o.Phase = "network"
	r, err = e.Run(context.Background(), o)
	if err != nil || !r.NetworkReady || n.creates != 4 {
		t.Fatal("own route treated as conflict", r, err)
	}
}

func TestNetworkProbeManifestHasTwoPinnedArchitectures(t *testing.T) {
	data, err := sources.ReadFile("network-images.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest map[string]string
	if json.Unmarshal(data, &manifest) != nil {
		t.Fatal("image manifest invalid")
	}
	for _, arch := range []string{"amd64", "arm64"} {
		e := Engine{Host: Host{Arch: arch}}
		reference := e.networkImage()
		if !strings.HasPrefix(reference, "docker.io/library/busybox@sha256:") || !hashPattern.MatchString(strings.TrimPrefix(reference, "docker.io/library/busybox@sha256:")) {
			t.Fatal("probe image is not pinned", arch)
		}
	}
	if manifest["linux-amd64"] == manifest["linux-arm64"] {
		t.Fatal("architecture manifests were conflated")
	}
}

func TestInterruptedProbeCleanupCanResumeWithoutRecreatingNetworks(t *testing.T) {
	e, n, o := networkFixture(t, "precision-windows")
	n.cleanupFail = true
	r, err := e.Run(context.Background(), o)
	if err != nil || r.Outcome != "UNKNOWN" || len(n.containers) != 4 || n.creates != 4 {
		t.Fatal("interruption fixture did not preserve candidates", r, err)
	}
	n.cleanupFail = false
	o.Phase = "network"
	r, err = e.Run(context.Background(), o)
	if err != nil || !r.NetworkReady || n.creates != 4 || len(n.containers) != 0 {
		t.Fatal("interrupted probes were adopted/recreated or leaked", r, err)
	}
	if _, err = os.Stat(filepath.Join(o.DataRoot, "network.probes.json")); !os.IsNotExist(err) {
		t.Fatal("probe intent survived verified cleanup", err)
	}
}

func TestOwnedCandidateWithUnconfirmedOptionsCanBeCompensated(t *testing.T) {
	e, n, o := networkFixture(t, "precision-windows")
	n.badCreatedOptions = true
	r, err := e.Run(context.Background(), o)
	if err != nil || r.NetworkReady || r.Outcome != "FAILED" || n.removes != 1 || len(n.networks) != 0 {
		t.Fatal("own incompatible candidate leaked or qualified", r, err)
	}
}
