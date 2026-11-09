"""Isolated distribution fixtures. No Go, WSL, host mutation or real GitHub writes."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "operations/scripts"))
import validation


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "operations/scripts" / filename)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


release = module("precision_release_test", "precision-release.py")
packager = module("precision_package_test", "package-cli.py")


class FakeGitHub:
    def __init__(self):
        self.release = None; self.assets = {}; self.writes = []; self.fail_upload = None; self.wrong_tag = False

    def request(self, method, path, value=None, data=None, upload=False):
        if method == "GET" and path.startswith("/releases/tags/"):
            return self.release.copy() if self.release else None
        if method == "POST" and path == "/releases":
            self.release = dict(value, id=123); self.writes.append("create")
            return self.release.copy()
        if method == "GET" and path.startswith("/git/ref/"):
            if self.release is None or self.release["draft"]:
                return None
            return {"object": {"type": "commit", "sha": "f" * 40 if self.wrong_tag else self.release["target_commitish"]}}
        if method == "GET" and "/assets?" in path:
            return list(self.assets.values())
        if method == "POST" and "/assets?name=" in path:
            name = path.split("name=", 1)[1]
            self.writes.append("upload:" + name)
            item = {"name": name, "digest": "sha256:" + release.sha(data), "state": "uploaded", "size": len(data)}
            self.assets[name] = item
            if name == self.fail_upload:
                self.fail_upload = None
                raise OSError("isolated lost response after upload")
            return item
        if method == "PATCH" and path == "/releases/123":
            self.release.update(value); self.writes.append("publish")
            return self.release.copy()
        raise AssertionError((method, path))


class DistributionContracts(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="platform-distribution-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / "sources with spaces"; self.root.mkdir()
        for name in (*release.BOOTSTRAP_FILES, "environments/platform.json", "environments/windows.psd1"):
            target = self.root / name; target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(validation.source_bytes(ROOT / name))
        self.packages = self.base / "packages"; self.reports = self.base / "reports"; self.reports.mkdir()
        binary = self.base / "native-fixture"; binary.write_bytes(b"\x7fELF" + b"isolated-non-executed-fixture")
        packager.package("linux-amd64", binary, self.packages)
        self.commit = "b" * 40; self.run_id = "123"
        self.digest = validation.source_digest(self.root)
        evidence = {}
        for filename, (mode, target, qualification, required) in release.gate.EXPECTED.items():
            value = {"schema_version": 1, "mode": mode, "target": target, "qualification": qualification,
                     "commit": self.commit, "ci_run_id": self.run_id, "source_sha256": self.digest,
                     "comparison": {"before": self.digest, "after": self.digest}, "outcome": "SUCCEEDED", "phase": "COMPLETED", "exit_code": 0,
                     "checks": [{"check": key, "outcome": "SUCCEEDED", "exit_code": 0, "tests_passed": 1} for key in sorted(required)]}
            raw = release.encode(value); (self.reports / filename).write_bytes(raw); evidence[filename] = release.sha(raw)
        receipt = {"schema_version": 1, "profile": "precision-windows", "commit": self.commit, "ci_run_id": self.run_id,
                   "source_sha256": self.digest, "evidence_sha256": evidence, "outcome": "SUCCEEDED", "phase": "COMPLETED", "installation_ready": False}
        (self.packages / "validation.json").write_bytes(release.encode(receipt))
        self.output = self.base / "release"

    def prepare(self):
        manifest = release.prepare(self.packages, self.reports, self.output, self.commit, self.run_id, self.root)
        proof = {"action": "PLATFORM_PRECISION_SETUP_VERIFIED", "commit": self.commit, "ci_run_id": self.run_id,
                 "source_sha256": self.digest, "setup_sha256": manifest['assets']['setup']['sha256'],
                 "installation_ready": False, "outcome": "SUCCEEDED", "phase": "COMPLETED"}
        (self.output / "precision-setup-verification.json").write_bytes(release.encode(proof))
        return manifest

    def test_publication_requires_matching_real_windows_verification(self):
        self.prepare(); api = FakeGitHub()
        path = self.output / 'precision-setup-verification.json'
        proof = json.loads(path.read_text()); proof['setup_sha256'] = '0' * 64; path.write_bytes(release.encode(proof))
        with patch.object(release, 'source_digest', return_value=self.digest):
            with self.assertRaisesRegex(ValueError, 'WINDOWS_VERIFICATION_REQUIRED'):
                release.publish(self.output, api, self.commit, self.run_id)
        self.assertEqual(api.writes, [])

    def test_archive_is_reproducible_and_has_closed_safe_layout(self):
        binary = self.base / "binary"; binary.write_bytes(b"native-fixture")
        first = packager.package("linux-amd64", binary, self.base / "first").read_bytes()
        os.utime(binary, (1700000000, 1700000000))
        second = packager.package("linux-amd64", binary, self.base / "second").read_bytes()
        self.assertEqual(first, second)
        with tarfile.open(self.base / "first/platform-linux-amd64.tar.gz") as archive:
            files = [entry for entry in archive if entry.isfile()]
            self.assertEqual(len(files), 11)
            self.assertTrue(all(entry.uid == 0 and entry.gid == 0 and entry.mtime == 0 for entry in files))
            self.assertFalse(any(entry.issym() or entry.islnk() or ".." in Path(entry.name).parts for entry in archive.getmembers()))

    def test_bundle_has_installer_cli_reports_and_no_private_state(self):
        manifest = self.prepare()
        with zipfile.ZipFile(self.output / "precision-setup.zip") as archive:
            names = set(archive.namelist())
            self.assertIn("install.ps1", names); self.assertIn("precision-lock.json", names)
            self.assertIn("packages/platform-linux-amd64.tar.gz", names)
            self.assertEqual(len([name for name in names if name.startswith("packages/evidence/")]), 3)
            self.assertFalse(any(set(Path(name).parts) & validation.PRIVATE_PARTS for name in names))
            lock = json.loads(archive.read("precision-lock.json"))
            self.assertNotIn("setup", lock["assets"])  # No self-referential archive hash.
            self.assertNotIn("environments/platform.json", lock["bootstrap_sha256"])  # User configuration is editable.
        self.assertFalse(manifest["installation_ready"])
        before = (self.output / "precision-setup.zip").read_bytes()
        self.prepare()
        self.assertEqual(before, (self.output / "precision-setup.zip").read_bytes())

    def test_wrong_report_source_or_archive_checksum_blocks_bundle(self):
        receipt_path = self.packages / "validation.json"
        receipt = json.loads(receipt_path.read_text()); receipt["source_sha256"] = "a" * 64
        receipt_path.write_bytes(release.encode(receipt))
        with self.assertRaisesRegex(ValueError, "VALIDATION_MISMATCH"):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_publication_retries_draft_then_reuses_published_assets(self):
        self.prepare(); api = FakeGitHub(); api.fail_upload = "validation.json"
        with patch.object(release, "source_digest", return_value=self.digest):
            with self.assertRaises(OSError):
                release.publish(self.output, api, self.commit, self.run_id)
            self.assertTrue(api.release["draft"])
            result = release.publish(self.output, api, self.commit, self.run_id)
            self.assertFalse(api.release["draft"]); self.assertEqual(len(result["assets_sha256"]), 5)
            self.assertEqual(api.writes.count('upload:validation.json'), 1)
            previous = list(api.writes)
            result = release.publish(self.output, api, self.commit, self.run_id)
            self.assertEqual(api.writes, previous)
            self.assertFalse(result['changed']); self.assertEqual(result['before'], result['after'])

    def test_existing_asset_conflict_is_never_overwritten(self):
        self.prepare(); api = FakeGitHub()
        with patch.object(release, "source_digest", return_value=self.digest):
            release.publish(self.output, api, self.commit, self.run_id)
            api.assets["validation.json"]["digest"] = "sha256:" + "0" * 64
            previous = list(api.writes)
            with self.assertRaisesRegex(ValueError, "UPLOAD_UNCONFIRMED"):
                release.publish(self.output, api, self.commit, self.run_id)
            self.assertEqual(api.writes, previous)

    def test_wrong_release_tag_commit_is_rejected(self):
        self.prepare(); api = FakeGitHub()
        with patch.object(release, "source_digest", return_value=self.digest):
            release.publish(self.output, api, self.commit, self.run_id); api.wrong_tag = True
            with self.assertRaisesRegex(ValueError, "TAG_CONFLICT"):
                release.publish(self.output, api, self.commit, self.run_id)

    @unittest.skipUnless(os.name == "nt", "requires Windows PowerShell bundle consumer")
    def test_windows_consumes_complete_bundle_without_mutating_it(self):
        self.prepare(); extracted = self.base / "bundle"
        with zipfile.ZipFile(self.output / "precision-setup.zip") as archive:
            archive.extractall(extracted)
        before = {p.relative_to(extracted).as_posix(): release.sha(p.read_bytes()) for p in extracted.rglob("*") if p.is_file()}
        result = self.consume(extracted)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        after = {p.relative_to(extracted).as_posix(): release.sha(p.read_bytes()) for p in extracted.rglob("*") if p.is_file()}
        self.assertEqual(before, after)

    @unittest.skipUnless(os.name == "nt", "requires Windows PowerShell ZIP verification")
    def test_windows_verifies_zip_and_rejects_traversal_before_unpack(self):
        manifest = self.prepare()
        archive = self.output / 'precision-setup.zip'
        result, report = self.verify_zip(archive, 'valid')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(report['outcome'], 'SUCCEEDED')
        self.assertEqual(report['source_sha256'], self.digest)
        self.assertEqual(report['setup_sha256'], manifest['assets']['setup']['sha256'])
        malicious = self.base / 'invalid.zip'
        with zipfile.ZipFile(archive) as original, zipfile.ZipFile(malicious, 'w') as changed:
            for index, item in enumerate(original.infolist()):
                changed.writestr('../outside-fixture' if index == 0 else item.filename, original.read(item))
        result, report = self.verify_zip(malicious, 'invalid')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(report['reason_code'], 'PLATFORM_DISTRIBUTION_ZIP_LAYOUT_INVALID')
        self.assertFalse((self.base / 'invalid-unpack').exists())
        self.assertFalse((self.base / 'outside-fixture').exists())

    @unittest.skipUnless(os.name == "nt", "requires Windows PowerShell entry points")
    def test_windows_entry_defaults_are_relative_to_script_and_preserve_explicit_paths(self):
        root = self.base / 'entry points with spaces'; root.mkdir()
        bootstrap = root / 'operations/bootstrap'; bootstrap.mkdir(parents=True)
        (root / 'environments').mkdir()
        (root / 'environments/platform.json').write_text('{}', encoding='utf-8')
        (root / 'environments/windows.psd1').write_text('@{}', encoding='utf-8')
        for name in ['install.ps1', 'platform.ps1']:
            (root / name).write_bytes(validation.source_bytes(ROOT / name))
        # Replace only the provider module in this disposable fixture. No real host API.
        (bootstrap / 'windows.psm1').write_text('''
function Get-EntryFixture($Configuration,$WindowsProfile) {
    [pscustomobject]@{configuration=$Configuration;profile=$WindowsProfile;marker='isolated-entry-fixture'}
}
function Invoke-PlatformWindowsInstallation {
    param($Action,$Configuration,$WindowsProfile)
    $result=Get-EntryFixture $Configuration $WindowsProfile
    $result | Add-Member -NotePropertyName exit_code -NotePropertyValue 0
    return $result
}
function Invoke-PlatformInstalledQuery {
    param($Command,$Configuration,$WindowsProfile,$Arguments)
    [pscustomobject]@{ExitCode=0;Output=((Get-EntryFixture $Configuration $WindowsProfile) | ConvertTo-Json -Compress)}
}
''', encoding='utf-8')
        env = {k:v for k,v in os.environ.items() if k.upper() != 'PSMODULEPATH'}
        shell = str(Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe')
        for name in ['install.ps1', 'platform.ps1']:
            for extra, expected in [([], [str(root / 'environments/platform.json'), str(root / 'environments/windows.psd1')]),
                                    (['-Configuration', 'custom-config.json', '-WindowsProfile', 'custom-windows.psd1'],
                                     ['custom-config.json', 'custom-windows.psd1'])]:
                result = subprocess.run([shell, '-NoProfile', '-File', str(root / name), *extra], cwd=self.base,
                                        env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                record = json.loads(result.stdout)
                self.assertEqual(record['marker'], 'isolated-entry-fixture')
                actual = [record['configuration'], record['profile']]
                if extra:
                    self.assertEqual(actual, expected)  # Explicit paths are passed through unchanged.
                else:
                    # PowerShell expands Windows 8.3 names (RUNNER~1); compare file identity.
                    for observed, target in zip(actual, expected):
                        self.assertTrue(os.path.samefile(observed, target))

    def verify_zip(self, archive, name):
        report = self.base / (name + '-verification.json')
        env = {k:v for k,v in os.environ.items() if k.upper() != 'PSMODULEPATH'}
        env.update(GITHUB_SHA=self.commit, GITHUB_RUN_ID=self.run_id)
        result = subprocess.run([str(Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'),
                                 '-NoProfile', '-File', str(ROOT / 'operations/scripts/verify-precision-bundle.ps1'),
                                 '-Archive', str(archive), '-Destination', str(self.base / (name + '-unpack')),
                                 '-Report', str(report)], env=env, capture_output=True, text=True)
        return result, json.loads(report.read_text(encoding='utf-8-sig'))

    def consume(self, root):
        script = self.base / "consume.ps1"
        script.write_text("param([string]$Root)\n$ErrorActionPreference='Stop'\nImport-Module (Join-Path $Root 'operations/bootstrap/windows.psm1') -Force -DisableNameChecking\n& (Get-Module windows) {param($Path) $p=Read-PlatformCliPackage '' ''; if($p.Source -ne 'validated_precision_bundle'){throw 'fixture bundle not selected'}} $Root\n", encoding="utf-8")
        env = {k:v for k,v in os.environ.items() if k.upper() != "PSMODULEPATH"}
        return subprocess.run([str(Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"), "-NoProfile", "-File", str(script), str(root)], env=env, capture_output=True, text=True)

    @unittest.skipUnless(os.name == "nt", "requires Windows PowerShell bundle consumer")
    def test_windows_rejects_modified_bootstrap_and_rehashed_stale_report(self):
        self.prepare(); extracted = self.base / "bundle"
        with zipfile.ZipFile(self.output / "precision-setup.zip") as archive:
            archive.extractall(extracted)
        script = extracted / "operations/bootstrap/linux-host.sh"; original = script.read_bytes(); script.write_bytes(original + b"\n# fixture mutation\n")
        result = self.consume(extracted)
        self.assertNotEqual(result.returncode, 0); self.assertIn("BOOTSTRAP_MISMATCH", result.stderr)
        script.write_bytes(original)
        path = extracted / "packages/evidence/native-linux-amd64.json"
        report = json.loads(path.read_text()); report["commit"] = "c" * 40; path.write_bytes(release.encode(report))
        receipt_path = extracted / "packages/validation.json"; receipt = json.loads(receipt_path.read_text())
        receipt["evidence_sha256"][path.name] = release.sha(path.read_bytes()); receipt_path.write_bytes(release.encode(receipt))
        lock_path = extracted / "precision-lock.json"; lock = json.loads(lock_path.read_text())
        lock["assets"]["validation"].update(sha256=release.sha(receipt_path.read_bytes()), size=receipt_path.stat().st_size)
        lock_path.write_bytes(release.encode(lock))
        result = self.consume(extracted)
        self.assertNotEqual(result.returncode, 0); self.assertIn("REPORT_BINDING_INVALID", result.stderr)


if __name__ == "__main__":
    unittest.main()
