package provision

import (
	"ai-platform/operations/blueprints"
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

var actionCatalog = map[string]string{
	"PLATFORM_CI_RUNNER_IDENTITY_PREPARED":         "ci_runner_identity_receipt_digest",
	"PLATFORM_CI_RUNNER_REGISTRATION_PREPARED":     "ci_runner_registration_digest",
	"PLATFORM_CI_RUNNER_IMAGE_PREPARED":            "ci_runner_image_digest",
	"PLATFORM_CI_RUNNER_SERVICE_PREPARED":          "ci_runner_service_state_digest",
	"PLATFORM_CI_RUNNER_STARTUP_COMPENSATED":       "ci_runner_service_state_digest",
	"PLATFORM_CI_RUNNER_ISOLATED_TEST_REMOVED":     "ci_runner_isolated_resource_digest",
	"PLATFORM_GITLAB_CREDENTIALS_PREPARED":         "gitlab_credential_receipt_digest",
	"PLATFORM_GITLAB_IMAGES_PREPARED":              "gitlab_image_set_digest",
	"PLATFORM_GITLAB_SERVICES_PREPARED":            "gitlab_service_state_digest",
	"PLATFORM_GITLAB_STARTUP_COMPENSATED":          "gitlab_service_state_digest",
	"PLATFORM_GITLAB_ISOLATED_TEST_REMOVED":        "isolated_gitlab_resource_digest",
	"PLATFORM_HUB_IDENTITY_PREPARED":               "hub_owner_digest",
	"PLATFORM_HUB_IMAGE_PREPARED":                  "hub_image_digest",
	"PLATFORM_HUB_SERVICE_PREPARED":                "hub_service_state_digest",
	"PLATFORM_HUB_STARTUP_COMPENSATED":             "hub_service_state_digest",
	"PLATFORM_HUB_ISOLATED_TEST_REMOVED":           "isolated_hub_resource_digest",
	"PLATFORM_OBSERVABILITY_ISOLATED_TEST_REMOVED": "isolated_test_resources_digest",
	"PLATFORM_OBSERVABILITY_CREDENTIALS_PREPARED":  "observability_credential_receipt_digest",
	"PLATFORM_OBSERVABILITY_CONFIG_VALIDATED":      "observability_native_config_digest",
	"PLATFORM_OBSERVABILITY_IMAGES_PREPARED":       "observability_image_set_digest",
	"PLATFORM_OBSERVABILITY_SERVICES_PREPARED":     "observability_service_state_digest",
	"PLATFORM_OBSERVABILITY_STARTUP_COMPENSATED":   "observability_service_state_digest",
	"PLATFORM_RUNTIME_STARTED":                     "runtime_process_digest",
	"PLATFORM_RUNTIME_STOPPED":                     "runtime_process_digest",
	"PLATFORM_RUNTIME_RESTARTED":                   "runtime_process_digest",
	"PLATFORM_RUNTIME_STATE_RESTORED":              "runtime_process_digest",
	"PLATFORM_SERVICES_STARTED":                    "service_process_digest",
	"PLATFORM_SERVICES_STOPPED":                    "service_process_digest",
	"PLATFORM_SERVICES_RESTARTED":                  "service_process_digest",
	"PLATFORM_SERVICE_STATE_RESTORED":              "service_process_digest",
	"PLATFORM_SECRET_STORE_UNSEALED":               "secret_store_seal_state_digest",
	"PLATFORM_PRIVATE_LOGS_EXPORTED":               "private_log_export_digest",
	"PLATFORM_INGRESS_ISOLATED_VALIDATED":          "isolated_ingress_validation_digest",
	"PLATFORM_INGRESS_BUNDLE_PREPARED":             "ingress_private_bundle_digest",
	"PLATFORM_ORIGIN_ISOLATED_TEST_REMOVED":        "isolated_origin_resource_digest",
	"PLATFORM_ORIGIN_IMAGE_PREPARED":               "origin_image_digest",
	"PLATFORM_ORIGIN_TLS_MATERIAL_PREPARED":        "origin_certificate_material_receipt_digest",
	"PLATFORM_ORIGIN_TLS_SERVICE_PREPARED":         "origin_service_state_digest",
	"PLATFORM_ORIGIN_TLS_COMPENSATED":              "origin_service_state_digest",
	"PLATFORM_ACCESS_ISOLATED_TEST_REMOVED":        "isolated_test_resource_digest",
	"PLATFORM_OS_PACKAGES_PREPARED":                "package_inventory_digest",
	"PLATFORM_GPU_ACCESS_VERIFIED":                 "gpu_probe_digest",
	"PLATFORM_RUNTIME_ARTIFACTS_PREPARED":          "runtime_artifact_digest",
	"PLATFORM_NVIDIA_CDI_PREPARED":                 "cdi_configuration_digest",
	"PLATFORM_CONTAINER_RUNTIME_PREPARED":          "runtime_configuration_digest",
	"PLATFORM_RUNTIME_CONFIGURATION_RESTORED":      "runtime_configuration_digest",
	"PLATFORM_NETWORK_PROBE_IMAGE_PREPARED":        "network_probe_image_digest",
	"PLATFORM_NETWORKS_PREPARED":                   "network_topology_digest",
	"PLATFORM_NETWORKS_RESTORED":                   "network_topology_digest",
	"PLATFORM_ACCESS_CREDENTIALS_PREPARED":         "bootstrap_credential_receipt_digest",
	"PLATFORM_ACCESS_IMAGES_PREPARED":              "access_image_set_digest",
	"PLATFORM_ACCESS_SERVICES_PREPARED":            "access_service_state_digest",
	"PLATFORM_ACCESS_STARTUP_COMPENSATED":          "access_service_state_digest",
	"PLATFORM_SECRET_STORE_BOOTSTRAPPED":           "secret_store_bootstrap_state_digest",
}

type ledgerRow struct {
	Sequence int    `json:"sequence"`
	Previous string `json:"previous_hash"`
	Record   string `json:"record"`
	Hash     string `json:"hash"`
}
type recorder struct {
	root    string
	options Options
	host    Host
	now     func() time.Time
}

var projection = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,128}$`)
var sourceOnce sync.Once
var processSourceDigest string
var processSourceError error

func sourceFingerprint() (string, error) {
	sourceOnce.Do(func() {
		path, err := os.Executable()
		if err != nil {
			processSourceError = err
			return
		}
		data, err := os.ReadFile(path)
		if err != nil {
			processSourceError = err
			return
		}
		processSourceDigest = digest(data)
	})
	return processSourceDigest, processSourceError
}

func (r recorder) append(s Step) error {
	sourceDigest, sourceErr := sourceFingerprint()
	if sourceErr != nil {
		return codedError("PLATFORM_AUDIT_SOURCE_UNAVAILABLE")
	}
	if actionCatalog[s.Action] == "" {
		return codedError("PLATFORM_AUDIT_ACTION_UNKNOWN")
	}
	pairs := map[string]bool{"ACCEPTED/REQUESTED": true, "SUCCEEDED/COMPLETED": true, "NO_CHANGE/COMPLETED": true, "FAILED/COMPLETED": true, "UNKNOWN/OBSERVED": true, "DEFERRED/WAITING": true}
	if !pairs[s.Outcome+"/"+s.Phase] || !projection.MatchString(s.Before) || !projection.MatchString(s.After) || !projection.MatchString(s.Reason) {
		return codedError("PLATFORM_AUDIT_PROJECTION_INVALID")
	}
	path := filepath.Join(r.root, "admin.jsonl")
	if err := plain(path); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	if err = regularSingleLink(f); err != nil {
		return err
	}
	previous, seq, err := validateAuditFile(f)
	if err != nil {
		return err
	}
	data := map[string]any{"schema_version": 1, "at": r.now().UTC().Format(time.RFC3339Nano), "installation_id": r.options.InstallationID, "operation_id": r.options.OperationID,
		"actor": map[string]string{"type": "os_process", "identity": r.host.Actor, "assurance": "OS_ACCOUNT_OBSERVED_HUMAN_NOT_VERIFIED"}, "initiator": map[string]string{"type": "unknown", "assurance": "NOT_CAPTURED"},
		"action": s.Action, "outcome": s.Outcome, "phase": s.Phase, "decision": "NOT_APPLICABLE", "reason_code": s.Reason, "comparison": map[string]string{"kind": actionCatalog[s.Action], "before": s.Before, "after": s.After}, "profile": r.options.Profile}
	data["source_sha256"] = sourceDigest
	middlewareImages, _ := sources.ReadFile("middleware-images.json")
	data["middleware_images_manifest_sha256"] = digest(middlewareImages)
	manifest, _ := sources.ReadFile("assets.json")
	data["assets_manifest_sha256"] = digest(manifest)
	networkImages, _ := sources.ReadFile("network-images.json")
	data["network_images_manifest_sha256"] = digest(networkImages)
	accessImages, _ := sources.ReadFile("access-images.json")
	data["access_images_manifest_sha256"] = digest(accessImages)
	observabilityImages, _ := sources.ReadFile("observability-images.json")
	data["observability_images_manifest_sha256"] = digest(observabilityImages)
	data["observability_blueprints_sha256"] = blueprints.Digest()
	data["definition_sha256"] = r.options.DefinitionDigest
	if r.options.MaintenanceID != "" {
		if !operationPattern.MatchString(r.options.MaintenanceID) {
			return codedError("PLATFORM_AUDIT_PROJECTION_INVALID")
		}
		data["maintenance_id"] = r.options.MaintenanceID
	}
	record := string(jsonBytes(data))
	row := ledgerRow{seq + 1, previous, record, digest([]byte(previous + "\n" + record))}
	if _, err = f.Seek(0, 2); err != nil {
		return err
	}
	if _, err = f.Write(append(jsonBytes(row), '\n')); err != nil {
		return err
	}
	return f.Sync()
}
func zeroHash() string { return "0000000000000000000000000000000000000000000000000000000000000000" }

// Shared by the writer and read-only diagnosis; neither repairs a damaged tail.
func validateAuditFile(f *os.File) (string, int, error) {
	previous, seq := zeroHash(), 0
	if err := regularSingleLink(f); err != nil {
		return previous, seq, err
	}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4096), 1<<20)
	for scanner.Scan() {
		var row ledgerRow
		if json.Unmarshal(scanner.Bytes(), &row) != nil || row.Sequence != seq+1 || row.Previous != previous || row.Hash != digest([]byte(previous+"\n"+row.Record)) {
			return previous, seq, codedError("PLATFORM_AUDIT_CORRUPT")
		}
		seq++
		previous = row.Hash
	}
	if err := scanner.Err(); err != nil {
		return previous, seq, err
	}
	info, err := f.Stat()
	if err != nil {
		return previous, seq, err
	}
	if info.Size() > 0 {
		last := make([]byte, 1)
		if _, err = f.ReadAt(last, info.Size()-1); err != nil {
			return previous, seq, err
		}
		if last[0] != '\n' {
			return previous, seq, codedError("PLATFORM_AUDIT_INCOMPLETE")
		}
	}
	return previous, seq, nil
}

func readAuditIntegrity(root string) error {
	path := filepath.Join(root, "admin.jsonl")
	if err := plain(path); err != nil {
		return err
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, _, err = validateAuditFile(f)
	return err
}
func (r recorder) diagnostic(action string, err error) {
	detail := err.Error()
	var private interface{ PrivateDiagnostic() string }
	if errors.As(err, &private) {
		detail = private.PrivateDiagnostic()
	}
	_ = atomicFile(filepath.Join(r.root, "diagnostic-"+r.options.OperationID+"-"+action+".json"), jsonBytes(map[string]string{"action": action, "detail": detail}), 0600)
}
