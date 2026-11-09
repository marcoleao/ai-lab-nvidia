"""No apt import, package changes or network: isolated fake cache contracts."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

source = Path(__file__).resolve().parents[1] / "operations/internal/provision/security-update.py"
spec = importlib.util.spec_from_file_location("security_preparation", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Package:
    def __init__(self, name, archive="noble-security", origin="Ubuntu", trusted=True):
        self.name=name; self.is_installed=True; self.is_upgradable=True
        self.installed=SimpleNamespace(version="1")
        self.candidate=SimpleNamespace(version="2",origins=[SimpleNamespace(origin=origin,archive=archive,trusted=trusted)])
        self.marked_delete=False; self.marked_upgrade=False
    def mark_upgrade(self): self.marked_upgrade=True

class Cache:
    def __init__(self, packages): self.packages=packages; self.commits=0; self.confirm=True
    def __iter__(self): return iter(self.packages)
    def __getitem__(self, name): return next(p for p in self.packages if p.name==name)
    def get_changes(self): return [p for p in self.packages if p.marked_upgrade or p.marked_delete]
    def commit(self, allow_unauthenticated):
        assert allow_unauthenticated is False
        self.commits+=1
        if self.confirm:
            for package in self.get_changes(): package.installed.version=package.candidate.version
    def open(self, _): pass

class SecurityContracts(unittest.TestCase):
    def test_security_userspace_only(self):
        packages=[Package("openssl"),Package("linux-image-generic"),Package("nvidia-driver-595"),Package("libnvidia-container1"),Package("curl",archive="noble-updates"),Package("vendor",origin="NVIDIA")]
        cache=Cache(packages);result=module.apply_security(cache)
        self.assertEqual(result["count"],1);self.assertEqual(cache.commits,1)
        self.assertEqual([p.name for p in packages if p.installed.version=="2"],["openssl"])
    def test_untrusted_origin_not_selected(self):
        cache=Cache([Package("openssl",trusted=False)])
        self.assertEqual(module.apply_security(cache)["count"],0);self.assertEqual(cache.commits,0)
    def test_vendor_dependency_refused(self):
        package=Package("vendor-lib",origin="NVIDIA");package.marked_upgrade=True
        cache=Cache([package])
        with self.assertRaisesRegex(RuntimeError,"ORIGIN_REJECTED"): module.apply_security(cache)
        self.assertEqual(cache.commits,0)
    def test_kernel_dependency_refused(self):
        package=Package("linux-modules-6.14");package.marked_upgrade=True
        cache=Cache([package])
        with self.assertRaisesRegex(RuntimeError,"PROTECTED_PACKAGE"): module.apply_security(cache)
        self.assertEqual(cache.commits,0)
    def test_removal_refused(self):
        package=Package("existing");package.marked_delete=True
        with self.assertRaisesRegex(RuntimeError,"PROTECTED_PACKAGE"): module.apply_security(Cache([package]))
    def test_unconfirmed_commit_is_not_success(self):
        cache=Cache([Package("openssl")]);cache.confirm=False
        with self.assertRaisesRegex(RuntimeError,"EFFECT_UNCONFIRMED"): module.apply_security(cache)

if __name__ == "__main__": unittest.main()
