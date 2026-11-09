package platform

import (
	"crypto/rand"
	"fmt"
	"slices"
)

func dependencyOrder(byID map[string]Component, targets []string) ([]string, error) {
	visited, visiting := map[string]bool{}, map[string]bool{}
	ordered := make([]string, 0, len(byID))
	var visit func(string) error
	visit = func(id string) error {
		if visited[id] {
			return nil
		}
		if visiting[id] {
			return invalid("DEPENDENCY_CYCLE")
		}
		component, exists := byID[id]
		if !exists {
			return invalid("COMPONENT_REFERENCE_UNKNOWN")
		}
		visiting[id] = true
		for _, dependency := range component.DependsOn {
			if err := visit(dependency); err != nil {
				return err
			}
		}
		delete(visiting, id)
		visited[id] = true
		ordered = append(ordered, id)
		return nil
	}
	for _, target := range targets {
		if err := visit(target); err != nil {
			return nil, err
		}
	}
	return ordered, nil
}

func selectScope(definition *Definition, options Options) (Scope, []string, error) {
	if options.Stack != "" && options.Component != "" {
		return Scope{}, nil, invalid("SCOPE_AMBIGUOUS")
	}
	scope := Scope{Kind: "stack", Stack: options.Stack, Component: options.Component, Targets: []string{}}
	if (options.Command == "inventory" || options.Command == "publication") && options.Stack == "" && options.Component == "" {
		scope.Kind = "catalog"
		for _, component := range definition.Catalog.Components {
			scope.Targets = append(scope.Targets, component.ID)
		}
	} else if options.Component != "" {
		if !validID(options.Component) {
			return Scope{}, nil, invalid("COMPONENT_UNKNOWN")
		}
		if _, exists := definition.ByID[options.Component]; !exists {
			return Scope{}, nil, invalid("COMPONENT_UNKNOWN")
		}
		scope.Kind = "component"
		scope.Targets = []string{options.Component}
	} else {
		if scope.Stack == "" {
			scope.Stack = definition.Configuration.DefaultStack
		}
		roots, exists := definition.Catalog.Stacks[scope.Stack]
		if !validID(scope.Stack) || !exists {
			return Scope{}, nil, invalid("STACK_UNKNOWN")
		}
		scope.Targets = slices.Clone(roots)
	}
	ordered, err := dependencyOrder(definition.ByID, scope.Targets)
	return scope, ordered, err
}

func operationID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", invalid("CORRELATION_UNAVAILABLE")
	}
	value[6] = value[6]&0x0f | 0x40
	value[8] = value[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", value[:4], value[4:6], value[6:8], value[8:10], value[10:]), nil
}

func envelope(command string) Result {
	id, _ := operationID()
	return Result{
		SchemaVersion: 1, Command: command, Action: actions[command], Outcome: "SUCCEEDED", Phase: "COMPLETED", Decision: "NOT_APPLICABLE",
		OperationID: id, Actor: Actor{Type: "operator", Identity: "not_captured", Assurance: "not_verified"},
		Effect: "read_only", AuditPersistence: "none_read_only", Comparison: "NOT_APPLICABLE_READ_ONLY", Rollback: "NOT_APPLICABLE_NO_MUTATION",
		Warnings: []string{}, Components: []ComponentView{}, Steps: []Step{},
	}
}

func componentView(definition *Definition, id string, selected map[string]bool) ComponentView {
	component := definition.ByID[id]
	view := ComponentView{
		ID: id, Layer: component.Layer, Kind: component.Kind, Product: component.Product,
		SourceAdoption: component.Adoption, SourceReference: component.Source,
		ImplementationStatus: "not_adapted_to_foundation", RuntimeStatus: "not_observed",
		DependsOn: slices.Clone(component.DependsOn), IntegratesWith: slices.Clone(component.IntegratesWith),
		IntegrationsOutsideScope: []string{}, Exposure: component.Exposure,
	}
	if component.Adoption == "foundation_preparation" {
		view.ImplementationStatus = "preparation_implemented_not_qualified"
	}
	if component.LocalPort != nil {
		port := *component.LocalPort
		if override, exists := definition.Configuration.Ports[id]; exists {
			port = override
		}
		origin := fmt.Sprintf("http://127.0.0.1:%d", port)
		if id == "origin-tls" {
			origin = fmt.Sprintf("https://gateway.localhost:%d", port)
		}
		view.DesiredLocalOrigin = &origin
	}
	if origin := desiredPublicOrigin(definition.Configuration.Publication, component); origin != "" {
		view.DesiredPublicOrigin = &origin
	}
	if id == "inference" {
		view.InferenceRuntime = &definition.Profile.InferenceRuntime
	}
	for _, integration := range component.IntegratesWith {
		if !selected[integration] {
			view.IntegrationsOutsideScope = append(view.IntegrationsOutsideScope, integration)
		}
	}
	return view
}

func Query(options Options) (Result, error) {
	if actions[options.Command] == "" {
		return Result{}, invalid("COMMAND_UNKNOWN")
	}
	if options.PreviousConfiguration != "" && options.Command != "publication" {
		return Result{}, invalid("PREVIOUS_CONFIG_REQUIRES_PUBLICATION_QUERY")
	}
	definition, err := Load(options)
	if err != nil {
		return Result{}, err
	}
	if options.InstallationID != "" && (!validID(options.InstallationID) || options.InstallationID != definition.Configuration.InstallationID) {
		return Result{}, invalid("INSTALLATION_ID_MISMATCH")
	}
	scope, ordered, err := selectScope(definition, options)
	if err != nil {
		return Result{}, err
	}
	result := envelope(options.Command)
	if result.OperationID == "" {
		return Result{}, invalid("CORRELATION_UNAVAILABLE")
	}
	result.ConfigurationDigest = definition.Digest
	result.InstallationID = definition.Configuration.InstallationID
	result.Profile, result.Scope = &definition.Profile, &scope
	result.ConfigurationValid = true
	result.PublicationMode = definition.Configuration.Publication.Mode
	result.CatalogCount, result.SelectedCount = len(definition.Catalog.Components), len(ordered)
	if definition.Profile.Qualification.Status != "qualified" {
		result.Warnings = append(result.Warnings, "PROFILE_NOT_QUALIFIED")
	}
	if definition.Profile.Capacity.HostMemoryGiB == nil || definition.Profile.Capacity.InferenceMemoryGiB == nil {
		result.Warnings = append(result.Warnings, "CAPACITY_NOT_QUALIFIED")
	}
	if result.PublicationMode == "local" {
		result.Warnings = append(result.Warnings, "EXTERNAL_PUBLICATION_PENDING")
	}
	result.Warnings = append(result.Warnings, "FOUNDATION_PROVISIONING_INCOMPLETE")
	selected := map[string]bool{}
	for _, id := range ordered {
		selected[id] = true
	}
	selectionPending, integrationsMissing := false, false
	for index, id := range ordered {
		view := componentView(definition, id, selected)
		selectionPending = selectionPending || view.SourceAdoption == "selection_pending"
		integrationsMissing = integrationsMissing || len(view.IntegrationsOutsideScope) > 0
		if options.Command != "validate" {
			result.Components = append(result.Components, view)
		}
		if options.Command == "plan" {
			work := "implement_and_qualify_component"
			if view.SourceAdoption == "foundation_preparation" {
				work = "prepare_and_qualify_component"
			}
			result.Steps = append(result.Steps, Step{Order: index + 1, ComponentID: id, RequiredWork: work})
		}
	}
	if selectionPending {
		result.Warnings = append(result.Warnings, "COMPONENT_SELECTION_PENDING")
	}
	if integrationsMissing {
		result.Warnings = append(result.Warnings, "OPTIONAL_INTEGRATIONS_OUTSIDE_SCOPE")
	}
	if options.Command == "publication" {
		var previous *Definition
		if options.PreviousConfiguration != "" {
			previousOptions := options
			previousOptions.Configuration = options.PreviousConfiguration
			previous, err = Load(previousOptions)
			if err != nil {
				return Result{}, err
			}
			if previous.Configuration.InstallationID != definition.Configuration.InstallationID {
				return Result{}, invalid("PREVIOUS_CONFIG_INSTALLATION_MISMATCH")
			}
			if previous.Profile.ID != definition.Profile.ID {
				return Result{}, invalid("PREVIOUS_CONFIG_PROFILE_MISMATCH")
			}
		}
		result.Publication = publicationReport(definition, previous, ordered)
		result.Warnings = append(result.Warnings, "PUBLICATION_REPORT_IS_CONFIGURATION_ONLY", "PUBLICATION_EXECUTOR_NOT_IMPLEMENTED")
	}
	return result, nil
}
