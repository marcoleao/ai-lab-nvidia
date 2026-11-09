package platform

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func savePrevious(t *testing.T, root string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, "environments/platform.json"))
	if err != nil {
		t.Fatal(err)
	}
	name := "previous configuration.json"
	if err = os.WriteFile(filepath.Join(root, name), data, 0600); err != nil {
		t.Fatal(err)
	}
	return name
}

func requirement(report *PublicationReport, code string) string {
	for _, requirement := range report.Requirements {
		if requirement.Code == code {
			return requirement.Status
		}
	}
	return ""
}

func TestPublicationLocalProfilesCompleteAndReadOnly(t *testing.T) {
	root := fixture(t)
	before := snapshot(t, root)
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		options := Options{Command: "publication", Root: root, Profile: profile}
		r := mustQuery(t, options)
		p := r.Publication
		if r.Action != "PLATFORM_PUBLICATION_PLAN_COMPUTED" || p == nil || p.State != "LOCAL_ONLY" || p.ExternalPublicationReady || p.ExecutionSupported || p.RuntimeObserved || r.RuntimeChanges || r.ExecutionSupported || r.InstallationReady {
			t.Fatalf("publication was promoted to runtime readiness: %+v", r)
		}
		if r.Scope.Kind != "catalog" || r.SelectedCount != r.CatalogCount || len(p.Routes)+len(p.Excluded) != r.CatalogCount {
			t.Fatal("report silently omitted catalog components")
		}
		for _, route := range p.Routes {
			if route.CandidateOrigin != nil || route.DNSName != nil || route.TLSServerName != nil || route.DNSRecordTarget != nil || route.UpstreamStatus != "NOT_OBSERVED" || route.PolicyStatus != "DESIGN_ONLY_NOT_APPLIED" || route.DefaultAction != "deny" {
				t.Fatal("invented DNS/runtime", route)
			}
		}
		if requirement(p, "PUBLIC_ORIGINS_REQUIRED") == "" || requirement(p, "PUBLIC_EDGE_EXECUTOR_REQUIRED") != "NOT_IMPLEMENTED" {
			t.Fatal("missing blockers")
		}
		if p.OIDC.ConfiguredIssuer != "http://auth.localhost:8082/realms/platform" || p.OIDC.OpenBaoCurrentLocalUICallback != "http://vault.localhost:8200/ui/vault/auth/oidc/oidc/callback" {
			t.Fatal("incorrect local OIDC contract", p.OIDC)
		}
		second := mustQuery(t, options)
		if !reflect.DeepEqual(p, second.Publication) {
			t.Fatal("report not deterministic")
		}
	}
	if !reflect.DeepEqual(before, snapshot(t, root)) {
		t.Fatal("read-only report changed files")
	}
}

func TestPublicationStoredDomainDoesNotActivateOrMigrate(t *testing.T) {
	root := fixture(t)
	previous := savePrevious(t, root)
	edit(t, root, "environments/platform.json", func(v map[string]any) { v["publication"].(map[string]any)["base_domain"] = "platform.example.test" })
	before := snapshot(t, root)
	r := mustQuery(t, Options{Command: "publication", Root: root, PreviousConfiguration: previous})
	p := r.Publication
	if p.State != "LOCAL_ONLY" || p.MigrationRequired || p.PreviousDigest == "" || len(p.Changes) == 0 || !strings.HasPrefix(p.OIDC.ConfiguredIssuer, "http://auth.localhost:") {
		t.Fatal("stored candidate changed effective issuer", p)
	}
	for _, change := range p.Changes {
		if change.RuntimeMigrationRequired {
			t.Fatal("local candidate promoted to migration", change)
		}
	}
	for _, route := range p.Routes {
		if route.CandidateOrigin == nil || route.AddressStatus != "RESERVED_NAME_NOT_PUBLIC" || route.DNSRecordTarget != nil {
			t.Fatal(route)
		}
	}
	if requirement(p, "PUBLIC_DNS_NAME_REQUIRED") == "" || !reflect.DeepEqual(before, snapshot(t, root)) {
		t.Fatal("reserved domain or side effects")
	}
}

func TestPublicationExternalModesPoliciesAndMigrationBoundary(t *testing.T) {
	for _, mode := range []string{"direct", "tunnel"} {
		t.Run(mode, func(t *testing.T) {
			root := fixture(t)
			previous := savePrevious(t, root)
			edit(t, root, "environments/platform.json", func(v map[string]any) {
				p := v["publication"].(map[string]any)
				p["mode"], p["base_domain"] = mode, "customer.platform-demo.dev"
				p["public_urls"] = map[string]any{"sdlc": "https://engineering.customer.platform-demo.dev:443/"}
			})
			before := snapshot(t, root)
			r := mustQuery(t, Options{Command: "publication", Root: root, Component: "sdlc", PreviousConfiguration: previous})
			p := r.Publication
			if p.State != "BLOCKED" || !p.MigrationRequired || p.ExternalPublicationReady || p.OIDC.ConfiguredIssuer != "https://auth.customer.platform-demo.dev/realms/platform" {
				t.Fatal(p)
			}
			if !slices.Contains(p.ImpactedOutsideScope, "secret-store") || !slices.Contains(p.ImpactedOutsideScope, "grafana") {
				t.Fatal("issuer impact truncated to scope", p.ImpactedOutsideScope)
			}
			provider := "DIRECT_INGRESS_ROUTING_REQUIRED"
			if mode == "tunnel" {
				provider = "TUNNEL_PROVIDER_AND_ORIGIN_SECURITY_REQUIRED"
			}
			if requirement(p, provider) != "MISSING_CONFIGURATION" {
				t.Fatal("provider configuration inferred")
			}
			foundIdentity, foundSDLC := false, false
			for _, route := range p.Routes {
				if route.AddressStatus != "CONFIGURED_NOT_VERIFIED" || route.DNSRecordTarget != nil {
					t.Fatal("DNS was inferred", route)
				}
				if route.ComponentID == "identity" {
					foundIdentity = true
					if slices.Contains(route.AllowedPaths, "/*") || !slices.Contains(route.DeniedPaths, "/admin/*") || !slices.Contains(route.DeniedPaths, "/realms/master/*") {
						t.Fatal("unsafe identity design", route)
					}
				} else if len(route.AllowedPaths) != 0 {
					t.Fatal("guessed consumer route/auth contract", route)
				}
				if route.ComponentID == "sdlc" {
					foundSDLC = true
					if *route.CandidateOrigin != "https://engineering.customer.platform-demo.dev" {
						t.Fatal("origin not normalized")
					}
				}
			}
			if !foundIdentity || !foundSDLC || !reflect.DeepEqual(before, snapshot(t, root)) {
				t.Fatal("missing scope or report mutated inputs")
			}
		})
	}
}

func TestPublicationDomainAndLocalPortMigration(t *testing.T) {
	root := fixture(t)
	edit(t, root, "environments/platform.json", func(v map[string]any) {
		p := v["publication"].(map[string]any)
		p["mode"], p["base_domain"] = "direct", "before.platform-demo.dev"
	})
	previous := savePrevious(t, root)
	edit(t, root, "environments/platform.json", func(v map[string]any) {
		v["publication"].(map[string]any)["base_domain"] = "after.platform-demo.dev"
		v["ports"].(map[string]any)["secret-store"] = 18200
	})
	p := mustQuery(t, Options{Command: "publication", Root: root, PreviousConfiguration: previous}).Publication
	foundIssuer, foundCallback := false, false
	for _, change := range p.Changes {
		if change.Field == "oidc_issuer" {
			foundIssuer = true
			if *change.Before != "https://auth.before.platform-demo.dev/realms/platform" || *change.After != "https://auth.after.platform-demo.dev/realms/platform" {
				t.Fatal(change)
			}
		}
		if change.Field == "oidc_local_ui_callback" {
			foundCallback = true
			if !strings.HasPrefix(*change.After, "http://vault.localhost:18200/") || !change.RuntimeMigrationRequired {
				t.Fatal(change)
			}
		}
	}
	if !foundIssuer || !foundCallback || !p.MigrationRequired {
		t.Fatal("migration incomplete", p.Changes)
	}
}

func TestPublicationPreviousBindingAndCLI(t *testing.T) {
	for _, binding := range []string{"installation", "profile"} {
		t.Run(binding, func(t *testing.T) {
			root := fixture(t)
			previous := savePrevious(t, root)
			edit(t, root, previous, func(v map[string]any) {
				if binding == "installation" {
					v["installation_id"] = "another-installation"
				} else {
					v["default_profile"] = "dell-gb10"
				}
			})
			_, err := Query(Options{Command: "publication", Root: root, PreviousConfiguration: previous})
			code := "PREVIOUS_CONFIG_INSTALLATION_MISMATCH"
			if binding == "profile" {
				code = "PREVIOUS_CONFIG_PROFILE_MISMATCH"
			}
			if errorCode(err) != code {
				t.Fatal(err)
			}
		})
	}
	root := fixture(t)
	previous := savePrevious(t, root)
	before := snapshot(t, root)
	for _, format := range []string{"json", "text"} {
		var out, diagnostic bytes.Buffer
		if Run([]string{"publication", "--root", root, "--previous-config", previous, "--format", format}, &out, &diagnostic) != 0 {
			t.Fatal(diagnostic.String())
		}
		if format == "json" {
			var r Result
			if json.Unmarshal(out.Bytes(), &r) != nil || r.Publication == nil || r.Publication.MigrationRequired {
				t.Fatal(out.String())
			}
		} else if !strings.Contains(out.String(), "PUBLIC_EDGE_EXECUTOR_REQUIRED") || !strings.Contains(out.String(), "Excluded secret-store") {
			t.Fatal(out.String())
		}
	}
	_, err := Query(Options{Command: "plan", Root: root, PreviousConfiguration: previous})
	if errorCode(err) != "PREVIOUS_CONFIG_REQUIRES_PUBLICATION_QUERY" || !reflect.DeepEqual(before, snapshot(t, root)) {
		t.Fatal("invalid argument or side effect", err)
	}
}
