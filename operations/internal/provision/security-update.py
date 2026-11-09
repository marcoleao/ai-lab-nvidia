"""Explicit Ubuntu userspace security preparation; no schedules or kernel/driver updates."""
import hashlib
import json
import re
import sys
import os
import tempfile

PROTECTED = re.compile(r"^(?:linux-|nvidia|libnvidia|cuda|libcuda|firmware-|system76|dgx)")

def apply_security(cache):
    before = sorted((p.name, p.installed.version) for p in cache if p.is_installed)
    selected = []
    for package in cache:
        if not package.is_upgradable or PROTECTED.match(package.name):
            continue
        if any(o.origin == "Ubuntu" and o.archive == "noble-security" and o.trusted for o in package.candidate.origins):
            package.mark_upgrade()
            selected.append(package.name)
    for package in cache.get_changes():
        if package.marked_delete or PROTECTED.match(package.name):
            raise RuntimeError("PLATFORM_SECURITY_PROTECTED_PACKAGE")
        if not any(o.origin == "Ubuntu" and o.trusted for o in package.candidate.origins):
            raise RuntimeError("PLATFORM_SECURITY_ORIGIN_REJECTED")
    expected = {p.name: p.candidate.version for p in cache.get_changes()}
    if expected:
        cache.commit(allow_unauthenticated=False)
        cache.open(None)
    for name, version in expected.items():
        if not cache[name].is_installed or cache[name].installed.version != version:
            raise RuntimeError("PLATFORM_SECURITY_EFFECT_UNCONFIRMED")
    after = sorted((p.name, p.installed.version) for p in cache if p.is_installed)
    def fingerprint(rows):
        return hashlib.sha256(json.dumps(rows, separators=(",", ":")).encode()).hexdigest()
    return {"before": fingerprint(before), "after": fingerprint(after), "count": len(selected)}

if __name__ == "__main__":
    import apt
    result = apply_security(apt.Cache())
    if len(sys.argv) == 2:
        descriptor, temporary = tempfile.mkstemp(prefix=".security-", dir=os.path.dirname(sys.argv[1]))
        try:
            with os.fdopen(descriptor, "w") as stream:
                json.dump(result, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, sys.argv[1])
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    else:
        print(json.dumps(result))
