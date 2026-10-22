FROM node@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.14.0
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM toolchain AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/templates/package.json ./packages/templates/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS prepared
COPY . .
RUN pnpm build
ARG SOURCE_SHA256
LABEL org.sdlc.source=$SOURCE_SHA256
USER node
CMD ["node","apps/web/node_modules/next/dist/bin/next","start","apps/web","--hostname","0.0.0.0","--port","3000"]
