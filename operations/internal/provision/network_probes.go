package provision

import (
	"context"
	"encoding/json"
	"fmt"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type networkProbe struct {
	Name, Network, Nonce, Image string
}
type probeContainer struct {
	ID, Name string
	Config   struct {
		Image  string
		Labels map[string]string
	}
	HostConfig      struct{ NetworkMode string }
	State           struct{ Running bool }
	NetworkSettings struct {
		Networks map[string]struct{ IPAddress string }
	}
}

func (e *Engine) probeLabels(o Options, owner string, p networkProbe) map[string]string {
	return map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.component": "network-probe", "ai.platform.owner": owner, "ai.platform.probe": p.Nonce}
}
func (e *Engine) readNetworkProbe(ctx context.Context, o Options, p networkProbe) (*probeContainer, error) {
	r, err := e.dockerResponse(ctx, o, "container", "inspect", p.Name)
	if err != nil {
		return nil, err
	}
	if r.ExitCode != 0 {
		text := strings.ToLower(r.Output)
		if strings.Contains(text, "no such container:") || strings.Contains(text, "no such object:") {
			return nil, nil
		}
		return nil, codedError("PLATFORM_NETWORK_PROBE_INSPECTION_FAILED")
	}
	var values []probeContainer
	if json.Unmarshal([]byte(r.Output), &values) != nil || len(values) != 1 || !hashPattern.MatchString(values[0].ID) {
		return nil, codedError("PLATFORM_NETWORK_PROBE_INVALID")
	}
	return &values[0], nil
}
func (e *Engine) matchesNetworkProbe(o Options, owner string, p networkProbe, c *probeContainer) bool {
	if c.Name != "/"+p.Name || familiarProbeImage(c.Config.Image) != familiarProbeImage(p.Image) || c.HostConfig.NetworkMode != p.Network {
		return false
	}
	for key, value := range e.probeLabels(o, owner, p) {
		if c.Config.Labels[key] != value {
			return false
		}
	}
	return true
}
func (e *Engine) cleanupNetworkProbes(ctx context.Context, o Options, owner string) error {
	path := filepath.Join(o.DataRoot, "network.probes.json")
	var pending []networkProbe
	if err := networkControl(o, "network.probes.json", &pending); err != nil {
		return err
	}
	allowed := map[string]bool{}
	for _, v := range e.networkViews(o) {
		allowed[v.Name] = true
	}
	for _, p := range pending {
		if !validID(p.Name) || !strings.HasPrefix(p.Name, "ai-platform-"+e.shortID(o)+"-probe-") || !allowed[p.Network] || len(p.Nonce) != 32 || !operationPattern.MatchString(p.Nonce) || p.Image != e.networkImage() {
			return codedError("PLATFORM_NETWORK_PROBE_JOURNAL_INVALID")
		}
		c, err := e.readNetworkProbe(ctx, o, p)
		if err != nil {
			return err
		}
		if c == nil {
			continue
		}
		if !e.matchesNetworkProbe(o, owner, p, c) {
			return codedError("PLATFORM_NETWORK_PROBE_OWNERSHIP_CONFLICT")
		}
		if _, err = e.docker(ctx, o, "container", "rm", "--force", c.ID); err != nil {
			return err
		}
		if remaining, err := e.readNetworkProbe(ctx, o, p); err != nil || remaining != nil {
			return codedError("PLATFORM_NETWORK_PROBE_CLEANUP_UNCONFIRMED")
		}
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
func (e *Engine) verifyNetworkIsolation(ctx context.Context, o Options, owner string, views []NetworkView, all map[string]networkState) (finalErr error) {
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if err := e.cleanupNetworkProbes(cleanupCtx, o, owner); err != nil {
			finalErr = fmt.Errorf("%w: original=%v", err, finalErr)
		}
	}()
	nonce, err := randomIdentity()
	if err != nil {
		return err
	}
	pending := []networkProbe{}
	sequence := 0
	register := func(network string) (networkProbe, error) {
		sequence++
		p := networkProbe{fmt.Sprintf("ai-platform-%s-probe-%s-%d", e.shortID(o), nonce[:12], sequence), network, nonce, e.networkImage()}
		pending = append(pending, p)
		if err := atomicFile(filepath.Join(o.DataRoot, "network.probes.json"), jsonBytes(pending), 0600); err != nil {
			return p, err
		}
		if existing, err := e.readNetworkProbe(ctx, o, p); err != nil {
			return p, err
		} else if existing != nil {
			return p, codedError("PLATFORM_NETWORK_PROBE_NAME_CONFLICT")
		}
		return p, nil
	}
	argsFor := func(p networkProbe) []string {
		args := []string{"run", "--pull", "never", "--name", p.Name, "--network", p.Network, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges=true", "--user", "65534:65534", "--memory", "32m", "--pids-limit", "32", "--cpus", "0.25", "--tmpfs", "/tmp:rw,noexec,nosuid,mode=1777,size=65536"}
		for _, key := range []string{"ai.platform.installation", "ai.platform.profile", "ai.platform.component", "ai.platform.owner", "ai.platform.probe"} {
			args = append(args, "--label", key+"="+e.probeLabels(o, owner, p)[key])
		}
		return args
	}
	marker := "AI_PLATFORM_NETWORK_" + nonce
	targets := map[string]string{}
	servers := map[string]string{}
	for _, v := range views {
		p, err := register(v.Name)
		if err != nil {
			return err
		}
		args := append(argsFor(p), "--detach", p.Image, "sh", "-c", `mkdir -p /tmp/www && printf '%s' "$1" > /tmp/www/index.html && exec httpd -f -p 18080 -h /tmp/www`, "sh", marker)
		if _, err = e.docker(ctx, o, args...); err != nil {
			return err
		}
		c, err := e.readNetworkProbe(ctx, o, p)
		if err != nil {
			return err
		}
		if c == nil || !e.matchesNetworkProbe(o, owner, p, c) || !c.State.Running || len(c.NetworkSettings.Networks) != 1 {
			return codedError("PLATFORM_NETWORK_CANARY_INVALID")
		}
		address, err := netip.ParseAddr(c.NetworkSettings.Networks[v.Name].IPAddress)
		prefix, _ := netip.ParsePrefix(v.Subnet)
		if err != nil || !prefix.Contains(address) {
			return codedError("PLATFORM_NETWORK_CANARY_ADDRESS_INVALID")
		}
		targets[v.Name] = address.String()
		servers[v.Name] = p.Name
	}
	probe := func(network, target string, allowed bool) error {
		p, err := register(network)
		if err != nil {
			return err
		}
		// A successful in-network request checks DNS and the live canary marker.
		// Denied requests use an observed IP, avoiding a DNS-only false positive.
		args := append(argsFor(p), "--rm", p.Image, "wget", "-q", "-T", "2", "-O", "-", "http://"+target+":18080/")
		r, err := e.dockerResponse(ctx, o, args...)
		if err != nil {
			return err
		}
		if allowed {
			if r.ExitCode == 0 && r.Output == marker {
				return nil
			}
			return codedError("PLATFORM_NETWORK_ALLOWED_PATH_FAILED")
		}
		if r.ExitCode == 1 {
			return nil
		}
		if r.ExitCode == 0 {
			return codedError("PLATFORM_NETWORK_ISOLATION_FAILED")
		}
		return codedError("PLATFORM_NETWORK_DENIAL_PROBE_INVALID")
	}
	checkAllowed := func() error {
		for _, v := range views {
			var err error
			for attempt := 0; attempt < 3; attempt++ {
				err = probe(v.Name, servers[v.Name], true)
				if err == nil {
					break
				}
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(200 * time.Millisecond):
				}
			}
			if err != nil {
				return err
			}
		}
		return nil
	}
	if err = checkAllowed(); err != nil {
		return err
	}
	for _, source := range views {
		for _, destination := range views {
			if source.Name != destination.Name {
				if err = probe(source.Name, targets[destination.Name], false); err != nil {
					return err
				}
			}
		}
	}
	// Check both the lack of a default IPv4 route and the continued liveness of
	// every destination, so a dead server cannot masquerade as isolation.
	for _, v := range views {
		p, err := register(v.Name)
		if err != nil {
			return err
		}
		args := append(argsFor(p), "--rm", p.Image, "ip", "-4", "route", "show", "default")
		r, err := e.docker(ctx, o, args...)
		if err != nil {
			return err
		}
		if strings.TrimSpace(r.Output) != "" {
			return codedError("PLATFORM_NETWORK_EGRESS_ROUTE_PRESENT")
		}
	}
	return checkAllowed()
}
