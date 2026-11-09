package provision

import "testing"

func TestNoNewPrivilegesDockerRepresentations(t *testing.T) {
	for _, option := range []string{"no-new-privileges", "no-new-privileges:true", "no-new-privileges=true"} {
		if !noNewPrivilegesEnabled([]string{option}) {
			t.Fatal("enabled Docker security option rejected", option)
		}
	}
	for _, options := range [][]string{nil, {"no-new-privileges=false"}, {"no-new-privileges:false"}, {"no-new-privileges=invalid"}, {"no-new-privileges=true", "no-new-privileges=false"}} {
		if noNewPrivilegesEnabled(options) {
			t.Fatal("missing, disabled or conflicting security option accepted", options)
		}
	}
}
