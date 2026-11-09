package platform

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"testing"
)

func fixture(t *testing.T) string {
	t.Helper()
	_, source, _, _ := runtime.Caller(0)
	repository := filepath.Clean(filepath.Join(filepath.Dir(source), "../../.."))
	root := t.TempDir()
	for _, name := range []string{"operations/catalog.json", "operations/command-catalog.json", "environments/platform.json", "environments/profiles/precision-windows.json", "environments/profiles/macos-m3-max.json", "environments/profiles/dell-gb10.json"} {
		data, err := os.ReadFile(filepath.Join(repository, filepath.FromSlash(name)))
		if err != nil {
			t.Fatal(err)
		}
		target := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func edit(t *testing.T, root, filename string, mutate func(map[string]any)) {
	t.Helper()
	target := filepath.Join(root, filepath.FromSlash(filename))
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	mutate(value)
	data, err = json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, data, 0600); err != nil {
		t.Fatal(err)
	}
}

func component(value map[string]any, id string) map[string]any {
	for _, raw := range value["components"].([]any) {
		item := raw.(map[string]any)
		if item["id"] == id {
			return item
		}
	}
	panic("missing test component")
}

func mustQuery(t *testing.T, options Options) Result {
	t.Helper()
	result, err := Query(options)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestInstallationBinding(t *testing.T) {
	root := fixture(t)
	before := snapshot(t, root)
	for _, command := range []string{"validate", "inventory", "plan"} {
		options := Options{Root: root, Command: command, InstallationID: "ai-platform-local"}
		mustQuery(t, options)
		options.InstallationID = "another-installation"
		if _, err := Query(options); errorCode(err) != "INSTALLATION_ID_MISMATCH" {
			t.Fatalf("wrong installation was accepted: %v", err)
		}
	}
	var output, diagnostic bytes.Buffer
	if code := Run([]string{"validate", "--root", root, "--installation-id", "another-installation", "--format", "json"}, &output, &diagnostic); code != 1 || !strings.Contains(output.String(), "INSTALLATION_ID_MISMATCH") {
		t.Fatal("CLI did not enforce installation binding")
	}
	if !reflect.DeepEqual(before, snapshot(t, root)) {
		t.Fatal("binding queries changed files")
	}
}

func snapshot(t *testing.T, root string) map[string][32]byte {
	t.Helper()
	result := map[string][32]byte{}
	err := filepath.WalkDir(root, func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		data, err := os.ReadFile(name)
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, name)
		if err != nil {
			return err
		}
		result[relative] = sha256.Sum256(data)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestProfilesAndReadOnlyQueries(t *testing.T) {
	root := fixture(t)
	before := snapshot(t, root)
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		for _, command := range []string{"validate", "inventory", "plan"} {
			t.Run(profile+"/"+command, func(t *testing.T) {
				options := Options{Root: root, Command: command, Profile: profile}
				first, second := mustQuery(t, options), mustQuery(t, options)
				if first.OperationID == second.OperationID || first.ConfigurationDigest != second.ConfigurationDigest {
					t.Fatal("retry must have fresh correlation and the same configuration fingerprint")
				}
				if first.RuntimeChanges || first.InstallationReady || first.ExecutionSupported || !first.ConfigurationValid {
					t.Fatal("configuration validation must not claim installation readiness")
				}
				if first.AuditPersistence != "none_read_only" || first.Comparison != "NOT_APPLICABLE_READ_ONLY" || first.Rollback != "NOT_APPLICABLE_NO_MUTATION" {
					t.Fatal("read-only classification changed")
				}
				if first.Profile.ID != profile || first.Profile.Qualification.Status != "not_qualified" {
					t.Fatal("profile was silently qualified")
				}
				if !slices.Contains(first.Warnings, "FOUNDATION_PROVISIONING_INCOMPLETE") || !slices.Contains(first.Warnings, "EXTERNAL_PUBLICATION_PENDING") {
					t.Fatal("missing capability disclosure")
				}
				for _, view := range first.Components {
					if view.RuntimeStatus != "not_observed" || view.DesiredPublicOrigin != nil {
						t.Fatal("local queries must not activate publication or invent live state")
					}
				}
			})
		}
	}
	if !reflect.DeepEqual(before, snapshot(t, root)) {
		t.Fatal("a read-only command modified its input or created state")
	}
}

func TestInventoryScopeAndFirstApplication(t *testing.T) {
	root := fixture(t)
	all := mustQuery(t, Options{Root: root, Command: "inventory"})
	if all.Scope.Kind != "catalog" || all.SelectedCount != all.CatalogCount || len(all.Components) != all.CatalogCount {
		t.Fatal("default inventory omitted declared components")
	}
	applications := []string{}
	preparations := map[string]bool{}
	for _, view := range all.Components {
		if view.SourceAdoption == "foundation_preparation" {
			if view.ImplementationStatus != "preparation_implemented_not_qualified" || view.RuntimeStatus != "not_observed" {
				t.Fatal("preparation claimed qualification", view)
			}
			preparations[view.ID] = true
		}
		if view.Kind == "application" {
			applications = append(applications, view.ID)
		}
	}
	if len(preparations) != 14 || !preparations["network"] || !preparations["host"] || !preparations["container-runtime"] || !preparations["identity"] || !preparations["secret-store"] || !preparations["edge"] || !preparations["origin-tls"] || !preparations["ingress-adapters"] || !preparations["metrics"] || !preparations["logs"] || !preparations["telemetry"] || !preparations["grafana"] || !preparations["homepage"] || !preparations["gitlab"] {
		t.Fatal("foundation code absent from inventory", preparations)
	}
	if !slices.Equal(applications, []string{"sdlc"}) {
		t.Fatal("Portal SDLC must be the first application; tools must retain their own classification")
	}
	limited := mustQuery(t, Options{Root: root, Command: "inventory", Component: "sdlc"})
	if limited.Scope.Kind != "component" || limited.SelectedCount >= limited.CatalogCount || len(limited.Components) != limited.SelectedCount {
		t.Fatal("component scope is not explicit or complete")
	}
	if !slices.Contains(limited.Warnings, "OPTIONAL_INTEGRATIONS_OUTSIDE_SCOPE") {
		t.Fatal("feature dependencies outside the minimal application scope must remain visible")
	}
	for _, view := range limited.Components {
		if view.ID == "inference" {
			t.Fatal("browsing the application must not require optional inference")
		}
	}
}

func TestDependencyPlanAndProfileOverrides(t *testing.T) {
	root := fixture(t)
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		plan := mustQuery(t, Options{Root: root, Command: "plan", Profile: profile})
		completed := map[string]bool{}
		for index, step := range plan.Steps {
			view := plan.Components[index]
			if step.Order != index+1 || step.ComponentID != view.ID || step.ExecutionSupported {
				t.Fatal("invalid plan step")
			}
			for _, dependency := range view.DependsOn {
				if !completed[dependency] {
					t.Fatal("dependency appears after consumer")
				}
			}
			if completed[view.ID] {
				t.Fatal("dependency was scheduled twice")
			}
			completed[view.ID] = true
		}
		if !completed["sdlc"] || !completed["telemetry"] || completed["replay"] {
			t.Fatal("foundation stack omitted its application or included an optional experiment")
		}
		inference := mustQuery(t, Options{Root: root, Command: "plan", Profile: profile, Component: "inference"})
		ids := []string{}
		for _, step := range inference.Steps {
			ids = append(ids, step.ComponentID)
		}
		if slices.Contains(ids, "container-runtime") == (profile == "macos-m3-max") {
			t.Fatal("container inference and native Metal must have different prerequisites")
		}
	}
}

func TestPublicationIsDesiredConfigurationOnly(t *testing.T) {
	root := fixture(t)
	local := mustQuery(t, Options{Root: root, Command: "inventory"})
	edit(t, root, "environments/platform.json", func(value map[string]any) {
		publication := value["publication"].(map[string]any)
		publication["base_domain"] = "platform.example.test"
	})
	stored := mustQuery(t, Options{Root: root, Command: "inventory"})
	for _, view := range stored.Components {
		if view.DesiredPublicOrigin != nil {
			t.Fatal("storing a domain must not enable publication in local mode")
		}
	}
	edit(t, root, "environments/platform.json", func(value map[string]any) { value["publication"].(map[string]any)["mode"] = "direct" })
	public := mustQuery(t, Options{Root: root, Command: "inventory"})
	if local.InstallationID != public.InstallationID || local.ConfigurationDigest == public.ConfigurationDigest || public.InstallationReady {
		t.Fatal("domain update must preserve identity and not imply deployment")
	}
	for _, view := range public.Components {
		if view.ID == "sdlc" && (view.DesiredPublicOrigin == nil || *view.DesiredPublicOrigin != "https://sdlc.platform.example.test") {
			t.Fatal("public application URL was not derived")
		}
		if view.ID == "inference" && view.DesiredPublicOrigin != nil {
			t.Fatal("raw inference was published")
		}
	}
	edit(t, root, "environments/platform.json", func(value map[string]any) {
		publication := value["publication"].(map[string]any)
		publication["mode"], publication["base_domain"] = "tunnel", nil
		publication["public_urls"] = map[string]any{"sdlc": "https://portal.customer.example/"}
		value["ports"] = map[string]any{"sdlc": 3320}
	})
	tunneled := mustQuery(t, Options{Root: root, Command: "inventory"})
	for _, view := range tunneled.Components {
		if view.ID == "sdlc" && (*view.DesiredPublicOrigin != "https://portal.customer.example" || *view.DesiredLocalOrigin != "http://127.0.0.1:3320") {
			t.Fatal("explicit origin or local port override ignored")
		}
	}
}

func TestRejectInvalidDefinitions(t *testing.T) {
	tests := []struct {
		name, file, code string
		mutate           func(map[string]any)
	}{
		{"unknown credential field", "environments/platform.json", "CONFIG_FIELDS_INVALID", func(v map[string]any) { v["password"] = "DO_NOT_DISCLOSE" }},
		{"wrong field case", "environments/platform.json", "CONFIG_FIELDS_INVALID", func(v map[string]any) { v["Schema_Version"] = v["schema_version"]; delete(v, "schema_version") }},
		{"boolean schema", "environments/platform.json", "CONFIG_JSON_INVALID", func(v map[string]any) { v["schema_version"] = true }},
		{"null ports", "environments/platform.json", "CONFIG_FIELDS_INVALID", func(v map[string]any) { v["ports"] = nil }},
		{"unknown default profile", "environments/platform.json", "DEFAULT_PROFILE_UNKNOWN", func(v map[string]any) { v["default_profile"] = "unknown" }},
		{"unknown default stack", "environments/platform.json", "DEFAULT_STACK_UNKNOWN", func(v map[string]any) { v["default_stack"] = "unknown" }},
		{"port collision", "environments/platform.json", "LOCAL_PORT_COLLISION", func(v map[string]any) { v["ports"] = map[string]any{"sdlc": 3180} }},
		{"fractional port", "environments/platform.json", "CONFIG_JSON_INVALID", func(v map[string]any) { v["ports"] = map[string]any{"sdlc": 3310.5} }},
		{"unknown port", "environments/platform.json", "PORT_OVERRIDE_INVALID", func(v map[string]any) { v["ports"] = map[string]any{"unknown": 3320} }},
		{"expose private API", "environments/platform.json", "PRIVATE_COMPONENT_PUBLICATION_DENIED", func(v map[string]any) {
			v["publication"].(map[string]any)["public_urls"] = map[string]any{"inference": "https://raw.example.test"}
		}},
		{"external mode without address", "environments/platform.json", "PUBLICATION_ADDRESS_REQUIRED", func(v map[string]any) { v["publication"].(map[string]any)["mode"] = "direct" }},
		{"domain with scheme", "environments/platform.json", "PUBLICATION_DOMAIN_INVALID", func(v map[string]any) { v["publication"].(map[string]any)["base_domain"] = "https://example.test" }},
		{"domain uppercase", "environments/platform.json", "PUBLICATION_DOMAIN_INVALID", func(v map[string]any) { v["publication"].(map[string]any)["base_domain"] = "Example.test" }},
		{"origin collision with derived URL", "environments/platform.json", "PUBLIC_ORIGIN_COLLISION", func(v map[string]any) {
			p := v["publication"].(map[string]any)
			p["base_domain"] = "example.test"
			p["public_urls"] = map[string]any{"sdlc": "https://git.example.test/"}
		}},
		{"duplicate component", "operations/catalog.json", "COMPONENT_ID_DUPLICATED", func(v map[string]any) { v["components"] = append(v["components"].([]any), component(v, "sdlc")) }},
		{"missing first application", "operations/catalog.json", "FIRST_APPLICATION_REQUIRED", func(v map[string]any) { component(v, "sdlc")["kind"] = "tool" }},
		{"application in middleware", "operations/catalog.json", "APPLICATION_LAYER_INVALID", func(v map[string]any) { component(v, "sdlc")["layer"] = "middleware" }},
		{"source traversal", "operations/catalog.json", "COMPONENT_SOURCE_INVALID", func(v map[string]any) { component(v, "sdlc")["source"] = "../private.env" }},
		{"null dependencies", "operations/catalog.json", "CONFIG_FIELDS_INVALID", func(v map[string]any) { component(v, "sdlc")["depends_on"] = nil }},
		{"unknown dependency outside scope", "operations/catalog.json", "COMPONENT_REFERENCE_UNKNOWN", func(v map[string]any) { component(v, "replay")["depends_on"] = []any{"missing"} }},
		{"dependency cycle outside scope", "operations/catalog.json", "DEPENDENCY_CYCLE", func(v map[string]any) { component(v, "host")["depends_on"] = []any{"replay"} }},
		{"unknown integration", "operations/catalog.json", "COMPONENT_REFERENCE_UNKNOWN", func(v map[string]any) { component(v, "sdlc")["integrates_with"] = []any{"missing"} }},
		{"unknown stack component", "operations/catalog.json", "STACK_COMPONENT_UNKNOWN", func(v map[string]any) { v["stacks"].(map[string]any)["custom"] = []any{"missing"} }},
		{"first app absent from foundation", "operations/catalog.json", "FIRST_APPLICATION_STACK_REQUIRED", func(v map[string]any) { v["stacks"].(map[string]any)["foundation"] = []any{"homepage"} }},
		{"private component public name", "operations/catalog.json", "PRIVATE_COMPONENT_PUBLICATION_DENIED", func(v map[string]any) { component(v, "inference")["public_name"] = "raw" }},
		{"candidate without product", "operations/catalog.json", "CANDIDATE_PRODUCT_REQUIRED", func(v map[string]any) { component(v, "sonarqube")["product"] = nil }},
		{"incorrect profile binding", "environments/profiles/precision-windows.json", "PROFILE_BINDING_INVALID", func(v map[string]any) { v["accelerator"] = "metal" }},
		{"profile ID mismatch", "environments/profiles/precision-windows.json", "PROFILE_ID_OR_SCHEMA_INVALID", func(v map[string]any) { v["id"] = "dell-gb10" }},
		{"unknown overridden component", "environments/profiles/precision-windows.json", "PROFILE_COMPONENT_UNKNOWN", func(v map[string]any) { v["component_dependencies"] = map[string]any{"missing": []any{"host"}} }},
		{"overridden dependency cycle", "environments/profiles/precision-windows.json", "DEPENDENCY_CYCLE", func(v map[string]any) { v["component_dependencies"] = map[string]any{"host": []any{"network"}} }},
		{"no host memory reserve", "environments/profiles/precision-windows.json", "CAPACITY_NO_HOST_RESERVE", func(v map[string]any) {
			c := v["capacity"].(map[string]any)
			c["host_memory_gib"] = 16
			c["inference_memory_gib"] = 16
		}},
		{"qualification without evidence", "environments/profiles/precision-windows.json", "QUALIFICATION_EVIDENCE_REQUIRED", func(v map[string]any) { v["qualification"].(map[string]any)["status"] = "qualified" }},
		{"mutating command catalog", "operations/command-catalog.json", "COMMAND_MUTATION_DENIED", func(v map[string]any) { v["commands"].([]any)[0].(map[string]any)["effect"] = "write" }},
		{"wrong command action", "operations/command-catalog.json", "COMMAND_ACTION_INVALID", func(v map[string]any) {
			v["commands"].([]any)[0].(map[string]any)["action"] = "PLATFORM_INSTALL_SUCCEEDED"
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root := fixture(t)
			edit(t, root, test.file, test.mutate)
			before := snapshot(t, root)
			_, err := Query(Options{Root: root, Command: "plan", Component: "host"})
			if err == nil || errorCode(err) != test.code {
				t.Fatalf("expected %s, got %v", test.code, err)
			}
			if !reflect.DeepEqual(before, snapshot(t, root)) {
				t.Fatal("rejected query changed files")
			}
		})
	}
}

func TestUnsafePublicOrigins(t *testing.T) {
	for _, origin := range []string{"http://portal.example.test", "https://user:DO_NOT_DISCLOSE@portal.example.test", "https://portal.example.test/?token=DO_NOT_DISCLOSE", "https://portal.example.test/#DO_NOT_DISCLOSE", "https://portal.example.test/path", "https://127.0.0.1", "https://localhost", "https://portal.example.test:0", "https://portal.example.test:65536"} {
		t.Run(origin, func(t *testing.T) {
			if _, err := publicOrigin(origin); err == nil {
				t.Fatal("unsafe public origin accepted")
			}
		})
	}
}

func TestMalformedDuplicateAndTrailingJSONAreSanitized(t *testing.T) {
	for _, raw := range []string{
		`{"schema_version":1,"schema_version":1,"secret":"DO_NOT_DISCLOSE"}`,
		`{"id":"one","\u0069d":"two"}`,
		`{"password":"DO_NOT_DISCLOSE"`,
		`{} "DO_NOT_DISCLOSE"`,
	} {
		root := fixture(t)
		filename := filepath.Join(root, "environments", "platform.json")
		if err := os.WriteFile(filename, []byte(raw), 0600); err != nil {
			t.Fatal(err)
		}
		var stdout, stderr bytes.Buffer
		code := Run([]string{"validate", "--root", root, "--format", "json"}, &stdout, &stderr)
		if code != 1 || strings.Contains(stdout.String()+stderr.String(), "DO_NOT_DISCLOSE") {
			t.Fatal("invalid JSON was accepted or sensitive parser text was disclosed")
		}
		var result Result
		if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.ErrorCode != "CONFIG_JSON_INVALID" || result.OperationID == "" || result.Action != actions["validate"] || result.RuntimeChanges {
			t.Fatal("invalid failure envelope")
		}
	}
}

func TestCLIQueriesSelectorsAndRetry(t *testing.T) {
	root := fixture(t)
	for _, command := range []string{"validate", "inventory", "plan"} {
		var stdout, stderr bytes.Buffer
		if code := Run([]string{command, "--root", root, "--profile", "macos-m3-max", "--format", "json"}, &stdout, &stderr); code != 0 {
			t.Fatalf("%s: %s", command, stderr.String())
		}
		var result Result
		if err := json.Unmarshal(stdout.Bytes(), &result); err != nil || result.Profile.ID != "macos-m3-max" {
			t.Fatal("CLI result invalid")
		}
	}
	for _, test := range []struct {
		args []string
		code string
	}{
		{[]string{"--profile", "../../private"}, "PROFILE_UNKNOWN"},
		{[]string{"--profile", "precision-windows\n"}, "PROFILE_UNKNOWN"},
		{[]string{"--stack", "missing"}, "STACK_UNKNOWN"},
		{[]string{"--component", "missing"}, "COMPONENT_UNKNOWN"},
		{[]string{"--stack", "sdlc", "--component", "sdlc"}, "SCOPE_AMBIGUOUS"},
	} {
		var stdout, stderr bytes.Buffer
		args := append([]string{"plan", "--root", root, "--format", "json"}, test.args...)
		if code := Run(args, &stdout, &stderr); code != 1 {
			t.Fatal("invalid selector accepted")
		}
		var result Result
		if err := json.Unmarshal(stdout.Bytes(), &result); err != nil || result.ErrorCode != test.code {
			t.Fatalf("expected %s, got %s", test.code, stdout.String())
		}
	}
	var stdout, stderr bytes.Buffer
	if code := Run([]string{"plan", "--root", root, "--component", "sdlc"}, &stdout, &stderr); code != 0 || !strings.Contains(stdout.String(), "provisioning executors are not available") {
		t.Fatal("text query must disclose implementation limits")
	}
	for _, args := range [][]string{{"--help"}, {"plan", "--help"}} {
		stdout.Reset()
		stderr.Reset()
		if code := Run(args, &stdout, &stderr); code != 0 || !strings.Contains(stdout.String(), "Read-only") {
			t.Fatal("help unavailable")
		}
	}
	// Rejection is side-effect-free; fixing only the fixture makes the same query work.
	edit(t, root, "environments/platform.json", func(v map[string]any) { v["publication"].(map[string]any)["mode"] = "direct" })
	if _, err := Query(Options{Root: root, Command: "plan"}); errorCode(err) != "PUBLICATION_ADDRESS_REQUIRED" {
		t.Fatal("expected address rejection")
	}
	edit(t, root, "environments/platform.json", func(v map[string]any) { v["publication"].(map[string]any)["mode"] = "local" })
	mustQuery(t, Options{Root: root, Command: "plan"})
}

func TestSymlinkInputRejected(t *testing.T) {
	root := fixture(t)
	source := filepath.Join(root, "environments", "platform.json")
	link := filepath.Join(root, "symlink.json")
	if err := os.Symlink(source, link); err != nil {
		t.Skip("symlink creation is unavailable on this host")
	}
	_, err := Query(Options{Root: root, Command: "validate", Configuration: link})
	if errorCode(err) != "CONFIG_FILE_UNSAFE" {
		t.Fatal("symlink configuration accepted")
	}
}

func TestRootDiscoveryAndAlternateConfiguration(t *testing.T) {
	root := fixture(t)
	t.Chdir(filepath.Join(root, "environments", "profiles"))
	var stdout, stderr bytes.Buffer
	if code := Run([]string{"validate", "--format", "json"}, &stdout, &stderr); code != 0 {
		t.Fatalf("root discovery failed: %s", stderr.String())
	}
	original, err := os.ReadFile(filepath.Join(root, "environments", "platform.json"))
	if err != nil {
		t.Fatal(err)
	}
	alternate := bytes.Replace(original, []byte("ai-platform-local"), []byte("another-installation"), 1)
	if err := os.WriteFile(filepath.Join(root, "environments", "local.json"), alternate, 0600); err != nil {
		t.Fatal(err)
	}
	result := mustQuery(t, Options{Root: root, Command: "validate", Configuration: "environments/local.json"})
	if result.InstallationID != "another-installation" {
		t.Fatal("alternate configuration was not selected relative to root")
	}
}

func TestOriginCanonicalizationAndCollision(t *testing.T) {
	origin, err := publicOrigin("https://portal.example.test:443/")
	if err != nil || origin != "https://portal.example.test" {
		t.Fatal("default HTTPS port was not normalized")
	}
	if _, err := publicOrigin("https://portal.example.test:"); err == nil {
		t.Fatal("empty explicit port accepted")
	}
	root := fixture(t)
	edit(t, root, "environments/platform.json", func(value map[string]any) {
		publication := value["publication"].(map[string]any)
		publication["base_domain"] = "example.test"
		publication["public_urls"] = map[string]any{"sdlc": "https://git.example.test:443/"}
	})
	if _, err := Query(Options{Root: root, Command: "validate"}); errorCode(err) != "PUBLIC_ORIGIN_COLLISION" {
		t.Fatal("equivalent HTTPS origins were not considered conflicting")
	}
}

func TestArgumentFailuresDoNotEchoCallerInput(t *testing.T) {
	root := fixture(t)
	for _, arguments := range [][]string{
		{"DO_NOT_DISCLOSE", "--format", "json"},
		{"plan", "--unknown", "DO_NOT_DISCLOSE"},
		{"plan", "--format", "DO_NOT_DISCLOSE"},
	} {
		var stdout, stderr bytes.Buffer
		arguments = append(arguments, "--root", root)
		if code := Run(arguments, &stdout, &stderr); code != 1 || strings.Contains(stdout.String()+stderr.String(), "DO_NOT_DISCLOSE") {
			t.Fatal("argument failure echoed caller input or succeeded")
		}
	}
}
