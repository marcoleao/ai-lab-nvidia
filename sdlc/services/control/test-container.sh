#!/usr/bin/env bash
set -Eeuo pipefail
# Run only in a disposable container, with /src mounted read-only.
python -m venv --system-site-packages /tmp/control-tests
/tmp/control-tests/bin/python -m pip install -q --disable-pip-version-check -r /src/requirements.txt
cd /src
PYTHONDONTWRITEBYTECODE=1 /tmp/control-tests/bin/python -m pytest -p no:cacheprovider -q
