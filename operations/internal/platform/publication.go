package platform

import (
	"fmt"
	"net/url"
	"slices"
	"strings"
)

// PublicationReport is a design and reconciliation report, never evidence of
// DNS, a certificate, a running proxy, an authenticated user or public access.
type PublicationReport struct {
	State                    string                   `json:"state"`
	Mode                     string                   `json:"mode"`
	ExternalPublicationReady bool                     `json:"external_publication_ready"`
	ExecutionSupported       bool                     `json:"execution_supported"`
	RuntimeObserved          bool                     `json:"runtime_observed"`
	PreviousDigest           string                   `json:"previous_configuration_digest,omitempty"`
	MigrationRequired        bool                     `json:"migration_required"`
	Routes                   []PublicationRoute       `json:"routes"`
	Excluded                 []PublicationExclusion   `json:"excluded"`
	Requirements             []PublicationRequirement `json:"requirements"`
	Changes                  []PublicationChange      `json:"changes"`
	ImpactedOutsideScope     []string                 `json:"impacted_outside_scope"`
	Reconciliation           []PublicationTask        `json:"reconciliation"`
	OIDC                     PublicationOIDC          `json:"oidc"`
}

type PublicationOIDC struct {
	ConfiguredIssuer              string `json:"configured_issuer"`
	DiscoveryURL                  string `json:"discovery_url"`
	OpenBaoCurrentLocalUICallback string `json:"openbao_current_local_ui_callback"`
	OpenBaoCLICallback            string `json:"openbao_cli_callback"`
	PrivateAdminURLStatus         string `json:"private_administration_url_status"`
}

type PublicationRoute struct {
	ComponentID      string   `json:"component_id"`
	CandidateOrigin  *string  `json:"candidate_origin"`
	DNSName          *string  `json:"dns_name"`
	TLSServerName    *string  `json:"tls_server_name"`
	DNSRecordTarget  *string  `json:"dns_record_target"`
	AddressStatus    string   `json:"address_status"`
	UpstreamStatus   string   `json:"upstream_status"`
	PolicyStatus     string   `json:"policy_status"`
	DefaultAction    string   `json:"default_action"`
	AllowedPaths     []string `json:"allowed_paths"`
	DeniedPaths      []string `json:"denied_paths"`
	RequiredControls []string `json:"required_controls"`
}

type PublicationExclusion struct {
	ComponentID string `json:"component_id"`
	Reason      string `json:"reason_code"`
}

type PublicationRequirement struct {
	Code   string `json:"code"`
	Status string `json:"status"`
}

type PublicationChange struct {
	ComponentID              string  `json:"component_id"`
	Field                    string  `json:"field"`
	Before                   *string `json:"before"`
	After                    *string `json:"after"`
	RuntimeMigrationRequired bool    `json:"runtime_migration_required"`
}

type PublicationTask struct {
	Order              int    `json:"order"`
	Code               string `json:"code"`
	ExecutionSupported bool   `json:"execution_supported"`
}

func candidateOrigin(publication Publication, component Component) string {
	// Storing an address while mode=local must make the future candidate
	// inspectable without enabling publication or changing its effective issuer.
	publication.Mode = "direct"
	return desiredPublicOrigin(publication, component)
}

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func reservedPublicName(host string) bool {
	for _, suffix := range []string{"localhost", "local", "internal", "test", "invalid", "example", "home.arpa", "example.com", "example.net", "example.org", "onion"} {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}

func localAccessOrigin(configuration Configuration, id string) string {
	port, host := 8082, "auth.localhost"
	if id == "secret-store" {
		port, host = 8200, "vault.localhost"
	}
	if configured, exists := configuration.Ports[id]; exists {
		port = configured
	}
	return fmt.Sprintf("http://%s:%d", host, port)
}

func effectiveIssuer(definition *Definition) string {
	origin := desiredPublicOrigin(definition.Configuration.Publication, definition.ByID["identity"])
	if origin == "" {
		origin = localAccessOrigin(definition.Configuration, "identity")
	}
	return origin + "/realms/platform"
}

func publicationRoute(definition *Definition, id string) PublicationRoute {
	component := definition.ByID[id]
	origin := candidateOrigin(definition.Configuration.Publication, component)
	route := PublicationRoute{
		ComponentID: id, CandidateOrigin: nullable(origin), AddressStatus: "MISSING_CONFIGURATION",
		UpstreamStatus: "NOT_OBSERVED", PolicyStatus: "DESIGN_ONLY_NOT_APPLIED", DefaultAction: "deny",
		AllowedPaths: []string{}, DeniedPaths: []string{}, RequiredControls: []string{"VERIFIED_TLS", "AUTHENTICATION_AUTHORIZATION", "REQUEST_LIMITS", "SAFE_ACCESS_LOGS"},
	}
	if origin != "" {
		uri, _ := url.Parse(origin) // Already validated by Load.
		route.DNSName, route.TLSServerName = nullable(uri.Hostname()), nullable(uri.Hostname())
		route.AddressStatus = "CONFIGURED_NOT_VERIFIED"
		if reservedPublicName(uri.Hostname()) {
			route.AddressStatus = "RESERVED_NAME_NOT_PUBLIC"
		}
	}
	if id == "identity" {
		// A dedicated public listener must filter paths. The F2b loopback
		// listener exposes native administration and cannot be forwarded as-is.
		route.AllowedPaths = []string{"/realms/platform", "/realms/platform/*", "/resources/*"}
		route.DeniedPaths = []string{"/admin", "/admin/*", "/realms/master", "/realms/master/*", "/health", "/health/*", "/metrics"}
		route.RequiredControls = []string{"VERIFIED_TLS", "DEDICATED_PUBLIC_LISTENER", "TRUSTED_PROXY_HEADERS", "REQUEST_LIMITS", "SAFE_ACCESS_LOGS", "ADMINISTRATION_ON_AUTHENTICATED_PRIVATE_PATH"}
	} else {
		// Do not guess application routes, admin APIs or a consumer's auth
		// contract from its catalog port. Empty allowlist deliberately denies all.
		route.RequiredControls = append(route.RequiredControls, "CONSUMER_PUBLIC_ROUTE_CONTRACT_REQUIRED")
	}
	return route
}

func publicationReport(definition, previous *Definition, ordered []string) *PublicationReport {
	p := definition.Configuration.Publication
	report := &PublicationReport{
		State: "BLOCKED", Mode: p.Mode, Routes: []PublicationRoute{}, Excluded: []PublicationExclusion{},
		Requirements: []PublicationRequirement{}, Changes: []PublicationChange{}, ImpactedOutsideScope: []string{}, Reconciliation: []PublicationTask{},
	}
	if p.Mode == "local" {
		report.State = "LOCAL_ONLY"
	}
	report.OIDC = PublicationOIDC{
		ConfiguredIssuer: effectiveIssuer(definition), DiscoveryURL: effectiveIssuer(definition) + "/.well-known/openid-configuration",
		OpenBaoCurrentLocalUICallback: localAccessOrigin(definition.Configuration, "secret-store") + "/ui/vault/auth/oidc/oidc/callback",
		OpenBaoCLICallback:            "http://localhost:8250/oidc/callback", PrivateAdminURLStatus: "AUTHENTICATED_PRIVATE_ORIGIN_REQUIRED_BEFORE_REMOTE_ADMINISTRATION",
	}
	selected := map[string]bool{}
	for _, id := range ordered {
		selected[id] = true
		component := definition.ByID[id]
		if publishable(component) {
			report.Routes = append(report.Routes, publicationRoute(definition, id))
		} else {
			reason := "PRIVATE_SERVICE_NOT_PUBLICLY_ROUTED"
			if component.Exposure == "administrative" {
				reason = "AUTHENTICATED_PRIVATE_ADMINISTRATION_REQUIRED"
			}
			report.Excluded = append(report.Excluded, PublicationExclusion{id, reason})
		}
	}
	addRequirement := func(code, status string) {
		report.Requirements = append(report.Requirements, PublicationRequirement{code, status})
	}
	if p.Mode == "local" {
		addRequirement("PUBLICATION_MODE_REQUIRED", "MISSING_CONFIGURATION")
	} else if p.Mode == "direct" {
		addRequirement("DIRECT_INGRESS_ROUTING_REQUIRED", "MISSING_CONFIGURATION")
	} else {
		addRequirement("TUNNEL_PROVIDER_AND_ORIGIN_SECURITY_REQUIRED", "MISSING_CONFIGURATION")
	}
	missing, reserved := false, false
	for _, route := range report.Routes {
		missing = missing || route.CandidateOrigin == nil
		reserved = reserved || route.AddressStatus == "RESERVED_NAME_NOT_PUBLIC"
	}
	if missing {
		addRequirement("PUBLIC_ORIGINS_REQUIRED", "MISSING_CONFIGURATION")
	}
	if reserved {
		addRequirement("PUBLIC_DNS_NAME_REQUIRED", "RESERVED_NAME_NOT_PUBLIC")
	}
	addRequirement("PUBLIC_EDGE_EXECUTOR_REQUIRED", "NOT_IMPLEMENTED")
	addRequirement("ORIGIN_MTLS_PREPARATION_CODE", "IMPLEMENTED_NOT_OBSERVED_OR_QUALIFIED")
	addRequirement("INGRESS_ARTIFACT_PREPARER_CODE", "IMPLEMENTED_CONFIGURATION_ONLY_NOT_OBSERVED")
	if p.Ingress == nil {
		addRequirement("INGRESS_ARTIFACT_SETTINGS", "MISSING_CONFIGURATION")
	} else if CandidateIngressHostname(p) == "" {
		addRequirement("INGRESS_ARTIFACT_HOSTNAME", "MISSING_CONFIGURATION")
	}
	for _, code := range []string{
		"DNS_TARGET_AND_RESOLUTION", "PUBLIC_TLS_CHAIN_SNI_RENEWAL", "ORIGIN_TRANSPORT_AND_PROXY_TRUST",
		"PRIVATE_ADMINISTRATION_PATH", "BOOTSTRAP_ADMIN_REMOVAL_AND_MFA", "SECRET_STORE_RECOVERY_HARDENING",
		"IDENTITY_ISSUER_AND_CONSUMER_CALLBACKS", "BROWSER_ALLOW_DENY_LOGOUT_REVOCATION", "PUBLIC_PATHS_AND_ADMIN_DENIAL",
		"HOST_VM_CONTAINER_NAME_RESOLUTION", "INDEPENDENT_INTERNET_REACHABILITY", "PROFILE_PHYSICAL_QUALIFICATION",
	} {
		addRequirement(code, "NOT_OBSERVED")
	}
	if previous != nil {
		report.PreviousDigest = previous.Digest
		addChange := func(id, field, before, after string, runtime bool) {
			if before != after {
				report.Changes = append(report.Changes, PublicationChange{id, field, nullable(before), nullable(after), runtime})
				report.MigrationRequired = report.MigrationRequired || runtime
			}
		}
		wasExternal := previous.Configuration.Publication.Mode != "local"
		willBeExternal := p.Mode != "local"
		addChange("edge", "publication_mode", previous.Configuration.Publication.Mode, p.Mode, wasExternal || willBeExternal)
		for _, id := range ordered {
			component := definition.ByID[id]
			if publishable(component) {
				addChange(id, "candidate_public_origin", candidateOrigin(previous.Configuration.Publication, component), candidateOrigin(p, component), wasExternal || willBeExternal)
			}
		}
		for _, id := range []string{"identity", "secret-store"} {
			addChange(id, "local_access_origin", localAccessOrigin(previous.Configuration, id), localAccessOrigin(definition.Configuration, id), true)
		}
		addChange("secret-store", "oidc_local_ui_callback", localAccessOrigin(previous.Configuration, "secret-store")+"/ui/vault/auth/oidc/oidc/callback", report.OIDC.OpenBaoCurrentLocalUICallback, true)
		oldIssuer, newIssuer := effectiveIssuer(previous), effectiveIssuer(definition)
		addChange("identity", "oidc_issuer", oldIssuer, newIssuer, true)
		if oldIssuer != newIssuer {
			// Issuer changes affect every consumer, even one excluded by the
			// requested scope. Report that boundary instead of hiding it.
			for _, id := range sortedKeys(definition.ByID) {
				if !selected[id] && identityConsumer(definition, id) {
					report.ImpactedOutsideScope = append(report.ImpactedOutsideScope, id)
				}
			}
			addRequirement("ALL_IDENTITY_CONSUMERS_REQUIRE_RECONCILIATION", "MIGRATION_REQUIRED")
		}
	} else {
		addRequirement("PREVIOUS_CONFIGURATION_COMPARISON", "NOT_PROVIDED")
	}
	for index, code := range []string{
		"CONFIRM_INSTALLATION_SCOPE_AND_OWNERSHIP", "PREPARE_PRIVATE_ADMINISTRATION_AND_RECOVERY",
		"PREPARE_INGRESS_DNS_TLS_AND_RENEWAL", "DRAIN_CONSUMERS_AND_RECONCILE_ISSUER_ORIGINS_CALLBACKS",
		"APPLY_DEDICATED_PUBLIC_ALLOWLISTS", "VERIFY_SSO_PERMISSIONS_REVOCATION_AND_ADMIN_DENIAL",
		"VERIFY_FROM_INDEPENDENT_INTERNET_CLIENT", "ACTIVATE_EXPLICITLY_WITH_OBSERVED_EVIDENCE",
	} {
		report.Reconciliation = append(report.Reconciliation, PublicationTask{Order: index + 1, Code: code})
	}
	return report
}

func identityConsumer(definition *Definition, id string) bool {
	if id == "identity" {
		return false
	}
	component := definition.ByID[id]
	return publishable(component) || component.Exposure == "administrative" || slices.Contains(component.DependsOn, "identity") || slices.Contains(component.IntegratesWith, "identity")
}
