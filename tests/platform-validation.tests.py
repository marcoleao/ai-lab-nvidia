"""Isolated validation/gate contracts; never starts Go, WSL or containers."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "operations/scripts"))
import validation

spec = importlib.util.spec_from_file_location("release_gate", ROOT / "operations/scripts/release-gate.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class ValidationContracts(unittest.TestCase):
    def test_windows_native_refuses_before_resolving_or_running_go(self):
        with patch.object(validation, "host_target", return_value="windows-amd64"), patch.object(validation, "find_go") as go, patch.object(validation.subprocess, "run") as run:
            with self.assertRaisesRegex(validation.ValidationError, "PLATFORM_NATIVE_VALIDATION_REQUIRED"):
                validation.execute("unit", ROOT, ROOT, {}, [])
            go.assert_not_called(); run.assert_not_called()

    def test_local_integration_requires_disposable_ci_before_go(self):
        with patch.object(validation, "host_target", return_value="linux-amd64"), patch.dict(validation.os.environ, {"GITHUB_ACTIONS": "false"}), patch.object(validation, "find_go") as go:
            with self.assertRaisesRegex(validation.ValidationError, "PLATFORM_DISPOSABLE_CI_REQUIRED"):
                validation.execute("integration", ROOT, ROOT, {}, [], disposable=True)
            go.assert_not_called()

    def test_windows_bootstrap_does_not_inherit_powershell_7_module_path(self):
        env = {"PSModulePath": "fixture-powershell-7-modules", "PATH": "fixture-path"}
        with patch.object(validation, "host_target", return_value="windows-amd64"), patch.object(validation, "run") as run:
            validation.execute("windows", ROOT, ROOT, env, [])
        self.assertEqual(run.call_count, 4)
        for call in run.call_args_list:
            self.assertEqual(call.args[2], {"PATH": "fixture-path"})
        self.assertIn("PSModulePath", env)

    def test_skipped_or_absent_named_test_is_not_execution(self):
        for events in ([], [{"Action": "skip", "Test": "required"}], [{"Action": "pass", "Test": "other"}]):
            with self.assertRaisesRegex(validation.ValidationError, "NOT_EXECUTED"):
                validation.executed_tests(events, ["required"])
        self.assertEqual(validation.executed_tests([{"Action": "pass", "Test": "required"}], ["required"]), 1)

    def test_snapshot_digest_is_independent_of_windows_line_endings(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            validation.snapshot(directory)
            self.assertEqual(validation.source_digest(directory), validation.source_digest())
            sample = directory / "operations/go.mod"
            sample.write_bytes(sample.read_bytes().replace(b"\n", b"\r\n"))
            self.assertEqual(validation.source_digest(directory), validation.source_digest())

    def test_manifest_order_is_portable_for_mixed_case_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ("operations/Z.md", "operations/a.md", "operations/Aardvark.md", "environments/z.json", "platform.sh"):
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text("fixture\n")
            names = [name for name, _ in validation.source_files(root)]
            self.assertEqual(names, ["environments/z.json", "operations/Aardvark.md", "operations/Z.md", "operations/a.md", "platform.sh"])

    def test_snapshot_excludes_runtime_private_data_and_binary_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            for name in ("operations/internal/access-seed.json", "operations/.secrets/private.json", "operations/control/state.json", "operations/output.test", "environments/.env"):
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(b"private-fixture\xff")
            source = root / "operations/public.go"; source.write_text("package fixture\n")
            target = Path(tmp) / "snapshot"
            validation.snapshot(target, root)
            self.assertEqual({p.relative_to(target).as_posix() for p in target.rglob("*") if p.is_file()}, {"operations/public.go"})

    def test_workflow_publication_needs_all_required_validation_jobs(self):
        workflow = (ROOT / ".github/workflows/validate.yaml").read_text(encoding="utf-8")
        native = workflow.split("  platform-cli:\n", 1)[1].split("  platform-windows-bootstrap:", 1)[0]
        self.assertNotIn("windows-latest", native)
        self.assertNotIn("macos-15", native)
        self.assertNotIn("ubuntu-24.04-arm", native)
        release = workflow.split("  platform-cli-build:\n", 1)[1].split("  portal-foundation:", 1)[0]
        self.assertIn("needs: [platform-cli, platform-windows-bootstrap, platform-integration]", release)
        self.assertLess(release.index("release-gate.py"), release.index("package-cli.sh"))
        self.assertNotIn("continue-on-error", release)

    def reports(self, directory):
        for name, (mode, target, qualification, required) in gate.EXPECTED.items():
            checks = [{"check": check, "outcome": "SUCCEEDED", "exit_code": 0, "tests_passed": 1} for check in required]
            report = {"schema_version": 1, "mode": mode, "target": target, "qualification": qualification, "outcome": "SUCCEEDED", "phase": "COMPLETED", "exit_code": 0, "source_sha256": "a" * 64, "commit": "b" * 40, "ci_run_id": "123", "comparison": {"before": "a" * 64, "after": "a" * 64}, "checks": checks}
            (directory / name).write_text(json.dumps(report), encoding="utf-8")

    def test_release_requires_complete_matching_reports(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            self.reports(directory)
            self.assertEqual(len(gate.require_reports(directory, "a" * 64, "b" * 40, "123")), 3)
            for field, value in (("qualification", "STATIC_ONLY"), ("commit", "c" * 40), ("ci_run_id", "old"), ("source_sha256", "d" * 64), ("outcome", "DEFERRED"), ("exit_code", False)):
                self.reports(directory)
                sample = directory / "native-linux-amd64.json"
                report = json.loads(sample.read_text()); report[field] = value; sample.write_text(json.dumps(report))
                with self.assertRaises(ValueError):
                    gate.require_reports(directory, "a" * 64, "b" * 40, "123")
            self.reports(directory)
            (directory / "docker-linux-amd64.json").unlink()
            with self.assertRaisesRegex(ValueError, "INCOMPLETE"):
                gate.require_reports(directory, "a" * 64, "b" * 40, "123")

    def test_release_rejects_failed_missing_or_unexecuted_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            for change in ("missing", "failed", "not-executed"):
                self.reports(directory)
                path = directory / "native-linux-amd64.json"
                report = json.loads(path.read_text())
                if change == "missing": report["checks"] = []
                elif change == "failed": report["checks"][0]["outcome"] = "FAILED"
                else:
                    next(c for c in report["checks"] if c["check"] == "native-go-tests")["tests_passed"] = 0
                path.write_text(json.dumps(report))
                with self.assertRaises(ValueError):
                    gate.require_reports(directory, "a" * 64, "b" * 40, "123")


if __name__ == "__main__":
    unittest.main()
