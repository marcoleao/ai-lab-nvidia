"""Build a deterministic native CLI candidate; no compiler or host effects."""
import argparse
import gzip
import hashlib
import io
from pathlib import Path
import tarfile

from validation import ROOT, source_bytes


def package(target, binary, output, root=ROOT):
    if target not in {"linux-amd64", "linux-arm64", "darwin-arm64"} or binary.is_symlink() or not binary.is_file():
        raise ValueError("PLATFORM_PACKAGE_INPUT_INVALID")
    files = {"platform": binary.read_bytes()}
    for name in ("platform.sh", "install.sh", "operations/catalog.json", "operations/command-catalog.json", "operations/go.mod", "environments/platform.json"):
        files[name] = source_bytes(root / name)
    files["operations/README.md"] = source_bytes(root / "operations/package-README.md")
    for profile in ("precision-windows", "macos-m3-max", "dell-gb10"):
        name = f"environments/profiles/{profile}.json"
        files[name] = source_bytes(root / name)
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"platform-{target}.tar.gz"
    temporary = archive.with_suffix(".partial")
    try:
        with temporary.open("wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed, tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as tar:
            for name in (".", "./environments", "./environments/profiles", "./operations"):
                header = tarfile.TarInfo(name); header.type = tarfile.DIRTYPE; header.mode = 0o755
                tar.addfile(header)
            for name, data in sorted(files.items()):
                header = tarfile.TarInfo("./" + name); header.size = len(data)
                header.mode = 0o755 if name in {"platform", "platform.sh", "install.sh"} else 0o644
                tar.addfile(header, io.BytesIO(data))
        temporary.replace(archive)
    finally:
        temporary.unlink(missing_ok=True)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_name(f"platform-{target}.sha256").write_text(f"{digest}  {archive.name}\n", encoding="utf-8", newline="\n")
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target"); parser.add_argument("binary", type=Path); parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(package(args.target, args.binary, args.output))
