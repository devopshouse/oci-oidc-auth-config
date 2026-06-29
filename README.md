# Setup OCI OIDC Auth

> **GitHub Action + CI scripts** — Keyless authentication to Oracle Cloud Infrastructure (OCI) from GitHub Actions or GitLab CI using OpenID Connect (OIDC). No long-lived credentials stored in secrets.

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Setup%20OCI%20OIDC%20Auth-blue?logo=github)](https://github.com/marketplace/actions/setup-oci-oidc-auth)
[![Latest release](https://img.shields.io/github/v/release/devopshouse/oci-oidc-auth-config?label=latest)](https://github.com/devopshouse/oci-oidc-auth-config/releases/latest)
[![License](https://img.shields.io/github/license/devopshouse/oci-oidc-auth-config)](LICENSE)

---

## How it works

```
CI runner (GitHub Actions or GitLab CI)
  │
  ├─ 1. Obtains a short-lived OIDC JWT from the platform token endpoint
  ├─ 2. Exchanges that JWT for an OCI UPST (User Principal Security Token) via
  │     the OCI IDCS OAuth2 token-exchange endpoint
  ├─ 3. Writes ~/.oci/config (SecurityToken auth profile)
  ├─ 4. Installs the OCI CLI (GitHub Actions only, cached between runs)
  └─ 5. Sets OCI_CLI_AUTH=security_token in the job environment
```

After the auth step completes, every subsequent step in the job can use the **OCI CLI**, **Terraform OCI provider**, OCI SDKs, or any other tool that reads `~/.oci/config`.

---

## Platform support

| Platform | How to use | Version |
|----------|-----------|---------|
| **GitHub Actions** | `uses: devopshouse/oci-oidc-auth-config@v2` — composite action | `@v2` |
| **GitLab CI** | Clone the repo and call `scripts/` directly with `CI_PLATFORM=gitlab` | `--branch v2` |

> GitLab CI cannot run GitHub composite actions natively. It calls the underlying shell scripts in `scripts/` instead.

---

## GitHub Actions usage

### Prerequisites

#### 1. Enable GitHub OIDC in your OCI tenancy

You need an **OCI IDCS confidential application** configured as a token-exchange client:

1. Open **OCI Console → Identity → Domains → Default domain → Applications**
2. Create a new **Confidential Application**
3. Under **OAuth configuration** enable the **Token exchange** grant type
4. Under **Resources → Primary audience** add `https://cloud.oracle.com`
5. Under **Web tier policy** (or **JWT validation**) trust the GitHub issuer:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject claim: `repo:<org>/<repo>:ref:refs/heads/<branch>` (adjust as needed)
6. Note down the **Client ID**, **Client Secret**, and the **Domain URL** (e.g. `https://<domain>.identity.oraclecloud.com`)

Use the Terraform in [`examples/oci-oidc-configuration/`](examples/oci-oidc-configuration/) to provision all required OCI resources automatically.

#### 2. Create the `OCI_CONFIG_JSON` secret

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

### Minimal

```yaml
permissions:
  id-token: write   # Required — lets the job request a GitHub OIDC token
  contents: read

steps:
  - name: Setup OCI OIDC Auth
    uses: devopshouse/oci-oidc-auth-config@v2
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
    uses: devopshouse/oci-oidc-auth-config@v2
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
    uses: devopshouse/oci-oidc-auth-config@v2
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
      - uses: actions/checkout@v7

      - name: Setup OCI OIDC Auth
        id: oci
        uses: devopshouse/oci-oidc-auth-config@v2
        with:
          config_json: ${{ secrets.OCI_CONFIG_JSON }}

      - uses: hashicorp/setup-terraform@v3

      - run: terraform init -input=false

      - run: |
          terraform apply -auto-approve -input=false \
            -var="region=${{ steps.oci.outputs.oci_region }}" \
            -var="compartment_id=${{ steps.oci.outputs.oci_compartment_id }}"
```

See the [`examples/workflows/`](examples/workflows/) folder for more ready-to-use workflow examples.

---

## GitLab CI usage

GitLab CI cannot execute GitHub composite actions directly. Instead, clone this repository in your pipeline and call the shell scripts in `scripts/` with `CI_PLATFORM=gitlab`.

### Prerequisites

1. Run the Terraform in [`examples/oci-oidc-configuration/`](examples/oci-oidc-configuration/) with `enable_gitlab=true` and `gitlab_projects` set to your project(s). This creates a second Identity Propagation Trust in OCI IDCS for GitLab.

2. Add the following CI/CD variables to your GitLab project or group (**Settings → CI/CD → Variables**, mark sensitive values as Masked):

   | Variable | Description |
   |----------|-------------|
   | `OCI_IDCS_ENDPOINT` | Identity domain URL |
   | `OCI_CLIENT_ID` | OAuth2 client ID |
   | `OCI_CLIENT_SECRET` | OAuth2 client secret *(masked)* |
   | `OCI_REGION` | OCI region (e.g. `sa-saopaulo-1`) |
   | `OCI_TENANCY_ID` | Tenancy OCID *(masked)* |
   | `OCI_COMPARTMENT_ID` | Compartment OCID *(masked)* |

### Example `.gitlab-ci.yml`

```yaml
oci-auth-test:
  image: ubuntu:22.04

  variables:
    OCI_CLI_AUTH: security_token

  id_tokens:
    OCI_OIDC_TOKEN:
      aud: https://cloud.oracle.com/gitlab

  script:
    - curl -sSfL https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/v2/scripts/setup-gitlab.sh | bash
    - oci os ns get
```

See [`examples/gitlab/.gitlab-ci.yml`](examples/gitlab/.gitlab-ci.yml) for the full annotated example.

---

## Action inputs (GitHub Actions)

You must supply OCI credentials using **one** of two approaches:

### Option A — single JSON secret (recommended for simplicity)

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `config_json` | ❌ | — | JSON string with all OCI connection parameters. When provided, all individual OCI inputs below are ignored. |
| `oidc_audience` | ❌ | `https://cloud.oracle.com` | Audience claim requested in the GitHub OIDC token |
| `oci_profile` | ❌ | `DEFAULT` | OCI config profile name written to `~/.oci/config` |

### Option B — individual inputs

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

## Action outputs (GitHub Actions)

| Output | Description |
|--------|-------------|
| `oci_region` | OCI region identifier |
| `oci_tenancy_id` | Tenancy OCID |
| `oci_compartment_id` | Compartment OCID |
| `oci_idcs_endpoint` | IDCS identity domain URL |

---

## Releases and versioning

This action follows [Semantic Versioning](https://semver.org/).

| Reference | Meaning |
|-----------|---------|
| `@v2` | Latest patch/minor in the v2 major line *(recommended)* |
| `@v2.0.0` | Exact version pin |
| `@main` | Tip of the default branch — may include breaking changes |

> **v1 users** — `@v1` continues to work. Migrate to `@v2` to get GitLab CI support and the refactored script-based architecture.

---

## Security

- All sensitive values (`client_id`, `client_secret`, UPST token) are immediately masked in the log via `::add-mask::` (GitHub Actions) or should be marked Masked in GitLab CI variables.
- The ephemeral RSA key pair generated for the UPST exchange is discarded after writing to `~/.oci/` and never leaves the runner.
- No credentials are committed to source control.
- The OCI CLI cache key does **not** include any credential material.

---

## Examples

The [`examples/`](examples/) folder contains:

- [`oci-oidc-configuration/`](examples/oci-oidc-configuration/) — Terraform module to provision the OCI IDCS app, service user, IAM policy, and Identity Propagation Trusts for GitHub and/or GitLab
- [`gitlab/.gitlab-ci.yml`](examples/gitlab/.gitlab-ci.yml) — GitLab CI example using `scripts/` directly
- [`workflows/basic-oci-cli.yml`](examples/workflows/basic-oci-cli.yml) — GitHub Actions OCI CLI example
- [`workflows/terraform.yml`](examples/workflows/terraform.yml) — GitHub Actions Terraform example

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## License

[MIT](LICENSE)
