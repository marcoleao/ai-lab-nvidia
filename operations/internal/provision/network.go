package provision

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/netip"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type NetworkView struct {
	Role               string `json:"role"`
	Name               string `json:"name"`
	Subnet             string `json:"subnet"`
	Internal           bool   `json:"internal"`
	DefaultHostBinding string `json:"default_host_binding"`
}
type networkState struct {
	Name, ID, Driver, Scope string
	Internal, EnableIPv6    bool
	Labels, Options         map[string]string
	IPAM                    struct {
		Driver string
		Config []struct{ Subnet, Gateway string }
	}
	Containers map[string]json.RawMessage
}
type networkResource struct {
	ID     string `json:"id"`
	Digest string `json:"digest"`
}
type networkIntent struct {
	Desired string            `json:"desired"`
	Created map[string]string `json:"created"`
}

func (e *Engine) networkViews(o Options) []NetworkView {
	pool, _ := netip.ParsePrefix(o.Pool)
	bits := 24
	if pool.Bits()+2 > bits {
		bits = pool.Bits() + 2
	}
	address := pool.Addr().As4()
	base := uint32(address[0])<<24 | uint32(address[1])<<16 | uint32(address[2])<<8 | uint32(address[3])
	views := []NetworkView{}
	for i, role := range []string{"edge", "services", "data", "executors"} {
		n := base + uint32(i)*(uint32(1)<<uint(32-bits))
		ip := netip.AddrFrom4([4]byte{byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)})
		// Docker does not activate published ports on internal-only endpoints.
		// Only the perimeter permits host publication; backends remain internal.
		views = append(views, NetworkView{role, "ai-platform-" + e.shortID(o) + "-" + role, netip.PrefixFrom(ip, bits).String(), role != "edge", "127.0.0.1"})
	}
	return views
}
func (e *Engine) dockerResponse(ctx context.Context, o Options, args ...string) (Response, error) {
	return e.Runner.Run(ctx, Command{Program: filepath.Join(o.DataRoot, "tools", "bin", "docker"), Args: append([]string{"--host", e.endpoint(o)}, args...), Env: e.runtimeEnv(o)})
}
func (e *Engine) networkImage() string {
	data, _ := sources.ReadFile("network-images.json")
	var images map[string]string
	_ = json.Unmarshal(data, &images)
	return images["linux-"+e.Host.Arch]
}
func (e *Engine) networkImageProof(ctx context.Context, o Options) ([]byte, error) {
	r, err := e.dockerResponse(ctx, o, "image", "inspect", e.networkImage())
	if err != nil {
		return nil, err
	}
	if r.ExitCode != 0 {
		if strings.Contains(strings.ToLower(r.Output), "no such image:") {
			return nil, nil
		}
		return nil, codedError("PLATFORM_NETWORK_IMAGE_INSPECTION_FAILED")
	}
	var values []struct {
		ID, Architecture, Os string
		RepoDigests          []string
	}
	if json.Unmarshal([]byte(r.Output), &values) != nil || len(values) != 1 || values[0].Os != "linux" || values[0].Architecture != e.Host.Arch || !strings.HasPrefix(values[0].ID, "sha256:") {
		return nil, codedError("PLATFORM_NETWORK_IMAGE_INVALID")
	}
	wanted := familiarProbeImage(e.networkImage())
	for _, reference := range values[0].RepoDigests {
		reference = familiarProbeImage(reference)
		if reference == wanted {
			return jsonBytes(map[string]string{"reference": e.networkImage(), "id": values[0].ID, "architecture": values[0].Architecture}), nil
		}
	}
	return nil, codedError("PLATFORM_NETWORK_IMAGE_DIGEST_MISMATCH")
}
func (e *Engine) networkImageFingerprint(ctx context.Context, o Options) (string, error) {
	proof, err := e.networkImageProof(ctx, o)
	if len(proof) == 0 && err == nil {
		return "ABSENT", nil
	}
	return digest(proof), err
}
func (e *Engine) prepareNetworkImage(ctx context.Context, o Options) ([]byte, error) {
	proof, err := e.networkImageProof(ctx, o)
	if err != nil || proof != nil {
		return proof, err
	}
	if _, err = e.docker(ctx, o, "pull", "--platform", "linux/"+e.Host.Arch, e.networkImage()); err != nil {
		return nil, err
	}
	proof, err = e.networkImageProof(ctx, o)
	if err == nil && proof == nil {
		err = codedError("PLATFORM_NETWORK_IMAGE_NOT_OBSERVED")
	}
	return proof, err
}
func (e *Engine) networkInventory(ctx context.Context, o Options) (map[string]networkState, error) {
	r, err := e.docker(ctx, o, "network", "ls", "--quiet", "--no-trunc")
	if err != nil {
		return nil, err
	}
	all := map[string]networkState{}
	for _, id := range strings.Fields(r.Output) {
		if !hashPattern.MatchString(id) {
			return nil, codedError("PLATFORM_NETWORK_INVENTORY_INVALID")
		}
		r, err = e.docker(ctx, o, "network", "inspect", id)
		if err != nil {
			return nil, err
		}
		var values []networkState
		if json.Unmarshal([]byte(r.Output), &values) != nil || len(values) != 1 || values[0].ID != id || values[0].Name == "" {
			return nil, codedError("PLATFORM_NETWORK_INVENTORY_INVALID")
		}
		if _, exists := all[values[0].Name]; exists {
			return nil, codedError("PLATFORM_NETWORK_INVENTORY_INVALID")
		}
		all[values[0].Name] = values[0]
	}
	return all, nil
}
func (e *Engine) networkLabels(o Options, v NetworkView, owner string) map[string]string {
	return map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.component": "network", "ai.platform.owner": owner, "ai.platform.role": v.Role, "ai.platform.spec": digest(jsonBytes(v))}
}
func networkOptions() map[string]string {
	return map[string]string{"com.docker.network.bridge.enable_icc": "true", "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1", "com.docker.network.bridge.enable_ip_masquerade": "false"}
}
func familiarProbeImage(reference string) string {
	return strings.TrimPrefix(strings.TrimPrefix(reference, "docker.io/"), "library/")
}
func (e *Engine) ownsNetwork(o Options, v NetworkView, n networkState, owner string) bool {
	if n.Name != v.Name || n.Driver != "bridge" || n.Scope != "local" {
		return false
	}
	for key, value := range e.networkLabels(o, v, owner) {
		if n.Labels[key] != value {
			return false
		}
	}
	return true
}
func (e *Engine) matchesNetwork(o Options, v NetworkView, n networkState, owner string) bool {
	if !e.ownsNetwork(o, v, n, owner) || n.Internal != v.Internal || n.EnableIPv6 || n.IPAM.Driver != "default" || len(n.IPAM.Config) != 1 || n.IPAM.Config[0].Subnet != v.Subnet {
		return false
	}
	if string(jsonBytes(n.Options)) != string(jsonBytes(networkOptions())) {
		return false
	}
	prefix, _ := netip.ParsePrefix(v.Subnet)
	if n.IPAM.Config[0].Gateway != prefix.Addr().Next().String() {
		return false
	}
	return true
}
func randomIdentity() (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(data[:]), nil
}
func networkControl(o Options, name string, destination any) error {
	path := filepath.Join(o.DataRoot, name)
	if err := plain(path); err != nil {
		return err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if json.Unmarshal(data, destination) != nil {
		return codedError("PLATFORM_NETWORK_CONTROL_INVALID")
	}
	return nil
}
func (e *Engine) networkFingerprint(ctx context.Context, o Options) (string, error) {
	all, err := e.networkInventory(ctx, o)
	if err != nil {
		return "", err
	}
	return digest(networkProof(e.networkViews(o), all)), nil
}
func networkProof(views []NetworkView, all map[string]networkState) []byte {
	resources := map[string]networkResource{}
	for _, v := range views {
		if n, ok := all[v.Name]; ok {
			// Endpoints are live application state, outside the network revision.
			n.Containers = nil
			resources[v.Name] = networkResource{n.ID, digest(jsonBytes(n))}
		}
	}
	return jsonBytes(resources)
}
func (e *Engine) prepareNetworks(ctx context.Context, o Options) ([]byte, error) {
	views := e.networkViews(o)
	all, err := e.networkInventory(ctx, o)
	if err != nil {
		return nil, err
	}
	ownerPath := filepath.Join(o.DataRoot, "network.owner")
	if err = plain(ownerPath); err != nil {
		return nil, err
	}
	ownerBytes, err := os.ReadFile(ownerPath)
	if os.IsNotExist(err) {
		owner, err := randomIdentity()
		if err != nil {
			return nil, err
		}
		if err = atomicFile(ownerPath, []byte(owner), 0600); err != nil {
			return nil, err
		}
		ownerBytes = []byte(owner)
	} else if err != nil {
		return nil, err
	}
	owner := string(ownerBytes)
	if len(owner) != 32 || !operationPattern.MatchString(owner) {
		return nil, codedError("PLATFORM_NETWORK_CONTROL_INVALID")
	}
	known := map[string]networkResource{}
	if err = networkControl(o, "network.resources.json", &known); err != nil {
		return nil, err
	}
	committed := map[string]networkState{}
	for name, n := range all {
		if known[name].ID == n.ID {
			committed[name] = n
		}
	}
	intent := networkIntent{}
	if err = networkControl(o, "network.intent.json", &intent); err != nil {
		return nil, err
	}
	desired := digest(jsonBytes(views))
	if intent.Desired != "" && intent.Desired != desired {
		return nil, codedError("PLATFORM_NETWORK_MIGRATION_REQUIRED")
	}
	for _, v := range views {
		if n, exists := all[v.Name]; exists {
			if !e.matchesNetwork(o, v, n, owner) {
				return nil, codedError("PLATFORM_NETWORK_OWNERSHIP_OR_CONFIGURATION_CONFLICT")
			}
			if known[v.Name].ID != n.ID && (intent.Desired != desired || intent.Created[v.Name] != "" && intent.Created[v.Name] != n.ID) {
				return nil, codedError("PLATFORM_NETWORK_UNCLAIMED_RESOURCE")
			}
		}
	}
	if err = e.checkNetworkConflicts(ctx, o, views, all); err != nil {
		return nil, err
	}
	if err = e.cleanupNetworkProbes(ctx, o, owner); err != nil {
		return nil, err
	}
	if intent.Created == nil {
		intent.Created = map[string]string{}
	}
	intent.Desired = desired
	intentPath := filepath.Join(o.DataRoot, "network.intent.json")
	if err = atomicFile(intentPath, jsonBytes(intent), 0600); err != nil {
		return nil, err
	}
	// Anything not in the committed manifest is a candidate from this transaction.
	for _, v := range views {
		if n, ok := all[v.Name]; ok && known[v.Name].ID != n.ID {
			intent.Created[v.Name] = n.ID
		}
	}
	applyErr := func() error {
		for _, v := range views {
			if _, exists := all[v.Name]; exists {
				continue
			}
			prefix, _ := netip.ParsePrefix(v.Subnet)
			args := []string{"network", "create", "--driver", "bridge", "--ipv6=false", "--subnet", v.Subnet, "--gateway", prefix.Addr().Next().String(), "--ipam-driver", "default"}
			if v.Internal {
				args = append(args, "--internal")
			}
			labels := e.networkLabels(o, v, owner)
			keys := []string{}
			for key := range labels {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				args = append(args, "--label", key+"="+labels[key])
			}
			options := networkOptions()
			keys = nil
			for key := range options {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				args = append(args, "--opt", key+"="+options[key])
			}
			args = append(args, v.Name)
			_, createErr := e.docker(ctx, o, args...)
			observed, observeErr := e.networkInventory(ctx, o)
			if observeErr != nil {
				return observeErr
			}
			n, exists := observed[v.Name]
			if exists && e.ownsNetwork(o, v, n, owner) {
				intent.Created[v.Name] = n.ID
				all = observed
				if err = atomicFile(intentPath, jsonBytes(intent), 0600); err != nil {
					return err
				}
				if !e.matchesNetwork(o, v, n, owner) {
					return codedError("PLATFORM_NETWORK_CONFIGURATION_UNCONFIRMED")
				}
				continue // A lost reply is reconciled by ID, labels and configuration.
			}
			if createErr != nil {
				return createErr
			}
			return codedError("PLATFORM_NETWORK_CREATION_UNCONFIRMED")
		}
		return e.verifyNetworkIsolation(ctx, o, owner, views, all)
	}()
	if applyErr != nil {
		if err = e.restoreCandidateNetworks(ctx, o, owner, views, intent.Created, committed); err != nil {
			return nil, fmt.Errorf("%w: initial=%v", err, applyErr)
		}
		if err = os.Remove(intentPath); err != nil {
			return nil, err
		}
		return nil, &restoredError{cause: applyErr, after: digest(networkProof(views, committed))}
	}
	all, err = e.networkInventory(ctx, o)
	if err != nil {
		return nil, err
	}
	for _, v := range views {
		if !e.matchesNetwork(o, v, all[v.Name], owner) {
			return nil, codedError("PLATFORM_NETWORK_POSTCHECK_FAILED")
		}
	}
	proof := networkProof(views, all)
	if err = atomicFile(filepath.Join(o.DataRoot, "network.resources.json"), proof, 0600); err != nil {
		return nil, err
	}
	if err = os.Remove(intentPath); err != nil {
		return nil, err
	}
	return proof, nil
}
func (e *Engine) restoreCandidateNetworks(ctx context.Context, o Options, owner string, views []NetworkView, created map[string]string, committed map[string]networkState) error {
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	step := Step{"PLATFORM_NETWORKS_RESTORED", "ACCEPTED", "REQUESTED", digest(jsonBytes(created)), "NOT_OBSERVED", "COMPENSATION_REQUESTED"}
	if err := audit.append(step); err != nil {
		return err
	}
	rollbackErr := func() error {
		if err := e.cleanupNetworkProbes(ctx, o, owner); err != nil {
			return err
		}
		all, err := e.networkInventory(ctx, o)
		if err != nil {
			return err
		}
		for _, v := range views {
			id, ok := created[v.Name]
			if !ok {
				continue
			}
			n, exists := all[v.Name]
			if !exists {
				continue
			}
			if n.ID != id || !e.ownsNetwork(o, v, n, owner) || len(n.Containers) != 0 {
				return codedError("PLATFORM_NETWORK_ROLLBACK_CONFLICT")
			}
			if _, err = e.docker(ctx, o, "network", "rm", id); err != nil {
				return err
			}
		}
		all, err = e.networkInventory(ctx, o)
		if err != nil {
			return err
		}
		for name := range created {
			if _, exists := all[name]; exists {
				return codedError("PLATFORM_NETWORK_ROLLBACK_UNCONFIRMED")
			}
		}
		if string(networkProof(views, all)) != string(networkProof(views, committed)) {
			return codedError("PLATFORM_NETWORK_ROLLBACK_UNCONFIRMED")
		}
		return nil
	}()
	if rollbackErr != nil {
		step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(rollbackErr)
	} else {
		step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", digest(networkProof(views, committed)), "COMPENSATION_VERIFIED"
	}
	if err := audit.append(step); err != nil {
		return err
	}
	return rollbackErr
}

func (e *Engine) checkNetworkConflicts(ctx context.Context, o Options, views []NetworkView, all map[string]networkState) error {
	for _, v := range views {
		wanted, _ := netip.ParsePrefix(v.Subnet)
		for name, n := range all {
			for _, config := range n.IPAM.Config {
				if name == v.Name {
					continue
				}
				prefix, err := netip.ParsePrefix(config.Subnet)
				if err != nil {
					return codedError("PLATFORM_NETWORK_IPAM_INVALID")
				}
				if prefix.Overlaps(wanted) {
					return codedError("PLATFORM_NETWORK_SUBNET_CONFLICT")
				}
			}
		}
	}
	command := Command{Program: "/usr/sbin/ip", Args: []string{"-j", "-4", "route", "show"}}
	if e.Host.OS == "darwin" {
		command = Command{Program: filepath.Join(o.DataRoot, "tools", "bin", "colima"), Args: []string{"ssh", "--profile", e.profileName(o), "--", "ip", "-j", "-4", "route", "show"}, Env: e.runtimeEnv(o)}
	}
	r, err := e.command(ctx, command)
	if err != nil {
		return err
	}
	var routes []struct {
		Destination string `json:"dst"`
		Device      string `json:"dev"`
	}
	if json.Unmarshal([]byte(r.Output), &routes) != nil {
		return codedError("PLATFORM_ROUTE_PROBE_INVALID")
	}
	for _, route := range routes {
		if route.Destination == "default" {
			continue
		}
		prefix, err := routePrefix(route.Destination)
		if err != nil {
			return err
		}
		for _, v := range views {
			wanted, _ := netip.ParsePrefix(v.Subnet)
			if !prefix.Overlaps(wanted) {
				continue
			}
			n, exists := all[v.Name]
			bridge := "br-" + n.ID[:min(12, len(n.ID))]
			if value := n.Options["com.docker.network.bridge.name"]; value != "" {
				bridge = value
			}
			if exists && prefix == wanted && route.Device == bridge {
				continue
			}
			return codedError("PLATFORM_NETWORK_ROUTE_CONFLICT")
		}
	}
	if e.Host.OS == "darwin" {
		r, err = e.command(ctx, Command{Program: "/usr/sbin/netstat", Args: []string{"-rn", "-f", "inet"}})
		if err != nil {
			return err
		}
		for _, line := range strings.Split(r.Output, "\n") {
			fields := strings.Fields(line)
			if len(fields) < 3 || fields[0] == "default" || fields[0] == "Destination" || fields[0] == "Routing" {
				continue
			}
			if fields[0] == "Internet:" {
				continue
			}
			prefix, err := routePrefix(fields[0])
			if err != nil {
				return err
			}
			for _, v := range views {
				wanted, _ := netip.ParsePrefix(v.Subnet)
				if prefix.Overlaps(wanted) {
					return codedError("PLATFORM_NETWORK_ROUTE_CONFLICT")
				}
			}
		}
	}
	return nil
}

// BSD netstat permits abbreviated IPv4 destinations such as 10/8 and 10.2.
func routePrefix(value string) (netip.Prefix, error) {
	if p, err := netip.ParsePrefix(value); err == nil {
		return p, nil
	}
	address, bits, hasBits := strings.Cut(value, "/")
	parts := strings.Split(address, ".")
	if len(parts) > 4 {
		return netip.Prefix{}, codedError("PLATFORM_ROUTE_PROBE_INVALID")
	}
	length := len(parts) * 8
	if hasBits {
		n, err := strconv.Atoi(bits)
		if err != nil || n < 0 || n > 32 {
			return netip.Prefix{}, codedError("PLATFORM_ROUTE_PROBE_INVALID")
		}
		length = n
	}
	for len(parts) < 4 {
		parts = append(parts, "0")
	}
	ip, err := netip.ParseAddr(strings.Join(parts, "."))
	if err != nil || !ip.Is4() {
		return netip.Prefix{}, codedError("PLATFORM_ROUTE_PROBE_INVALID")
	}
	return netip.PrefixFrom(ip, length).Masked(), nil
}
