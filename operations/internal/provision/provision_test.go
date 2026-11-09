package provision

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

type fakeDownload struct {
	t     *testing.T
	root  string
	data  map[string][]byte
	calls int
	bad   bool
}

func (f *fakeDownload) Fetch(_ context.Context, a Asset, path string) error {
	f.calls++
	if !strings.HasPrefix(path, f.root+string(os.PathSeparator)) {
		f.t.Fatal("download escaped fixture")
	}
	data := f.data[a.URL]
	if f.bad {
		data = []byte("corrupt")
	}
	return os.WriteFile(path, data, 0600)
}

type fakeRunner struct {
	network                                    *fakeNetworkEngine
	noMetal                                    bool
	noNvidiaRuntime                            bool
	t                                          *testing.T
	e                                          *Engine
	o                                          Options
	calls                                      []Command
	running, enabled, packages, toolkit        bool
	failStart, failRestore, corruptDuringStart bool
	failProgram                                string
	route                                      string
	serverVersion                              string
}

func (f *fakeRunner) Run(_ context.Context, c Command) (Response, error) {
	f.calls = append(f.calls, c)
	program := filepath.Base(c.Program)
	args := strings.Join(c.Args, " ")
	if program == f.failProgram {
		return Response{ExitCode: 31, Output: "token=fixture-private"}, nil
	}
	switch program {
	case "dpkg-query":
		if f.packages {
			return Response{Output: "base=2\n"}, nil
		}
		return Response{Output: "base=1\n"}, nil
	case "apt-get":
		if strings.Contains(args, "nvidia-container-toolkit-base=") {
			f.toolkit = true
		}
		return Response{}, nil
	case "python3":
		f.packages = true
		proof := map[string]any{"before": digest([]byte("before")), "after": digest([]byte("after")), "count": 1}
		if len(c.Args) != 2 {
			return Response{}, errors.New("missing receipt argument")
		}
		return Response{}, os.WriteFile(c.Args[1], jsonBytes(proof), 0600)
	case "nvidia-smi":
		return Response{Output: "595.0\n"}, nil
	case "sw_vers":
		return Response{Output: "15.7\n"}, nil
	case "sysctl":
		return Response{Output: "1\n"}, nil
	case "system_profiler":
		if f.noMetal {
			return Response{Output: `{"SPDisplaysDataType":[{"spdisplays_metal":"unsupported"}]}`}, nil
		}
		return Response{Output: `{"SPDisplaysDataType":[{"spdisplays_metal":"spdisplays_metal3"}]}`}, nil
	case "ip":
		if f.route != "" {
			return Response{Output: f.route}, nil
		}
		return Response{Output: "[]"}, nil
	case "nvidia-ctk":
		if args == "--version" {
			if !f.toolkit {
				return Response{ExitCode: 1}, nil
			}
			return Response{Output: "NVIDIA Container Toolkit 1.20.1"}, nil
		}
		for _, arg := range c.Args {
			if strings.HasPrefix(arg, "--output=") {
				path := strings.TrimPrefix(arg, "--output=")
				return Response{}, os.WriteFile(path, []byte("kind: nvidia.com/gpu\ndevices: []\n"), 0600)
			}
		}
		return Response{}, errors.New("unexpected toolkit call")
	case "dockerd":
		if !strings.Contains(args, "--validate") {
			return Response{}, errors.New("uncontrolled daemon invocation")
		}
		return Response{}, nil
	case "systemctl":
		if c.Args[0] == "show" {
			active, sub, invocation := "inactive", "dead", ""
			if f.running {
				active, sub, invocation = "active", "running", strings.Repeat("1", 32)
			}
			return Response{Output: fmt.Sprintf("Id=%s\nLoadState=loaded\nActiveState=%s\nSubState=%s\nFragmentPath=%s\nDropInPaths=\nNeedDaemonReload=no\nTransient=no\nInvocationID=%s\n", f.e.runtimeUnit(f.o), active, sub, f.e.path("/etc/systemd/system/"+f.e.runtimeUnit(f.o)), invocation)}, nil
		}
		if c.Args[0] == "is-enabled" {
			if f.enabled {
				return Response{}, nil
			}
			return Response{ExitCode: 1}, nil
		}
		if c.Args[0] == "enable" || c.Args[0] == "disable" {
			f.enabled = c.Args[0] == "enable"
		}
		if c.Args[0] == "is-active" {
			if f.running {
				return Response{}, nil
			}
			return Response{ExitCode: 3}, nil
		}
		if c.Args[0] == "start" || c.Args[0] == "restart" {
			if f.failStart {
				f.failStart = false
				if f.corruptDuringStart {
					_ = os.WriteFile(filepath.Join(f.o.DataRoot, "daemon.json"), []byte("foreign edit"), 0644)
				}
				return Response{ExitCode: 7, Output: "private runtime failure"}, nil
			}
			if f.failRestore {
				return Response{ExitCode: 8}, nil
			}
			f.running = true
		}
		if c.Args[0] == "stop" {
			if f.failRestore {
				return Response{ExitCode: 8}, nil
			}
			f.running = false
		}
		return Response{}, nil
	case "colima":
		if c.Env["DOCKER_CONFIG"] != filepath.Join(f.o.DataRoot, "client") || c.Env["COLIMA_HOME"] != filepath.Join(f.o.DataRoot, "colima") {
			f.t.Fatal("global Docker/Colima scope used")
		}
		if c.Args[0] == "status" {
			if f.running {
				return Response{}, nil
			}
			return Response{ExitCode: 1}, nil
		}
		if c.Args[0] == "ssh" {
			return Response{Output: "[]"}, nil
		}
		if c.Args[0] == "start" {
			if f.failStart {
				f.failStart = false
				return Response{ExitCode: 7}, nil
			}
			f.running = true
			dir := filepath.Join(f.o.DataRoot, "lima", "colima-"+f.e.profileName(f.o))
			if err := os.MkdirAll(dir, 0700); err != nil {
				f.t.Fatal(err)
			}
			for _, leaf := range []string{"lima.yaml", "basedisk", "diffdisk"} {
				if err := os.WriteFile(filepath.Join(dir, leaf), []byte("isolated-vm-fixture"), 0600); err != nil {
					f.t.Fatal(err)
				}
			}
		}
		if c.Args[0] == "stop" {
			f.running = false
		}
		return Response{}, nil
	case "limactl":
		if c.Args[0] == "list" {
			state := "Stopped"
			pid := 0
			if f.running {
				state = "Running"
				pid = 101
			}
			name := "colima-" + f.e.profileName(f.o)
			return Response{Output: string(jsonBytes(map[string]any{"name": name, "dir": filepath.Join(f.o.DataRoot, "lima", name), "status": state, "arch": "aarch64", "hostAgentPID": pid}))}, nil
		}
	case "docker":
		if len(c.Args) < 3 || c.Args[0] != "--host" || c.Args[1] != f.e.endpoint(f.o) || c.Env["DOCKER_CONFIG"] != filepath.Join(f.o.DataRoot, "client") {
			f.t.Fatal("global Docker endpoint/config used")
		}
		if !f.running {
			return Response{ExitCode: 1}, nil
		}
		if c.Args[2] == "network" || c.Args[2] == "image" || c.Args[2] == "pull" || c.Args[2] == "container" || c.Args[2] == "run" {
			if f.network == nil {
				f.network = newFakeNetworkEngine(f)
			}
			return f.network.run(c.Args[2:])
		}
		if c.Args[2] == "info" {
			root := filepath.Join(f.o.DataRoot, "docker")
			if f.e.Host.OS == "darwin" {
				root = "/var/lib/docker"
			}
			version := f.serverVersion
			if version == "" {
				version = "29.9.3"
			}
			runtimes := map[string]any{}
			if !f.noNvidiaRuntime {
				runtimes["nvidia"] = map[string]string{"path": "nvidia-container-runtime"}
			}
			return Response{Output: string(jsonBytes(map[string]any{"OSType": "linux", "Architecture": f.e.Host.Arch, "DockerRootDir": root, "ServerVersion": version, "Runtimes": runtimes}))}, nil
		}
		if c.Args[2] == "compose" {
			return Response{Output: "5.7.0\n"}, nil
		}
	case "netstat":
		if f.network != nil && f.network.macRoutes != "" {
			return Response{Output: f.network.macRoutes}, nil
		}
		return Response{Output: "Routing tables\n\nInternet:\nDestination Gateway Flags Netif\ndefault 192.168.5.1 UGSc en0\n"}, nil
	}
	return Response{}, fmt.Errorf("unexpected fixture command: %s", program)
}
func archiveBytes(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buffer bytes.Buffer
	gz := gzip.NewWriter(&buffer)
	tw := tar.NewWriter(gz)
	for path, content := range files {
		if err := tw.WriteHeader(&tar.Header{Name: path, Mode: 0755, Size: int64(len(content)), Typeflag: tar.TypeReg}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	_ = tw.Close()
	_ = gz.Close()
	return buffer.Bytes()
}
func fixtureEngine(t *testing.T, profile string) (*Engine, *fakeRunner, *fakeDownload, Options) {
	t.Helper()
	// macOS commonly exposes TMPDIR through /var -> /private/var. Fixtures use
	// the canonical path while production continues to reject symlinked roots.
	root := t.TempDir()
	if runtime.GOOS != "windows" {
		var err error
		root, err = filepath.EvalSymlinks(root)
		if err != nil {
			t.Fatal(err)
		}
	}
	host := Host{OS: "linux", Arch: "amd64", Distribution: "ubuntu", Codename: "noble", Actor: "uid:0", Root: true, WSL: true, Home: filepath.Join(root, "home"), BootID: "fixture-boot"}
	if profile == "dell-gb10" {
		host.Arch = "arm64"
		host.WSL = false
	}
	if profile == "macos-m3-max" {
		host.OS = "darwin"
		host.Arch = "arm64"
		host.Root = false
		host.WSL = false
		host.Actor = "uid:501"
	}
	o := Options{Action: "install", Phase: "infrastructure", Profile: profile, InstallationID: "fixture-platform", ControlRoot: filepath.Join(root, "control"), DataRoot: filepath.Join(root, "data"), OperationID: strings.Repeat("a", 32), Pool: "10.248.0.0/16", MemoryGiB: 16, CPUs: 4, DiskGiB: 80}
	e := &Engine{Host: host, FSRoot: root, Now: func() time.Time { return time.Unix(100, 0) }, assetSet: map[string]Asset{}}
	download := &fakeDownload{t: t, root: root, data: map[string][]byte{}}
	target := host.OS + "-" + host.Arch
	blobs := map[string][]byte{"docker-" + target: archiveBytes(t, map[string]string{"docker/docker": "fixture docker", "docker/dockerd": "fixture dockerd"}), "compose-" + target: []byte("fixture compose"), "nvidia-key": []byte("fixture public key")}
	if host.OS == "darwin" {
		blobs["lima-"+target] = archiveBytes(t, map[string]string{"bin/limactl": "fixture lima", "share/lima/guestagent": "fixture guest"})
		blobs["colima-"+target] = []byte("fixture colima")
	}
	for key, data := range blobs {
		kind, version := "binary", "v5.7.0"
		if strings.HasPrefix(key, "docker-") {
			kind, version = "docker", "29.9.3"
		}
		if strings.HasPrefix(key, "lima-") {
			kind, version = "lima", "v2.3.0"
		}
		if key == "nvidia-key" {
			kind = "public_key"
		}
		url := "https://fixtures.invalid/" + key
		e.assetSet[key] = Asset{url, digest(data), kind, version}
		download.data[url] = data
	}
	runner := &fakeRunner{t: t, e: e, o: o, toolkit: true}
	e.Runner = runner
	e.Downloader = download
	return e, runner, download, o
}
func readLedger(t *testing.T, o Options) []ledgerRow {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(o.ControlRoot, "admin.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	rows := []ledgerRow{}
	for _, line := range bytes.Split(bytes.TrimSpace(data), []byte("\n")) {
		var row ledgerRow
		if err = json.Unmarshal(line, &row); err != nil {
			t.Fatal(err)
		}
		rows = append(rows, row)
	}
	return rows
}
func TestPlanAllProfilesHasNoEffects(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, runner, download, o := fixtureEngine(t, profile)
			o.Action = "plan"
			result, err := e.Run(context.Background(), o)
			if err != nil || !result.Planned || result.RuntimeReady || result.InstallationReady || len(runner.calls) != 0 || download.calls != 0 {
				t.Fatalf("plan had effects: %+v %v", result, err)
			}
			if _, err = os.Stat(o.ControlRoot); !os.IsNotExist(err) {
				t.Fatal("plan created control state")
			}
		})
	}
}
func TestInstallRetryAndRuntimeIsolation(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max", "dell-gb10"} {
		t.Run(profile, func(t *testing.T) {
			e, runner, download, o := fixtureEngine(t, profile)
			result, err := e.Run(context.Background(), o)
			if err != nil || !result.HostReady || !result.RuntimeReady || result.InstallationReady || result.GPUQualified {
				t.Fatalf("install: %+v %v", result, err)
			}
			calls := download.calls
			runner.calls = nil
			result, err = e.Run(context.Background(), o)
			if err != nil || !result.RuntimeReady || download.calls != calls {
				t.Fatalf("retry: %+v %v", result, err)
			}
			for _, command := range runner.calls {
				args := strings.Join(command.Args, " ")
				if command.Program == "/usr/bin/systemctl" && (strings.Contains(args, "restart") || strings.Contains(args, "daemon-reload")) {
					t.Fatalf("unchanged daemon modified: %v", command)
				}
				if strings.Contains(args, "nvidia-driver") || strings.Contains(args, "cuda-drivers") || strings.Contains(args, "docker-ce") || strings.Contains(args, "context use") {
					t.Fatalf("foreign scope: %v", command)
				}
			}
			rows := readLedger(t, o)
			var last map[string]any
			_ = json.Unmarshal([]byte(rows[len(rows)-1].Record), &last)
			if last["outcome"] != "NO_CHANGE" {
				t.Fatalf("unchanged runtime not observed: %v", last)
			}
		})
	}
}
func TestForeignActiveRuntimeCannotBeAdoptedByName(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max"} {
		t.Run(profile, func(t *testing.T) {
			e, runner, _, o := fixtureEngine(t, profile)
			runner.running = true
			result, err := e.Run(context.Background(), o)
			if err != nil || result.RuntimeReady || result.Reason != "PLATFORM_RUNTIME_FOREIGN_SERVICE" {
				t.Fatalf("foreign runtime accepted: %+v %v", result, err)
			}
			for _, c := range runner.calls {
				args := strings.Join(c.Args, " ")
				if (filepath.Base(c.Program) == "systemctl" || filepath.Base(c.Program) == "colima") && (strings.HasPrefix(args, "start") || strings.HasPrefix(args, "stop") || strings.HasPrefix(args, "restart") || strings.HasPrefix(args, "enable")) {
					t.Fatalf("foreign runtime changed: %v", c)
				}
			}
		})
	}
}
func TestPackageFailureKeepsPrivateDiagnostic(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "precision-windows")
	runner.failProgram = "apt-get"
	result, err := e.Run(context.Background(), o)
	if err != nil || result.Outcome != "UNKNOWN" || result.RuntimeReady {
		t.Fatalf("bad failure: %+v %v", result, err)
	}
	data, _ := os.ReadFile(filepath.Join(o.ControlRoot, "admin.jsonl"))
	if strings.Contains(string(data), "token=") {
		t.Fatal("private output leaked")
	}
	files, _ := filepath.Glob(filepath.Join(o.ControlRoot, "diagnostic-*.json"))
	if len(files) != 1 {
		t.Fatal("private source missing")
	}
	runner.failProgram = ""
	if result, err = e.Run(context.Background(), o); err != nil || !result.RuntimeReady {
		t.Fatalf("retry failed: %+v %v", result, err)
	}
}
func TestUntrustedDownloadCannotStartRuntime(t *testing.T) {
	e, runner, download, o := fixtureEngine(t, "dell-gb10")
	download.bad = true
	result, err := e.Run(context.Background(), o)
	if err != nil || result.Outcome != "UNKNOWN" || runner.running || result.RuntimeReady || result.Reason != "PLATFORM_ASSET_HASH_MISMATCH" {
		t.Fatalf("bad download accepted: %+v %v", result, err)
	}
}
func TestRuntimeConfigurationRollbackAndRetry(t *testing.T) {
	for _, profile := range []string{"precision-windows", "macos-m3-max"} {
		t.Run(profile, func(t *testing.T) {
			e, runner, _, o := fixtureEngine(t, profile)
			result, err := e.Run(context.Background(), o)
			if err != nil || !result.RuntimeReady {
				t.Fatalf("initial: %+v %v", result, err)
			}
			config := filepath.Join(o.DataRoot, "daemon.json")
			if profile == "macos-m3-max" {
				config = filepath.Join(o.DataRoot, "colima", e.profileName(o), "colima.yaml")
			}
			before, _ := os.ReadFile(config)
			o.Phase = "runtime"
			o.Pool = "10.247.0.0/16"
			o.MemoryGiB = 20
			runner.o = o
			runner.failStart = true
			result, err = e.Run(context.Background(), o)
			if err != nil || result.Outcome != "FAILED" || result.Phase != "COMPLETED" || result.RuntimeReady {
				t.Fatalf("rollback result: %+v %v", result, err)
			}
			after, _ := os.ReadFile(config)
			if !bytes.Equal(before, after) {
				t.Fatal("previous config not restored")
			}
			if result, err = e.Run(context.Background(), o); err != nil || !result.RuntimeReady {
				t.Fatalf("retry: %+v %v", result, err)
			}
		})
	}
}
func TestFailedFirstStartDoesNotEnableService(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "precision-windows")
	runner.failStart = true
	result, err := e.Run(context.Background(), o)
	if err != nil || result.Outcome != "FAILED" || result.RuntimeReady || runner.enabled || runner.running {
		t.Fatalf("first-start compensation: %+v %v", result, err)
	}
	for _, c := range runner.calls {
		if filepath.Base(c.Program) == "systemctl" && (c.Args[0] == "enable" || c.Args[0] == "disable") {
			t.Fatalf("boot dependency changed before successful start: %v", c)
		}
	}
	if result, err = e.Run(context.Background(), o); err != nil || !result.RuntimeReady || !runner.enabled {
		t.Fatalf("first-start retry: %+v %v", result, err)
	}
}
func TestRollbackRefusesConcurrentForeignEdit(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "precision-windows")
	result, err := e.Run(context.Background(), o)
	if err != nil || !result.RuntimeReady {
		t.Fatal(err, result)
	}
	o.Phase = "runtime"
	o.Pool = "10.247.0.0/16"
	runner.o = o
	runner.failStart = true
	runner.corruptDuringStart = true
	result, err = e.Run(context.Background(), o)
	if err != nil || result.Outcome != "UNKNOWN" || result.RuntimeReady {
		t.Fatal(err, result)
	}
	data, _ := os.ReadFile(filepath.Join(o.DataRoot, "daemon.json"))
	if string(data) != "foreign edit" {
		t.Fatal("concurrent admin change overwritten")
	}
}
func TestCorruptAuditAndOwnershipFailClosed(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "precision-windows")
	result, err := e.Run(context.Background(), o)
	if err != nil || !result.RuntimeReady {
		t.Fatal(err, result)
	}
	path := filepath.Join(o.ControlRoot, "admin.jsonl")
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
	_, _ = f.Write([]byte("broken"))
	_ = f.Close()
	runner.calls = nil
	if _, err = e.Run(context.Background(), o); code(err) != "PLATFORM_AUDIT_CORRUPT" {
		t.Fatalf("bad ledger allowed: %v", err)
	}
	for _, command := range runner.calls {
		if filepath.Base(command.Program) != "dpkg-query" {
			t.Fatalf("effect after bad ledger: %v", command)
		}
	}
}
func TestRuntimeRequiresHostAndRejectsForeignConfig(t *testing.T) {
	e, _, _, o := fixtureEngine(t, "precision-windows")
	o.Phase = "runtime"
	if _, err := e.Run(context.Background(), o); code(err) != "PLATFORM_HOST_PREPARATION_REQUIRED" {
		t.Fatal(err)
	}
	o.Phase = "host"
	if _, err := e.Run(context.Background(), o); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(o.DataRoot, "daemon.json"), []byte("foreign config"), 0600); err != nil {
		t.Fatal(err)
	}
	o.Phase = "runtime"
	result, err := e.Run(context.Background(), o)
	if err != nil || result.Reason != "PLATFORM_RUNTIME_FOREIGN_CONFIGURATION" {
		t.Fatalf("foreign config accepted: %+v %v", result, err)
	}
	data, _ := os.ReadFile(filepath.Join(o.DataRoot, "daemon.json"))
	if string(data) != "foreign config" {
		t.Fatal("foreign config changed")
	}
}
func TestNetworkConflictNoDaemonStarted(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "dell-gb10")
	runner.route = `[{"dst":"10.248.4.0/24"}]`
	result, err := e.Run(context.Background(), o)
	if err != nil || result.Reason != "PLATFORM_RUNTIME_NETWORK_CONFLICT" || runner.running {
		t.Fatal(err, result)
	}
}
func TestToolkitInstallationNeverInstallsLinuxDriver(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "precision-windows")
	runner.toolkit = false
	result, err := e.Run(context.Background(), o)
	if err != nil || !result.RuntimeReady {
		t.Fatal(err, result)
	}
	found := false
	for _, command := range runner.calls {
		args := strings.Join(command.Args, " ")
		if strings.Contains(args, "nvidia-container-toolkit-base=1.20.1-1") {
			found = true
		}
		if strings.Contains(args, "nvidia-driver") || strings.Contains(args, "cuda-drivers") {
			t.Fatal("Linux display driver requested")
		}
	}
	if !found {
		t.Fatal("toolkit not prepared")
	}
}
func TestLockedControlAndHostMismatch(t *testing.T) {
	e, _, _, o := fixtureEngine(t, "dell-gb10")
	if err := ownedDirectory(o.ControlRoot, o.InstallationID+":"+o.Profile+":"+e.Host.Actor); err != nil {
		t.Fatal(err)
	}
	unlock, err := lockFile(filepath.Join(o.ControlRoot, "installation.lock"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = e.Run(context.Background(), o); code(err) != "PLATFORM_PROVISION_BUSY" {
		t.Fatalf("concurrent installer allowed: %v", err)
	}
	unlock()
	e.Host.Arch = "amd64"
	if _, err = e.Run(context.Background(), o); code(err) != "PLATFORM_SETUP_PROFILE_MISMATCH" {
		t.Fatal(err)
	}
}
func TestLockedAssetsAndCLIErrorProjection(t *testing.T) {
	for key, a := range assets() {
		if !hashPattern.MatchString(a.SHA256) || !strings.HasPrefix(a.URL, "https://") {
			t.Fatalf("unlocked asset: %s", key)
		}
	}
	var output bytes.Buffer
	if RunCLI([]string{"--unknown", "token=private"}, &output, &output) != 1 || strings.Contains(output.String(), "token=private") {
		t.Fatal("argument error leaked input")
	}
}
func TestVendorEngineIsConsumedWithoutModification(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "dell-gb10")
	o.RuntimeMode = "external"
	runner.o = o
	runner.running = true
	runner.serverVersion = "28.3.0"
	result, err := e.Run(context.Background(), o)
	if err != nil || !result.RuntimeReady || result.RuntimeMode != "external" {
		t.Fatalf("external engine: %+v %v", result, err)
	}
	for _, command := range runner.calls {
		if filepath.Base(command.Program) == "systemctl" || filepath.Base(command.Program) == "nvidia-ctk" {
			t.Fatalf("modified vendor engine/toolkit: %v", command)
		}
	}
	if _, err = os.Stat(filepath.Join(o.DataRoot, "daemon.json")); !os.IsNotExist(err) {
		t.Fatal("vendor daemon config generated")
	}
	o.RuntimeMode = "owned"
	if _, err = e.Run(context.Background(), o); code(err) != "PLATFORM_RUNTIME_MODE_MIGRATION_REQUIRED" {
		t.Fatal("silently migrated vendor engine", err)
	}
}
func TestVendorGpuConfigurationIsNeverRewritten(t *testing.T) {
	e, runner, _, o := fixtureEngine(t, "dell-gb10")
	o.RuntimeMode = "external"
	runner.o = o
	runner.running = true
	runner.noNvidiaRuntime = true
	result, err := e.Run(context.Background(), o)
	if err != nil || result.RuntimeReady || result.Reason != "PLATFORM_EXTERNAL_GPU_RUNTIME_CONFIGURATION_REQUIRED" {
		t.Fatal(err, result)
	}
}
func TestUnsupportedMetalAndControlBinding(t *testing.T) {
	e, runner, download, o := fixtureEngine(t, "macos-m3-max")
	runner.noMetal = true
	result, err := e.Run(context.Background(), o)
	if err != nil || result.RuntimeReady || result.Reason != "PLATFORM_METAL_NOT_OBSERVED" || download.calls != 0 {
		t.Fatal(err, result)
	}
	runner.noMetal = false
	result, err = e.Run(context.Background(), o)
	if err != nil || !result.RuntimeReady {
		t.Fatal(err, result)
	}
	o.ControlRoot = filepath.Join(filepath.Dir(o.ControlRoot), "other-control")
	if _, err = e.Run(context.Background(), o); code(err) != "PLATFORM_PROVISION_OWNERSHIP_CONFLICT" {
		t.Fatal("data reused with another control root", err)
	}
}
func TestApprovedVendorArchives(t *testing.T) {
	root := os.Getenv("PROVISION_TEST_ASSET_ROOT")
	if root == "" {
		t.Skip("optional real vendor archive check")
	}
	files := map[string]string{"docker-linux-amd64": "docker-linux-x86_64-29.9.3.tgz", "docker-linux-arm64": "docker-linux-aarch64-29.9.3.tgz", "docker-darwin-arm64": "docker-mac-aarch64-29.9.3.tgz", "lima-darwin-arm64": "lima-2.3.0-Darwin-arm64.tar.gz"}
	for key, name := range files {
		t.Run(key, func(t *testing.T) {
			path := filepath.Join(root, name)
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			asset := assets()[key]
			if digest(data) != asset.SHA256 {
				t.Fatal("vendor hash mismatch")
			}
			if err = extractAsset(path, t.TempDir(), asset.Kind); err != nil {
				t.Fatal(err)
			}
		})
	}
}
func TestRebootRequiredDefersRuntime(t *testing.T) {
	e, runner, download, o := fixtureEngine(t, "precision-windows")
	path := e.path("/var/run/reboot-required")
	_ = os.MkdirAll(filepath.Dir(path), 0700)
	_ = os.WriteFile(path, []byte("required"), 0600)
	result, err := e.Run(context.Background(), o)
	if err != nil || result.Outcome != "DEFERRED" || result.Phase != "WAITING" || download.calls != 0 || runner.running {
		t.Fatal(err, result)
	}
}
