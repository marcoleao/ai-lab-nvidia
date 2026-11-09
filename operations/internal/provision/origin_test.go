package provision

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

type fakeOrigin struct {
	*fakeAccess
	creates                                  int
	lostCreate, lostStart, failCandidateStop bool
}

func originFixture(t *testing.T, profile string) (*Engine, *fakeOrigin, Options) {
	e, f, o := accessFixture(t, profile)
	o.Phase = "origin"
	o.OriginPort = 9443
	w := &fakeOrigin{fakeAccess: f}
	e.Runner = w
	e.originProbe = func(context.Context, Options, originMaterial) error { return nil }
	return e, w, o
}
func (f *fakeOrigin) Run(ctx context.Context, c Command) (Response, error) {
	if filepath.Base(c.Program) != "docker" || len(c.Args) < 4 {
		return f.fakeAccess.Run(ctx, c)
	}
	a := c.Args[2:]
	if a[0] == "run" && strings.Contains(option(a, "--name"), "-origin-helper-") {
		mount := strings.Split(option(a, "--mount"), ",")
		name := strings.TrimPrefix(mount[1], "source=")
		files := f.files[name]
		reader := tar.NewReader(bytes.NewReader(c.Stdin))
		for {
			h, err := reader.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				f.t.Fatal(err)
			}
			if h.Typeflag == tar.TypeDir {
				continue
			}
			data, err := io.ReadAll(reader)
			if err != nil {
				f.t.Fatal(err)
			}
			if old, exists := files[h.Name]; exists && !bytes.Equal(old, data) {
				return Response{ExitCode: 22}, nil
			}
			files[h.Name] = data
		}
		var out strings.Builder
		for name, data := range files {
			fmt.Fprintf(&out, "%s  %s\n", digest(data), name)
		}
		return Response{Output: out.String()}, nil
	}
	if a[0] == "container" && a[1] == "inspect" && strings.Contains(a[2], "-origin-") {
		if value, ok := f.containers[a[2]]; ok {
			return Response{Output: string(jsonBytes([]any{value}))}, nil
		}
		return Response{ExitCode: 1, Output: "No such container: origin fixture"}, nil
	}
	if a[0] == "container" && a[1] == "create" {
		name := option(a, "--name")
		v := &accessContainer{ID: digest([]byte(name)), Name: "/" + name}
		v.Config.Image = accessReleases()["caddy"].Platforms[f.e.Host.Arch].Reference
		v.Image = f.imageID(accessReleases()["caddy"].Platforms[f.e.Host.Arch])
		v.Config.User = option(a, "--user")
		v.Config.Labels = repeated(a, "--label")
		v.HostConfig.ReadonlyRootfs = true
		v.HostConfig.CapDrop = []string{"ALL"}
		v.HostConfig.SecurityOpt = []string{"no-new-privileges:true"}
		v.NetworkSettings.Networks = map[string]accessNetwork{option(a, "--network"): {}}
		port := strings.Split(option(a, "--publish"), ":")
		v.HostConfig.PortBindings = map[string][]struct{ HostIp, HostPort string }{port[2]: {{port[0], port[1]}}}
		mount := strings.Split(option(a, "--mount"), ",")
		v.Mounts = append(v.Mounts, struct {
			Type, Name, Destination string
			RW                      bool
		}{"volume", strings.TrimPrefix(mount[1], "source="), "/origin", false})
		f.containers[name] = v
		f.creates++
		if f.lostCreate {
			return Response{ExitCode: 1}, nil
		}
		return Response{Output: v.ID}, nil
	}
	if a[0] == "container" && (a[1] == "start" || a[1] == "stop") {
		for _, v := range f.containers {
			if v.ID == a[len(a)-1] {
				if a[1] == "stop" && f.failCandidateStop {
					m, _ := f.e.workingOriginMaterial(f.o)
					if v.Config.Labels["ai.platform.generation"] == m.Generation {
						return Response{ExitCode: 1}, nil
					}
				}
				v.State.Running = a[1] == "start"
				if a[1] == "start" && f.lostStart {
					return Response{ExitCode: 1}, nil
				}
				return Response{}, nil
			}
		}
	}
	return f.fakeAccess.Run(ctx, c)
}

func TestOriginAllProfilesRetryRotationAndPrivacy(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, f, o := originFixture(t, profile)
			f.o = o
			r, err := e.Run(context.Background(), o)
			if err != nil || !r.OriginTLSReady || r.PublicationReady || r.SSOQualified || r.InstallationReady {
				t.Fatal(r, err)
			}
			if _, err = time.Parse(time.RFC3339, r.OriginCertificateNotAfter); err != nil || !hashPattern.MatchString(r.OriginCertificateSHA256) {
				t.Fatal("missing expiry/fingerprint", r, err)
			}
			first, err := e.readOriginMaterial(o, false)
			if err != nil {
				t.Fatal(err)
			}
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.OriginTLSReady || f.creates != 1 {
				t.Fatal("retry recreated origin", r, err)
			}
			o.OriginRevision = "rotation-one"
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.OriginTLSReady || f.creates != 2 {
				t.Fatal("rotation", r, err)
			}
			second, _ := e.readOriginMaterial(o, false)
			if second.Generation == first.Generation || bytes.Equal(first.CA, second.CA) {
				t.Fatal("rotation reused trust material")
			}
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.OriginTLSReady || f.creates != 2 {
				t.Fatal("rotation retry not idempotent", r, err)
			}
			var record originRecord
			if err = networkControl(o, "origin.resources.json", &record); err != nil || len(record.Retained) != 1 || record.Retained[0].Revision != "initial" {
				t.Fatal(record, err)
			}
			for _, retired := range record.Retained {
				if f.containers[retired.Name].State.Running {
					t.Fatal("retired origin still running")
				}
			}
			ledger, _ := os.ReadFile(filepath.Join(o.ControlRoot, "admin.jsonl"))
			for _, secret := range [][]byte{first.ServerKey, first.ClientKey, second.ServerKey, second.ClientKey} {
				if bytes.Contains(ledger, secret) || bytes.Contains(jsonBytes(r), secret) {
					t.Fatal("private key leaked")
				}
			}
			o.OriginRevision = "initial"
			r, err = e.Run(context.Background(), o)
			if err != nil || r.OriginTLSReady || r.Reason != "PLATFORM_ORIGIN_RETIRED_REVISION" || f.creates != 2 {
				t.Fatal("retired revision reused", r, err)
			}
		})
	}
}
func TestOriginRotationCompensationRetryAndLostReplies(t *testing.T) {
	for _, mode := range []string{"probe", "unknown", "reply", "commit"} {
		t.Run(mode, func(t *testing.T) {
			e, f, o := originFixture(t, "precision-windows")
			f.o = o
			if mode == "reply" {
				f.lostCreate = true
				f.lostStart = true
			}
			if mode == "commit" {
				if err := os.Mkdir(filepath.Join(o.ControlRoot, "origin-material.json"), 0700); err != nil {
					t.Fatal(err)
				}
			}
			// A directory is an invalid input, so inject the commit fault after the
			// request/material checks and native verification, immediately before CAS.
			if mode == "commit" {
				os.Remove(filepath.Join(o.ControlRoot, "origin-material.json"))
				e.originProbe = func(context.Context, Options, originMaterial) error {
					return os.Mkdir(filepath.Join(o.ControlRoot, "origin-material.json"), 0700)
				}
			}
			r, err := e.Run(context.Background(), o)
			if mode == "commit" {
				if err != nil || r.Outcome != "UNKNOWN" || r.OriginTLSReady {
					t.Fatal(r, err)
				}
				if err = os.Remove(filepath.Join(o.ControlRoot, "origin-material.json")); err != nil {
					t.Fatal(err)
				}
				e.originProbe = func(context.Context, Options, originMaterial) error { return nil }
				r, err = e.Run(context.Background(), o)
				if err != nil || !r.OriginTLSReady || f.creates != 1 {
					t.Fatal("commit recovery", r, err)
				}
				return
			}
			if err != nil || !r.OriginTLSReady {
				t.Fatal(r, err)
			}
			if mode == "reply" && f.creates != 1 {
				t.Fatal("lost response repeated create")
			}
			if mode == "reply" {
				return
			}
			var old originRecord
			_ = networkControl(o, "origin.resources.json", &old)
			o.OriginRevision = "rotation-two"
			e.originProbe = func(context.Context, Options, originMaterial) error {
				return codedError("PLATFORM_ORIGIN_ROUTE_OR_TLS_UNCONFIRMED")
			}
			f.failCandidateStop = mode == "unknown"
			r, err = e.Run(context.Background(), o)
			want := "FAILED"
			if mode == "unknown" {
				want = "UNKNOWN"
			}
			if err != nil || r.Outcome != want || r.OriginTLSReady {
				t.Fatal(r, err)
			}
			if mode == "probe" && !f.containers[old.Active.Name].State.Running {
				t.Fatal("previous process not restored")
			}
			f.failCandidateStop = false
			e.originProbe = func(context.Context, Options, originMaterial) error { return nil }
			r, err = e.Run(context.Background(), o)
			if err != nil || !r.OriginTLSReady || f.creates != 2 {
				t.Fatal("failed rotation retry", r, err)
			}
		})
	}
}
func TestOriginDriftAndReadOnlyPlan(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "dell-gb10")
	o.Phase = "origin"
	o.Action = "plan"
	r, err := e.Run(context.Background(), o)
	if err != nil || !r.Planned || r.OriginTLSReady || len(r.Steps) != 3 || len(runner.calls) != 0 {
		t.Fatal(r, err)
	}
	if _, err = os.Stat(filepath.Join(o.ControlRoot, "origin-pending-material.json")); !os.IsNotExist(err) {
		t.Fatal("plan created material")
	}
	for _, mode := range []string{"binding", "owner", "port", "expired"} {
		t.Run(mode, func(t *testing.T) {
			e, f, o := originFixture(t, "macos-m3-max")
			f.o = o
			r, err := e.Run(context.Background(), o)
			if err != nil || !r.OriginTLSReady {
				t.Fatal(r, err)
			}
			var record originRecord
			_ = networkControl(o, "origin.resources.json", &record)
			switch mode {
			case "binding":
				c := f.containers[record.Active.Name]
				bindings := c.HostConfig.PortBindings["9443/tcp"]
				bindings[0].HostIp = "0.0.0.0"
				c.HostConfig.PortBindings["9443/tcp"] = bindings
			case "owner":
				f.containers[record.Active.Name].Config.Labels["ai.platform.owner"] = "foreign"
			case "port":
				o.OriginPort = 19443
			case "expired":
				clock := e.Now()
				e.Now = func() time.Time { return clock.Add(91 * 24 * time.Hour) }
			}
			r, err = e.Run(context.Background(), o)
			if r.OriginTLSReady || err == nil && r.Outcome == "SUCCEEDED" || f.creates != 1 {
				t.Fatal("drift adopted", r, err)
			}
		})
	}
}

func TestOriginRealTLSAllowDenyAndWrongPolicy(t *testing.T) {
	o := Options{InstallationID: "tls-test", Profile: "dell-gb10"}
	m, err := newOriginMaterial(o, strings.Repeat("a", 32), "initial", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	for _, requireClient := range []bool{true, false} {
		t.Run(fmt.Sprint(requireClient), func(t *testing.T) {
			pair, err := tls.X509KeyPair(m.Server, m.ServerKey)
			if err != nil {
				t.Fatal(err)
			}
			pool := x509.NewCertPool()
			pool.AppendCertsFromPEM(m.CA)
			server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/readyz" {
					io.WriteString(w, m.Generation)
					return
				}
				w.WriteHeader(404)
			}))
			server.Config.ErrorLog = log.New(io.Discard, "", 0)
			server.TLS = &tls.Config{Certificates: []tls.Certificate{pair}, ClientCAs: pool, MinVersion: tls.VersionTLS13}
			if requireClient {
				server.TLS.ClientAuth = tls.RequireAndVerifyClientCert
			}
			server.StartTLS()
			defer server.Close()
			_, port, _ := net.SplitHostPort(server.Listener.Addr().String())
			o.OriginPort, _ = strconv.Atoi(port)
			err = probeOriginHTTP(context.Background(), o, m)
			if requireClient && err != nil || !requireClient && code(err) != "PLATFORM_ORIGIN_MTLS_DENIAL_UNCONFIRMED" {
				t.Fatal("TLS policy proof", err)
			}
			if requireClient {
				retired, err := newOriginMaterial(o, strings.Repeat("a", 32), "retired", time.Now().Add(-400*24*time.Hour))
				if err != nil {
					t.Fatal(err)
				}
				if err = probeRetiredOriginClient(context.Background(), o, m, retired); err != nil {
					t.Fatal("retired credential not rejected", err)
				}
			}
		})
	}
}
