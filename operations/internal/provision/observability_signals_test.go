package provision

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

func (f *fakeObservability) prometheusReply(req *http.Request) map[string]any {
	expression := req.URL.Query().Get("query")
	if req.URL.Query().Get("time") == "" || !strings.Contains(expression, `installation="`+f.options.InstallationID+`"`) || !strings.Contains(expression, `profile="`+f.options.Profile+`"`) {
		f.t.Fatal("query lost fixed evaluation time or installation scope", req.URL)
	}
	at := f.e.Now().Unix()
	results := []any{}
	appendSample := func(labels map[string]string, number string) {
		results = append(results, map[string]any{"metric": labels, "value": []any{at, number}})
	}
	labels := func() map[string]string {
		return map[string]string{"installation": f.options.InstallationID, "profile": f.options.Profile, "private_payload": "private-unprojected-series-detail"}
	}
	core := strings.HasPrefix(expression, "up{") || strings.HasPrefix(expression, "timestamp(up{")
	if core {
		jobs := []string{"prometheus", "telemetry"}
		if f.badSeries {
			jobs = jobs[:1]
		}
		for _, job := range jobs {
			fields, number := labels(), "1"
			fields["job"] = job
			if strings.HasPrefix(expression, "timestamp(") {
				sampleTime := at
				if f.staleSeries {
					sampleTime -= 180
				}
				if f.coreCase == "future" {
					sampleTime += 30
				}
				number = strconv.FormatInt(sampleTime, 10)
			}
			if f.coreCase == "foreign" {
				fields["installation"] = "another-installation"
			}
			if f.coreCase == "nan" {
				number = "NaN"
			}
			appendSample(fields, number)
			if f.coreCase == "duplicate" {
				appendSample(fields, number)
			}
		}
	} else if strings.Contains(expression, "httpcheck_status{") {
		f.signalQueries++
		for i, target := range observabilityHTTPChecks {
			fields, number := labels(), "1"
			fields["http_url"], fields["job"] = target.endpoint, "telemetry"
			if i == 0 && f.signalCase == "missing-http" {
				continue
			}
			if i == 0 && f.signalCase == "unhealthy" {
				number = "0"
			}
			if strings.HasPrefix(expression, "timestamp(") {
				sampleTime := at
				if i == 0 && f.signalCase == "stale-http" {
					sampleTime -= 180
				}
				if i == 0 && f.signalCase == "future" {
					sampleTime += 30
				}
				number = strconv.FormatInt(sampleTime, 10)
			}
			if i == 0 && f.signalCase == "foreign" {
				fields["installation"] = "another-installation"
			}
			if i == 0 && f.signalCase == "nan" {
				number = "NaN"
			}
			appendSample(fields, number)
			if i == 0 && f.signalCase == "duplicate" {
				appendSample(fields, number)
			}
		}
	} else if strings.HasPrefix(expression, "min(timestamp(jvm_memory_used_bytes{") {
		f.signalQueries++
		sampleTime := at
		if f.signalCase == "stale-jvm" {
			sampleTime -= 180
		}
		if f.signalCase != "missing-jvm" {
			appendSample(map[string]string{}, strconv.FormatInt(sampleTime, 10))
		}
	} else {
		f.t.Fatal("unapproved query", expression)
	}
	v := map[string]any{"status": "success", "data": map[string]any{"resultType": "vector", "result": results}}
	if !core && f.signalCase == "query-error" {
		v = map[string]any{"status": "error", "error": "private-unprojected-series-detail"}
	}
	if core && f.coreCase == "warning" || !core && f.signalCase == "warning" {
		v["warnings"] = []string{"private-unprojected-series-detail"}
	}
	return v
}

func TestObservabilitySignalEvidenceAndReadOnlyDiagnosis(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, f, o := observabilityFixture(t, profile)
			e.Now = func() time.Time { return time.Unix(1000, 0) }
			if r, err := e.Run(context.Background(), o); err != nil || !r.ObservabilityReady {
				t.Fatal(r, err)
			}
			p := OperationOptions{Options: o, Component: "telemetry"}
			diagnose := func() OperationResult {
				t.Helper()
				p.Command = "doctor"
				r, err := e.RunOperation(context.Background(), p)
				if err != nil || r.Outcome != "SUCCEEDED" || r.Phase != "COMPLETED" {
					t.Fatal("diagnosis failed instead of reporting source state", r, err)
				}
				return r
			}
			before := treeContents(t, o.ControlRoot, o.DataRoot)
			status := runDaily(t, e, p, "status")
			if status.Observability.SignalsReady != nil || len(status.Observability.Signals) != 6 || f.signalQueries != 0 {
				t.Fatal("status invented signal evidence", status)
			}
			for _, scenario := range []struct {
				name, state string
				index       int
			}{
				{"", "HEALTHY", 0}, {"unhealthy", "UNHEALTHY", 0}, {"missing-http", "MISSING", 0},
				{"stale-http", "STALE", 0}, {"future", "INVALID", 0}, {"foreign", "INVALID", 0},
				{"duplicate", "INVALID", 0}, {"nan", "UNAVAILABLE", 0}, {"warning", "UNAVAILABLE", 0},
				{"query-error", "UNAVAILABLE", 0}, {"stale-jvm", "STALE", 5}, {"missing-jvm", "MISSING", 5},
			} {
				f.signalCase = scenario.name
				result := diagnose()
				v := result.Observability
				if v.APIReady == nil || !*v.APIReady || v.State != "CORE_READY" || len(v.Signals) != 6 || v.Signals[scenario.index].State != scenario.state {
					t.Fatal(scenario.name, result)
				}
				wantReady := scenario.name == ""
				if v.SignalsReady == nil || *v.SignalsReady != wantReady || result.ScopeReady == nil || *result.ScopeReady != wantReady || (result.ExitCode == 0) != wantReady {
					t.Fatal("source readiness confused with backend readiness", scenario.name, result)
				}
				if scenario.name == "" && (v.Signals[0].AgeSeconds == nil || *v.Signals[0].AgeSeconds != 0 || v.Signals[5].Healthy != nil) {
					t.Fatal("freshness missing or JVM health fabricated", result)
				}
				if scenario.name == "stale-http" && v.Signals[0].Healthy != nil {
					t.Fatal("stale healthy value was projected as current health")
				}
				if bytes.Contains(jsonBytes(result), []byte("private-unprojected-series-detail")) {
					t.Fatal("provider content projected")
				}
			}
			// A UI/backend diagnostic keeps its own scope when one source fails.
			f.signalCase = "missing-http"
			p.Component = "grafana"
			result := diagnose()
			if result.ExitCode != 0 || result.ScopeReady == nil || !*result.ScopeReady || *result.Observability.SignalsReady {
				t.Fatal("Grafana availability confused with source coverage", result)
			}
			p.Component = "all"
			if result = diagnose(); result.ExitCode != 2 {
				t.Fatal("global diagnosis ignored missing source", result)
			}
			p.Component, f.signalCase = "telemetry", ""
			if result = diagnose(); result.ExitCode != 0 || !*result.Observability.SignalsReady {
				t.Fatal("repeated diagnosis retained failure instead of current evidence", result)
			}
			if !equalTree(before, treeContents(t, o.ControlRoot, o.DataRoot)) {
				t.Fatal("read-only diagnosis changed controls, audit or data")
			}
		})
	}
}

func TestObservabilityCollectionRejectsAmbiguousOrStaleProof(t *testing.T) {
	e, f, o := observabilityFixture(t, "dell-gb10")
	e.Now = func() time.Time { return time.Unix(1000, 0) }
	if _, err := e.Run(context.Background(), o); err != nil {
		t.Fatal(err)
	}
	seed, _ := readObservabilitySeed(o)
	for _, scenario := range []string{"duplicate", "foreign", "nan", "future", "warning", "stale"} {
		f.coreCase = scenario
		f.staleSeries = scenario == "stale"
		if err := e.verifyObservabilityCollection(context.Background(), o, seed); err == nil {
			t.Fatal("unproven collection accepted", scenario)
		}
	}
}

func TestObservabilityExpectedSourcesMatchCollector(t *testing.T) {
	data, err := observabilityBlueprint("observability/collector.json", Options{})
	if err != nil {
		t.Fatal(err)
	}
	var config struct {
		Receivers map[string]struct{ Targets []struct{ Endpoint string } }
	}
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	targets := config.Receivers["http_check/platform"].Targets
	if len(targets) != len(observabilityHTTPChecks) {
		t.Fatal("collector and diagnostic source contracts differ")
	}
	for i, target := range targets {
		if target.Endpoint != observabilityHTTPChecks[i].endpoint {
			t.Fatal("diagnostic coverage no longer matches collector", i)
		}
	}
}
