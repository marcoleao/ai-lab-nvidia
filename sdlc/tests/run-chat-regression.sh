#!/usr/bin/env bash
set -Eeuo pipefail
python -m pip install -q --disable-pip-version-check --root-user-action=ignore --target /tmp/chat-test -r /src/requirements.txt playwright==1.55.0
cd /src
PYTHONPATH=/tmp/chat-test PYTHONDONTWRITEBYTECODE=1 CONTROL_BROWSER_TEST=1 python -m pytest -p no:cacheprovider -q
