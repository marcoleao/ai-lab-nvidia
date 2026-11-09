// Package platform implements read-only configuration queries. It never starts
// a process, opens a network connection, or writes installation state.
package platform

type Configuration struct {
	SchemaVersion  int            `json:"schema_version"`
	InstallationID string         `json:"installation_id"`
	DefaultProfile string         `json:"default_profile"`
	DefaultStack   string         `json:"default_stack"`
	Publication    Publication    `json:"publication"`
	Ports          map[string]int `json:"ports"`
}

type Publication struct {
	Mode       string            `json:"mode"`
	BaseDomain *string           `json:"base_domain"`
	PublicURLs map[string]string `json:"public_urls"`
	Ingress    *IngressSettings  `json:"ingress,omitempty"`
}

// Optional preparation contract. Presence does not activate a listener/tunnel.
type IngressSettings struct {
	Revision   string  `json:"revision"`
	Hostname   *string `json:"hostname"`
	DirectPort int     `json:"direct_port"`
	TunnelPort int     `json:"tunnel_port"`
	TunnelID   *string `json:"tunnel_id"`
}

type Profile struct {
	SchemaVersion         int                 `json:"schema_version"`
	ID                    string              `json:"id"`
	HostOS                string              `json:"host_os"`
	Architecture          string              `json:"architecture"`
	Accelerator           string              `json:"accelerator"`
	ContainerRuntime      string              `json:"container_runtime"`
	InferenceRuntime      string              `json:"inference_runtime"`
	ComponentDependencies map[string][]string `json:"component_dependencies"`
	Capacity              Capacity            `json:"capacity"`
	Qualification         Qualification       `json:"qualification"`
}

type Capacity struct {
	HostMemoryGiB      *int `json:"host_memory_gib"`
	InferenceMemoryGiB *int `json:"inference_memory_gib"`
	MaxParallelJobs    int  `json:"max_parallel_jobs"`
}

type Qualification struct {
	Status   string   `json:"status"`
	Evidence []string `json:"evidence"`
}

type Catalog struct {
	SchemaVersion int                 `json:"schema_version"`
	Profiles      []string            `json:"profiles"`
	Layers        []string            `json:"layers"`
	Stacks        map[string][]string `json:"stacks"`
	Components    []Component         `json:"components"`
}

type Component struct {
	ID             string   `json:"id"`
	Layer          string   `json:"layer"`
	Kind           string   `json:"kind"`
	Product        *string  `json:"product"`
	Adoption       string   `json:"adoption"`
	Source         *string  `json:"source"`
	DependsOn      []string `json:"depends_on"`
	IntegratesWith []string `json:"integrates_with"`
	LocalPort      *int     `json:"local_port"`
	PublicName     *string  `json:"public_name"`
	Exposure       string   `json:"exposure"`
}

type CommandCatalog struct {
	SchemaVersion int       `json:"schema_version"`
	Commands      []Command `json:"commands"`
}

type Command struct {
	Command          string `json:"command"`
	Action           string `json:"action"`
	Effect           string `json:"effect"`
	AuditPersistence string `json:"audit_persistence"`
	Comparison       string `json:"comparison"`
	Rollback         string `json:"rollback"`
}

type Definition struct {
	Configuration Configuration
	Catalog       Catalog
	Profile       Profile
	Commands      CommandCatalog
	ByID          map[string]Component
	Digest        string
}

type Options struct {
	Command               string
	InstallationID        string
	Root                  string
	Configuration         string
	PreviousConfiguration string
	Profile               string
	Stack                 string
	Component             string
}

type Actor struct {
	Type      string `json:"type"`
	Identity  string `json:"identity"`
	Assurance string `json:"assurance"`
}

type Scope struct {
	Kind      string   `json:"kind"`
	Stack     string   `json:"stack"`
	Component string   `json:"component"`
	Targets   []string `json:"targets"`
}

type ComponentView struct {
	ID                       string   `json:"id"`
	Layer                    string   `json:"layer"`
	Kind                     string   `json:"kind"`
	Product                  *string  `json:"product"`
	SourceAdoption           string   `json:"source_adoption"`
	SourceReference          *string  `json:"source_reference"`
	ImplementationStatus     string   `json:"implementation_status"`
	RuntimeStatus            string   `json:"runtime_status"`
	DependsOn                []string `json:"depends_on"`
	IntegratesWith           []string `json:"integrates_with"`
	IntegrationsOutsideScope []string `json:"integrations_outside_scope"`
	DesiredLocalOrigin       *string  `json:"desired_local_origin"`
	DesiredPublicOrigin      *string  `json:"desired_public_origin"`
	Exposure                 string   `json:"exposure"`
	InferenceRuntime         *string  `json:"inference_runtime"`
}

type Step struct {
	Order              int    `json:"order"`
	ComponentID        string `json:"component_id"`
	RequiredWork       string `json:"required_work"`
	ExecutionSupported bool   `json:"execution_supported"`
}

type Result struct {
	SchemaVersion       int                `json:"schema_version"`
	Command             string             `json:"command"`
	Action              string             `json:"action"`
	Outcome             string             `json:"outcome"`
	Phase               string             `json:"phase"`
	Decision            string             `json:"decision"`
	OperationID         string             `json:"operation_id"`
	Actor               Actor              `json:"actor"`
	Effect              string             `json:"effect"`
	AuditPersistence    string             `json:"audit_persistence"`
	Comparison          string             `json:"comparison"`
	Rollback            string             `json:"rollback"`
	RuntimeChanges      bool               `json:"runtime_changes"`
	ConfigurationDigest string             `json:"configuration_digest,omitempty"`
	InstallationID      string             `json:"installation_id,omitempty"`
	Profile             *Profile           `json:"profile,omitempty"`
	Scope               *Scope             `json:"scope,omitempty"`
	ConfigurationValid  bool               `json:"configuration_valid"`
	InstallationReady   bool               `json:"installation_ready"`
	ExecutionSupported  bool               `json:"execution_supported"`
	PublicationMode     string             `json:"publication_mode,omitempty"`
	CatalogCount        int                `json:"catalog_count,omitempty"`
	SelectedCount       int                `json:"selected_count,omitempty"`
	Warnings            []string           `json:"warnings"`
	Components          []ComponentView    `json:"components"`
	Steps               []Step             `json:"steps"`
	ErrorCode           string             `json:"error_code,omitempty"`
	Publication         *PublicationReport `json:"publication,omitempty"`
}
