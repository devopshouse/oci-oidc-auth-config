#!/usr/bin/env bash
# Writes ~/.oci/config and ~/.oci/oci_cli_rc from an existing UPST private key.
# Reads: OCI_TENANCY_ID, OCI_REGION, OCI_COMPARTMENT_ID, OCI_PROFILE (default: DEFAULT).
# Sets OCI_CLI_AUTH=security_token in the runner environment.
set -euo pipefail

: "${OCI_TENANCY_ID:?OCI_TENANCY_ID is required}"
: "${OCI_REGION:?OCI_REGION is required}"
: "${OCI_COMPARTMENT_ID:?OCI_COMPARTMENT_ID is required}"
OCI_PROFILE="${OCI_PROFILE:-DEFAULT}"

_mask() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$1"; fi
}

_mask "$OCI_TENANCY_ID"
_mask "$OCI_COMPARTMENT_ID"

fingerprint=$(openssl rsa -pubout -outform DER \
  -in "$HOME/.oci/upst_private_key.pem" 2>/dev/null \
  | openssl dgst -md5 -c \
  | awk '{print $NF}')

printf '%s\n' \
  "[${OCI_PROFILE}]" \
  "tenancy=${OCI_TENANCY_ID}" \
  "region=${OCI_REGION}" \
  "key_file=${HOME}/.oci/upst_private_key.pem" \
  "security_token_file=${HOME}/.oci/oci-upst" \
  "fingerprint=${fingerprint}" \
  > "$HOME/.oci/config"
chmod 600 "$HOME/.oci/config"

printf '%s\n' \
  "[${OCI_PROFILE}]" \
  "compartment-id=${OCI_COMPARTMENT_ID}" \
  > "$HOME/.oci/oci_cli_rc"
chmod 600 "$HOME/.oci/oci_cli_rc"

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "OCI_CLI_AUTH=security_token" >> "$GITHUB_ENV"
  echo "PYTHONWARNINGS=ignore::SyntaxWarning" >> "$GITHUB_ENV"
fi
if [ -n "${OCI_AUTH_ENV_FILE:-}" ]; then
  echo "export OCI_CLI_AUTH=security_token" >> "$OCI_AUTH_ENV_FILE"
  echo "export PYTHONWARNINGS=ignore::SyntaxWarning" >> "$OCI_AUTH_ENV_FILE"
fi

echo "~/.oci/config and ~/.oci/oci_cli_rc written (profile: ${OCI_PROFILE}, region: ${OCI_REGION})."
