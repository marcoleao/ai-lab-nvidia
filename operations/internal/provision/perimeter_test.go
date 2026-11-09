package provision

import (
	"context"
	"testing"
)

func TestOnlyPublishedServicesJoinPerimeter(t *testing.T) {
	e, h, o := hubFixture(t, "dell-gb10")
	if r, err := e.Run(context.Background(), o); err != nil || !r.HubReady {
		t.Fatal(r, err)
	}
	for _, spec := range []accessSpec{h.fakeAccess.spec(), h.fakeObservability.spec(), h.spec()} {
		for key, service := range spec.Services {
			_, perimeter := service["networks"].(map[string]any)["edge"]
			if perimeter != (key == "edge" || key == "grafana" || key == "homepage") {
				t.Fatal("incorrect perimeter membership", key, perimeter)
			}
		}
	}
}
