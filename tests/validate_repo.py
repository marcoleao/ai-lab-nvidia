"""Static gates and API contract tests; no GPU needed."""
import ast
import importlib.util
import json
from pathlib import Path
import tomllib
import unittest
from unittest.mock import patch
import yaml

ROOT = Path(__file__).resolve().parents[1]


def load_test(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tests" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Contracts(unittest.TestCase):
    def test_ollama_rejects_cpu_fallback(self):
        module = load_test("test_ollama")
        responses = [{"models": [{"name": "test:1"}]}, {"done": True, "response": "hello"},
                     {"models": [{"name": "test:1", "size_vram": 0}]}]
        with patch.object(module, "request", side_effect=responses):
            with self.assertRaisesRegex(AssertionError, "VRAM"):
                module.main()

    def test_ollama_gpu_response(self):
        module = load_test("test_ollama")
        responses = [{"models": [{"name": "test:1"}]}, {"done": True, "response": "hello"},
                     {"models": [{"name": "test:1", "size_vram": 1000}]}]
        with patch.object(module, "request", side_effect=responses):
            module.main()

    def test_qdrant_cleans_up_after_failed_assertion(self):
        module = load_test("test_qdrant")
        with patch.object(module, "request", side_effect=[{}, {}, {}, {"result": {"payload": {"test": False}}}, {}]) as request:
            with self.assertRaises(AssertionError):
                module.main()
            self.assertEqual(request.call_args.args[1], "DELETE")

    def test_local_binding_and_gpu(self):
        compose = yaml.safe_load((ROOT / "compose.yaml").read_text())
        services = compose["services"]
        self.assertNotIn("ports", services["ollama"])
        for service in ("open-webui", "qdrant", "jupyter"):
            self.assertTrue(all("127.0.0.1" in port for port in services[service]["ports"]))
        for service in ("ollama", "ai-dev", "jupyter"):
            self.assertEqual(services[service]["deploy"]["resources"]["reservations"]["devices"][0]["capabilities"], ["gpu"])

    def test_lock_closure_and_direct_pins(self):
        project = tomllib.loads((ROOT / "python/pyproject.toml").read_text())
        lock = tomllib.loads((ROOT / "python/uv.lock").read_text())
        packages = {p["name"]: p for p in lock["package"]}
        for dependency in project["project"]["dependencies"]:
            name, version = dependency.split("==")
            self.assertEqual(packages[name]["version"], version)
        for package in packages.values():
            for dependency in package.get("dependencies", []):
                self.assertIn(dependency["name"], packages)
            for wheel in package.get("wheels", []):
                self.assertRegex(wheel["hash"], r"^sha256:[a-f0-9]{64}$")


if __name__ == "__main__":
    for path in list(ROOT.glob("tests/*.py")) + list(ROOT.glob("docker/**/*.py")):
        ast.parse(path.read_text(), filename=str(path))
    for path in ROOT.glob("config/*.yaml"):
        yaml.safe_load(path.read_text())
    print("[OK] Python, YAML and TOML syntax")
    unittest.main()
