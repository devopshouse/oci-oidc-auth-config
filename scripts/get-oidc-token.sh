#!/usr/bin/env bash
# Obtains an OIDC token from GitHub Actions or GitLab CI.
# Reads: CI_PLATFORM (default: github), OIDC_AUDIENCE (GitHub only), CI_JOB_JWT_FILE (GitLab only).
# Writes: oidc_token to $GITHUB_OUTPUT and/or OIDC_TOKEN to $OCI_AUTH_ENV_FILE.
set -euo pipefail

CI_PLATFORM="${CI_PLATFORM:-github}"

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

case "$CI_PLATFORM" in
  github)
    if [ -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ] || [ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
      _error "GitHub OIDC variables not available. Ensure 'permissions: id-token: write' is set on the job."
      exit 1
    fi

    oidc_response="$(
      curl -fsS \
        -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
        "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${OIDC_AUDIENCE:-https://cloud.oracle.com}"
    )"

    token="$(jq -r '.value' <<< "$oidc_response")"

    if [ -z "$token" ] || [ "$token" = "null" ]; then
      _error "GitHub did not return an OIDC token."
      exit 1
    fi

    _mask "$token"

    payload="$(jq -R 'split(".") | .[1] | @base64d | fromjson' <<< "$token")"
    echo "OIDC issuer:   $(jq -r '.iss' <<< "$payload")"
    echo "OIDC audience: $(jq -r '.aud' <<< "$payload")"
    echo "OIDC subject:  $(jq -r '.sub' <<< "$payload")"
    ;;

  gitlab)
    if [ -z "${CI_JOB_JWT_FILE:-}" ]; then
      _error "CI_JOB_JWT_FILE is not set. Configure id_tokens in your .gitlab-ci.yml and write the token to a file."
      exit 1
    fi
    if [ ! -f "$CI_JOB_JWT_FILE" ]; then
      _error "CI_JOB_JWT_FILE=${CI_JOB_JWT_FILE} does not exist."
      exit 1
    fi
    token="$(cat "$CI_JOB_JWT_FILE")"
    if [ -z "$token" ]; then
      _error "CI_JOB_JWT_FILE is empty."
      exit 1
    fi
    ;;

  *)
    _error "Unknown CI_PLATFORM '${CI_PLATFORM}'. Expected 'github' or 'gitlab'."
    exit 1
    ;;
esac

_emit "oidc_token" "$token"
