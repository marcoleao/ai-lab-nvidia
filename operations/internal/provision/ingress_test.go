package provision

import (
	"ai-platform/operations/internal/platform"
	"bytes"
	"context"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func ingressFixture(t *testing.T, profile string) (*Engine, *fakeOrigin, Options) {
	e, f, o := originFixture(t, profile)
	f.o = o
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.OriginTLSReady {
		t.Fatal(r, err)
	}
	o.Phase = "ingress"
	o.IngressHostname = "gateway.customer.platform-demo.dev"
	uuid := "12345678-1234-1234-1234-123456789abc"
	o.Ingress = &platform.IngressSettings{Revision: "edge-one", DirectPort: 10443, TunnelPort: 10444, TunnelID: &uuid}
	return e, f, o
}

func TestIngressArtifactsAllProfilesAndRetry(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, f, o := ingressFixture(t, profile)
			r, err := e.Run(context.Background(), o)
			if err != nil || !r.IngressArtifactsPrepared || r.PublicationReady || r.SSOQualified || r.InstallationReady {
				t.Fatal(r, err)
			}
			b, err := readIngressBundle(o)
			if err != nil {
				t.Fatal(err)
			}
			if b.ActivationSupported || len(b.Files) != 8 || b.Adapters["tunnel"] != "CONFIGURATION_PREPARED_CONNECTOR_AND_CREDENTIALS_PENDING" {
				t.Fatal(b)
			}
			m, _ := e.readOriginMaterial(o, false)
			for _, name := range []string{"Caddyfile.direct", "Caddyfile.tunnel"} {
				data, _ := os.ReadFile(filepath.Join(ingressBundleDirectory(o, b.Revision), name))
				for _, expected := range []string{"bind 127.0.0.1", "handle /readyz", "respond 404", "tls_client_auth ingress-client.pem ingress-client-key.pem", "tls_trust_pool file ca.pem", "tls_server_name gateway.localhost"} {
					if !bytes.Contains(data, []byte(expected)) {
						t.Fatal("unsafe/incomplete transport", name, expected)
					}
				}
				if bytes.Contains(data, []byte("tls_insecure_skip_verify")) || bytes.Contains(data, []byte("identity:8080")) {
					t.Fatal("bypass or application routing")
				}
			}
			var cloud map[string]any
			data, _ := os.ReadFile(filepath.Join(ingressBundleDirectory(o, b.Revision), "cloudflared.json"))
			if json.Unmarshal(data, &cloud) != nil {
				t.Fatal("invalid cloudflared JSON")
			}
			rules := cloud["ingress"].([]any)
			first := rules[0].(map[string]any)
			request := first["originRequest"].(map[string]any)
			if request["noTLSVerify"] != false || request["originServerName"] != "ingress.localhost" || rules[1].(map[string]any)["service"] != "http_status:404" {
				t.Fatal(cloud)
			}
			payload, _ := os.ReadFile(filepath.Join(ingressBundleDirectory(o, b.Revision), "ingress-client-key.pem"))
			if !bytes.Equal(payload, m.IngressClientKey) || bytes.Equal(payload, m.ClientKey) {
				t.Fatal("installer identity exported")
			}
			ledger, _ := os.ReadFile(filepath.Join(o.ControlRoot, "admin.jsonl"))
			for _, key := range [][]byte{m.ClientKey, m.ServerKey, m.IngressClientKey, m.IngressServerKey} {
				for _, secret := range [][]byte{key, []byte(base64.StdEncoding.EncodeToString(key))} {
					if bytes.Contains(ledger, secret) || bytes.Contains(jsonBytes(r), secret) {
						t.Fatal("private key leaked")
					}
				}
			}
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.IngressArtifactsPrepared || f.creates != 1 || r.Steps[0].Outcome != "NO_CHANGE" {
				t.Fatal("retry started a service or rematerialized", r, err)
			}
		})
	}
}

func TestIngressPlanAndMissingDomainHaveNoEffects(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "dell-gb10")
	o.Phase = "ingress"
	o.Action = "plan"
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.Planned || r.IngressArtifactsPrepared || len(runner.calls) != 0 || len(r.Steps) != 1 {
		t.Fatal(r, err)
	}
	o.Action = "install"
	r, err = e.Run(context.Background(), o)
	if err != nil || r.Outcome != "DEFERRED" || r.Phase != "WAITING" || r.ExitCode != 42 || len(runner.calls) != 0 || r.IngressArtifactsPrepared {
		t.Fatal(r, err)
	}
	if _, err = os.Stat(o.ControlRoot); !os.IsNotExist(err) {
		t.Fatal("missing settings created control")
	}
}

func TestIngressImmutableRevisionPendingAndCommitRecovery(t *testing.T) {
	for _, mode := range []string{"change", "tamper", "commit", "legacy", "stopped", "no-tunnel"} {
		t.Run(mode, func(t *testing.T) {
			e, f, o := ingressFixture(t, "precision-windows")
			if mode == "legacy" {
				m, _ := e.readOriginMaterial(o, false)
				m.IngressServer, m.IngressServerKey, m.IngressClient, m.IngressClientKey = nil, nil, nil, nil
				_ = atomicFile(filepath.Join(o.ControlRoot, "origin-material.json"), jsonBytes(m), 0600)
			}
			if mode == "stopped" {
				for _, c := range f.containers {
					c.State.Running = false
				}
			}
			if mode == "no-tunnel" {
				o.Ingress.TunnelID = nil
			}
			if mode == "commit" {
				e.originProbe = func(context.Context, Options, originMaterial) error {
					return os.Mkdir(filepath.Join(o.DataRoot, "ingress-prepared-bundle.json"), 0700)
				}
			}
			r, err := e.Run(context.Background(), o)
			if mode == "legacy" || mode == "stopped" {
				if err != nil || r.Outcome != "FAILED" || r.IngressArtifactsPrepared || r.Steps[0].Before != r.Steps[0].After {
					t.Fatal("unmodified precondition failure", r, err)
				}
				return
			}
			if mode == "commit" {
				if err != nil || r.Outcome != "UNKNOWN" || r.IngressArtifactsPrepared {
					t.Fatal(r, err)
				}
				if err = os.Remove(filepath.Join(o.DataRoot, "ingress-prepared-bundle.json")); err != nil {
					t.Fatal(err)
				}
				e.originProbe = func(context.Context, Options, originMaterial) error { return nil }
				r, err = e.Run(context.Background(), o)
				if err != nil || !r.IngressArtifactsPrepared || f.creates != 1 {
					t.Fatal("commit not reconciled", r, err)
				}
				return
			}
			if err != nil || !r.IngressArtifactsPrepared {
				t.Fatal(r, err)
			}
			if mode == "no-tunnel" {
				b, err := readIngressBundle(o)
				if err != nil || b.Adapters["tunnel"] != "PENDING_TUNNEL_ID" || len(b.Files) != 7 {
					t.Fatal(b, err)
				}
				return
			}
			if mode == "change" {
				o.Ingress.DirectPort = 11443
			} else {
				_ = os.WriteFile(filepath.Join(ingressBundleDirectory(o, o.Ingress.Revision), "ca.pem"), []byte("tampered"), 0600)
			}
			r, err = e.Run(context.Background(), o)
			if r.IngressArtifactsPrepared || err == nil && r.Outcome == "SUCCEEDED" {
				t.Fatal("drift overwritten", r, err)
			}
		})
	}
}

func TestIngressDistinctCertificatePurposes(t *testing.T) {
	e, _, o := ingressFixture(t, "dell-gb10")
	m, _ := e.readOriginMaterial(o, false)
	server, _ := originCert(m.IngressServer)
	client, _ := originCert(m.IngressClient)
	if server.VerifyHostname("ingress.localhost") != nil || server.VerifyHostname("gateway.localhost") == nil || client.Subject.CommonName != "platform-ingress" || len(client.ExtKeyUsage) != 1 || client.ExtKeyUsage[0] != x509.ExtKeyUsageClientAuth {
		t.Fatal("identity purposes confused")
	}
	m.IngressClient = m.Client
	m.IngressClientKey = m.ClientKey
	if verifyIngressIdentity(m, e.Now()) == nil {
		t.Fatal("installer credential adopted as ingress")
	}
}
