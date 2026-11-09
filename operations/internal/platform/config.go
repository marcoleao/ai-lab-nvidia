package platform

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
)

type ValidationError struct{ Code string }

func (e *ValidationError) Error() string { return e.Code }
func invalid(code string) error          { return &ValidationError{Code: code} }

var identifier = regexp.MustCompile(`\A[a-z][a-z0-9]*(?:-[a-z0-9]+)*\z`)
var sourceReference = regexp.MustCompile(`\A[a-zA-Z0-9][a-zA-Z0-9_./-]{0,250}\z`)
var domainLabel = regexp.MustCompile(`\A[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\z`)

func validID(value string) bool { return len(value) <= 63 && identifier.MatchString(value) }

func validReference(value string) bool {
	if !sourceReference.MatchString(value) || path.IsAbs(value) {
		return false
	}
	for _, part := range strings.Split(value, "/") {
		if part == ".." {
			return false
		}
	}
	return true
}

func uniqueIDs(values []string, emptyAllowed bool) bool {
	if values == nil || (!emptyAllowed && len(values) == 0) {
		return false
	}
	seen := map[string]bool{}
	for _, value := range values {
		if !validID(value) || seen[value] {
			return false
		}
		seen[value] = true
	}
	return true
}

// checkTokens rejects duplicate keys (including escaped spellings), trailing
// values and excessive nesting before the typed, closed-schema decoder runs.
func checkTokens(decoder *json.Decoder, depth int) error {
	if depth > 32 {
		return invalid("CONFIG_JSON_INVALID")
	}
	token, err := decoder.Token()
	if err != nil {
		return invalid("CONFIG_JSON_INVALID")
	}
	delimiter, compound := token.(json.Delim)
	if !compound {
		return nil
	}
	switch delimiter {
	case '{':
		seen := map[string]bool{}
		for decoder.More() {
			key, err := decoder.Token()
			name, ok := key.(string)
			if err != nil || !ok || seen[name] {
				return invalid("CONFIG_JSON_INVALID")
			}
			seen[name] = true
			if err := checkTokens(decoder, depth+1); err != nil {
				return err
			}
		}
	case '[':
		for decoder.More() {
			if err := checkTokens(decoder, depth+1); err != nil {
				return err
			}
		}
	default:
		return invalid("CONFIG_JSON_INVALID")
	}
	if _, err := decoder.Token(); err != nil {
		return invalid("CONFIG_JSON_INVALID")
	}
	return nil
}

func readJSON(filename string, destination any) error {
	info, err := os.Lstat(filename)
	if err != nil {
		return invalid("CONFIG_JSON_UNAVAILABLE")
	}
	if !info.Mode().IsRegular() || info.Size() > 1<<20 {
		return invalid("CONFIG_FILE_UNSAFE")
	}
	data, err := os.ReadFile(filename)
	if err != nil {
		return invalid("CONFIG_JSON_UNAVAILABLE")
	}
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	check := json.NewDecoder(bytes.NewReader(data))
	if err := checkTokens(check, 0); err != nil {
		return err
	}
	if _, err := check.Token(); err != io.EOF {
		return invalid("CONFIG_JSON_INVALID")
	}
	if err := checkShape(data, reflect.TypeOf(destination).Elem()); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return invalid("CONFIG_JSON_INVALID")
	}
	return nil
}

// Struct tags are the schema: input fields are required unless explicitly
// omitempty, maps remain extensible, and only pointer fields accept null. This prevents
// encoding/json's case-insensitive struct matching from accepting aliases.
func checkShape(raw json.RawMessage, valueType reflect.Type) error {
	if valueType.Kind() == reflect.Pointer {
		if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return nil
		}
		return checkShape(raw, valueType.Elem())
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return invalid("CONFIG_FIELDS_INVALID")
	}
	switch valueType.Kind() {
	case reflect.Struct:
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(raw, &fields); err != nil {
			return invalid("CONFIG_FIELDS_INVALID")
		}
		declared := map[string]bool{}
		for index := 0; index < valueType.NumField(); index++ {
			field := valueType.Field(index)
			tag := strings.Split(field.Tag.Get("json"), ",")
			name := tag[0]
			declared[name] = true
			value, exists := fields[name]
			if !exists && slices.Contains(tag[1:], "omitempty") {
				continue
			}
			if !exists {
				return invalid("CONFIG_FIELDS_INVALID")
			}
			if err := checkShape(value, field.Type); err != nil {
				return err
			}
		}
		for name := range fields {
			if !declared[name] {
				return invalid("CONFIG_FIELDS_INVALID")
			}
		}
	case reflect.Map:
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(raw, &fields); err != nil {
			return invalid("CONFIG_FIELDS_INVALID")
		}
		for _, value := range fields {
			if err := checkShape(value, valueType.Elem()); err != nil {
				return err
			}
		}
	case reflect.Slice:
		var values []json.RawMessage
		if err := json.Unmarshal(raw, &values); err != nil {
			return invalid("CONFIG_FIELDS_INVALID")
		}
		for _, value := range values {
			if err := checkShape(value, valueType.Elem()); err != nil {
				return err
			}
		}
	}
	return nil
}

func validDomain(value string) bool {
	if len(value) > 253 || !strings.Contains(value, ".") || net.ParseIP(value) != nil {
		return false
	}
	for _, label := range strings.Split(value, ".") {
		if len(label) > 63 || !domainLabel.MatchString(label) {
			return false
		}
	}
	return true
}

func publicOrigin(value string) (string, error) {
	uri, err := url.Parse(value)
	if err != nil || uri.Scheme != "https" || uri.User != nil || uri.RawQuery != "" || uri.ForceQuery || uri.Fragment != "" || uri.RawFragment != "" || uri.RawPath != "" || (uri.Path != "" && uri.Path != "/") || uri.Opaque != "" || !validDomain(uri.Hostname()) || strings.HasSuffix(uri.Host, ":") {
		return "", invalid("PUBLIC_ORIGIN_INVALID")
	}
	if port := uri.Port(); port != "" {
		value, err := strconv.Atoi(port)
		if err != nil || value < 1 || value > 65535 {
			return "", invalid("PUBLIC_ORIGIN_INVALID")
		}
	}
	host := uri.Hostname()
	if port := uri.Port(); port != "" && port != "443" {
		host += ":" + port
	}
	return "https://" + host, nil
}

func Load(options Options) (*Definition, error) {
	var definition Definition
	root, err := filepath.Abs(options.Root)
	if err != nil {
		return nil, invalid("ROOT_INVALID")
	}
	if err := readJSON(filepath.Join(root, "operations", "catalog.json"), &definition.Catalog); err != nil {
		return nil, err
	}
	if err := readJSON(filepath.Join(root, "operations", "command-catalog.json"), &definition.Commands); err != nil {
		return nil, err
	}
	configuration := options.Configuration
	if configuration == "" {
		configuration = filepath.Join("environments", "platform.json")
	}
	if !filepath.IsAbs(configuration) {
		configuration = filepath.Join(root, filepath.FromSlash(configuration))
	}
	if err := readJSON(configuration, &definition.Configuration); err != nil {
		return nil, err
	}
	config, catalog := &definition.Configuration, &definition.Catalog
	if config.SchemaVersion != 1 || catalog.SchemaVersion != 1 || definition.Commands.SchemaVersion != 1 {
		return nil, invalid("SCHEMA_UNSUPPORTED")
	}
	if !validID(config.InstallationID) || !validID(config.DefaultProfile) || !validID(config.DefaultStack) || config.Ports == nil {
		return nil, invalid("CONFIG_FIELDS_INVALID")
	}
	if !uniqueIDs(catalog.Profiles, false) || !uniqueIDs(catalog.Layers, false) || len(catalog.Components) == 0 {
		return nil, invalid("CATALOG_FIELDS_INVALID")
	}
	if !slices.Contains(catalog.Profiles, config.DefaultProfile) {
		return nil, invalid("DEFAULT_PROFILE_UNKNOWN")
	}
	profileID := options.Profile
	if profileID == "" {
		profileID = config.DefaultProfile
	}
	if !validID(profileID) || !slices.Contains(catalog.Profiles, profileID) {
		return nil, invalid("PROFILE_UNKNOWN")
	}
	if err := readJSON(filepath.Join(root, "environments", "profiles", profileID+".json"), &definition.Profile); err != nil {
		return nil, err
	}
	if err := validateProfile(definition.Profile, profileID); err != nil {
		return nil, err
	}
	definition.ByID = map[string]Component{}
	names := map[string]bool{}
	for _, component := range catalog.Components {
		if !validID(component.ID) {
			return nil, invalid("COMPONENT_ID_INVALID")
		}
		if _, exists := definition.ByID[component.ID]; exists {
			return nil, invalid("COMPONENT_ID_DUPLICATED")
		}
		if !slices.Contains(catalog.Layers, component.Layer) {
			return nil, invalid("COMPONENT_LAYER_UNKNOWN")
		}
		if !slices.Contains([]string{"infrastructure", "tool", "runtime", "application"}, component.Kind) {
			return nil, invalid("COMPONENT_KIND_INVALID")
		}
		if component.Kind == "application" && component.Layer != "applications" {
			return nil, invalid("APPLICATION_LAYER_INVALID")
		}
		if component.Product != nil && !validID(*component.Product) {
			return nil, invalid("COMPONENT_PRODUCT_INVALID")
		}
		if !slices.Contains([]string{"candidate", "legacy_implementation", "selection_pending", "foundation_preparation"}, component.Adoption) {
			return nil, invalid("COMPONENT_ADOPTION_INVALID")
		}
		if component.Adoption == "candidate" && component.Product == nil {
			return nil, invalid("CANDIDATE_PRODUCT_REQUIRED")
		}
		if component.Source != nil && !validReference(*component.Source) {
			return nil, invalid("COMPONENT_SOURCE_INVALID")
		}
		if component.Adoption == "legacy_implementation" && component.Source == nil {
			return nil, invalid("LEGACY_SOURCE_REQUIRED")
		}
		if component.Adoption == "foundation_preparation" && component.Source == nil {
			return nil, invalid("FOUNDATION_SOURCE_REQUIRED")
		}
		if !uniqueIDs(component.DependsOn, true) || !uniqueIDs(component.IntegratesWith, true) {
			return nil, invalid("COMPONENT_DEPENDENCIES_INVALID")
		}
		if component.LocalPort != nil && (*component.LocalPort < 1 || *component.LocalPort > 65535) {
			return nil, invalid("COMPONENT_PORT_INVALID")
		}
		if !slices.Contains([]string{"private", "administrative", "application", "api"}, component.Exposure) {
			return nil, invalid("COMPONENT_EXPOSURE_INVALID")
		}
		if publishable(component) {
			if component.PublicName == nil || !validID(*component.PublicName) || component.LocalPort == nil {
				return nil, invalid("PUBLIC_COMPONENT_ENDPOINT_REQUIRED")
			}
			if names[*component.PublicName] {
				return nil, invalid("PUBLIC_NAME_DUPLICATED")
			}
			names[*component.PublicName] = true
		} else if component.PublicName != nil {
			return nil, invalid("PRIVATE_COMPONENT_PUBLICATION_DENIED")
		}
		definition.ByID[component.ID] = component
	}
	first, exists := definition.ByID["sdlc"]
	if !exists || first.Kind != "application" {
		return nil, invalid("FIRST_APPLICATION_REQUIRED")
	}
	for id, dependencies := range definition.Profile.ComponentDependencies {
		component, exists := definition.ByID[id]
		if !exists {
			return nil, invalid("PROFILE_COMPONENT_UNKNOWN")
		}
		if !uniqueIDs(dependencies, true) {
			return nil, invalid("PROFILE_DEPENDENCIES_INVALID")
		}
		component.DependsOn = dependencies
		definition.ByID[id] = component
	}
	for _, component := range catalog.Components {
		effective := definition.ByID[component.ID]
		for _, target := range append(slices.Clone(effective.DependsOn), effective.IntegratesWith...) {
			if _, exists := definition.ByID[target]; !exists {
				return nil, invalid("COMPONENT_REFERENCE_UNKNOWN")
			}
			if target == component.ID {
				return nil, invalid("COMPONENT_SELF_REFERENCE")
			}
		}
	}
	allIDs := make([]string, 0, len(catalog.Components))
	for _, component := range catalog.Components {
		allIDs = append(allIDs, component.ID)
	}
	if _, err := dependencyOrder(definition.ByID, allIDs); err != nil {
		return nil, err
	}
	if len(catalog.Stacks) == 0 {
		return nil, invalid("STACKS_INVALID")
	}
	for name, ids := range catalog.Stacks {
		if !validID(name) || !uniqueIDs(ids, false) {
			return nil, invalid("STACK_COMPONENTS_INVALID")
		}
		for _, id := range ids {
			if _, exists := definition.ByID[id]; !exists {
				return nil, invalid("STACK_COMPONENT_UNKNOWN")
			}
		}
	}
	if !slices.Contains(catalog.Stacks["foundation"], "sdlc") || !slices.Contains(catalog.Stacks["sdlc"], "sdlc") {
		return nil, invalid("FIRST_APPLICATION_STACK_REQUIRED")
	}
	if _, exists := catalog.Stacks[config.DefaultStack]; !exists {
		return nil, invalid("DEFAULT_STACK_UNKNOWN")
	}
	for id, port := range config.Ports {
		component, exists := definition.ByID[id]
		if !exists || component.LocalPort == nil || port < 1 || port > 65535 {
			return nil, invalid("PORT_OVERRIDE_INVALID")
		}
	}
	ports := map[int]bool{}
	for _, component := range catalog.Components {
		if component.LocalPort == nil {
			continue
		}
		port := *component.LocalPort
		if override, exists := config.Ports[component.ID]; exists {
			port = override
		}
		if ports[port] {
			return nil, invalid("LOCAL_PORT_COLLISION")
		}
		ports[port] = true
	}
	if err := validatePublication(config.Publication, definition.ByID); err != nil {
		return nil, err
	}
	if settings := config.Publication.Ingress; settings != nil {
		for port := range ports {
			if settings.DirectPort == port || settings.TunnelPort == port {
				return nil, invalid("INGRESS_PORT_COLLISION")
			}
		}
	}
	if err := validateCommands(definition.Commands); err != nil {
		return nil, err
	}
	// encoding/json sorts map keys, yielding a stable digest across platforms.
	serialized, err := json.Marshal([]any{definition.Configuration, definition.Catalog, definition.Profile, definition.Commands})
	if err != nil {
		return nil, invalid("CONFIG_DIGEST_FAILED")
	}
	sum := sha256.Sum256(serialized)
	definition.Digest = hex.EncodeToString(sum[:])
	return &definition, nil
}

func validateProfile(profile Profile, id string) error {
	if profile.SchemaVersion != 1 || profile.ID != id {
		return invalid("PROFILE_ID_OR_SCHEMA_INVALID")
	}
	expected := map[string][]string{
		"precision-windows": {"windows", "amd64", "cuda", "docker-wsl2", "ollama-container"},
		"macos-m3-max":      {"macos", "arm64", "metal", "docker-linux-vm", "ollama-native"},
		"dell-gb10":         {"linux", "arm64", "cuda", "docker-native", "ollama-container"},
	}
	binding := []string{profile.HostOS, profile.Architecture, profile.Accelerator, profile.ContainerRuntime, profile.InferenceRuntime}
	if !slices.Equal(binding, expected[id]) || profile.ComponentDependencies == nil {
		return invalid("PROFILE_BINDING_INVALID")
	}
	for _, value := range []*int{profile.Capacity.HostMemoryGiB, profile.Capacity.InferenceMemoryGiB} {
		if value != nil && (*value < 1 || *value > 65536) {
			return invalid("CAPACITY_INVALID")
		}
	}
	if profile.Capacity.MaxParallelJobs < 1 || profile.Capacity.MaxParallelJobs > 128 {
		return invalid("CAPACITY_INVALID")
	}
	if profile.Capacity.HostMemoryGiB != nil && profile.Capacity.InferenceMemoryGiB != nil && *profile.Capacity.InferenceMemoryGiB >= *profile.Capacity.HostMemoryGiB {
		return invalid("CAPACITY_NO_HOST_RESERVE")
	}
	qualification := profile.Qualification
	if !slices.Contains([]string{"not_qualified", "partially_qualified", "qualified"}, qualification.Status) || qualification.Evidence == nil {
		return invalid("QUALIFICATION_INVALID")
	}
	if qualification.Status != "not_qualified" && len(qualification.Evidence) == 0 {
		return invalid("QUALIFICATION_EVIDENCE_REQUIRED")
	}
	for _, reference := range qualification.Evidence {
		if !validReference(reference) {
			return invalid("QUALIFICATION_EVIDENCE_INVALID")
		}
	}
	return nil
}

func publishable(component Component) bool {
	return component.Exposure == "application" || component.Exposure == "api"
}

func desiredPublicOrigin(publication Publication, component Component) string {
	if publication.Mode == "local" || !publishable(component) {
		return ""
	}
	if override, exists := publication.PublicURLs[component.ID]; exists {
		origin, _ := publicOrigin(override)
		return origin
	}
	if publication.BaseDomain != nil {
		return "https://" + *component.PublicName + "." + *publication.BaseDomain
	}
	return ""
}

func validatePublication(publication Publication, byID map[string]Component) error {
	if s := publication.Ingress; s != nil {
		if !validID(s.Revision) || s.Hostname != nil && !validDomain(*s.Hostname) || s.DirectPort < 1024 || s.DirectPort > 65535 || s.TunnelPort < 1024 || s.TunnelPort > 65535 || s.DirectPort == s.TunnelPort {
			return invalid("INGRESS_SETTINGS_INVALID")
		}
		if s.TunnelID != nil && !regexp.MustCompile(`\A[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\z`).MatchString(*s.TunnelID) {
			return invalid("INGRESS_TUNNEL_ID_INVALID")
		}
		if host := CandidateIngressHostname(publication); host != "" && !validDomain(host) {
			return invalid("INGRESS_HOSTNAME_INVALID")
		}
	}
	if !slices.Contains([]string{"local", "direct", "tunnel"}, publication.Mode) || publication.PublicURLs == nil {
		return invalid("PUBLICATION_FIELDS_INVALID")
	}
	if publication.BaseDomain != nil && !validDomain(*publication.BaseDomain) {
		return invalid("PUBLICATION_DOMAIN_INVALID")
	}
	for id, value := range publication.PublicURLs {
		component, exists := byID[id]
		if !exists {
			return invalid("PUBLIC_URL_COMPONENT_UNKNOWN")
		}
		if !publishable(component) {
			return invalid("PRIVATE_COMPONENT_PUBLICATION_DENIED")
		}
		if _, err := publicOrigin(value); err != nil {
			return err
		}
	}
	if publication.Mode != "local" && publication.BaseDomain == nil && len(publication.PublicURLs) == 0 {
		return invalid("PUBLICATION_ADDRESS_REQUIRED")
	}
	// Check stored addresses even in local mode, without activating publication.
	publication.Mode = "direct"
	origins := map[string]bool{}
	for _, id := range sortedKeys(byID) {
		origin := desiredPublicOrigin(publication, byID[id])
		if origin == "" {
			continue
		}
		if origins[origin] {
			return invalid("PUBLIC_ORIGIN_COLLISION")
		}
		origins[origin] = true
	}
	return nil
}

var actions = map[string]string{
	"validate":    "PLATFORM_CONFIGURATION_VALIDATED",
	"inventory":   "PLATFORM_INVENTORY_READ",
	"plan":        "PLATFORM_PLAN_COMPUTED",
	"publication": "PLATFORM_PUBLICATION_PLAN_COMPUTED",
}

func validateCommands(catalog CommandCatalog) error {
	if len(catalog.Commands) != len(actions) {
		return invalid("COMMAND_CATALOG_INVALID")
	}
	seen := map[string]bool{}
	for _, command := range catalog.Commands {
		if actions[command.Command] == "" || command.Action != actions[command.Command] || seen[command.Command] {
			return invalid("COMMAND_ACTION_INVALID")
		}
		if command.Effect != "read_only" || command.AuditPersistence != "none_read_only" || command.Comparison != "NOT_APPLICABLE_READ_ONLY" || command.Rollback != "NOT_APPLICABLE_NO_MUTATION" {
			return invalid("COMMAND_MUTATION_DENIED")
		}
		seen[command.Command] = true
	}
	return nil
}

func sortedKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func errorCode(err error) string {
	var validation *ValidationError
	if errors.As(err, &validation) {
		return validation.Code
	}
	return "PLATFORM_QUERY_FAILED"
}
