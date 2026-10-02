import os
import urllib.request

request = urllib.request.Request(
    "http://127.0.0.1:8888/api/status",
    headers={"Authorization": "token " + os.environ["JUPYTER_TOKEN"]},
)
with urllib.request.urlopen(request, timeout=5) as response:
    assert response.status == 200
