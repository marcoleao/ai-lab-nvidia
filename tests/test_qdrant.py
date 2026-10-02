import json
import os
import urllib.request
import uuid


def request(path, method="GET", payload=None):
    req = urllib.request.Request("http://qdrant:6333" + path, method=method,
                                 data=None if payload is None else json.dumps(payload).encode(),
                                 headers={"api-key": os.environ["QDRANT_API_KEY"], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def main():
    name = "lab_smoke_" + uuid.uuid4().hex
    request("/collections")
    request("/collections/" + name, "PUT", {"vectors": {"size": 4, "distance": "Cosine"}})
    try:
        request(f"/collections/{name}/points?wait=true", "PUT",
                {"points": [{"id": 1, "vector": [1.0, 0.0, 0.0, 0.0], "payload": {"test": True}}]})
        result = request(f"/collections/{name}/points/1")
        assert result["result"]["payload"]["test"]
    finally:
        request("/collections/" + name, "DELETE")
    print("[OK] Qdrant authenticated write/read/delete")


if __name__ == "__main__":
    main()
