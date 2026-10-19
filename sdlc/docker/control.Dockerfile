ARG PYTHON_IMAGE=python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258
FROM ${PYTHON_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY services/control/requirements-runtime.lock /tmp/requirements.lock
RUN python -m pip install --root-user-action=ignore --no-cache-dir --require-hashes -r /tmp/requirements.lock \
    && groupadd -g 10001 control && useradd -u 10001 -g control -M control
COPY services/control/ /app/
USER 10001:10001
CMD ["python", "-m", "uvicorn", "runtime:application", "--factory", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
