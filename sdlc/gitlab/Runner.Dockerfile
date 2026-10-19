ARG RUNNER_BASE
FROM ${RUNNER_BASE}
USER root
RUN apk add --no-cache python3 bash git && mkdir -p /builds /release && chmod 1777 /builds /release
