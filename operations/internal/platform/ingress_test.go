package platform

import "testing"

func ingressSettings() map[string]any {
	return map[string]any{"revision": "edge-one", "hostname": nil, "direct_port": 10443, "tunnel_port": 10444, "tunnel_id": nil}
}

func TestIngressOptionalClosedSchema(t *testing.T) {
	root := fixture(t)
	mustQuery(t, Options{Command: "validate", Root: root})
	edit(t, root, "environments/platform.json", func(v map[string]any) {
		p := v["publication"].(map[string]any)
		p["base_domain"] = "platform.example.test"
		p["ingress"] = ingressSettings()
	})
	d, err := Load(Options{Root: root})
	if err != nil || CandidateIngressHostname(d.Configuration.Publication) != "gateway.platform.example.test" {
		t.Fatal(err)
	}
	if PublicDNSHostname(CandidateIngressHostname(d.Configuration.Publication)) {
		t.Fatal("reserved hostname accepted for execution")
	}
	for _, mode := range []string{"unknown", "case", "missing", "port", "collision", "uuid", "revision"} {
		t.Run(mode, func(t *testing.T) {
			root := fixture(t)
			edit(t, root, "environments/platform.json", func(v map[string]any) {
				s := ingressSettings()
				v["publication"].(map[string]any)["ingress"] = s
				switch mode {
				case "unknown":
					s["token"] = "PRIVATE_DO_NOT_PROJECT"
				case "case":
					s["Revision"] = s["revision"]
					delete(s, "revision")
				case "missing":
					delete(s, "hostname")
				case "port":
					s["direct_port"] = 443
				case "collision":
					s["tunnel_port"] = 9443
				case "uuid":
					s["tunnel_id"] = "not-a-uuid"
				case "revision":
					s["revision"] = "../escape"
				}
			})
			if _, err := Query(Options{Root: root, Command: "validate"}); err == nil {
				t.Fatal("unsafe contract accepted", mode)
			}
		})
	}
}
