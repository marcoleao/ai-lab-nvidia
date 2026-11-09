package provision

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

func originURL(o Options) string { return fmt.Sprintf("https://gateway.localhost:%d", o.OriginPort) }
func originClient(o Options, m originMaterial, certificate bool) (*http.Client, *http.Transport, error) {
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(m.CA) {
		return nil, nil, codedError("PLATFORM_ORIGIN_CA_INVALID")
	}
	config := &tls.Config{RootCAs: pool, ServerName: "gateway.localhost", MinVersion: tls.VersionTLS13}
	if certificate {
		pair, err := tls.X509KeyPair(m.Client, m.ClientKey)
		if err != nil {
			return nil, nil, codedError("PLATFORM_ORIGIN_KEY_MISMATCH")
		}
		config.Certificates = []tls.Certificate{pair}
	}
	transport := &http.Transport{Proxy: nil, TLSClientConfig: config, DisableKeepAlives: true, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		if address != fmt.Sprintf("gateway.localhost:%d", o.OriginPort) {
			return nil, codedError("PLATFORM_ORIGIN_ENDPOINT_REJECTED")
		}
		return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "tcp", fmt.Sprintf("127.0.0.1:%d", o.OriginPort))
	}}
	return &http.Client{Transport: transport, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, transport, nil
}

func probeOriginHTTP(ctx context.Context, o Options, m originMaterial) error {
	client, transport, err := originClient(o, m, true)
	if err != nil {
		return err
	}
	defer transport.CloseIdleConnections()
	for _, item := range []struct {
		path   string
		status int
	}{{"/readyz", 200}, {"/admin/", 404}, {"/v1/sys/init", 404}, {"/realms/master", 404}, {"/", 404}} {
		req, err := http.NewRequestWithContext(ctx, "GET", originURL(o)+item.path, nil)
		if err != nil {
			return err
		}
		response, err := client.Do(req)
		if err != nil {
			return codedError("PLATFORM_ORIGIN_TLS_UNAVAILABLE")
		}
		body, readErr := io.ReadAll(io.LimitReader(response.Body, 4097))
		response.Body.Close()
		if readErr != nil || len(body) > 4096 || response.StatusCode != item.status || response.TLS == nil || response.TLS.Version != tls.VersionTLS13 || len(response.TLS.VerifiedChains) == 0 {
			return codedError("PLATFORM_ORIGIN_ROUTE_OR_TLS_UNCONFIRMED")
		}
		if item.path == "/readyz" && string(body) != m.Generation {
			return codedError("PLATFORM_ORIGIN_GENERATION_UNCONFIRMED")
		}
	}
	anonymous, anonymousTransport, err := originClient(o, m, false)
	if err != nil {
		return err
	}
	defer anonymousTransport.CloseIdleConnections()
	req, _ := http.NewRequestWithContext(ctx, "GET", originURL(o)+"/readyz", nil)
	response, err := anonymous.Do(req)
	if response != nil {
		response.Body.Close()
	}
	// Only an explicit remote TLS client-certificate rejection is evidence.
	// DNS errors, deadlines and connection refusal must not pass a deny probe.
	if err == nil || !(strings.Contains(err.Error(), "remote error: tls: certificate required") || strings.Contains(err.Error(), "remote error: tls: bad certificate")) {
		return codedError("PLATFORM_ORIGIN_MTLS_DENIAL_UNCONFIRMED")
	}
	return nil
}

func (e *Engine) verifyOrigin(ctx context.Context, o Options, m originMaterial) error {
	if err := verifyOriginMaterial(m, e.Now()); err != nil {
		return err
	}
	if e.originProbe != nil {
		return e.originProbe(ctx, o, m)
	}
	return probeOriginHTTP(ctx, o, m)
}

func probeRetiredOriginClient(ctx context.Context, o Options, current, retired originMaterial) error {
	client, transport, err := originClient(o, current, false)
	if err != nil {
		return err
	}
	defer transport.CloseIdleConnections()
	pair, err := tls.X509KeyPair(retired.Client, retired.ClientKey)
	if err != nil {
		return codedError("PLATFORM_ORIGIN_KEY_MISMATCH")
	}
	transport.TLSClientConfig.GetClientCertificate = func(*tls.CertificateRequestInfo) (*tls.Certificate, error) { return &pair, nil }
	req, _ := http.NewRequestWithContext(ctx, "GET", originURL(o)+"/readyz", nil)
	response, err := client.Do(req)
	if response != nil {
		response.Body.Close()
	}
	if err == nil || !(strings.Contains(err.Error(), "remote error: tls: bad certificate") || strings.Contains(err.Error(), "remote error: tls: unknown certificate authority") || strings.Contains(err.Error(), "remote error: tls: unknown ca") || strings.Contains(err.Error(), "remote error: tls: expired certificate")) {
		return codedError("PLATFORM_ORIGIN_RETIRED_CLIENT_DENIAL_UNCONFIRMED")
	}
	return nil
}
