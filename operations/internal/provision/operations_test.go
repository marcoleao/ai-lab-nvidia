package provision

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

type fakeDaily struct {
	*fakeOrigin
	calls                                     []string
	logs                                      string
	logCalls, tick                            int
	failComponent                             string
	failOnce, offline, lostReply, failRestore bool
}

func dailyFixture(t *testing.T, profile string) (*Engine, *fakeDaily, OperationOptions) {
	t.Helper()
	e, f, o := originFixture(t, profile)
	f.o = o
	o.Phase = "access"
	if r, err := e.Run(context.Background(), o); err != nil || !r.AccessReady {
		t.Fatal(r, err)
	}
	o.Phase = "origin"
	if r, err := e.Run(context.Background(), o); err != nil || !r.OriginTLSReady {
		t.Fatal(r, err)
	}
	w := &fakeDaily{fakeOrigin: f, logs: "private-fixture-secret\n"}
	for _, c := range f.containers {
		c.State.StartedAt = time.Unix(90, 0).UTC().Format(time.RFC3339Nano)
	}
	e.Runner = w
	return e, w, OperationOptions{Options: o, Command: "status", Component: "all", Tail: 200}
}

func (f *fakeDaily) Run(ctx context.Context, c Command) (Response, error) {
	if filepath.Base(c.Program) == "docker" && len(c.Args) > 2 {
		a := c.Args[2:]
		if f.offline && a[0] == "info" {
			return Response{ExitCode: 1}, nil
		}
		if a[0] == "container" && len(a) > 2 {
			if a[1] == "logs" {
				f.logCalls++
				return Response{Output: f.logs}, nil
			}
			if a[1] == "start" || a[1] == "stop" {
				for _, v := range f.containers {
					if v.ID != a[len(a)-1] {
						continue
					}
					component := strings.TrimPrefix(v.Name, "/"+f.spec().Project+"-")
					if strings.Contains(component, "origin-") {
						component = "origin-tls"
					}
					f.calls = append(f.calls, a[1]+":"+component)
					if f.failRestore && a[1] == "start" && component == "edge" {
						return Response{ExitCode: 1}, nil
					}
					if component == f.failComponent && f.failOnce {
						f.failOnce = false
						return Response{ExitCode: 1, Output: "private-provider-secret"}, nil
					}
					v.State.Running = a[1] == "start"
					if a[1] == "start" {
						f.tick++
						v.State.StartedAt = time.Unix(100+int64(f.tick), 0).UTC().Format(time.RFC3339Nano)
						if component == "secret-store" {
							f.sealed = true
						}
					}
					if f.lostReply {
						return Response{ExitCode: 1}, nil
					}
					return Response{}, nil
				}
			}
		}
	}
	return f.fakeOrigin.Run(ctx, c)
}

func runDaily(t *testing.T, e *Engine, p OperationOptions, command string) OperationResult {
	t.Helper()
	p.Command = command
	r, err := e.RunOperation(context.Background(), p)
	if err != nil || r.ExitCode != 0 {
		t.Fatalf("%s: %+v %v", command, r, err)
	}
	return r
}

func treeContents(t *testing.T, roots ...string) map[string]string {
	t.Helper()
	files := map[string]string{}
	for _, root := range roots {
		err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if os.IsNotExist(err) {
				return nil
			}
			if err != nil {
				return err
			}
			if !d.IsDir() {
				b, err := os.ReadFile(path)
				if err != nil {
					return err
				}
				files[path] = digest(b)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	return files
}

func TestOperationsAllProfilesObservationLifecycleAndUnseal(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, f, p := dailyFixture(t, profile)
			before := treeContents(t, p.ControlRoot, p.DataRoot)
			r := runDaily(t, e, p, "status")
			if !r.ProcessesReady || r.InstallationReady || len(r.Services) != 5 {
				t.Fatal(r)
			}
			r = runDaily(t, e, p, "doctor")
			if r.APIsReady == nil || !*r.APIsReady {
				t.Fatal(r)
			}
			if !reflect.DeepEqual(before, treeContents(t, p.ControlRoot, p.DataRoot)) || len(f.calls) != 0 {
				t.Fatal("query mutated the installation")
			}
			r = runDaily(t, e, p, "stop")
			if r.ProcessesReady {
				t.Fatal(r)
			}
			want := []string{"stop:origin-tls", "stop:edge", "stop:secret-store", "stop:identity", "stop:identity-db"}
			if !reflect.DeepEqual(f.calls, want) {
				t.Fatal(f.calls)
			}
			f.calls = nil
			r = runDaily(t, e, p, "start")
			if !r.ProcessesReady || r.APIsReady == nil || *r.APIsReady {
				t.Fatal("sealed service should be visible", r)
			}
			want = []string{"start:identity-db", "start:identity", "start:secret-store", "start:edge", "start:origin-tls"}
			if !reflect.DeepEqual(f.calls, want) {
				t.Fatal(f.calls)
			}
			p.Unseal = true
			p.RequestID = strings.Repeat("b", 32)
			r = runDaily(t, e, p, "start")
			if !*r.APIsReady || f.initCalls != 1 || f.secretWrites != 2 {
				t.Fatal("unseal initialized/rewrote state", r, f.initCalls, f.secretWrites)
			}
			if len(f.containers) != 5 || f.creates != 1 {
				t.Fatal("maintenance created resources")
			}
			ledger, _ := os.ReadFile(filepath.Join(p.ControlRoot, "admin.jsonl"))
			if !bytes.Contains(ledger, []byte("maintenance_id")) || !bytes.Contains(ledger, []byte("PLATFORM_SECRET_STORE_UNSEALED")) {
				t.Fatal("missing correlation/unseal audit")
			}
			f.sealed = true
			p.Command = "start"
			_, err := e.RunOperation(context.Background(), p)
			if code(err) != "PLATFORM_OPERATION_COMPLETED_STATE_CHANGED" || !f.sealed {
				t.Fatal("completed request silently unsealed again", err)
			}
		})
	}
}

func TestOperationsRestartDedupAndInterruptedResume(t *testing.T) {
	e, f, p := dailyFixture(t, "dell-gb10")
	p.Component = "edge"
	p.RequestID = strings.Repeat("b", 32)
	f.lostReply = true
	r := runDaily(t, e, p, "restart")
	if r.Outcome != "SUCCEEDED" || len(f.calls) != 2 {
		t.Fatal(r, f.calls)
	}
	first := append([]string(nil), f.calls...)
	r = runDaily(t, e, p, "restart")
	if r.Outcome != "NO_CHANGE" || !reflect.DeepEqual(first, f.calls) {
		t.Fatal(r, f.calls)
	}
	p.RequestID = strings.Repeat("c", 32)
	runDaily(t, e, p, "restart")
	p.RequestID = strings.Repeat("b", 32)
	calls := len(f.calls)
	runDaily(t, e, p, "restart")
	if len(f.calls) != calls {
		t.Fatal("older request replay restarted services")
	}
	// A lost completion after start must not stop and start the process again.
	p.RequestID = strings.Repeat("d", 32)
	s := e.observeOperations(context.Background(), p.Options)
	p.Command = "restart"
	targets, err := newOperationTargets(p, s)
	if err != nil {
		t.Fatal(err)
	}
	targets[0].Stage = "START_REQUESTED"
	v := operationIntent{Schema: 1, Installation: p.InstallationID, Profile: p.Profile, MaintenanceID: p.RequestID, Command: p.Command, Component: p.Component, Mode: "APPLYING", Targets: targets}
	if err = saveOperationIntent(p.Options, v); err != nil {
		t.Fatal(err)
	}
	r = runDaily(t, e, p, "restart")
	if len(f.calls) != calls || r.Pending != nil {
		t.Fatal("resumed restart repeated effects", r, f.calls)
	}
}

func TestOperationsCompensationOwnershipAndAuditFailures(t *testing.T) {
	t.Run("compensate", func(t *testing.T) {
		e, f, p := dailyFixture(t, "precision-windows")
		f.failComponent = "secret-store"
		f.failOnce = true
		r, err := e.RunOperation(context.Background(), OperationOptions{Options: p.Options, Command: "stop", Component: "all"})
		if err != nil || r.Outcome != "FAILED" || !r.ProcessesReady {
			t.Fatal(r, err)
		}
		if _, err = os.Stat(filepath.Join(p.DataRoot, "operation.intent.json")); !os.IsNotExist(err) {
			t.Fatal("compensated intent not cleared", err)
		}
		ledger, _ := os.ReadFile(filepath.Join(p.ControlRoot, "admin.jsonl"))
		if !bytes.Contains(ledger, []byte("PLATFORM_SERVICE_STATE_RESTORED")) || bytes.Contains(ledger, []byte("private-provider-secret")) {
			t.Fatal("audit missing or leaked")
		}
	})
	t.Run("ownership", func(t *testing.T) {
		e, f, p := dailyFixture(t, "dell-gb10")
		f.containers[f.spec().Project+"-edge"].Config.Labels["ai.platform.installation"] = "foreign"
		r := runDaily(t, e, p, "status")
		if r.ProcessesReady {
			t.Fatal(r)
		}
		p.Command = "stop"
		_, err := e.RunOperation(context.Background(), p)
		if err == nil || len(f.calls) != 0 {
			t.Fatal("foreign resource changed", err, f.calls)
		}
	})
	t.Run("audit", func(t *testing.T) {
		e, f, p := dailyFixture(t, "dell-gb10")
		path := filepath.Join(p.ControlRoot, "admin.jsonl")
		file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = file.WriteString("broken-tail")
		file.Close()
		p.Command = "stop"
		_, err = e.RunOperation(context.Background(), p)
		if err == nil || len(f.calls) != 0 {
			t.Fatal("mutation without audit", err)
		}
		p.Command = "doctor"
		r, err := e.RunOperation(context.Background(), p)
		if err != nil || r.ExitCode != 2 {
			t.Fatal(r, err)
		}
	})
	t.Run("dependencies", func(t *testing.T) {
		e, f, p := dailyFixture(t, "dell-gb10")
		p.Component = "identity-db"
		p.Command = "stop"
		_, err := e.RunOperation(context.Background(), p)
		if code(err) != "PLATFORM_OPERATION_DEPENDENT_RUNNING" || len(f.calls) != 0 {
			t.Fatal(err)
		}
	})
}

func TestOperationsMissingAndOfflineDoNotProvision(t *testing.T) {
	e, f, p := dailyFixture(t, "macos-m3-max")
	f.offline = true
	r := runDaily(t, e, p, "status")
	if r.RuntimeObserved || len(f.calls) != 0 {
		t.Fatal(r)
	}
	for _, s := range r.Services {
		if s.State != "NOT_OBSERVED" {
			t.Fatal(s)
		}
	}
	// macOS exposes /tmp through a symlink; production roots must be canonical.
	missingRoot, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	p.ControlRoot = filepath.Join(missingRoot, "missing-control")
	p.DataRoot = filepath.Join(missingRoot, "missing-data")
	r = runDaily(t, e, p, "status")
	for _, s := range r.Services {
		if s.State != "NOT_PREPARED" {
			t.Fatal(s)
		}
	}
	if _, err := os.Stat(p.ControlRoot); !os.IsNotExist(err) {
		t.Fatal("query created roots")
	}
}

func TestOperationsUncertainCompensationAndCommitResume(t *testing.T) {
	t.Run("compensation", func(t *testing.T) {
		e, f, p := dailyFixture(t, "dell-gb10")
		p.Command = "stop"
		p.RequestID = strings.Repeat("f", 32)
		f.failComponent = "secret-store"
		f.failOnce = true
		f.failRestore = true
		r, err := e.RunOperation(context.Background(), p)
		if err != nil || r.Outcome != "UNKNOWN" || r.Pending == nil || r.Pending.Mode != "COMPENSATING" {
			t.Fatal(r, err)
		}
		p.Command = "start"
		_, err = e.RunOperation(context.Background(), p)
		if code(err) != "PLATFORM_OPERATION_PENDING" {
			t.Fatal(err)
		}
		p.Command = "stop"
		f.failRestore = false
		r, err = e.RunOperation(context.Background(), p)
		if err != nil || r.Outcome != "FAILED" || r.Pending != nil || !r.ProcessesReady {
			t.Fatal("resume must finish compensation", r, err)
		}
	})
	t.Run("completion", func(t *testing.T) {
		e, f, p := dailyFixture(t, "dell-gb10")
		p.Command = "restart"
		p.Component = "edge"
		p.RequestID = strings.Repeat("f", 32)
		blocked := filepath.Join(p.DataRoot, "operation.last.json")
		if err := os.Mkdir(blocked, 0700); err != nil {
			t.Fatal(err)
		}
		r, err := e.RunOperation(context.Background(), p)
		if err == nil || r.Outcome != "UNKNOWN" || r.Pending == nil || len(f.calls) != 2 {
			t.Fatal(r, err, f.calls)
		}
		ledger, _ := os.ReadFile(filepath.Join(p.ControlRoot, "admin.jsonl"))
		if !bytes.Contains(ledger, []byte("UNKNOWN")) {
			t.Fatal("missing uncertain result")
		}
		if err = os.Remove(blocked); err != nil {
			t.Fatal(err)
		}
		r = runDaily(t, e, p, "restart")
		if r.Pending != nil || len(f.calls) != 2 {
			t.Fatal("commit resume repeated restart", r, f.calls)
		}
	})
	t.Run("restart-order", func(t *testing.T) {
		e, f, p := dailyFixture(t, "dell-gb10")
		r := runDaily(t, e, p, "restart")
		if !r.ProcessesReady {
			t.Fatal(r)
		}
		want := []string{"stop:origin-tls", "stop:edge", "stop:secret-store", "stop:identity", "stop:identity-db", "start:identity-db", "start:identity", "start:secret-store", "start:edge", "start:origin-tls"}
		if !reflect.DeepEqual(want, f.calls) {
			t.Fatal(f.calls)
		}
	})
}

func TestOperationsPrivateBoundedLogsReplayAndRecovery(t *testing.T) {
	e, f, p := dailyFixture(t, "precision-windows")
	p.Component = "identity"
	p.Command = "logs"
	p.RequestID = strings.Repeat("e", 32)
	p.Tail = 20
	f.logs = strings.Repeat("private-fixture-secret\n", 14000)
	r := runDaily(t, e, p, "logs")
	if r.Export == nil || !r.Export.Truncated || r.Export.CapturedBytes != 262144 || f.logCalls != 1 {
		t.Fatal(r)
	}
	ledger, _ := os.ReadFile(filepath.Join(p.ControlRoot, "admin.jsonl"))
	for _, data := range [][]byte{ledger, jsonBytes(r)} {
		if bytes.Contains(data, []byte("private-fixture-secret")) {
			t.Fatal("log content leaked")
		}
	}
	r = runDaily(t, e, p, "logs")
	if r.Outcome != "NO_CHANGE" || f.logCalls != 1 {
		t.Fatal(r)
	}
	// Simulate interruption after payload persistence, before receipt persistence.
	base := filepath.Join(p.ControlRoot, "exports")
	if err := os.Remove(filepath.Join(base, p.RequestID+".json")); err != nil {
		t.Fatal(err)
	}
	intent := logExportIntent{Component: p.Component, ContainerID: r.Export.ContainerID, RequestID: p.RequestID, Tail: p.Tail, Capture: r.Export}
	if err := atomicFile(filepath.Join(base, p.RequestID+".intent.json"), jsonBytes(intent), 0600); err != nil {
		t.Fatal(err)
	}
	r = runDaily(t, e, p, "logs")
	if f.logCalls != 1 || r.Export == nil {
		t.Fatal("capture repeated", r)
	}
	if err := os.WriteFile(filepath.Join(base, p.RequestID+".log"), []byte("altered"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := e.RunOperation(context.Background(), p)
	if code(err) != "PLATFORM_LOG_EXPORT_CONTENT_CHANGED" || f.logCalls != 1 {
		t.Fatal(err)
	}
}

func TestOperationCLIRejectsAmbiguousOrUnsafeArguments(t *testing.T) {
	for _, args := range [][]string{{"--format", "html"}, {"unexpected"}, {"--unknown"}} {
		var out bytes.Buffer
		if RunOperationCLI("status", args, &out, &out) != 1 || !bytes.Contains(out.Bytes(), []byte("PLATFORM_OPERATION_ARGUMENTS_INVALID")) {
			t.Fatal(fmt.Sprint(args), out.String())
		}
	}
}
