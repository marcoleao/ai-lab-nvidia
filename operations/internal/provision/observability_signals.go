package provision

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"strconv"
	"time"
)

const observabilityMaxAge = 120.0

// Only these static sources may appear in the administrative projection.
// Source URLs and arbitrary labels returned by a product are never projected.
var observabilityHTTPChecks = []struct{ component, endpoint string }{
	{"identity", "http://identity:8080/realms/platform/.well-known/openid-configuration"},
	{"secret-store", "http://secret-store:8200/v1/sys/health"},
	{"grafana", "http://grafana:3000/api/health"},
	{"logs", "http://logs:3100/ready"},
	{"metrics", "http://metrics:9090/-/ready"},
}

type SignalObservation struct {
	Signal     string   `json:"signal"`
	Component  string   `json:"component"`
	State      string   `json:"state"`
	Reason     string   `json:"reason_code"`
	SampledAt  string   `json:"sampled_at,omitempty"`
	AgeSeconds *float64 `json:"age_seconds,omitempty"`
	Healthy    *bool    `json:"healthy"`
}

func unobservedSignals(reason string) []SignalObservation {
	rows := []SignalObservation{}
	for _, target := range observabilityHTTPChecks {
		rows = append(rows, SignalObservation{Signal: "http-" + target.component, Component: target.component, State: "NOT_OBSERVED", Reason: reason})
	}
	return append(rows, SignalObservation{Signal: "identity-jvm", Component: "identity", State: "NOT_OBSERVED", Reason: reason})
}

type observabilitySample struct {
	labels map[string]string
	value  float64
}

func observabilitySelector(o Options, metric, filters string) string {
	return fmt.Sprintf(`%s{installation=%q,profile=%q%s}`, metric, o.InstallationID, o.Profile, filters)
}

func (e *Engine) observabilityQuery(ctx context.Context, o Options, seed observabilitySeed, expression string, at time.Time) ([]observabilitySample, error) {
	query := url.Values{"query": {expression}, "time": {strconv.FormatInt(at.Unix(), 10)}}
	v, err := e.observabilityRequest(ctx, o, seed, "/api/datasources/proxy/uid/platform-metrics/api/v1/query?"+query.Encode())
	if err != nil {
		return nil, err
	}
	data, ok := v["data"].(map[string]any)
	if v["status"] != "success" || !ok || data["resultType"] != "vector" {
		return nil, codedError("PLATFORM_OBSERVABILITY_QUERY_INVALID")
	}
	if warnings, exists := v["warnings"]; exists {
		items, ok := warnings.([]any)
		if !ok || len(items) != 0 {
			return nil, codedError("PLATFORM_OBSERVABILITY_QUERY_PARTIAL")
		}
	}
	items, ok := data["result"].([]any)
	if !ok || len(items) > 64 {
		return nil, codedError("PLATFORM_OBSERVABILITY_QUERY_INVALID")
	}
	rows := []observabilitySample{}
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			return nil, codedError("PLATFORM_OBSERVABILITY_QUERY_INVALID")
		}
		labels, ok := item["metric"].(map[string]any)
		if !ok {
			return nil, codedError("PLATFORM_OBSERVABILITY_QUERY_INVALID")
		}
		pair, ok := item["value"].([]any)
		if !ok || len(pair) != 2 {
			return nil, codedError("PLATFORM_OBSERVABILITY_QUERY_INVALID")
		}
		at, ok := pair[0].(float64)
		number, isString := pair[1].(string)
		value, parseErr := strconv.ParseFloat(number, 64)
		if !ok || math.IsNaN(at) || math.IsInf(at, 0) || !isString || parseErr != nil || math.IsNaN(value) || math.IsInf(value, 0) {
			return nil, codedError("PLATFORM_OBSERVABILITY_QUERY_INVALID")
		}
		row := observabilitySample{labels: map[string]string{}, value: value}
		for key, raw := range labels {
			value, ok := raw.(string)
			if !ok {
				return nil, codedError("PLATFORM_OBSERVABILITY_QUERY_INVALID")
			}
			row.labels[key] = value
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func scopedSamples(rows []observabilitySample, o Options, label string) (map[string][]observabilitySample, error) {
	groups := map[string][]observabilitySample{}
	for _, row := range rows {
		if row.labels["installation"] != o.InstallationID || row.labels["profile"] != o.Profile || row.labels[label] == "" {
			return nil, codedError("PLATFORM_OBSERVABILITY_SAMPLE_SCOPE_INVALID")
		}
		key := row.labels[label]
		groups[key] = append(groups[key], row)
	}
	return groups, nil
}

func recentObservabilitySample(at float64, now time.Time) bool {
	age := float64(now.Unix()) - at
	return !math.IsNaN(at) && !math.IsInf(at, 0) && at > 0 && age >= -5 && age <= observabilityMaxAge
}

func (e *Engine) verifyObservabilityCollection(ctx context.Context, o Options, seed observabilitySeed) error {
	at := e.Now()
	selector := observabilitySelector(o, "up", `,job=~"prometheus|telemetry"`)
	values, err := e.observabilityQuery(ctx, o, seed, selector, at)
	if err != nil {
		return err
	}
	times, err := e.observabilityQuery(ctx, o, seed, "timestamp("+selector+")", at)
	if err != nil {
		return err
	}
	byJob, err := scopedSamples(values, o, "job")
	if err != nil {
		return err
	}
	timeByJob, err := scopedSamples(times, o, "job")
	if err != nil {
		return err
	}
	if len(byJob) != 2 || len(timeByJob) != 2 {
		return codedError("PLATFORM_OBSERVABILITY_COLLECTION_UNCONFIRMED")
	}
	for _, job := range []string{"prometheus", "telemetry"} {
		values, times := byJob[job], timeByJob[job]
		if len(values) != 1 || len(times) != 1 || values[0].value != 1 || !recentObservabilitySample(times[0].value, at) {
			return codedError("PLATFORM_OBSERVABILITY_COLLECTION_UNCONFIRMED")
		}
	}
	return nil
}

func measureSignal(row *SignalObservation, timestamp float64, at time.Time) bool {
	age := float64(at.Unix()) - timestamp
	if timestamp <= 0 || age < -5 {
		row.State, row.Reason = "INVALID", "PLATFORM_OBSERVABILITY_SAMPLE_TIME_INVALID"
		return false
	}
	// Only bounded, finite timestamps are formatted and projected.
	if age > observabilityMaxAge {
		row.State, row.Reason = "STALE", "PLATFORM_OBSERVABILITY_SAMPLE_STALE"
		return false
	}
	seconds, fraction := math.Modf(timestamp)
	row.SampledAt = time.Unix(int64(seconds), int64(fraction*1e9)).UTC().Format(time.RFC3339Nano)
	row.AgeSeconds = &age
	return true
}

// Query failures are observational states, never evidence of a healthy source.
func (e *Engine) observeSignals(ctx context.Context, o Options, seed observabilitySeed) []SignalObservation {
	rows := unobservedSignals("PLATFORM_OBSERVABILITY_SIGNAL_NOT_QUERIED")
	at := e.Now()
	selector := observabilitySelector(o, "httpcheck_status", `,http_status_class="2xx",job="telemetry"`)
	values, valueErr := e.observabilityQuery(ctx, o, seed, selector, at)
	times, timeErr := e.observabilityQuery(ctx, o, seed, "timestamp("+selector+")", at)
	byURL, groupErr := scopedSamples(values, o, "http_url")
	timeByURL, timeGroupErr := scopedSamples(times, o, "http_url")
	for i, target := range observabilityHTTPChecks {
		row := &rows[i]
		row.State, row.Reason = "UNAVAILABLE", "PLATFORM_OBSERVABILITY_SIGNAL_QUERY_UNAVAILABLE"
		if valueErr != nil || timeErr != nil {
			continue
		}
		if groupErr != nil || timeGroupErr != nil {
			row.State, row.Reason = "INVALID", "PLATFORM_OBSERVABILITY_SAMPLE_SCOPE_INVALID"
			continue
		}
		values, times := byURL[target.endpoint], timeByURL[target.endpoint]
		if len(values) == 0 || len(times) == 0 {
			row.State, row.Reason = "MISSING", "PLATFORM_OBSERVABILITY_SAMPLE_MISSING"
			continue
		}
		if len(values) != 1 || len(times) != 1 || values[0].value != 0 && values[0].value != 1 {
			row.State, row.Reason = "INVALID", "PLATFORM_OBSERVABILITY_SAMPLE_AMBIGUOUS"
			continue
		}
		if !measureSignal(row, times[0].value, at) {
			continue
		}
		healthy := values[0].value == 1
		row.Healthy = &healthy
		row.State, row.Reason = "HEALTHY", "PLATFORM_OBSERVABILITY_HTTP_2XX_OBSERVED"
		if !healthy {
			row.State, row.Reason = "UNHEALTHY", "PLATFORM_OBSERVABILITY_HTTP_NON_2XX_OBSERVED"
		}
	}
	// The oldest reported heap pool determines freshness; a fresh pool cannot
	// hide a stale one. Aggregation prevents pool names entering the result DTO.
	jvm := &rows[len(rows)-1]
	times, err := e.observabilityQuery(ctx, o, seed, "min(timestamp("+observabilitySelector(o, "jvm_memory_used_bytes", `,area="heap"`)+"))", at)
	jvm.State, jvm.Reason = "UNAVAILABLE", "PLATFORM_OBSERVABILITY_SIGNAL_QUERY_UNAVAILABLE"
	if err != nil {
		return rows
	}
	if len(times) == 0 {
		jvm.State, jvm.Reason = "MISSING", "PLATFORM_OBSERVABILITY_SAMPLE_MISSING"
	} else if len(times) != 1 {
		jvm.State, jvm.Reason = "INVALID", "PLATFORM_OBSERVABILITY_SAMPLE_AMBIGUOUS"
	} else if measureSignal(jvm, times[0].value, at) {
		jvm.State, jvm.Reason = "OBSERVED", "PLATFORM_OBSERVABILITY_JVM_HEAP_OBSERVED_NO_HEALTH_THRESHOLD"
	}
	return rows
}
