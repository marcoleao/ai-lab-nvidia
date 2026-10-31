ARG NODE_IMAGE=node:24.22.0-bookworm-slim
FROM ${NODE_IMAGE}
USER root
WORKDIR /opt/qwen-code
COPY package.json package-lock.json ./
# The bundled headless CLI needs no installation scripts, audio, clipboard,
# alternate runtimes or PTY. The Linux esbuild binary is pinned explicitly.
RUN npm ci --ignore-scripts --omit=optional --no-audit --no-fund \
    && npm cache clean --force \
    && node node_modules/@qwen-code/qwen-code/cli-entry.js --version \
    && node --input-type=module -e "import('esbuild').then(e=>e.transformSync('const n = 1'))"
COPY workspace.mjs runner.mjs ui-probes.mjs patch.mjs ./
ENV NODE_ENV=production \
    QWEN_CODE_SAFE_MODE=true \
    QWEN_CODE_UNATTENDED_RETRY=0 \
    OTEL_SDK_DISABLED=true \
    DO_NOT_TRACK=1 \
    NO_COLOR=1
RUN mkdir -p /workspace /session && chown node:node /workspace /session
LABEL org.sdlc.coding-toolchain=qwen-code-node24-v1 \
      org.sdlc.qwen-code-version=0.26.4
USER node
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/qwen-code/node_modules/@qwen-code/qwen-code/cli-entry.js"]
CMD ["--version"]
