"""Require Precision's source-bound native, Windows and Docker reports."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

from validation import ROOT, source_digest

EXPECTED = {
    "native-linux-amd64.json": ("unit", "linux-amd64", "NATIVE_UNIT_PASSED", {"native-go-tests", "native-installed-release", "validation-contracts", "distribution-contracts"}),
    "windows-bootstrap.json": ("windows", "windows-amd64", "WINDOWS_BOOTSTRAP_PASSED", {"platform-installer.tests.ps1", "platform-windows-gpu.tests.ps1", "validation-contracts", "distribution-contracts"}),
    "docker-linux-amd64.json": ("integration", "linux-amd64", "DISPOSABLE_DOCKER_PASSED", {"TestNetworkWithRealDocker", "TestAccessWithRealDocker", "TestGitlabWithRealDocker"}),
}


def require_reports(directory, digest, commit, run_id):
    if not commit or commit == "NOT_OBSERVED" or not run_id or run_id == "NOT_OBSERVED":
        raise ValueError("PLATFORM_RELEASE_CI_IDENTITY_REQUIRED")
    if {p.name for p in directory.glob("*.json")} != set(EXPECTED):
        raise ValueError("PLATFORM_RELEASE_REPORT_SET_INCOMPLETE")
    evidence = {}
    for filename, (mode, target, qualification, required) in EXPECTED.items():
        path = directory / filename
        if path.is_symlink() or path.stat().st_size > 1 << 20:
            raise ValueError("PLATFORM_RELEASE_REPORT_INVALID")
        data = path.read_bytes()
        report = json.loads(data)
        if (not isinstance(report, dict) or not isinstance(report.get("comparison"),dict) or report.get("schema_version") != 1 or report.get("mode") != mode or report.get("target") != target
                or report.get("qualification") != qualification or report.get("outcome") != "SUCCEEDED"
                or report.get("phase") != "COMPLETED" or type(report.get("exit_code")) is not int or report["exit_code"] != 0
                or report.get("source_sha256") != digest or report.get("commit") != commit or report.get("ci_run_id") != run_id
                or report.get("comparison", {}).get("before") != digest or report.get("comparison", {}).get("after") != digest):
            raise ValueError("PLATFORM_RELEASE_REPORT_BINDING_INVALID")
        checks = report.get("checks", [])
        if not isinstance(checks,list) or any(not isinstance(c,dict) for c in checks):
            raise ValueError("PLATFORM_RELEASE_CHECKS_INVALID")
        names = [c.get("check") for c in checks]
        if any(not isinstance(name,str) for name in names) or len(names) != len(set(names)) or not required.issubset(names) or any(c.get("outcome") != "SUCCEEDED" or type(c.get("exit_code")) is not int or c["exit_code"] != 0 for c in checks):
            raise ValueError("PLATFORM_RELEASE_CHECKS_INCOMPLETE")
        for check in checks:
            if check["check"] in {"native-go-tests", "TestNetworkWithRealDocker", "TestAccessWithRealDocker", "TestGitlabWithRealDocker"} and (type(check.get("tests_passed")) is not int or check["tests_passed"] < 1):
                raise ValueError("PLATFORM_RELEASE_TEST_EXECUTION_UNCONFIRMED")
        evidence[filename] = hashlib.sha256(data).hexdigest()
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reports", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    digest = source_digest()
    policy = json.loads((ROOT / "operations/release-policy.json").read_text(encoding="utf-8"))
    if policy["active_profile"] != "precision-windows" or set(policy["required_reports"]) != set(EXPECTED):
        print("PLATFORM_RELEASE_POLICY_INVALID", file=sys.stderr)
        return 1
    commit, run_id = os.environ.get("GITHUB_SHA"), os.environ.get("GITHUB_RUN_ID")
    try:
        evidence = require_reports(args.reports, digest, commit, run_id)
    except (ValueError, OSError, KeyError, TypeError):
        print("PLATFORM_RELEASE_VALIDATION_REQUIRED", file=sys.stderr)
        return 1
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps({"schema_version": 1, "action": "PLATFORM_VALIDATED_PACKAGES_PUBLISHED", "outcome": "SUCCEEDED", "phase": "COMPLETED", "decision": "NOT_APPLICABLE", "commit": commit, "ci_run_id": run_id, "source_sha256": digest, "evidence_sha256": evidence, "scope": "PRECISION_NATIVE_WINDOWS_BOOTSTRAP_DOCKER_NOT_HARDWARE", "profile": "precision-windows", "backlog_profiles": policy["backlog_profiles"], "installation_ready": False}, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
