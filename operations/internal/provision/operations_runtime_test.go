package provision

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type fakeRuntimeOperation struct {
	base                                                     Runner
	f                                                        *fakeRunner
	calls                                                    []string
	workloads, swarm                                         string
	truncated, lostReply, failStart, failStop, badController bool
	tick                                                     int
}

func (w *fakeRuntimeOperation) Run(ctx context.Context, c Command) (Response, error) {
	program := filepath.Base(c.Program)
	if program == "docker" && len(c.Args) > 2 {
		if c.Args[2] == "info" && c.Args[len(c.Args)-1] == "{{.Swarm.LocalNodeState}}" {
			return Response{Output: w.swarm}, nil
		}
		if c.Args[2] == "container" && c.Args[3] == "ls" {
			return Response{Output: w.workloads, Truncated: w.truncated}, nil
		}
	}
	if program == "systemctl" || program == "colima" {
		verb := c.Args[0]
		if verb == "show" && w.badController {
			return Response{Output: "Id=foreign\n"}, nil
		}
		if verb == "show" {
			r, err := w.base.Run(ctx, c)
			if w.f.running {
				r.Output = strings.ReplaceAll(r.Output, strings.Repeat("1", 32), fmt.Sprintf("%032x", w.tick+1))
			}
			return r, err
		}
		if verb == "start" || verb == "stop" {
			w.calls = append(w.calls, verb)
			if verb == "start" && w.failStart || verb == "stop" && w.failStop {
				return Response{ExitCode: 1, Output: "private-runtime-provider-detail"}, nil
			}
			if program == "colima" && verb == "start" && !contains(c.Args, "--save-config=false") {
				panic("runtime start rewrote configuration")
			}
			w.f.running = verb == "start"
			if verb == "start" {
				w.tick++
			}
			if w.lostReply {
				return Response{ExitCode: 1}, nil
			}
			return Response{}, nil
		}
	}
	if program == "limactl" {
		r, err := w.base.Run(ctx, c)
		if w.f.running {
			r.Output = strings.ReplaceAll(r.Output, `"hostAgentPID":101`, fmt.Sprintf(`"hostAgentPID":%d`, 101+w.tick))
		}
		return r, err
	}
	return w.base.Run(ctx, c)
}

func runtimeOperationFixture(t *testing.T, profile string) (*Engine, *fakeRuntimeOperation, OperationOptions) {
	t.Helper()
	e, f, _, o := fixtureEngine(t, profile)
	if r, err := e.Run(context.Background(), o); err != nil || !r.RuntimeReady {
		t.Fatal(r, err)
	}
	if err := e.defaults(&o); err != nil {
		t.Fatal(err)
	}
	w := &fakeRuntimeOperation{base: e.Runner, f: f, swarm: "inactive"}
	e.Runner = w
	return e, w, OperationOptions{Options: o, Component: runtimeComponent, Command: "status"}
}

func TestRuntimeOperationsAllProfilesStopStartReplayAndObservation(t *testing.T) {
	for _, profile := range []string{"precision-windows", "dell-gb10", "macos-m3-max"} {
		t.Run(profile, func(t *testing.T) {
			e, w, p := runtimeOperationFixture(t, profile)
			before := treeContents(t, p.ControlRoot, p.DataRoot)
			r := runDaily(t, e, p, "status")
			if r.Runtime == nil || !r.Runtime.Owned || !r.Runtime.APIReady || r.InstallationReady {
				t.Fatal(r)
			}
			r = runDaily(t, e, p, "doctor")
			if r.ScopeReady == nil || !*r.ScopeReady {
				t.Fatal(r)
			}
			if !reflect.DeepEqual(before, treeContents(t, p.ControlRoot, p.DataRoot)) || len(w.calls) != 0 {
				t.Fatal("runtime observation wrote state")
			}
			r = runDaily(t, e, p, "stop")
			if w.f.running || r.Runtime.State != "STOPPED" || r.Runtime.APIReady || r.Action != "PLATFORM_RUNTIME_STOPPED" {
				t.Fatal(r)
			}
			p.RequestID = strings.Repeat("b", 32)
			r = runDaily(t, e, p, "start")
			if !w.f.running || !r.Runtime.APIReady {
				t.Fatal(r)
			}
			calls := len(w.calls)
			r = runDaily(t, e, p, "start")
			if r.Outcome != "NO_CHANGE" || len(w.calls) != calls {
				t.Fatal(r, w.calls)
			}
			p.RequestID = strings.Repeat("c", 32)
			w.lostReply = true
			incarnation := r.Runtime.Incarnation
			r = runDaily(t, e, p, "restart")
			if !r.Runtime.APIReady || !reflect.DeepEqual(w.calls, []string{"stop", "start", "stop", "start"}) {
				t.Fatal(r, w.calls)
			}
			if r.Runtime.Incarnation == incarnation {
				t.Fatal("restart did not observe a new process incarnation")
			}
			r = runDaily(t, e, p, "restart")
			if r.Outcome != "NO_CHANGE" || len(w.calls) != 4 {
				t.Fatal(r, w.calls)
			}
		})
	}
}

func TestRuntimeOperationsWorkloadAndOwnershipGuards(t *testing.T) {
	for _, scenario := range []string{"running", "paused", "restarting", "foreign-configuration", "controller", "truncated", "swarm", "pending-setup", "missing-vm"} {
		t.Run(scenario, func(t *testing.T) {
			profile := "dell-gb10"
			if scenario == "missing-vm" {
				profile = "macos-m3-max"
			}
			e, w, p := runtimeOperationFixture(t, profile)
			p.Command = "stop"
			switch scenario {
			case "running", "paused", "restarting":
				w.workloads = strings.Repeat("a", 64) + " " + scenario + "\n"
			case "foreign-configuration":
				if err := os.WriteFile(filepath.Join(p.DataRoot, "daemon.json"), []byte("foreign"), 0600); err != nil {
					t.Fatal(err)
				}
			case "controller":
				w.badController = true
			case "truncated":
				w.truncated = true
			case "swarm":
				w.swarm = "active"
			case "pending-setup":
				if err := os.WriteFile(filepath.Join(p.DataRoot, "runtime.intent.json"), []byte("{}"), 0600); err != nil {
					t.Fatal(err)
				}
			case "missing-vm":
				if err := os.Remove(filepath.Join(p.DataRoot, "lima", "colima-"+e.profileName(p.Options), "basedisk")); err != nil {
					t.Fatal(err)
				}
			}
			_, err := e.RunOperation(context.Background(), p)
			if err == nil || len(w.calls) != 0 {
				t.Fatal("unsafe runtime operation", err, w.calls)
			}
		})
	}
}

func TestRuntimeOperationsCompensationAndResume(t *testing.T) {
	t.Run("confirmed", func(t *testing.T) {
		e, w, p := runtimeOperationFixture(t, "dell-gb10")
		w.f.running = false
		w.failStart = true
		p.Command = "start"
		r, err := e.RunOperation(context.Background(), p)
		if err != nil || r.Outcome != "FAILED" || r.PendingRuntime != nil || w.f.running {
			t.Fatal(r, err)
		}
		ledger, err := os.ReadFile(filepath.Join(p.ControlRoot, "admin.jsonl"))
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(ledger), "private-runtime-provider-detail") || !strings.Contains(string(ledger), "PLATFORM_RUNTIME_STATE_RESTORED") || !strings.Contains(string(ledger), "maintenance_id") {
			t.Fatal("unsafe or incomplete runtime audit")
		}
		w.failStart = false
		runDaily(t, e, p, "start")
	})
	t.Run("uncertain", func(t *testing.T) {
		e, w, p := runtimeOperationFixture(t, "macos-m3-max")
		p.Command = "restart"
		p.RequestID = strings.Repeat("c", 32)
		w.failStart = true
		r, err := e.RunOperation(context.Background(), p)
		if err != nil || r.Outcome != "UNKNOWN" || r.PendingRuntime == nil || r.PendingRuntime.Mode != "COMPENSATING" {
			t.Fatal(r, err)
		}
		w.failStart = false
		r, err = e.RunOperation(context.Background(), p)
		if err != nil || r.Outcome != "FAILED" || r.PendingRuntime != nil || !w.f.running {
			t.Fatal(r, err)
		}
	})
	t.Run("commit", func(t *testing.T) {
		e, w, p := runtimeOperationFixture(t, "precision-windows")
		p.Command = "restart"
		p.RequestID = strings.Repeat("d", 32)
		blocked := filepath.Join(p.DataRoot, "operation.last.json")
		if err := os.Mkdir(blocked, 0700); err != nil {
			t.Fatal(err)
		}
		r, err := e.RunOperation(context.Background(), p)
		if err == nil || r.Outcome != "UNKNOWN" || r.PendingRuntime == nil || len(w.calls) != 2 {
			t.Fatal(r, err, w.calls)
		}
		if err = os.Remove(blocked); err != nil {
			t.Fatal(err)
		}
		r = runDaily(t, e, p, "restart")
		if r.PendingRuntime != nil || len(w.calls) != 2 {
			t.Fatal("restart repeated after commit failure", r, w.calls)
		}
	})
	t.Run("audit", func(t *testing.T) {
		e, w, p := runtimeOperationFixture(t, "dell-gb10")
		p.Command = "stop"
		f, err := os.OpenFile(filepath.Join(p.ControlRoot, "admin.jsonl"), os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = f.WriteString("bad-tail")
		f.Close()
		_, err = e.RunOperation(context.Background(), p)
		if err == nil || len(w.calls) != 0 {
			t.Fatal(err, w.calls)
		}
	})
}

func TestRuntimeRecoveryPreservesInterruptedServiceMaintenance(t *testing.T) {
	e, w, p := runtimeOperationFixture(t, "dell-gb10")
	w.f.running = false
	parent := operationIntent{Schema: 1, Installation: p.InstallationID, Profile: p.Profile, MaintenanceID: strings.Repeat("e", 32), Command: "start", Component: "edge", Mode: "APPLYING", Targets: []operationTarget{{Component: "edge", ID: strings.Repeat("f", 64), Stage: "START_REQUESTED"}}}
	if err := saveOperationIntent(p.Options, parent); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(filepath.Join(p.DataRoot, "operation.intent.json"))
	if err != nil {
		t.Fatal(err)
	}
	p.Command = "start"
	p.RequestID = parent.MaintenanceID
	if _, err = e.RunOperation(context.Background(), p); code(err) != "PLATFORM_OPERATION_REQUEST_CONFLICT" || len(w.calls) != 0 {
		t.Fatal(err, w.calls)
	}
	p.RequestID = strings.Repeat("b", 32)
	r := runDaily(t, e, p, "start")
	if !w.f.running || r.Pending == nil || r.Pending.MaintenanceID != parent.MaintenanceID || r.PendingRuntime != nil {
		t.Fatal(r)
	}
	after, err := os.ReadFile(filepath.Join(p.DataRoot, "operation.intent.json"))
	if err != nil || string(before) != string(after) {
		t.Fatal("runtime recovery rewrote service journal", err)
	}
	p.Command = "restart"
	_, err = e.RunOperation(context.Background(), p)
	if code(err) != "PLATFORM_OPERATION_PENDING" || len(w.calls) != 1 {
		t.Fatal("runtime restart ignored pending service maintenance", err, w.calls)
	}
}

func TestRuntimePendingBlocksServiceMutation(t *testing.T) {
	e, w, p := runtimeOperationFixture(t, "dell-gb10")
	r := e.observeRuntimeOperation(context.Background(), p.Options)
	v := operationIntent{Schema: 1, Installation: p.InstallationID, Profile: p.Profile, MaintenanceID: strings.Repeat("e", 32), Command: "stop", Component: runtimeComponent, Mode: "APPLYING", Targets: []operationTarget{{Component: runtimeComponent, ID: r.Configuration, BeforeRunning: true, Stage: "PENDING"}}}
	if err := saveRuntimeOperationIntent(p.Options, v); err != nil {
		t.Fatal(err)
	}
	p.Component = "all"
	p.Command = "stop"
	_, err := e.RunOperation(context.Background(), p)
	if code(err) != "PLATFORM_OPERATION_PENDING" || len(w.calls) != 0 {
		t.Fatal(err, w.calls)
	}
}

func TestRuntimeOperationsExternalEngineIsNeverControlled(t *testing.T) {
	e, w, p := runtimeOperationFixture(t, "dell-gb10")
	if err := os.WriteFile(filepath.Join(p.DataRoot, "runtime.mode"), []byte("external"), 0600); err != nil {
		t.Fatal(err)
	}
	p.RuntimeMode = "auto"
	w.f.o.RuntimeMode = "external"
	for _, command := range []string{"start", "stop", "restart"} {
		p.Command = command
		_, err := e.RunOperation(context.Background(), p)
		if code(err) != "PLATFORM_RUNTIME_EXTERNAL_MANAGEMENT_REQUIRED" || len(w.calls) != 0 {
			t.Fatal(command, err, w.calls)
		}
	}
}
