// Package provision implements explicit host/runtime preparation. Read-only
// catalog queries remain in package platform and never call these adapters.
package provision

import (
	"ai-platform/operations/internal/platform"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

type Options struct {
	DefinitionDigest                                                                                string
	RuntimeMode                                                                                     string
	PublicationMode                                                                                 string
	OriginRevision                                                                                  string
	MaintenanceID                                                                                   string
	OriginPort                                                                                      int
	GrafanaPort                                                                                     int
	HubPort                                                                                         int
	GitlabPort                                                                                      int
	Ingress                                                                                         *platform.IngressSettings
	IngressHostname                                                                                 string
	IdentityPort, SecretStorePort                                                                   int
	Action, Phase, Root, Configuration, Profile, InstallationID, OperationID, ControlRoot, DataRoot string
	Pool                                                                                            string
	MemoryGiB, CPUs, DiskGiB                                                                        int
}
type Host struct {
	OS, Arch, Distribution, Codename, Actor, BootID, Home string
	Root, WSL                                             bool
}
type Command struct {
	Program string
	Args    []string
	Env     map[string]string
	Stdin   []byte
}
type Response struct {
	Output    string
	ExitCode  int
	Truncated bool
}
type Runner interface {
	Run(context.Context, Command) (Response, error)
}
type Step struct {
	Action  string `json:"action"`
	Outcome string `json:"outcome"`
	Phase   string `json:"phase"`
	Before  string `json:"before"`
	After   string `json:"after"`
	Reason  string `json:"reason_code"`
}
type Result struct {
	SchemaVersion             int               `json:"schema_version"`
	OperationID               string            `json:"operation_id"`
	InstallationID            string            `json:"installation_id"`
	Profile                   string            `json:"profile"`
	Planned                   bool              `json:"planned"`
	Outcome                   string            `json:"outcome"`
	Phase                     string            `json:"phase"`
	Decision                  string            `json:"decision"`
	Reason                    string            `json:"reason_code"`
	ExitCode                  int               `json:"exit_code"`
	HostReady                 bool              `json:"host_prerequisites_ready"`
	RuntimeReady              bool              `json:"container_runtime_ready"`
	NetworkReady              bool              `json:"network_layer_ready"`
	IdentityReady             bool              `json:"identity_ready"`
	SecretStoreReady          bool              `json:"secret_store_ready"`
	EdgeReady                 bool              `json:"edge_ready"`
	AccessReady               bool              `json:"access_layer_ready"`
	OriginTLSReady            bool              `json:"origin_tls_ready"`
	OriginEndpoint            string            `json:"origin_endpoint,omitempty"`
	OriginCertificateNotAfter string            `json:"origin_certificate_not_after,omitempty"`
	OriginCertificateSHA256   string            `json:"origin_certificate_sha256,omitempty"`
	IngressArtifactsPrepared  bool              `json:"ingress_artifacts_prepared"`
	ObservabilityReady        bool              `json:"observability_core_ready"`
	GrafanaEndpoint           string            `json:"grafana_endpoint,omitempty"`
	DashboardUID              string            `json:"dashboard_uid,omitempty"`
	HubReady                  bool              `json:"hub_ready"`
	HubEndpoint               string            `json:"hub_endpoint,omitempty"`
	GitlabReady               bool              `json:"gitlab_ready"`
	GitlabEndpoint            string            `json:"gitlab_endpoint,omitempty"`
	IngressBundleID           string            `json:"ingress_bundle_id,omitempty"`
	IngressBundleRevision     string            `json:"ingress_bundle_revision,omitempty"`
	IngressAdapters           map[string]string `json:"ingress_adapters,omitempty"`
	SSOQualified              bool              `json:"sso_flow_qualified"`
	PublicationReady          bool              `json:"external_publication_ready"`
	AccessEndpoints           map[string]string `json:"access_endpoints,omitempty"`
	Networks                  []NetworkView     `json:"networks,omitempty"`
	RuntimeMode               string            `json:"runtime_mode"`
	GPUQualified              bool              `json:"gpu_container_qualified"`
	InstallationReady         bool              `json:"installation_ready"`
	Endpoint                  string            `json:"runtime_endpoint,omitempty"`
	Steps                     []Step            `json:"steps"`
	Limitations               []string          `json:"limitations"`
	effectsStarted            bool
}
type Engine struct {
	Host          Host
	Runner        Runner
	Downloader    Downloader
	Now           func() time.Time
	FSRoot        string
	assetSet      map[string]Asset
	HTTP          HTTPDoer
	PortAvailable func(int) error
	originProbe   func(context.Context, Options, originMaterial) error
}
type codedError string

func (e codedError) Error() string { return string(e) }
func code(err error) string {
	var e codedError
	if errors.As(err, &e) {
		return string(e)
	}
	return "PLATFORM_PROVISION_FAILED"
}
func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }

var idPattern = regexp.MustCompile(`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`)
var hashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var operationPattern = regexp.MustCompile(`^[a-f0-9-]{32,36}$`)

func validID(s string) bool  { return len(s) <= 63 && idPattern.MatchString(s) }
func jsonBytes(v any) []byte { b, _ := json.Marshal(v); return b }
func (e *Engine) path(p string) string {
	if e.FSRoot != "" {
		return filepath.Join(e.FSRoot, strings.TrimPrefix(p, "/"))
	}
	return p
}
func observeHost() Host {
	h := Host{OS: runtime.GOOS, Arch: runtime.GOARCH, Actor: os.Getenv("USER"), Root: os.Geteuid() == 0}
	h.Home, _ = os.UserHomeDir()
	if h.OS == "linux" {
		data, _ := os.ReadFile("/etc/os-release")
		for _, line := range strings.Split(string(data), "\n") {
			key, value, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			value = strings.Trim(value, `"`)
			if key == "ID" {
				h.Distribution = value
			}
			if key == "VERSION_CODENAME" {
				h.Codename = value
			}
		}
		kernel, _ := os.ReadFile("/proc/sys/kernel/osrelease")
		h.WSL = strings.Contains(strings.ToLower(string(kernel)), "microsoft")
		boot, _ := os.ReadFile("/proc/sys/kernel/random/boot_id")
		h.BootID = strings.TrimSpace(string(boot))
	}
	h.Actor = "uid:" + itoa(os.Geteuid())
	return h
}
