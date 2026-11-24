# kaniko-oci — Alpine-based image with Kaniko executor + OCI CLI + Node.js
#
# Multi-stage build:
#   Stage 1: pull only the Kaniko executor binary from the official image.
#   Stage 2: node:24-alpine runtime with OCI CLI, curl, and the Kaniko executor.
#
# The OCI CLI is installed with uv from prebuilt wheels, so no compiler is needed.
#
# Usage in GitLab CI:
#   image:
#     name: ghcr.io/devopshouse/kaniko-oci:latest
#     entrypoint: [""]
#   script:
#     - source <(curl -sSfL "$OCI_AUTH_BASE_URL/scripts/setup-gitlab.sh")
#     - /kaniko/executor --context "$CI_PROJECT_DIR" --dockerfile "$CI_PROJECT_DIR/Dockerfile" --destination "$OCIR_URL/$IMAGE_NAME:$CI_COMMIT_SHA"

# ── Stage 1: Kaniko executor source ──────────────────────────────────────────
FROM gcr.io/kaniko-project/executor:v1.24.0 AS kaniko

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:24-alpine

COPY --from=ghcr.io/astral-sh/uv:0.13.9 /uv /usr/local/bin/uv

# uv installs the OCI CLI in its own virtualenv and links the oci executable into /usr/local/bin.
ENV UV_TOOL_DIR=/opt/uv/tools \
    UV_TOOL_BIN_DIR=/usr/local/bin \
    UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy

RUN apk add --no-cache \
      ca-certificates \
      curl \
      bash \
      python3 \
 && uv tool install oci-cli

# Copy only the Kaniko executor binary from Stage 1.
COPY --from=kaniko /kaniko/executor /kaniko/executor

# Kaniko expects its docker config at /kaniko/.docker/config.json.
# setup-gitlab.sh writes there when DOCKER_CONFIG=/kaniko/.docker.
ENV DOCKER_CONFIG=/kaniko/.docker \
    PATH="/kaniko:${PATH}"

# Kaniko executor is the default entry point for build jobs; override with
# entrypoint: [""] in GitLab CI to run arbitrary commands first (e.g. setup-gitlab.sh).
ENTRYPOINT ["/kaniko/executor"]
