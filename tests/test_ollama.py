import json
import urllib.request


def request(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request("http://ollama:11434" + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as response:
        return json.load(response)


def main():
    models = request("/api/tags")["models"]
    assert models, "No installed models"
    model = models[0]["name"]
    result = request("/api/generate", {"model": model, "prompt": "Reply with a short greeting.",
                                      "stream": False, "options": {"num_predict": 32}, "keep_alive": "2m"})
    assert result["done"] and (result.get("response") or result.get("thinking"))
    running = request("/api/ps")["models"]
    assert any(m["name"] == model and m.get("size_vram", 0) > 0 for m in running), "Ollama inference did not use VRAM"
    print("[OK] Ollama generation and GPU residency: " + model)


if __name__ == "__main__":
    main()
