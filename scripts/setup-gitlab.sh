#!/usr/bin/env bash
# All-in-one GitLab CI setup — pipe-friendly.
#   curl -sSfL https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/v2/scripts/setup-gitlab.sh | bash
#
# Installs oci to /usr/local/bin (already in PATH) so no export is needed after the pipe.
# Required env vars: OCI_OIDC_TOKEN (from id_tokens), OCI_IDCS_ENDPOINT,
#   OCI_CLIENT_ID, OCI_CLIENT_SECRET, OCI_REGION, OCI_TENANCY_ID, OCI_COMPARTMENT_ID
set -euo pipefail

command -v apt-get > /dev/null && apt-get update -qq && apt-get install -y -qq curl jq openssl

curl -LsSf https://astral.sh/uv/install.sh | sh
UV_TOOL_BIN_DIR=/usr/local/bin "$HOME/.local/bin/uv" tool install oci-cli --quiet

echo "${OCI_OIDC_TOKEN:?OCI_OIDC_TOKEN is required — configure id_tokens in .gitlab-ci.yml}" > /tmp/oci.jwt

export CI_PLATFORM=gitlab CI_JOB_JWT_FILE=/tmp/oci.jwt OCI_AUTH_ENV_FILE=/tmp/oci.env
BASE="https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/v2/scripts"
for s in resolve-oci-config get-oidc-token exchange-token write-oci-config; do
  curl -sSfL "$BASE/$s.sh" | bash
  . "$OCI_AUTH_ENV_FILE"
done
