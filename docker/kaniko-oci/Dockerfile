# kaniko-oci — Alpine-based image with Kaniko executor + OCI CLI + Node.js
#
# Multi-stage build:
#   Stage 1: pull only the Kaniko executor binary from the official image.
#   Stage 2: node:24-alpine runtime with OCI CLI, curl, and the Kaniko executor.
#
# The OCI CLI (Python) needs to compile the cryptography wheel on musl — build
# dependencies are installed then removed to keep the final layer lean.
#
# Usage in GitLab CI:
#   image:
#     name: ghcr.io/devopshouse/oci-oidc-auth-config/kaniko-oci:v3
#     entrypoint: [""]
#   script:
#     - source <(curl -sSfL "$OCI_AUTH_BASE_URL/scripts/setup-gitlab.sh")
#     - /kaniko/executor --context "$CI_PROJECT_DIR" --dockerfile "$CI_PROJECT_DIR/Dockerfile" --destination "$OCIR_URL/$IMAGE_NAME:$CI_COMMIT_SHA"

# ── Stage 1: Kaniko executor source ──────────────────────────────────────────
FROM gcr.io/kaniko-project/executor:v1.24.0 AS kaniko

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:24-alpine

# Build deps needed to compile the Python cryptography wheel on musl.
# They are installed in a virtual group and removed after pip install.
RUN apk add --no-cache \
      ca-certificates \
      curl \
      bash \
      python3 \
      py3-pip \
 && apk add --no-cache --virtual .build-deps \
      cargo \
      gcc \
      musl-dev \
      libffi-dev \
      openssl-dev \
      python3-dev \
      make \
 && pip install --no-cache-dir --break-system-packages oci-cli \
 && apk del .build-deps

# Copy only the Kaniko executor binary from Stage 1.
COPY --from=kaniko /kaniko/executor /kaniko/executor

# Kaniko expects its docker config at /kaniko/.docker/config.json.
# setup-gitlab.sh writes there when DOCKER_CONFIG=/kaniko/.docker.
ENV DOCKER_CONFIG=/kaniko/.docker \
    PATH="/kaniko:${PATH}"

# Kaniko executor is the default entry point for build jobs; override with
# entrypoint: [""] in GitLab CI to run arbitrary commands first (e.g. setup-gitlab.sh).
ENTRYPOINT ["/kaniko/executor"]
