"""Native development checks. Never provisions the workstation or weakens policy."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[2]
TARGETS = ("linux-amd64", "linux-arm64", "darwin-arm64")
ROOT_FILES = ("platform.sh", "install.sh", "platform.ps1", "install.ps1", "validate-platform.ps1", ".gitattributes", ".github/workflows/validate.yaml")
PRIVATE_PARTS = {".git", ".cache", ".env", ".state", ".secrets", "__pycache__", "backups", "node_modules", "projects", "control", "data"}
PRIVATE_NAMES = {"access-seed.json", "access-recovery.json", "observability-seed.json", "hub-owner.json", "origin-material.json", "origin-pending-material.json"}
SOURCE_EXTENSIONS = {".go", ".json", ".py", ".sh", ".ps1", ".psm1", ".psd1", ".md", ".awk", ".mod", ".sum"}


class ValidationError(Exception):
    def __init__(self, code, exit_code=1):
        super().__init__(code)
        self.code, self.exit_code = code, exit_code


def source_files(root=ROOT):
    paths = [root / name for name in ROOT_FILES if (root / name).exists()]
    for name in ("operations", "environments"):
        for path in (root / name).rglob("*"):
            relative = path.relative_to(root)
            if any(part in PRIVATE_PARTS for part in relative.parts) or path.name in PRIVATE_NAMES or path.suffix not in SOURCE_EXTENSIONS:
                continue
            if path.is_symlink():
                raise ValidationError("PLATFORM_VALIDATION_SOURCE_LINK_REJECTED")
            if path.is_file():
                paths.append(path)
    paths.extend((root / "tests").glob("platform-*.tests.*"))
    # Path ordering differs between Windows (case-insensitive) and POSIX.
    # Hash the same relative names in exactly the same order on every host.
    for path in sorted(set(paths), key=lambda item: item.relative_to(root).as_posix()):
        if path.is_symlink() or not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
            if path.is_symlink():
                raise ValidationError("PLATFORM_VALIDATION_SOURCE_LINK_REJECTED")
            continue
        yield path.relative_to(root).as_posix(), path


def source_bytes(path):
    # Match Git's text normalization; WSL snapshots must not depend on NTFS EOL.
    data = path.read_bytes()
    data.decode("utf-8")
    return data.replace(b"\r\n", b"\n")


def source_digest(root=ROOT):
    digest = hashlib.sha256()
    for name, path in source_files(root):
        digest.update(name.encode() + b"\n" + source_bytes(path) + b"\n")
    return digest.hexdigest()


def snapshot(destination, root=ROOT):
    for name, path in source_files(root):
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source_bytes(path))
        target.chmod(0o700 if path.suffix == ".sh" else 0o600)


def host_target():
    system = {"Linux": "linux", "Darwin": "darwin", "Windows": "windows"}.get(platform.system(), "unsupported")
    arch = {"x86_64": "amd64", "AMD64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine(), "unsupported")
    return f"{system}-{arch}"


def actor_identity():
    if hasattr(os, "getuid"):
        return {"type": "os_process", "identity": f"uid:{os.getuid()}", "assurance": "OS_ACCOUNT_OBSERVED_HUMAN_NOT_VERIFIED"}
    try:
        whoami = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32/whoami.exe"
        value = subprocess.check_output([str(whoami), "/user", "/fo", "csv", "/nh"], text=True, timeout=5)
        sid = re.search(r"S-\d+(?:-\d+)+", value)
        if sid:
            return {"type": "os_process", "identity": sid.group(), "assurance": "OS_ACCOUNT_OBSERVED_HUMAN_NOT_VERIFIED"}
    except (OSError, subprocess.SubprocessError):
        pass
    return {"type": "os_process", "identity": "NOT_OBSERVED", "assurance": "NOT_OBSERVED"}


def find_go(root=ROOT):
    version = next(line.split()[1] for line in (root / "operations/go.mod").read_text().splitlines() if line.startswith("go "))
    executable = "go.exe" if platform.system() == "Windows" else "go"
    cached = root / f".cache/toolchains/go{version}/go/bin/{executable}"
    selected = os.environ.get("PLATFORM_GO") or (str(cached) if cached.is_file() else shutil.which("go"))
    if not selected:
        raise ValidationError("PLATFORM_VALIDATION_GO_REQUIRED", 42)
    return selected


def run(command, root, env, checks, name):
    print(f"[validation] {name}", flush=True)
    result = subprocess.run([str(x) for x in command], cwd=root, env=env, check=False)
    checks.append({"check": name, "exit_code": result.returncode, "outcome": "SUCCEEDED" if result.returncode == 0 else "FAILED"})
    if result.returncode:
        raise ValidationError("PLATFORM_VALIDATION_CHECK_FAILED")


def executed_tests(events, required):
    passed = {item.get("Test") for item in events if item.get("Action") == "pass" and item.get("Test")}
    if not set(required).issubset(passed):
        raise ValidationError("PLATFORM_VALIDATION_REQUIRED_TEST_NOT_EXECUTED")
    return len(passed)


def run_go_tests(command, root, env, checks, name, required):
    print(f"[validation] {name}", flush=True)
    events = []
    process = subprocess.Popen([str(x) for x in command], cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    for line in process.stdout:
        print(line, end="", flush=True)
        try:
            item = json.loads(line)
            if item.get("Test") and item.get("Action") in ("pass", "skip", "fail"):
                events.append({"Action": item["Action"], "Test": item["Test"]})
        except (ValueError, AttributeError):
            pass
    code = process.wait()
    check = {"check": name, "exit_code": code, "outcome": "FAILED", "tests_passed": 0}
    checks.append(check)
    if code:
        raise ValidationError("PLATFORM_VALIDATION_CHECK_FAILED")
    check["tests_passed"] = executed_tests(events, required)
    check["outcome"] = "SUCCEEDED"


def execute(mode, root, output, env, checks, disposable=False):
    target = host_target()
    # This guard precedes even resolving Go. No unsigned Windows test executable.
    if mode in ("unit", "integration") and target not in TARGETS:
        raise ValidationError("PLATFORM_NATIVE_VALIDATION_REQUIRED", 42)
    if mode == "integration" and (not disposable or target not in ("linux-amd64", "linux-arm64") or os.environ.get("GITHUB_ACTIONS") != "true"):
        raise ValidationError("PLATFORM_DISPOSABLE_CI_REQUIRED", 42)
    if mode == "windows":
        if target != "windows-amd64":
            raise ValidationError("PLATFORM_WINDOWS_BOOTSTRAP_HOST_REQUIRED", 42)
        # PowerShell 7's inherited module path can hide Windows PowerShell's
        # built-in modules. Let the system Windows PowerShell set its defaults.
        windows_env = {key: value for key, value in env.items() if key.upper() != "PSMODULEPATH"}
        for name in ("platform-installer.tests.ps1", "platform-windows-gpu.tests.ps1"):
            run(["powershell.exe", "-NoProfile", "-File", root / "tests" / name], root, windows_env, checks, name)
        run([sys.executable, root / "tests/platform-validation.tests.py"], root, windows_env, checks, "validation-contracts")
        run([sys.executable, root / "tests/platform-distribution.tests.py"], root, windows_env, checks, "distribution-contracts")
        return
    go = find_go()
    expected_version = next(line.split()[1] for line in (root / "operations/go.mod").read_text().splitlines() if line.startswith("go "))
    actual = subprocess.check_output([go, "version"], env=env, text=True).split()
    if len(actual) < 3 or actual[2] != f"go{expected_version}":
        raise ValidationError("PLATFORM_VALIDATION_GO_VERSION_MISMATCH")
    base = [go, "-C", root / "operations"]
    if mode == "integration":
        env.update(PROVISION_ACCESS_INTEGRATION="1", PROVISION_NETWORK_INTEGRATION="1")
        for test, timeout in (("TestNetworkWithRealDocker", "5m"), ("TestAccessWithRealDocker", "25m")):
            run_go_tests(base + ["test", "-json", "./internal/provision", "-run", f"^{test}$", "-count=1", "-timeout", timeout], root, env, checks, test, [test])
        return
    gofmt = Path(go).with_name("gofmt.exe" if platform.system() == "Windows" else "gofmt")
    formatted = subprocess.check_output([str(gofmt), "-l", "cmd", "internal", "blueprints"], cwd=root / "operations", env=env, text=True)
    if formatted.strip():
        raise ValidationError("PLATFORM_VALIDATION_FORMATTING_REQUIRED")
    checks.append({"check": "gofmt", "outcome": "SUCCEEDED", "exit_code": 0})
    run(base + ["vet", "./..."], root, env, checks, "go-vet")
    if mode == "static":
        for target in TARGETS:
            goos, goarch = target.split("-")
            target_env = dict(env, GOOS=goos, GOARCH=goarch)
            (output / target).mkdir(parents=True, exist_ok=True)
            run(base + ["build", "-trimpath", "-o", output / target / "platform", "./cmd/platform"], root, target_env, checks, f"compile-{target}")
            for package in ("platform", "provision"):
                run(base + ["test", "-c", "-o", output / target / f"{package}.test", f"./internal/{package}"], root, target_env, checks, f"compile-tests-{target}-{package}")
        return
    run_go_tests(base + ["test", "-json", "./...", "-count=1", "-timeout", "10m"], root, env, checks, "native-go-tests", ["TestInstallationBinding", "TestHubAllProfilesPreparationAndDailyOperations", "TestObservabilitySignalEvidenceAndReadOnlyDiagnosis"])
    binary = output / "platform"
    run(base + ["build", "-trimpath", "-o", binary, "./cmd/platform"], root, env, checks, "native-cli-build")
    for profile in ("precision-windows", "macos-m3-max", "dell-gb10"):
        for command in ("validate", "publication"):
            run([binary, command, "--root", root, "--profile", profile, "--format", "json"], root, env, checks, f"{command}-{profile}")
    for script in ("platform-launcher.tests.sh", "platform-wsl-config.tests.sh", "platform-core-release.tests.sh"):
        run(["sh", root / "tests" / script], root, env, checks, script)
    run(["sh", root / "tests/platform-core-release.tests.sh"], root, dict(env, PLATFORM_TEST_NATIVE_BINARY=str(binary)), checks, "native-installed-release")
    run([sys.executable, root / "tests/platform-security-updates.tests.py"], root, env, checks, "security-package-selection")
    run([sys.executable, root / "tests/platform-validation.tests.py"], root, env, checks, "validation-contracts")
    run([sys.executable, root / "tests/platform-distribution.tests.py"], root, env, checks, "distribution-contracts")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("unit", "static", "windows", "integration"), default="unit")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--snapshot", action="store_true")
    parser.add_argument("--disposable", action="store_true")
    args = parser.parse_args(argv)
    operation = uuid.uuid4().hex
    output = ROOT / ".cache/platform-validation" / operation
    report_path = args.report or output / "report.json"
    before = source_digest()
    catalog = json.loads((ROOT / "operations/validation-catalog.json").read_text())["commands"][args.mode]
    report = {"schema_version": 1, "operation_id": operation, "mode": args.mode, "target": host_target(), "action": catalog["action"],
              "effect": catalog["effect"], "comparison": {"kind": catalog["comparison"], "before": before, "after": "NOT_OBSERVED"},
              "rollback": catalog["rollback"], "source_sha256": before, "commit": os.environ.get("GITHUB_SHA", "NOT_OBSERVED"),
              "ci_run_id": os.environ.get("GITHUB_RUN_ID", "NOT_OBSERVED"), "actor": actor_identity(),
              "started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "outcome": "UNKNOWN", "phase": "OBSERVED", "decision": "NOT_APPLICABLE",
              "qualification": "NOT_EXECUTED", "installation_ready": False, "checks": []}
    env = dict(os.environ, GOTOOLCHAIN="local", GOTELEMETRY="off", CGO_ENABLED="0", PROVISION_ACCESS_INTEGRATION="0", PROVISION_NETWORK_INTEGRATION="0", PYTHONUTF8="1")
    env.pop("GOOS", None); env.pop("GOARCH", None)
    if host_target() in TARGETS:
        env["GOOS"], env["GOARCH"] = host_target().split("-")
    code = 1
    try:
        output.mkdir(parents=True, exist_ok=False)
        env["GOCACHE"] = str(ROOT / ".cache/platform-validation/go-build")
        if args.snapshot:
            # Native FS is required for POSIX ownership/permission tests in WSL.
            native_parent = "/tmp" if platform.system() == "Linux" else None
            with tempfile.TemporaryDirectory(prefix="platform-validation-", dir=native_parent) as temporary:
                copied = Path(temporary) / "source"
                snapshot(copied)
                if source_digest(copied) != before:
                    raise ValidationError("PLATFORM_VALIDATION_SNAPSHOT_MISMATCH")
                native_output = Path(temporary) / "build"
                native_output.mkdir()
                native_env = dict(env, GOCACHE=str(native_output / "go-build"))
                execute(args.mode, copied, native_output, native_env, report["checks"], args.disposable)
        else:
            execute(args.mode, ROOT, output, env, report["checks"], args.disposable)
        if source_digest() != before:
            raise ValidationError("PLATFORM_VALIDATION_SOURCES_CHANGED")
        report.update(outcome="SUCCEEDED", phase="COMPLETED", qualification={"unit": "NATIVE_UNIT_PASSED", "static": "STATIC_ONLY", "windows": "WINDOWS_BOOTSTRAP_PASSED", "integration": "DISPOSABLE_DOCKER_PASSED"}[args.mode])
        code = 0
    except ValidationError as exc:
        code = exc.exit_code
        report.update(reason_code=exc.code, outcome="DEFERRED" if code == 42 else "FAILED", phase="WAITING" if code == 42 else "COMPLETED")
        if args.mode == "integration" and code != 42:
            report.update(outcome="UNKNOWN", phase="OBSERVED")
    except (OSError, subprocess.SubprocessError):
        report.update(reason_code="PLATFORM_VALIDATION_TOOL_UNAVAILABLE")
    finally:
        report["comparison"]["after"] = source_digest()
        report.update(exit_code=code, ended_at=dt.datetime.now(dt.timezone.utc).isoformat())
        report_path.parent.mkdir(parents=True, exist_ok=True)
        candidate = report_path.with_suffix(".pending")
        candidate.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        candidate.replace(report_path)
        print(json.dumps({"outcome": report["outcome"], "qualification": report["qualification"], "reason_code": report.get("reason_code"), "report": str(report_path)}, ensure_ascii=False))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
