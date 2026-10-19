#!/usr/bin/env bash
set -Eeuo pipefail
# Disposable Playwright image only; no installed browser or server on the host.
python -m pip install -q --disable-pip-version-check --root-user-action=ignore --target /tmp/portal-test -r /src/requirements.txt playwright==1.55.0
cd /src
PYTHONPATH=/tmp/portal-test PYTHONDONTWRITEBYTECODE=1 CONTROL_BROWSER_TEST=1 python -m pytest -p no:cacheprovider test_browser.py test_chat_webview.py -q
