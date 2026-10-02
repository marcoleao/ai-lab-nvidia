"""Keep authentication out of process arguments and logs."""
import os
from pathlib import Path

token = os.environ["JUPYTER_TOKEN"]
assert len(token) >= 32
config = Path.home() / ".jupyter" / "jupyter_server_config.py"
config.parent.mkdir(mode=0o700, exist_ok=True)
config.write_text(
    "c.IdentityProvider.token = " + repr(token) + "\n"
    "c.ServerApp.ip = '0.0.0.0'\n"
    "c.ServerApp.port = 8888\n"
    "c.ServerApp.root_dir = '/notebooks'\n"
    "c.ServerApp.open_browser = False\n"
    "c.ServerApp.log_level = 'ERROR'\n"
)
config.chmod(0o600)
os.execvp("jupyter", ["jupyter", "lab"])
