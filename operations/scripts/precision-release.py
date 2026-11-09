"""Source-bound Precision setup bundle and resumable GitHub publication."""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

from validation import ROOT, source_bytes, source_digest

spec = importlib.util.spec_from_file_location("release_gate", Path(__file__).with_name("release-gate.py"))
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
BOOTSTRAP_FILES = (
    "install.ps1", "platform.ps1",
    "operations/audit/WindowsRecorder.psm1",
    *("operations/bootstrap/" + name for name in (
        "windows.psm1", "core.ps1", "distribution.ps1", "windows-gpu.ps1", "prerequisites.ps1",
        "core-release.sh", "installed-platform.sh", "linux-host.sh", "wsl-config.awk", "actions.psd1")),
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=True, sort_keys=True, indent=2) + "\n").encode()


def read_file(path, limit=128 << 20):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise ValueError("PLATFORM_DISTRIBUTION_FILE_INVALID")
    return path.read_bytes()


def prepare(packages, reports, output, commit, run_id, root=ROOT):
    if not re.fullmatch(r"[a-f0-9]{40}", commit) or not re.fullmatch(r"[0-9]+", run_id):
        raise ValueError("PLATFORM_DISTRIBUTION_CI_IDENTITY_REQUIRED")
    digest = source_digest(root)
    evidence = gate.require_reports(reports, digest, commit, run_id)
    receipt_data = read_file(packages / "validation.json", 1 << 20)
    receipt = json.loads(receipt_data)
    if (receipt.get("commit") != commit or receipt.get("ci_run_id") != run_id or receipt.get("source_sha256") != digest
            or receipt.get("evidence_sha256") != evidence or receipt.get("profile") != "precision-windows"
            or receipt.get("outcome") != "SUCCEEDED" or receipt.get("installation_ready") is not False):
        raise ValueError("PLATFORM_DISTRIBUTION_VALIDATION_MISMATCH")
    archive_name = "platform-linux-amd64.tar.gz"
    archive = read_file(packages / archive_name)
    checksum = read_file(packages / "platform-linux-amd64.sha256", 1024).decode("ascii")
    if not re.fullmatch(sha(archive) + r"[ \t]+\*?" + re.escape(archive_name) + r"\r?\n?", checksum):
        raise ValueError("PLATFORM_DISTRIBUTION_PACKAGE_HASH_MISMATCH")
    bootstrap = {name: source_bytes(root / name) for name in BOOTSTRAP_FILES}
    manifest = {
        "schema_version": 1, "product": "ai-platform", "profile": "precision-windows", "target": "linux-amd64",
        "release_tag": "precision-" + commit, "commit": commit, "ci_run_id": run_id, "source_sha256": digest,
        "qualification": "FOUNDATION_CORE_NOT_COMPLETE_PLATFORM_OR_HARDWARE", "installation_ready": False,
        "required_reports": sorted(evidence), "bootstrap_sha256": {name: sha(data) for name, data in bootstrap.items()},
        "assets": {"cli": {"name": archive_name, "sha256": sha(archive), "size": len(archive)},
                   "validation": {"name": "validation.json", "sha256": sha(receipt_data), "size": len(receipt_data)}},
    }
    output.mkdir(parents=True, exist_ok=True)
    setup = output / "precision-setup.zip"
    payload = dict(bootstrap)
    for name in ("environments/platform.json", "environments/windows.psd1"):
        payload[name] = source_bytes(root / name)
    payload.update({"packages/" + archive_name: archive, "packages/platform-linux-amd64.sha256": checksum.encode(),
                    "packages/validation.json": receipt_data, "precision-lock.json": encode(manifest)})
    for filename in evidence:
        payload["packages/evidence/" + filename] = read_file(reports / filename, 1 << 20)
    candidate = setup.with_suffix(".partial")
    try:
        with zipfile.ZipFile(candidate, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zip_file:
            for name, data in sorted(payload.items()):
                entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0)); entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                zip_file.writestr(entry, data)
        candidate.replace(setup)
    finally:
        candidate.unlink(missing_ok=True)
    manifest["assets"]["setup"] = {"name": setup.name, "sha256": sha(setup.read_bytes()), "size": setup.stat().st_size}
    for name, data in {archive_name: archive, "platform-linux-amd64.sha256": checksum.encode(), "validation.json": receipt_data,
                       "precision-release.json": encode(manifest)}.items():
        (output / name).write_bytes(data)
    return manifest


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("PLATFORM_DISTRIBUTION_API_REDIRECT_REJECTED")


class GitHub:
    def __init__(self, repository, token):
        self.repository, self.token = repository, token

    def request(self, method, path, value=None, data=None, upload=False):
        host = "https://uploads.github.com" if upload else "https://api.github.com"
        headers = {"Authorization": "Bearer " + self.token, "Accept": "application/vnd.github+json",
                   "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ai-platform-precision-release"}
        if value is not None:
            data = encode(value); headers["Content-Type"] = "application/json"
        elif data is not None:
            headers["Content-Type"] = "application/octet-stream"
        request = urllib.request.Request(host + "/repos/" + self.repository + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=90) as response:
                body = response.read((4 << 20) + 1)
                if len(body) > 4 << 20:
                    raise ValueError("PLATFORM_DISTRIBUTION_API_RESPONSE_TOO_LARGE")
                return json.loads(body) if body else None
        except urllib.error.HTTPError as exc:
            if exc.code == 404 and method == "GET":
                return None
            raise ValueError("PLATFORM_DISTRIBUTION_API_REJECTED") from None


def publish(directory, api, expected_commit, expected_run):
    manifest_data = read_file(directory / "precision-release.json", 1 << 20)
    manifest = json.loads(manifest_data)
    tag = manifest["release_tag"]
    if (tag != "precision-" + expected_commit or not re.fullmatch(r"precision-[a-f0-9]{40}", tag)
            or manifest["commit"] != expected_commit or manifest["ci_run_id"] != expected_run
            or manifest["profile"] != "precision-windows" or manifest["source_sha256"] != source_digest()
            or manifest["installation_ready"] is not False):
        raise ValueError("PLATFORM_DISTRIBUTION_SOURCE_MISMATCH")
    verification = json.loads(read_file(directory / "precision-setup-verification.json", 1 << 20))
    if (verification.get("outcome") != "SUCCEEDED" or verification.get("phase") != "COMPLETED"
            or verification.get("action") != "PLATFORM_PRECISION_SETUP_VERIFIED" or verification.get("commit") != expected_commit
            or verification.get("ci_run_id") != expected_run or verification.get("source_sha256") != manifest["source_sha256"]
            or verification.get("setup_sha256") != manifest["assets"]["setup"]["sha256"]
            or verification.get("installation_ready") is not False):
        raise ValueError("PLATFORM_DISTRIBUTION_WINDOWS_VERIFICATION_REQUIRED")
    assets = {value["name"]: (value["sha256"], value["size"]) for value in manifest["assets"].values()}
    assets["precision-release.json"] = (sha(manifest_data), len(manifest_data))
    checksum = read_file(directory / "platform-linux-amd64.sha256", 1024)
    assets["platform-linux-amd64.sha256"] = (sha(checksum), len(checksum))
    if set(assets) != {"platform-linux-amd64.tar.gz", "platform-linux-amd64.sha256", "validation.json", "precision-setup.zip", "precision-release.json"}:
        raise ValueError("PLATFORM_DISTRIBUTION_ASSET_SET_INVALID")
    for name, (digest, size) in assets.items():
        data = read_file(directory / name)
        if len(data) != size or sha(data) != digest:
            raise ValueError("PLATFORM_DISTRIBUTION_ASSET_HASH_MISMATCH")
    release = api.request("GET", "/releases/tags/" + tag)
    was_absent = release is None
    changed = was_absent
    if release is None:
        release = api.request("POST", "/releases", {
            "tag_name": tag, "target_commitish": expected_commit, "name": "Precision foundation " + expected_commit[:12],
            "body": "Foundation core validated in CI. Hardware, complete platform, SSO and internet remain pending.\n"
                    + "Source: " + expected_commit + "\nSource SHA-256: " + manifest["source_sha256"],
            "draft": True, "prerelease": False, "make_latest": "false"})
    if release.get("tag_name") != tag or release.get("target_commitish") != expected_commit:
        raise ValueError("PLATFORM_DISTRIBUTION_RELEASE_CONFLICT")
    ref = api.request("GET", "/git/ref/tags/" + tag)
    if ref is not None and (ref.get("object", {}).get("sha") != expected_commit or ref.get("object", {}).get("type") != "commit"):
        raise ValueError("PLATFORM_DISTRIBUTION_TAG_CONFLICT")
    release_id = release["id"]
    listed = api.request("GET", f"/releases/{release_id}/assets?per_page=100")
    if not isinstance(listed, list) or len(listed) >= 100 or len({item["name"] for item in listed}) != len(listed):
        raise ValueError("PLATFORM_DISTRIBUTION_ASSET_LIST_INVALID")
    existing = {item["name"]: item for item in listed}
    before = "ABSENT" if was_absent else sha(encode({"draft": release["draft"], "assets": {name: item.get("digest") for name, item in existing.items()}}))
    if set(existing) - set(assets):
        raise ValueError("PLATFORM_DISTRIBUTION_UNEXPECTED_ASSET")
    for name, (digest, size) in assets.items():
        asset = existing.get(name)
        if asset is None:
            if not release["draft"]:
                raise ValueError("PLATFORM_DISTRIBUTION_PUBLISHED_RELEASE_INCOMPLETE")
            asset = api.request("POST", f"/releases/{release_id}/assets?name=" + urllib.parse.quote(name, safe=""),
                                data=read_file(directory / name), upload=True)
            changed = True
        if asset.get("state") != "uploaded" or asset.get("digest") != "sha256:" + digest or asset.get("size") != size:
            raise ValueError("PLATFORM_DISTRIBUTION_UPLOAD_UNCONFIRMED")
    if release["draft"]:
        release = api.request("PATCH", f"/releases/{release_id}", {"draft": False, "make_latest": "true"})
        changed = True
    ref = api.request("GET", "/git/ref/tags/" + tag)
    if (release.get("draft") is not False or ref is None or ref.get("object", {}).get("sha") != expected_commit
            or ref.get("object", {}).get("type") != "commit"):
        raise ValueError("PLATFORM_DISTRIBUTION_PUBLICATION_UNCONFIRMED")
    after = sha(encode({"draft": False, "assets": {name: "sha256:" + digest for name, (digest, _) in assets.items()}}))
    return {"release_id": release_id, "tag": tag, "assets_sha256": {name: digest for name, (digest, _) in assets.items()}, "before": before, "after": after, "changed": changed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "publish")); parser.add_argument("--packages", type=Path)
    parser.add_argument("--reports", type=Path); parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    commit, run_id = os.environ.get("GITHUB_SHA", ""), os.environ.get("GITHUB_RUN_ID", "")
    if args.mode == "prepare":
        report = {"schema_version": 1, "action": "PLATFORM_PRECISION_BUNDLE_PREPARED", "operation_id": uuid.uuid4().hex,
                  "commit": commit, "ci_run_id": run_id, "source_sha256": source_digest(),
                  "actor": "CI_PROCESS" if os.environ.get("GITHUB_ACTIONS") == "true" else "LOCAL_PROCESS",
                  "decision": "NOT_APPLICABLE", "outcome": "ACCEPTED", "phase": "REQUESTED",
                  "comparison": {"before": "NOT_APPLICABLE_DISPOSABLE_OUTPUT", "after": "NOT_OBSERVED"},
                  "rollback": "DISCARD_OWNED_CANDIDATE_OUTPUTS", "at": dt.datetime.now(dt.timezone.utc).isoformat()}
        print(json.dumps(report), flush=True)
        try:
            manifest = prepare(args.packages, args.reports, args.output, commit, run_id)
            report.update(outcome="SUCCEEDED", phase="COMPLETED")
            report["comparison"]["after"] = {item["name"]: item["sha256"] for item in manifest["assets"].values()}
        except (OSError, ValueError, KeyError):
            report.update(outcome="FAILED", phase="COMPLETED", reason_code="PLATFORM_DISTRIBUTION_PREPARATION_FAILED")
        if args.output.is_dir():
            (args.output / "preparation.json").write_bytes(encode(report))
        print(json.dumps(report), flush=True)
        if report["outcome"] != "SUCCEEDED":
            return 1
        return 0
    policy = json.loads((ROOT / "operations/release-policy.json").read_text(encoding="utf-8"))
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_REPOSITORY") != policy["repository"] or not os.environ.get("GH_TOKEN"):
        raise ValueError("PLATFORM_DISTRIBUTION_PUBLICATION_REQUIRES_CI")
    report = {"schema_version": 1, "action": "PLATFORM_PRECISION_RELEASE_PUBLISHED", "operation_id": uuid.uuid4().hex,
              "commit": commit, "ci_run_id": run_id, "source_sha256": source_digest(), "actor": "GITHUB_ACTIONS_TOKEN",
              "decision": "NOT_APPLICABLE", "comparison": "RELEASE_ASSET_DIGESTS", "rollback": "PRESERVE_ASSETS_RECONCILE_DRAFT",
              "outcome": "ACCEPTED", "phase": "REQUESTED", "at": dt.datetime.now(dt.timezone.utc).isoformat()}
    print(json.dumps(report), flush=True)
    try:
        result = publish(args.output, GitHub(policy["repository"], os.environ["GH_TOKEN"]), commit, run_id)
        changed = result.pop("changed")
        report.update(result, outcome="SUCCEEDED" if changed else "NO_CHANGE", phase="COMPLETED")
    except (OSError, ValueError, KeyError):
        report.update(outcome="UNKNOWN", phase="OBSERVED", reason_code="PLATFORM_DISTRIBUTION_PUBLICATION_UNCONFIRMED")
    (args.output / "publication.json").write_bytes(encode(report))
    print(json.dumps(report), flush=True)
    return 0 if report["phase"] == "COMPLETED" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError):
        raise SystemExit("PLATFORM_DISTRIBUTION_PREPARATION_FAILED")
