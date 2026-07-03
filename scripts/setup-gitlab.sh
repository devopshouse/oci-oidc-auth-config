#!/usr/bin/env bash
# All-in-one GitLab CI setup — pipe-friendly AND source-safe.
#
#   # Option A — single step (recommended): propagates OCI_* / OCIR_* vars to the job
#   source <(curl -sSfL https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/${OCI_OIDC_AUTH_VERSION:-v2}/scripts/setup-gitlab.sh)
#
#   # Option B — pipe form (simpler, but vars are NOT propagated; source the env file manually if needed)
#   curl -sSfL https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/${OCI_OIDC_AUTH_VERSION:-v2}/scripts/setup-gitlab.sh | bash
#
# Required env vars: OCI_OIDC_TOKEN (from id_tokens) or CI_JOB_JWT_FILE, plus either
#   OCI_OIDC_CONFIG_B64  (base64-encoded unified JSON with all OCI + OCIR fields)
#   OCI_OIDC_CONFIG      (plain unified JSON with all OCI + OCIR fields)
#   or individual: OCI_IDCS_ENDPOINT/OCI_CLIENT_ID/OCI_CLIENT_SECRET/OCI_REGION/OCI_TENANCY_ID/OCI_COMPARTMENT_ID
# OCIR fields (ocir_username, ocir_password, ocir_url) are part of the unified JSON blob.
# When present, container auth is written to $DOCKER_CONFIG/config.json
#   (docker/podman/kaniko compatible). Set OCIR_LOGIN=false to skip this step.
# Set DOCKER_CONFIG to customise the auth file directory (default: ~/.docker).
#   Kaniko example: DOCKER_CONFIG=/kaniko/.docker source <(curl -sSfL ...)
# Multi-job GitLab pipelines can rely on the standard bundle directory:
#   $OCI_AUTH_BUNDLE_DIR/{env.sh,bin/,docker/,home/.oci/}
# The env file receives all exported vars including DOCKER_CONFIG and
#   REGISTRY_AUTH_FILE when container auth is written.

shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

_OCI_OIDC_AUTH_VERSION="${OCI_OIDC_AUTH_VERSION:-main}"
_OCI_AUTH_BASE="${OCI_AUTH_BASE_URL:-https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/${_OCI_OIDC_AUTH_VERSION}}"
_OCI_AUTH_BUNDLE_DIR="${OCI_AUTH_BUNDLE_DIR:-${CI_PROJECT_DIR:+$CI_PROJECT_DIR/oci-auth-bundle}}"
_OCI_AUTH_HOME_DEFAULT="${_OCI_AUTH_BUNDLE_DIR:+$_OCI_AUTH_BUNDLE_DIR/home}"
_OCI_AUTH_DOCKER_DEFAULT="${_OCI_AUTH_BUNDLE_DIR:+$_OCI_AUTH_BUNDLE_DIR/docker}"
_OCI_AUTH_BIN_DEFAULT="${_OCI_AUTH_HOME_DEFAULT:+$_OCI_AUTH_HOME_DEFAULT/.local/bin}"
_OCI_AUTH_EXPORT_BIN_DIR="${_OCI_AUTH_BUNDLE_DIR:+$_OCI_AUTH_BUNDLE_DIR/bin}"
_OCI_AUTH_ENV_DEFAULT="${_OCI_AUTH_BUNDLE_DIR:+$_OCI_AUTH_BUNDLE_DIR/env.sh}"

_OCI_AUTH_HOME="${OCI_AUTH_HOME:-${_OCI_AUTH_HOME_DEFAULT:-$HOME}}"
_OCI_AUTH_DOCKER_CONFIG="${DOCKER_CONFIG:-${_OCI_AUTH_DOCKER_DEFAULT:-}}"
_OCI_AUTH_ENV_FILE="${OCI_AUTH_ENV_FILE:-${_OCI_AUTH_ENV_DEFAULT:-$HOME/.oci-auth.env}}"
_OCI_AUTH_BIN_DIR="${UV_TOOL_BIN_DIR:-${_OCI_AUTH_BIN_DEFAULT:-/usr/local/bin}}"

# Run the heavy lifting in a subshell so that set -euo pipefail and traps do not
# leak into the caller's shell when this script is sourced with source <(...).
(
  set -euo pipefail

  echo "OCI auth version: ${_OCI_AUTH_BASE##*/}"

  export HOME="$_OCI_AUTH_HOME"
  export OCI_AUTH_ENV_FILE="$_OCI_AUTH_ENV_FILE"
  export UV_TOOL_BIN_DIR="$_OCI_AUTH_BIN_DIR"
  if [ -n "$_OCI_AUTH_DOCKER_CONFIG" ]; then
    export DOCKER_CONFIG="$_OCI_AUTH_DOCKER_CONFIG"
  fi

  mkdir -p "$(dirname "$OCI_AUTH_ENV_FILE")"
  : > "$OCI_AUTH_ENV_FILE"
  if [ -n "$_OCI_AUTH_BUNDLE_DIR" ]; then
    mkdir -p "$_OCI_AUTH_BUNDLE_DIR" "$HOME" "$UV_TOOL_BIN_DIR" "$_OCI_AUTH_EXPORT_BIN_DIR"
    if [ -n "${DOCKER_CONFIG:-}" ]; then
      mkdir -p "$DOCKER_CONFIG"
    fi
  fi

  command -v apt-get > /dev/null && DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl openssl > /dev/null 2>&1

  if ! command -v node > /dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' 2>/dev/null; then
    if command -v apt-get > /dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_24.x | bash - > /dev/null 2>&1
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs > /dev/null 2>&1
    else
      echo "error: Node.js 24+ is required and could not be installed automatically." >&2
      exit 1
    fi
  fi

  tmp_dir="$(mktemp -d)"
  cleanup() { rm -rf "$tmp_dir"; }
  trap cleanup EXIT

  if [ -n "${OCI_OIDC_TOKEN:-}" ] && [ -z "${CI_JOB_JWT_FILE:-}" ]; then
    printf '%s' "$OCI_OIDC_TOKEN" > "$tmp_dir/oci.jwt"
    export CI_JOB_JWT_FILE="$tmp_dir/oci.jwt"
  fi

  curl -sSfL "$_OCI_AUTH_BASE/dist/cli.js" -o "$tmp_dir/cli.js"
  sed "s|^import './sourcemap-register.cjs';||" "$tmp_dir/cli.js" > "$tmp_dir/cli-runtime.js"
  node "$tmp_dir/cli-runtime.js"

  if [ -n "$_OCI_AUTH_BUNDLE_DIR" ]; then
    if [ -x "$UV_TOOL_BIN_DIR/oci" ]; then
      cat > "$_OCI_AUTH_EXPORT_BIN_DIR/oci" <<EOF
#!/bin/sh
exec "\$HOME/.local/bin/oci" "\$@"
EOF
      chmod 755 "$_OCI_AUTH_EXPORT_BIN_DIR/oci"
    fi

    {
      printf 'export OCI_AUTH_BUNDLE_DIR=%s\n' "$(shell_quote "$_OCI_AUTH_BUNDLE_DIR")"
      printf 'export HOME=%s\n' "$(shell_quote "$HOME")"
      if [ -n "${DOCKER_CONFIG:-$_OCI_AUTH_DOCKER_CONFIG}" ]; then
        printf 'export DOCKER_CONFIG=%s\n' "$(shell_quote "${DOCKER_CONFIG:-$_OCI_AUTH_DOCKER_CONFIG}")"
      fi
      printf 'export OCI_AUTH_ENV_FILE=%s\n' "$(shell_quote "$OCI_AUTH_ENV_FILE")"
      if [ -d "$_OCI_AUTH_EXPORT_BIN_DIR" ]; then
        printf 'export PATH=%s:%s:$PATH\n' "$(shell_quote "$_OCI_AUTH_EXPORT_BIN_DIR")" "$(shell_quote "$UV_TOOL_BIN_DIR")"
      elif [ -d "$UV_TOOL_BIN_DIR" ]; then
        printf 'export PATH=%s:$PATH\n' "$(shell_quote "$UV_TOOL_BIN_DIR")"
      fi
    } >> "$OCI_AUTH_ENV_FILE"
  fi
)

if [ -f "$_OCI_AUTH_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$_OCI_AUTH_ENV_FILE"
fi
