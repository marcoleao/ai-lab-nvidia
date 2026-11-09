package provision

type operationSpec struct{ Action, Effect, Comparison, Persistence string }

// Runtime observation is deliberately separate from configuration-only F0.
var operationCatalog = map[string]operationSpec{
	"status":  {"PLATFORM_RUNTIME_STATUS_READ", "read_only", "NOT_APPLICABLE_READ_ONLY", "none_read_only"},
	"doctor":  {"PLATFORM_RUNTIME_DIAGNOSED", "read_only", "NOT_APPLICABLE_READ_ONLY", "none_read_only"},
	"start":   {"PLATFORM_SERVICES_STARTED", "administrative_workflow", "service_process_digest", "external_native_ledger"},
	"stop":    {"PLATFORM_SERVICES_STOPPED", "administrative_workflow", "service_process_digest", "external_native_ledger"},
	"restart": {"PLATFORM_SERVICES_RESTARTED", "administrative_workflow", "service_process_digest", "external_native_ledger"},
	"logs":    {"PLATFORM_PRIVATE_LOGS_EXPORTED", "private_diagnostic_export", "private_log_export_digest", "external_native_ledger"},
}

func IsOperation(command string) bool { _, ok := operationCatalog[command]; return ok }

type OperationOptions struct {
	Options
	Command, Component, RequestID string
	Unseal                        bool
	Tail                          int
}
type ServiceObservation struct {
	Component  string `json:"component"`
	State      string `json:"state"`
	Owned      bool   `json:"owned"`
	ID         string `json:"container_id,omitempty"`
	Running    bool   `json:"running"`
	StartedAt  string `json:"started_at,omitempty"`
	ExitCode   int    `json:"exit_code"`
	OOMKilled  bool   `json:"oom_killed"`
	Reason     string `json:"reason_code,omitempty"`
	NextAction string `json:"next_action,omitempty"`
}
type OperationCheck struct {
	Component  string `json:"component"`
	State      string `json:"state"`
	Reason     string `json:"reason_code"`
	NextAction string `json:"next_action,omitempty"`
}
type LogExport struct {
	RequestID     string `json:"request_id"`
	Component     string `json:"component"`
	ContainerID   string `json:"container_id"`
	RelativePath  string `json:"relative_path"`
	SHA256        string `json:"sha256"`
	CapturedBytes int    `json:"captured_bytes"`
	ByteLimit     int    `json:"byte_limit"`
	TailRequested int    `json:"tail_requested"`
	Truncated     bool   `json:"truncated"`
	Completeness  string `json:"completeness"`
}
type OperationResult struct {
	SchemaVersion     int                       `json:"schema_version"`
	Command           string                    `json:"command"`
	Component         string                    `json:"scope_component"`
	Action            string                    `json:"action"`
	InstallationID    string                    `json:"installation_id"`
	Profile           string                    `json:"profile"`
	OperationID       string                    `json:"operation_id"`
	MaintenanceID     string                    `json:"maintenance_id,omitempty"`
	Outcome           string                    `json:"outcome"`
	Phase             string                    `json:"phase"`
	Decision          string                    `json:"decision"`
	Reason            string                    `json:"reason_code,omitempty"`
	ExitCode          int                       `json:"exit_code"`
	Effect            string                    `json:"effect"`
	AuditPersistence  string                    `json:"audit_persistence"`
	Coverage          string                    `json:"coverage"`
	Consistency       string                    `json:"consistency"`
	ObservedAt        string                    `json:"observed_at"`
	RuntimeObserved   bool                      `json:"runtime_observed"`
	Runtime           *RuntimeObservation       `json:"runtime,omitempty"`
	ScopeReady        *bool                     `json:"scope_ready,omitempty"`
	ProcessesReady    bool                      `json:"foundation_processes_ready"`
	APIsReady         *bool                     `json:"foundation_apis_ready"`
	InstallationReady bool                      `json:"installation_ready"`
	Services          []ServiceObservation      `json:"services"`
	Checks            []OperationCheck          `json:"checks"`
	Limitations       []string                  `json:"limitations"`
	Pending           *operationIntent          `json:"pending_maintenance,omitempty"`
	PendingRuntime    *operationIntent          `json:"pending_runtime_maintenance,omitempty"`
	Export            *LogExport                `json:"private_log_export,omitempty"`
	Observability     *ObservabilityObservation `json:"observability,omitempty"`
	Hub               *HubObservation           `json:"hub,omitempty"`
	effectsStarted    bool
}

var operationServices = []string{"identity-db", "identity", "secret-store", "edge", "origin-tls"}

func managedOperationServices() []string {
	return append(append(append([]string{}, operationServices...), observabilityServices...), "homepage")
}

type liveService struct {
	observation ServiceObservation
	container   *accessContainer
}
type operationSnapshot struct {
	services         map[string]liveService
	checks           []OperationCheck
	runtime, network bool
	engine           *RuntimeObservation
	observability    *ObservabilityObservation
	hub              *HubObservation
}
