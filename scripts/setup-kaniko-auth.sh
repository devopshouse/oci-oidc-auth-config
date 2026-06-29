#!/bin/sh
# Usage (sh — no process substitution):
#   eval "$(wget -qO- "$OCI_AUTH_BASE_URL/scripts/setup-kaniko-auth.sh")"
#   eval "$(curl -sSfL "$OCI_AUTH_BASE_URL/scripts/setup-kaniko-auth.sh")"
#
# Usage (bash — process substitution):
#   source <(curl -sSfL "$OCI_AUTH_BASE_URL/scripts/setup-kaniko-auth.sh")
#
# The script writes /kaniko/.docker/config.json, stores exports in a temp file,
# and prints ". /tmp/file" to stdout. eval sources the temp file so sensitive
# values are never exposed in shell xtrace logs.
set -eu

_kaniko_env_file="/kaniko/kaniko-auth-env.sh"
: > "$_kaniko_env_file"

json_get_string() {
  json_payload="$1"
  key="$2"
  printf '%s' "$json_payload" \
    | tr -d '\n' \
    | sed -n "s/.*[\"']$key[\"'][[:space:]]*:[[:space:]]*[\"']\\([^\"']*\\)[\"'].*/\\1/p" \
    | head -n 1
}

emit_export() {
  key="$1"
  value="$2"
  if [ -n "$value" ]; then
    printf "export %s='%s'\n" "$key" "$(printf '%s' "$value" | sed "s/'/'\\\\''/g")" >> "$_kaniko_env_file"
  fi
}

derive_registry() {
  printf '%s' "$1" | cut -d / -f 1
}

resolve_ocir_from_json() {
  if [ -n "${OCI_OIDC_CONFIG_B64:-}" ]; then
    OCIR_CONFIG_JSON_RESOLVED="$(printf '%s' "$OCI_OIDC_CONFIG_B64" | base64 -d 2>/dev/null || true)"
    if [ -z "$OCIR_CONFIG_JSON_RESOLVED" ]; then
      echo "error: failed to decode OCI_OIDC_CONFIG_B64" >&2
      exit 1
    fi
  elif [ -n "${OCI_OIDC_CONFIG:-}" ]; then
    OCIR_CONFIG_JSON_RESOLVED="$OCI_OIDC_CONFIG"
  else
    return 0
  fi

  OCIR_USERNAME="${OCIR_USERNAME:-$(json_get_string "$OCIR_CONFIG_JSON_RESOLVED" ocir_username)}"
  OCIR_PASSWORD="${OCIR_PASSWORD:-$(json_get_string "$OCIR_CONFIG_JSON_RESOLVED" ocir_password)}"
  OCIR_URL="${OCIR_URL:-$(json_get_string "$OCIR_CONFIG_JSON_RESOLVED" ocir_url)}"
  OCIR_REGISTRY="${OCIR_REGISTRY:-$(json_get_string "$OCIR_CONFIG_JSON_RESOLVED" ocir_registry)}"

  OCIR_USERNAME="${OCIR_USERNAME:-$(json_get_string "$OCIR_CONFIG_JSON_RESOLVED" OCIR_USERNAME)}"
  OCIR_PASSWORD="${OCIR_PASSWORD:-$(json_get_string "$OCIR_CONFIG_JSON_RESOLVED" OCIR_PASSWORD)}"
  OCIR_URL="${OCIR_URL:-$(json_get_string "$OCIR_CONFIG_JSON_RESOLVED" OCIR_URL)}"
  OCIR_REGISTRY="${OCIR_REGISTRY:-$(json_get_string "$OCIR_CONFIG_JSON_RESOLVED" OCIR_REGISTRY)}"

  if [ -z "${OCIR_REGISTRY:-}" ] && [ -n "${OCIR_URL:-}" ]; then
    OCIR_REGISTRY="$(derive_registry "$OCIR_URL")"
  fi

  emit_export OCIR_USERNAME "${OCIR_USERNAME:-}"
  emit_export OCIR_PASSWORD "${OCIR_PASSWORD:-}"
  emit_export OCIR_URL "${OCIR_URL:-}"
  emit_export OCIR_REGISTRY "${OCIR_REGISTRY:-}"
}

require_var() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"
  if [ -z "$var_value" ]; then
    echo "error: $var_name is required" >&2
    exit 1
  fi
}

resolve_ocir_from_json

require_var OCIR_USERNAME
require_var OCIR_PASSWORD
require_var OCIR_URL
require_var OCIR_REGISTRY

KANIKO_DOCKER_CONFIG_DIR="${KANIKO_DOCKER_CONFIG_DIR:-/kaniko/.docker}"
mkdir -p "$KANIKO_DOCKER_CONFIG_DIR"
auth="$(printf '%s:%s' "$OCIR_USERNAME" "$OCIR_PASSWORD" | base64 | tr -d '\n')"
printf '{"auths":{"%s":{"auth":"%s"}}}\n' "$OCIR_REGISTRY" "$auth" > "$KANIKO_DOCKER_CONFIG_DIR/config.json"

printf '{ set +x; } 2>/dev/null; . %s; set -x\n' "$_kaniko_env_file"
