package provision

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"time"
)

func observabilityClient(o Options) *http.Client {
	host := "grafana.localhost:" + itoa(o.GrafanaPort)
	transport := &http.Transport{Proxy: nil, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		if address != host {
			return nil, codedError("PLATFORM_OBSERVABILITY_HTTP_TARGET_REJECTED")
		}
		return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "tcp4", net.JoinHostPort("127.0.0.1", itoa(o.GrafanaPort)))
	}}
	return &http.Client{Transport: transport, Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}
func (e *Engine) observabilityRequest(ctx context.Context, o Options, seed observabilitySeed, path string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", observabilityURL(o)+path, nil)
	if err != nil {
		return nil, codedError("PLATFORM_OBSERVABILITY_HTTP_INVALID")
	}
	req.SetBasicAuth("platform-admin", seed.AdminPassword)
	client := e.HTTP
	if client == nil {
		local := observabilityClient(o)
		defer local.CloseIdleConnections()
		client = local
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, codedError("PLATFORM_OBSERVABILITY_HTTP_UNAVAILABLE")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, codedError("PLATFORM_OBSERVABILITY_HEALTH_UNCONFIRMED")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return nil, codedError("PLATFORM_OBSERVABILITY_HTTP_INVALID")
	}
	var v map[string]any
	if json.Unmarshal(data, &v) != nil {
		return nil, codedError("PLATFORM_OBSERVABILITY_HTTP_INVALID")
	}
	return v, nil
}
func (e *Engine) verifyObservability(ctx context.Context, o Options, seed observabilitySeed) error {
	v, err := e.observabilityRequest(ctx, o, seed, "/api/health")
	if err != nil {
		return err
	}
	if v["database"] != "ok" {
		return codedError("PLATFORM_OBSERVABILITY_DATABASE_UNCONFIRMED")
	}
	for _, item := range []struct{ uid, kind, url string }{{"platform-metrics", "prometheus", "http://metrics:9090"}, {"platform-logs", "loki", "http://logs:3100"}} {
		v, err = e.observabilityRequest(ctx, o, seed, "/api/datasources/uid/"+item.uid)
		if err != nil {
			return err
		}
		if v["uid"] != item.uid || v["type"] != item.kind || v["url"] != item.url {
			return codedError("PLATFORM_OBSERVABILITY_DATASOURCE_CHANGED")
		}
		v, err = e.observabilityRequest(ctx, o, seed, "/api/datasources/uid/"+item.uid+"/health")
		if err != nil {
			return err
		}
		if v["status"] != "OK" {
			return codedError("PLATFORM_OBSERVABILITY_DATASOURCE_UNCONFIRMED")
		}
	}
	v, err = e.observabilityRequest(ctx, o, seed, "/api/dashboards/uid/platform-foundation")
	if err != nil {
		return err
	}
	dashboard, ok := v["dashboard"].(map[string]any)
	if !ok || dashboard["uid"] != "platform-foundation" {
		return codedError("PLATFORM_OBSERVABILITY_DASHBOARD_UNCONFIRMED")
	}
	return e.verifyObservabilityCollection(ctx, o, seed)
}

func (e *Engine) waitObservability(ctx context.Context, o Options, seed observabilitySeed) error {
	waitCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	for {
		if err := e.verifyObservability(waitCtx, o, seed); err == nil {
			return nil
		}
		select {
		case <-waitCtx.Done():
			return codedError("PLATFORM_OBSERVABILITY_HEALTH_TIMEOUT")
		case <-time.After(500 * time.Millisecond):
		}
	}
}
