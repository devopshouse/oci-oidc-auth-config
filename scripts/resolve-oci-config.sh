#!/usr/bin/env bash
# Resolves OCI connection parameters from CONFIG_JSON or individual OCI_* env vars.
# Writes outputs to $GITHUB_OUTPUT (GitHub Actions) and/or $OCI_AUTH_ENV_FILE (GitLab / other CI).
set -euo pipefail

_mask() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$1"; fi
}

_upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }

_emit() {
  local key="$1" value="$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "${key}=${value}" >> "$GITHUB_OUTPUT"; fi
  if [ -n "${OCI_AUTH_ENV_FILE:-}" ]; then echo "export $(_upper "$key")=${value}" >> "$OCI_AUTH_ENV_FILE"; fi
}

_error() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "::error::$*"
  else
    echo "error: $*" >&2
  fi
}

if [ -n "${CONFIG_JSON:-}" ]; then
  missing=0
  for key in oci_idcs_endpoint oci_client_id oci_client_secret oci_region oci_tenancy_id oci_compartment_id; do
    value="$(jq -r --arg k "$key" '.[$k] // empty' <<< "$CONFIG_JSON")"
    if [ -z "$value" ]; then
      _error "Missing required key in config_json: ${key}"
      missing=1
      continue
    fi
    _mask "$value"
    _emit "$key" "$value"
  done
  [ "$missing" -eq 0 ] || exit 1
  exit 0
fi

oci_idcs_endpoint="${OCI_IDCS_ENDPOINT:-}"
oci_client_id="${OCI_CLIENT_ID:-}"
oci_client_secret="${OCI_CLIENT_SECRET:-}"
oci_region="${OCI_REGION:-}"
oci_tenancy_id="${OCI_TENANCY_ID:-}"
oci_compartment_id="${OCI_COMPARTMENT_ID:-}"

missing=0
for key in oci_idcs_endpoint oci_client_id oci_client_secret oci_region oci_tenancy_id oci_compartment_id; do
  if [ -z "${!key}" ]; then
    _error "Missing required OCI parameter '${key}'. Supply it via CONFIG_JSON or as the individual env var $(_upper "$key")."
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 1

for key in oci_idcs_endpoint oci_client_id oci_client_secret oci_region oci_tenancy_id oci_compartment_id; do
  _mask "${!key}"
  _emit "$key" "${!key}"
done
