# Copilot Instructions — oci-oidc-auth-config

## What this repo is

A **composite GitHub Action** that enables keyless OCI authentication from GitHub Actions via OIDC. No compiled code, no dependencies to install — everything is YAML and inline bash.

## Architecture

The public entry point is the root `action.yml`. It delegates to two private composite actions:

```
action.yml  (public API — handles config_json vs. individual-inputs routing)
  └─ .github/actions/parse-oci-config/action.yml
       Parses config_json with jq, validates required keys, masks values.
  └─ .github/actions/setup-oci-oidc-auth/action.yml
       1. Requests GitHub OIDC JWT
       2. Exchanges it for OCI UPST via IDCS OAuth2 token-exchange endpoint
       3. Writes ~/.oci/config (SecurityToken profile) and ~/.oci/oci_cli_rc
       4. Installs OCI CLI (pip3, cached by runner OS)
       5. Sets OCI_CLI_AUTH=security_token in GITHUB_ENV
```

## Key conventions

**Input resolution — config_json takes precedence:**  
Root `action.yml` resolves parameters with `${JSON_VAL:-${INPUT_VAL}}`. If `config_json` is provided, parsed JSON values win; individual inputs are only used as fallbacks. Never pass both to downstream steps — only resolved values flow to `setup-oci-oidc-auth`.

**Sensitive value masking:**  
Every secret value (`client_id`, `client_secret`, UPST token, tenancy/compartment OCIDs) must be masked immediately after it is read using `echo "::add-mask::$value"`. This is done in both `parse-oci-config` and `setup-oci-oidc-auth`.

**Bash style:**  
All `run:` blocks use `set -euo pipefail`. Prefer `jq -r` for JSON extraction. Use `printf '%s\n'` for multi-line file writes.

**OCI CLI caching:**  
The CLI is installed with `pip3 install --user oci-cli` and cached under `~/.local/bin` and `~/.local/lib` with cache key `${{ runner.os }}-oci-cli-pip-v1`. Bump the `-v1` suffix when a CLI version change is needed.

**Terraform integration:**  
The Terraform OCI provider must use `auth = "SecurityToken"` and `config_file_profile` pointing to the profile name passed via `oci_profile` (default: `DEFAULT`). See `demo/main.tf`.

## Release process

1. Push a semver tag (`v1.2.3`).
2. `.github/workflows/release.yml` creates a GitHub Release with auto-generated notes.
3. The workflow force-updates the floating major tag (e.g., `v1`) to point at the new commit.

Consumers should pin to the major tag (`@v1`). Never push a `v*.*.*` tag unless it's ready to be the latest public release.

## Testing changes

There is no automated test suite. To validate changes:
- Open a draft PR and use `act` locally, **or**
- Reference the branch directly in a consumer workflow: `uses: devopshouse/oci-oidc-auth-config@<branch>`
- The `demo/` folder contains copy-paste workflows (`basic-oci-cli.yml`, `terraform.yml`) and a Terraform module (`main.tf`) that exercises real OCI auth end-to-end.
