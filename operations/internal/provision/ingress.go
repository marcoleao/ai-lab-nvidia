package provision

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type ingressBundle struct {
	Schema                   int               `json:"schema_version"`
	Installation             string            `json:"installation_id"`
	Profile                  string            `json:"profile"`
	Revision                 string            `json:"revision"`
	ID                       string            `json:"bundle_id"`
	OriginGeneration         string            `json:"origin_generation"`
	Hostname                 string            `json:"hostname"`
	Kind                     string            `json:"kind"`
	ActivationSupported      bool              `json:"activation_supported"`
	ExternalPublicationReady bool              `json:"external_publication_ready"`
	ListenAddress            string            `json:"listen_address"`
	AllowedPaths             []string          `json:"allowed_paths"`
	Adapters                 map[string]string `json:"adapters"`
	Requirements             []string          `json:"requirements"`
	RequiredTools            map[string]string `json:"required_tools"`
	Files                    map[string]string `json:"files"`
}
type ingressIntent struct{ Before, Desired, Revision string }

func verifyIngressIdentity(m originMaterial, now time.Time) error {
	if err := verifyOriginMaterial(m, now); err != nil {
		return err
	}
	if len(m.IngressClient) == 0 || len(m.IngressServer) == 0 {
		return codedError("PLATFORM_INGRESS_ORIGIN_REVISION_UPGRADE_REQUIRED")
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(m.CA) {
		return codedError("PLATFORM_ORIGIN_CA_INVALID")
	}
	for _, pair := range []struct {
		cert, key     []byte
		name, subject string
		usage         x509.ExtKeyUsage
	}{{m.IngressServer, m.IngressServerKey, "ingress.localhost", "ingress.localhost", x509.ExtKeyUsageServerAuth}, {m.IngressClient, m.IngressClientKey, "", "platform-ingress", x509.ExtKeyUsageClientAuth}} {
		cert, err := originCert(pair.cert)
		if err != nil {
			return err
		}
		if cert.Subject.CommonName != pair.subject {
			return codedError("PLATFORM_INGRESS_IDENTITY_INVALID")
		}
		if _, err = tls.X509KeyPair(pair.cert, pair.key); err != nil {
			return codedError("PLATFORM_ORIGIN_KEY_MISMATCH")
		}
		if _, err = cert.Verify(x509.VerifyOptions{Roots: pool, CurrentTime: now, DNSName: pair.name, KeyUsages: []x509.ExtKeyUsage{pair.usage}}); err != nil {
			return codedError("PLATFORM_INGRESS_CERTIFICATE_INVALID")
		}
		if cert.NotAfter.Before(now.Add(24 * time.Hour)) {
			return codedError("PLATFORM_ORIGIN_CERTIFICATE_RENEWAL_REQUIRED")
		}
	}
	if bytes.Equal(m.IngressClient, m.Client) || bytes.Equal(m.IngressClientKey, m.ClientKey) || bytes.Equal(m.IngressServerKey, m.ServerKey) {
		return codedError("PLATFORM_INGRESS_INSTALLER_IDENTITY_REUSE_DENIED")
	}
	return nil
}

func renderIngressBundle(o Options, m originMaterial) (ingressBundle, map[string][]byte) {
	s := o.Ingress
	proxy := fmt.Sprintf(`handle /readyz {
 reverse_proxy https://127.0.0.1:%d {
  header_up Host gateway.localhost:%d
  transport http {
   tls_server_name gateway.localhost
   tls_trust_pool file ca.pem
   tls_client_auth ingress-client.pem ingress-client-key.pem
  }
 }
}
handle {
 respond 404
}
`, o.OriginPort, o.OriginPort)
	direct := fmt.Sprintf(`{
 admin off
 persist_config off
 auto_https disable_redirects
 servers {
  protocols h1 h2
  strict_sni_host on
 }
}
https://%s:%d {
 bind 127.0.0.1
 tls {
  issuer acme {
   disable_http_challenge
  }
 }
%s}
`, o.IngressHostname, s.DirectPort, proxy)
	bridge := fmt.Sprintf(`{
 admin off
 persist_config off
 auto_https off
 servers {
  protocols h1 h2
  strict_sni_host on
 }
}
https://ingress.localhost:%d {
 bind 127.0.0.1
 tls bridge-server.pem bridge-server-key.pem {
  protocols tls1.3
 }
%s}
`, s.TunnelPort, proxy)
	files := map[string][]byte{"Caddyfile.direct": []byte(direct), "Caddyfile.tunnel": []byte(bridge), "ca.pem": m.CA, "bridge-server.pem": m.IngressServer, "bridge-server-key.pem": m.IngressServerKey, "ingress-client.pem": m.IngressClient, "ingress-client-key.pem": m.IngressClientKey}
	b := ingressBundle{Schema: 1, Installation: o.InstallationID, Profile: o.Profile, Revision: s.Revision, OriginGeneration: m.Generation, Hostname: o.IngressHostname, Kind: "CONFIGURATION_ONLY_NOT_ACTIVATED", ListenAddress: "127.0.0.1", AllowedPaths: []string{"/readyz"}, Adapters: map[string]string{"direct": "CONFIGURATION_PREPARED_ACME_AND_INGRESS_PENDING", "tunnel": "PENDING_TUNNEL_ID"}, Files: map[string]string{}, Requirements: []string{"MANAGED_CADDY_BINARY_REQUIRED", "BUNDLE_WORKING_DIRECTORY_REQUIRED", "DIRECT_INGRESS_TLS_ALPN_DNS_AND_ACME_EGRESS_REQUIRED", "TUNNEL_CONNECTOR_CREDENTIALS_AND_EGRESS_REQUIRED", "ACTIVATION_EXECUTOR_NOT_IMPLEMENTED", "APPLICATION_ROUTES_NOT_IMPLEMENTED", "SSO_AND_EXTERNAL_QUALIFICATION_PENDING"}, RequiredTools: map[string]string{"caddy": accessReleases()["caddy"].Version, "cloudflared": "EXTERNAL_CONNECTOR_VERSION_NOT_SELECTED"}}
	b.RequiredTools["caddy"] = strings.TrimSuffix(b.RequiredTools["caddy"], "-alpine")
	b.Requirements = append(b.Requirements, "MANAGED_PERSISTENT_ACME_STORAGE_REQUIRED")
	if s.TunnelID != nil {
		files["cloudflared.json"] = jsonBytes(map[string]any{"tunnel": *s.TunnelID, "credentials-file": "../../ingress-credentials/" + *s.TunnelID + ".json", "ingress": []any{map[string]any{"hostname": o.IngressHostname, "service": fmt.Sprintf("https://127.0.0.1:%d", s.TunnelPort), "originRequest": map[string]any{"originServerName": "ingress.localhost", "httpHostHeader": fmt.Sprintf("ingress.localhost:%d", s.TunnelPort), "caPool": "ca.pem", "noTLSVerify": false}}, map[string]string{"service": "http_status:404"}}})
		b.Adapters["tunnel"] = "CONFIGURATION_PREPARED_CONNECTOR_AND_CREDENTIALS_PENDING"
	}
	for name, data := range files {
		b.Files[name] = digest(data)
	}
	b.ID = digest(jsonBytes(b))
	files["bundle.json"] = jsonBytes(b)
	return b, files
}

func ingressBundleDirectory(o Options, revision string) string {
	return filepath.Join(o.ControlRoot, "ingress-bundles", revision)
}
func verifyIngressFiles(directory string, b ingressBundle) error {
	if b.Schema != 1 || !validID(b.Revision) || !hashPattern.MatchString(b.ID) || !validID(b.Installation) || !validID(b.Profile) || len(b.OriginGeneration) != 32 || !hashPattern.MatchString(b.OriginGeneration+b.OriginGeneration) || b.Kind != "CONFIGURATION_ONLY_NOT_ACTIVATED" || b.ActivationSupported || b.ExternalPublicationReady || b.ListenAddress != "127.0.0.1" {
		return codedError("PLATFORM_INGRESS_BUNDLE_INVALID")
	}
	identity := b
	identity.ID = ""
	if digest(jsonBytes(identity)) != b.ID {
		return codedError("PLATFORM_INGRESS_BUNDLE_INVALID")
	}
	allowed := map[string]bool{"Caddyfile.direct": true, "Caddyfile.tunnel": true, "ca.pem": true, "bridge-server.pem": true, "bridge-server-key.pem": true, "ingress-client.pem": true, "ingress-client-key.pem": true, "cloudflared.json": true}
	if len(b.Files) < 7 || len(b.Files) > 8 {
		return codedError("PLATFORM_INGRESS_BUNDLE_INVALID")
	}
	for name, hash := range b.Files {
		if !allowed[name] || !hashPattern.MatchString(hash) {
			return codedError("PLATFORM_INGRESS_BUNDLE_INVALID")
		}
	}
	if err := plain(directory); err != nil {
		return err
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		return err
	}
	wanted := map[string]string{}
	for name, hash := range b.Files {
		wanted[name] = hash
	}
	wanted["bundle.json"] = digest(jsonBytes(b))
	if len(entries) != len(wanted) {
		return codedError("PLATFORM_INGRESS_BUNDLE_CONTENT_CHANGED")
	}
	for _, entry := range entries {
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			return codedError("PLATFORM_INGRESS_BUNDLE_CONTENT_CHANGED")
		}
		hash, ok := wanted[entry.Name()]
		if !ok {
			return codedError("PLATFORM_INGRESS_BUNDLE_CONTENT_CHANGED")
		}
		path := filepath.Join(directory, entry.Name())
		if err = plain(path); err != nil {
			return err
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() || info.Size() > 1<<20 {
			return codedError("PLATFORM_INGRESS_BUNDLE_CONTENT_CHANGED")
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if digest(data) != hash {
			return codedError("PLATFORM_INGRESS_BUNDLE_CONTENT_CHANGED")
		}
	}
	return nil
}
func readIngressBundle(o Options) (ingressBundle, error) {
	var b ingressBundle
	path := filepath.Join(o.DataRoot, "ingress-prepared-bundle.json")
	if err := plain(path); err != nil {
		return b, err
	}
	if _, err := os.Stat(path); err != nil {
		return b, err
	}
	if err := networkControl(o, "ingress-prepared-bundle.json", &b); err != nil {
		return b, err
	}
	if b.ID == "" {
		return b, codedError("PLATFORM_INGRESS_BUNDLE_INVALID")
	}
	if b.Installation != o.InstallationID || b.Profile != o.Profile {
		return b, codedError("PLATFORM_INGRESS_BUNDLE_BINDING_INVALID")
	}
	return b, verifyIngressFiles(ingressBundleDirectory(o, b.Revision), b)
}
func ingressFingerprint(o Options) (string, error) {
	b, err := readIngressBundle(o)
	if os.IsNotExist(err) {
		return "ABSENT", nil
	}
	return digest(jsonBytes(b)), err
}

func (e *Engine) prepareIngressBundle(ctx context.Context, o Options) (proof []byte, finalErr error) {
	before, err := ingressFingerprint(o)
	if err != nil {
		return nil, err
	}
	mutated := false
	defer func() {
		if finalErr != nil && !mutated {
			finalErr = &restoredError{cause: finalErr, after: before}
		}
	}()
	if err = plain(filepath.Join(o.ControlRoot, "origin-pending-material.json")); err != nil {
		return nil, err
	}
	if _, err := os.Stat(filepath.Join(o.ControlRoot, "origin-pending-material.json")); err == nil {
		return nil, codedError("PLATFORM_INGRESS_ORIGIN_ROTATION_PENDING")
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	m, err := e.readOriginMaterial(o, false)
	if err != nil {
		return nil, err
	}
	if err = verifyIngressIdentity(m, e.Now()); err != nil {
		return nil, err
	}
	var receipt struct {
		Active  originResource `json:"active"`
		Running bool           `json:"active_running"`
	}
	if err = accessPrivateRead(o, "platform_origin_tls_service_prepared.state", &receipt); err != nil {
		return nil, codedError("PLATFORM_INGRESS_ORIGIN_PREPARATION_REQUIRED")
	}
	var origin originRecord
	if err = networkControl(o, "origin.resources.json", &origin); err != nil {
		return nil, err
	}
	if origin.Active.Generation != m.Generation || origin.Active.Port != o.OriginPort {
		return nil, codedError("PLATFORM_INGRESS_ORIGIN_BINDING_CHANGED")
	}
	if !receipt.Running || receipt.Active.ID != origin.Active.ID || receipt.Active.Spec != origin.Active.Spec || receipt.Active.Generation != m.Generation {
		return nil, codedError("PLATFORM_INGRESS_ORIGIN_PREPARATION_REQUIRED")
	}
	container, err := e.originContainer(ctx, o, origin.Active, m)
	if err != nil {
		return nil, err
	}
	if container == nil || !container.State.Running {
		return nil, codedError("PLATFORM_INGRESS_ORIGIN_NOT_RUNNING")
	}
	if _, err = e.originServiceProof(ctx, o); err != nil {
		return nil, err
	}
	if err = e.verifyOrigin(ctx, o, m); err != nil {
		return nil, err
	}
	b, files := renderIngressBundle(o, m)
	var intent ingressIntent
	if err = networkControl(o, "ingress-bundle.intent.json", &intent); err != nil {
		return nil, err
	}
	desired := digest(jsonBytes(b))
	if intent.Desired != "" && (intent.Desired != desired || intent.Revision != b.Revision || before != intent.Before && before != desired) {
		return nil, codedError("PLATFORM_INGRESS_PENDING_CONFIGURATION")
	}
	directory := ingressBundleDirectory(o, b.Revision)
	if _, err = os.Lstat(directory); err == nil {
		if err = verifyIngressFiles(directory, b); err != nil {
			return nil, err
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	mutated = true
	if err = ownedDirectory(filepath.Join(o.ControlRoot, "ingress-bundles"), o.InstallationID+":"+o.Profile+":"+m.Owner+":ingress-bundles"); err != nil {
		return nil, err
	}
	if intent.Desired == "" {
		intent = ingressIntent{Before: before, Desired: desired, Revision: b.Revision}
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "ingress-bundle.intent.json"), jsonBytes(intent), 0600); err != nil {
		return nil, err
	}
	if _, err = os.Lstat(directory); os.IsNotExist(err) {
		stage, err := os.MkdirTemp(filepath.Dir(directory), ".stage-")
		if err != nil {
			return nil, err
		}
		defer os.RemoveAll(stage)
		names := []string{}
		for name := range files {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			if err = atomicFile(filepath.Join(stage, name), files[name], 0600); err != nil {
				return nil, err
			}
		}
		if err = verifyIngressFiles(stage, b); err != nil {
			return nil, err
		}
		if err = os.Rename(stage, directory); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	current, err := ingressFingerprint(o)
	if err != nil {
		return nil, err
	}
	if current != intent.Before && current != desired {
		return nil, codedError("PLATFORM_INGRESS_RECEIPT_CONFLICT")
	}
	if err = atomicFile(filepath.Join(o.DataRoot, "ingress-prepared-bundle.json"), jsonBytes(b), 0600); err != nil {
		return nil, err
	}
	observed, err := readIngressBundle(o)
	if err != nil || !bytes.Equal(jsonBytes(observed), jsonBytes(b)) {
		return nil, codedError("PLATFORM_INGRESS_PREPARATION_UNCONFIRMED")
	}
	if err = os.Remove(filepath.Join(o.DataRoot, "ingress-bundle.intent.json")); err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	return jsonBytes(b), nil
}
