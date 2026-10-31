import json
import os
import urllib.request
import urllib.parse
import ipaddress


def request(path, payload=None):
    base=os.environ.get('OLLAMA_SMOKE_URL','http://ollama:11434')
    parsed=urllib.parse.urlsplit(base)
    if parsed.scheme!='http' or parsed.username or parsed.password or parsed.path not in ['','/'] or parsed.query or parsed.fragment or parsed.port!=11434:
        raise ValueError('Expected the internal Ollama endpoint')
    if parsed.hostname!='ollama' and not ipaddress.ip_address(parsed.hostname).is_private:
        raise ValueError('Expected the private LAB address')
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(base.rstrip('/') + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=600) as response:
        return json.load(response)


def main():
    models = request("/api/tags")["models"]
    assert models, "No installed models"
    model = os.environ.get("SMOKE_MODEL") or models[0]["name"]
    assert any(m["name"] == model for m in models), "Declared smoke model missing: " + model
    result = request("/api/generate", {"model": model, "prompt": "Reply with a short greeting.",
                                      "stream": False, "think": False, "options": {"num_ctx": 4096, "num_predict": 32}, "keep_alive": "2m"})
    assert result["done"] and (result.get("response") or result.get("thinking"))
    running = request("/api/ps")["models"]
    assert any(m["name"] == model and m.get("size_vram", 0) > 0 for m in running), "Ollama inference did not use VRAM"
    print("[OK] Ollama generation and GPU residency: " + model)


if __name__ == "__main__":
    main()
