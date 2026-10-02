ARG UV_IMAGE
ARG PYTORCH_IMAGE
FROM ${UV_IMAGE} AS uv
FROM ${PYTORCH_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=uv /uv /uvx /usr/local/bin/
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
WORKDIR /opt/lab
COPY python/pyproject.toml python/uv.lock ./
RUN uv venv --system-site-packages --python /opt/conda/bin/python \
    && uv sync --frozen --no-dev \
    && .venv/bin/python -c 'import torch; assert torch.__version__.split("+")[0] == "2.7.1"'
ENV PATH="/opt/lab/.venv/bin:$PATH"
COPY docker/dev/jupyter-launch.py docker/dev/jupyter-health.py /opt/lab/
COPY tests /opt/lab/tests
RUN groupadd -g 1000 lab && useradd -m -u 1000 -g lab lab \
    && mkdir -p /workspace /notebooks /cache/huggingface \
    && chown -R lab:lab /workspace /notebooks /cache
USER lab
WORKDIR /workspace
CMD ["sleep", "infinity"]
