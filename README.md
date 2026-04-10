# Setup OCI OIDC Auth

> **GitHub Action** — Keyless authentication to Oracle Cloud Infrastructure (OCI) from GitHub Actions using OpenID Connect (OIDC). No long-lived credentials stored in secrets.

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Setup%20OCI%20OIDC%20Auth-blue?logo=github)](https://github.com/marketplace/actions/setup-oci-oidc-auth)
[![Latest release](https://img.shields.io/github/v/release/devopshouse/oci-oidc-auth-config?label=latest)](https://github.com/devopshouse/oci-oidc-auth-config/releases/latest)
[![License](https://img.shields.io/github/license/devopshouse/oci-oidc-auth-config)](LICENSE)

---

## How it works

```
GitHub Actions runner
  │
  ├─ 1. Requests a short-lived GitHub OIDC JWT from the Actions token endpoint
  ├─ 2. Exchanges that JWT for an OCI UPST (User Principal Security Token) via
  │     the OCI IDCS OAuth2 token-exchange endpoint
  ├─ 3. Writes ~/.oci/config (SecurityToken auth profile)
  ├─ 4. Installs the OCI CLI (cached between runs)
  └─ 5. Sets OCI_CLI_AUTH=security_token in the job environment
```

After the action completes, every subsequent step in the job can use the **OCI CLI**, **Terraform OCI provider**, OCI SDKs, or any other tool that reads `~/.oci/config`.

---

## Prerequisites

### 1. Enable GitHub OIDC in your OCI tenancy

You need an **OCI IDCS confidential application** configured as a token-exchange client:

1. Open **OCI Console → Identity → Domains → Default domain → Applications**
2. Create a new **Confidential Application**
3. Under **OAuth configuration** enable the **Token exchange** grant type
4. Under **Resources → Primary audience** add `https://cloud.oracle.com`
5. Under **Web tier policy** (or **JWT validation**) trust the GitHub issuer:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject claim: `repo:<org>/<repo>:ref:refs/heads/<branch>` (adjust as needed)
6. Note down the **Client ID**, **Client Secret**, and the **Domain URL** (e.g. `https://<domain>.identity.oraclecloud.com`)

### 2. Create the `OCI_CONFIG_JSON` secret

In your repository go to **Settings → Secrets and variables → Actions → New repository secret** and create a secret named `OCI_CONFIG_JSON` with the following JSON:

```json
{
  "oci_idcs_endpoint":  "https://<domain>.identity.oraclecloud.com",
  "oci_client_id":      "<confidential-app-client-id>",
  "oci_client_secret":  "<confidential-app-client-secret>",
  "oci_region":         "sa-saopaulo-1",
  "oci_tenancy_id":     "ocid1.tenancy.oc1..<unique-id>",
  "oci_compartment_id": "ocid1.compartment.oc1..<unique-id>"
}
```

> **Tip** — Use an [OCI Vault secret](https://docs.oracle.com/en-us/iaas/Content/KeyManagement/Concepts/keyoverview.htm) or a GitHub Environment to scope access to specific branches/environments.

---

## Usage

### Minimal

```yaml
permissions:
  id-token: write   # Required — lets the job request a GitHub OIDC token
  contents: read

steps:
  - name: Setup OCI OIDC Auth
    uses: devopshouse/oci-oidc-auth-config@v1
    with:
      config_json: ${{ secrets.OCI_CONFIG_JSON }}

  - name: List compute instances
    run: oci compute instance list
```

### Using individual inputs instead of a JSON secret

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - name: Setup OCI OIDC Auth
    uses: devopshouse/oci-oidc-auth-config@v1
    with:
      oci_idcs_endpoint:  ${{ secrets.OCI_IDCS_ENDPOINT }}
      oci_client_id:      ${{ secrets.OCI_CLIENT_ID }}
      oci_client_secret:  ${{ secrets.OCI_CLIENT_SECRET }}
      oci_region:         ${{ vars.OCI_REGION }}
      oci_tenancy_id:     ${{ secrets.OCI_TENANCY_ID }}
      oci_compartment_id: ${{ secrets.OCI_COMPARTMENT_ID }}

  - name: List compute instances
    run: oci compute instance list
```

### With outputs (region, compartment, tenancy)

```yaml
steps:
  - name: Setup OCI OIDC Auth
    id: oci
    uses: devopshouse/oci-oidc-auth-config@v1
    with:
      config_json: ${{ secrets.OCI_CONFIG_JSON }}

  - name: Terraform plan
    run: |
      terraform plan \
        -var="region=${{ steps.oci.outputs.oci_region }}" \
        -var="compartment_id=${{ steps.oci.outputs.oci_compartment_id }}"
```

### With Terraform (full example)

```yaml
name: Terraform — OCI

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup OCI OIDC Auth
        id: oci
        uses: devopshouse/oci-oidc-auth-config@v1
        with:
          config_json: ${{ secrets.OCI_CONFIG_JSON }}

      - uses: hashicorp/setup-terraform@v3

      - run: terraform init -input=false

      - run: |
          terraform apply -auto-approve -input=false \
            -var="region=${{ steps.oci.outputs.oci_region }}" \
            -var="compartment_id=${{ steps.oci.outputs.oci_compartment_id }}"
```

See the [`demo/workflows/`](demo/workflows/) folder for more ready-to-use workflow examples.

---

## Inputs

You must supply OCI credentials using **one** of two approaches:

### Option A — single JSON secret (recommended for simplicity)

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `config_json` | ❌ | — | JSON string with all OCI connection parameters (see [Prerequisites](#prerequisites)). When provided, all individual OCI inputs below are ignored. |
| `oidc_audience` | ❌ | `https://cloud.oracle.com` | Audience claim requested in the GitHub OIDC token |
| `oci_profile` | ❌ | `DEFAULT` | OCI config profile name written to `~/.oci/config` |

### Option B — individual inputs (useful when values come from different sources)

All six OCI inputs below are required when `config_json` is **not** provided.

| Input | Default | Description |
|-------|---------|-------------|
| `oci_idcs_endpoint` | — | IDCS identity domain URL |
| `oci_client_id` | — | OAuth2 confidential application client ID |
| `oci_client_secret` | — | OAuth2 confidential application client secret |
| `oci_region` | — | OCI region identifier (e.g. `sa-saopaulo-1`) |
| `oci_tenancy_id` | — | Tenancy OCID |
| `oci_compartment_id` | — | Compartment OCID |
| `oidc_audience` | `https://cloud.oracle.com` | Audience claim requested in the GitHub OIDC token |
| `oci_profile` | `DEFAULT` | OCI config profile name written to `~/.oci/config` |

> **Note** — At least one complete set of credentials must be provided. If both `config_json` and individual inputs are supplied, `config_json` takes precedence.

---

## Outputs

| Output | Description |
|--------|-------------|
| `oci_region` | OCI region identifier parsed from `config_json` (e.g. `sa-saopaulo-1`) |
| `oci_tenancy_id` | Tenancy OCID parsed from `config_json` |
| `oci_compartment_id` | Compartment OCID parsed from `config_json` |
| `oci_idcs_endpoint` | IDCS identity domain URL parsed from `config_json` |

---

## Releases and versioning

This action follows [Semantic Versioning](https://semver.org/).

| Reference | Meaning |
|-----------|---------|
| `@v1` | Latest patch/minor in the v1 major line *(recommended)* |
| `@v1.2.3` | Exact version pin |
| `@main` | Tip of the default branch — may include breaking changes |

---

## Security

- All sensitive values (`client_id`, `client_secret`, UPST token) are immediately masked in the log via `::add-mask::`.
- The ephemeral RSA key pair generated for the UPST exchange is discarded after writing to `~/.oci/` and never leaves the runner.
- No credentials are committed to source control.
- The OCI CLI cache key does **not** include any credential material.

---

## Demo

The [`demo/`](demo/) folder contains:

- [`main.tf`](demo/main.tf) — Terraform module used by the internal integration test
- [`workflows/basic-oci-cli.yml`](demo/workflows/basic-oci-cli.yml) — OCI CLI example workflow
- [`workflows/terraform.yml`](demo/workflows/terraform.yml) — Terraform example workflow

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## License

[MIT](LICENSE)
