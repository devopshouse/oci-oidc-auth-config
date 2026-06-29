#!/usr/bin/env bash
# Exchanges a JWT (OIDC token) for an OCI UPST via the IDCS token-exchange endpoint.
# Reads: OIDC_TOKEN, OCI_IDCS_ENDPOINT, OCI_CLIENT_ID, OCI_CLIENT_SECRET.
# Writes: ~/.oci/oci-upst, ~/.oci/upst_private_key.pem.
set -euo pipefail

: "${OIDC_TOKEN:?OIDC_TOKEN is required}"
: "${OCI_IDCS_ENDPOINT:?OCI_IDCS_ENDPOINT is required}"
: "${OCI_CLIENT_ID:?OCI_CLIENT_ID is required}"
: "${OCI_CLIENT_SECRET:?OCI_CLIENT_SECRET is required}"

_mask() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$1"; fi
}

_error() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "::error::$*"
  else
    echo "error: $*" >&2
  fi
}

_mask "$OCI_CLIENT_ID"
_mask "$OCI_CLIENT_SECRET"

openssl genrsa -out private_key.pem 2048 2>/dev/null
openssl rsa -in private_key.pem -pubout -out public_key.pem 2>/dev/null

token_url="${OCI_IDCS_ENDPOINT%/}/oauth2/v1/token"
public_key="$(grep -v -- '-----' public_key.pem | tr -d '\n')"

max_attempts=4
attempt=1
http_status=0

while [ "$attempt" -le "$max_attempts" ]; do
  http_status="$(
    curl -sS -o token-response.json -w '%{http_code}' \
      --request POST "$token_url" \
      --header 'Content-Type: application/x-www-form-urlencoded' \
      --header "Authorization: Basic $(printf '%s:%s' "${OCI_CLIENT_ID}" "${OCI_CLIENT_SECRET}" | base64 -w0)" \
      --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
      --data-urlencode 'requested_token_type=urn:oci:token-type:oci-upst' \
      --data-urlencode "public_key=${public_key}" \
      --data-urlencode "subject_token=${OIDC_TOKEN}" \
      --data-urlencode 'subject_token_type=jwt'
  )"

  if [ "$http_status" -ge 200 ] && [ "$http_status" -le 299 ]; then
    break
  fi

  if [ "$attempt" -lt "$max_attempts" ]; then
    delay=$((attempt * 2))
    echo "warning: OCI token exchange failed with HTTP ${http_status} (attempt ${attempt}/${max_attempts}). Retrying in ${delay}s..."
    sleep "$delay"
  fi

  attempt=$((attempt + 1))
done

if [ "$http_status" -lt 200 ] || [ "$http_status" -gt 299 ]; then
  _error "OCI token exchange failed with HTTP ${http_status} after ${max_attempts} attempts."
  jq -C . token-response.json || cat token-response.json
  exit 1
fi

upst="$(jq -r '.token // .access_token // empty' token-response.json)"

if [ -z "$upst" ]; then
  _error "OCI response did not include a UPST token."
  jq -C . token-response.json || cat token-response.json
  exit 1
fi

_mask "$upst"
mkdir -p "$HOME/.oci"
chmod 700 "$HOME/.oci"

printf '%s' "$upst" > "$HOME/.oci/oci-upst"
chmod 600 "$HOME/.oci/oci-upst"

mv private_key.pem "$HOME/.oci/upst_private_key.pem"
chmod 600 "$HOME/.oci/upst_private_key.pem"

rm -f public_key.pem token-response.json

echo "OCI UPST token exchange succeeded."
