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
  ├─ 4. Installs the OCI CLI when it is not already available
  └─ 5. Sets OCI_CLI_AUTH=security_token in the job environment
```

After the auth step completes, every subsequent step in the job can use the **OCI CLI**, **Terraform OCI provider**, OCI SDKs, or any other tool that reads `~/.oci/config`.

---

## Platform support

| Platform | How to use | Version |
|----------|-----------|---------|
| **GitHub Actions** | `uses: devopshouse/oci-oidc-auth-config@v2` - Node 24 action | `@v2` |
| **GitLab CI** | Run `scripts/setup-gitlab.sh`, which calls the shared Node CLI | `v2` |

> GitLab CI cannot run GitHub Actions natively. It calls the shared CLI through `scripts/setup-gitlab.sh` instead.

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

#### 2. Create the `OCI_OIDC_CONFIG` secret

When `github.create_secrets = true` (the default) the [`terraform-oci-oidc-federation`](https://github.com/devopshouse/terraform-oci-oidc-federation) module writes the `OCI_OIDC_CONFIG` secret to each GitHub repository automatically. To retrieve it manually:

```sh
terraform output -raw ci_oidc_config_json
```

The secret is a single unified JSON blob with all OCI connection fields **and** OCIR credentials:

```json
{
  "oci_idcs_endpoint":  "https://<domain>.identity.oraclecloud.com",
  "oci_client_id":      "<confidential-app-client-id>",
  "oci_client_secret":  "<confidential-app-client-secret>",
  "oci_region":         "sa-saopaulo-1",
  "oci_tenancy_id":     "ocid1.tenancy.oc1..<unique-id>",
  "oci_compartment_id": "ocid1.compartment.oc1..<unique-id>",
  "ocir_username":      "<namespace>/<service_user>-ocir",
  "ocir_password":      "<auth-token>",
  "ocir_url":           "ocir.<region>.oci.oraclecloud.com/<namespace>"
}
```

Pass the unified secret to the action via the `config_json` input:

```yaml
- name: Setup OCI OIDC Auth
  uses: devopshouse/oci-oidc-auth-config@v2
  with:
    config_json: ${{ secrets.OCI_OIDC_CONFIG }}

# ~/.docker/config.json is written automatically when ocir_* keys are present.
# docker / podman / kaniko can push without a separate login step.
```

> `ocir_registry` is derived automatically from `ocir_url` and does not need to be set.

### Minimal

```yaml
permissions:
  id-token: write   # Required — lets the job request a GitHub OIDC token
  contents: read

steps:
  - name: Setup OCI OIDC Auth
    uses: devopshouse/oci-oidc-auth-config@v2
    with:
      config_json: ${{ secrets.OCI_OIDC_CONFIG }}

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
      config_json: ${{ secrets.OCI_OIDC_CONFIG }}

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
          config_json: ${{ secrets.OCI_OIDC_CONFIG }}

      - uses: hashicorp/setup-terraform@v3

      - run: terraform init -input=false

      - run: |
          terraform apply -auto-approve -input=false \
            -var="region=${{ steps.oci.outputs.oci_region }}" \
            -var="compartment_id=${{ steps.oci.outputs.oci_compartment_id }}"
```

### With OCIR (Docker / Podman / Kaniko)

When `config_json` contains `ocir_*` keys (the default when using the `terraform-oci-oidc-federation` module), the action automatically exports `OCIR_USERNAME`, `OCIR_PASSWORD`, `OCIR_URL`, and `OCIR_REGISTRY` to `GITHUB_ENV` and writes `~/.docker/config.json` — no separate login step needed.

**Docker / Podman**

```yaml
- name: Setup OCI OIDC Auth
  uses: devopshouse/oci-oidc-auth-config@v2
  with:
    config_json: ${{ secrets.OCI_OIDC_CONFIG }}
    # ocir_login: true (default) — writes ~/.docker/config.json automatically
    # when ocir_* keys are present in the blob.

# No docker login / podman login step needed.
- name: Build and push
  run: |
    docker build -t "$OCIR_URL/myapp:$GITHUB_SHA" .
    docker push "$OCIR_URL/myapp:$GITHUB_SHA"
```

On Kubernetes-based runners without privileged container builds, Podman `build` can fail at runtime setup (`fuse-overlayfs` / `ping_group_range`). Prefer Kaniko there.

**Kaniko** (rootless — no Docker daemon in the build step; runs via `docker run` on the ubuntu runner)

```yaml
- name: Setup OCI OIDC Auth
  uses: devopshouse/oci-oidc-auth-config@v2
  with:
    config_json: ${{ secrets.OCI_OIDC_CONFIG }}
    # ocir_login: true (default) — writes ~/.docker/config.json automatically.

# Bind-mount ~/.docker into Kaniko — no separate auth config step needed.
- name: Build and push with Kaniko
  run: |
    docker run --rm \
      -v "$GITHUB_WORKSPACE:/workspace" \
      -v "$HOME/.docker:/kaniko/.docker:ro" \
      gcr.io/kaniko-project/executor:latest \
        --context /workspace \
        --dockerfile /workspace/Dockerfile \
        --destination "$OCIR_URL/myapp:$GITHUB_SHA" \
        --destination "$OCIR_URL/myapp:latest"
```

> Docker and Podman are pre-installed on `ubuntu-latest` runners. See [`examples/github/ocir-push.yml`](examples/github/ocir-push.yml) for complete working jobs for all three tools.

See the [`examples/github/`](examples/github/) folder for more ready-to-use workflow examples.

---

## GitLab CI usage

GitLab CI cannot execute GitHub Actions directly. Instead, use one of two scripts depending on the job:

- `setup-gitlab.sh` for full OCI CLI auth in Ubuntu-based jobs
- `setup-kaniko-auth.sh` for OCIR/Kaniko-only jobs

The recommended way to choose which remote revision to fetch is `OCI_OIDC_AUTH_VERSION`
for tags like `v1` / `v2`, branches like `main`, or feature branches.

### Prerequisites

1. Run the Terraform in [`examples/oci-oidc-configuration/`](examples/oci-oidc-configuration/) with `enable_gitlab=true` and `gitlab_projects` set to your project(s). This creates a second Identity Propagation Trust in OCI IDCS for GitLab.

2. Add a single masked CI/CD variable to your GitLab project or group (**Settings → CI/CD → Variables**):

   | Variable | Description |
   |----------|-------------|
   | `OCI_OIDC_CONFIG_B64` | Base64-encoded output of `terraform output -raw ci_oidc_config_json \| base64 -w0`. Contains all OCI + OCIR fields in a single unified blob. |

   `setup-gitlab.sh` reads `OCI_OIDC_CONFIG_B64` (or `OCI_OIDC_CONFIG` for plain JSON), extracts the OCIR fields automatically, and exports `OCIR_USERNAME`, `OCIR_PASSWORD`, `OCIR_URL`, and `OCIR_REGISTRY` to the generated env file.

   You can still fall back to the six individual `OCI_*` variables plus individual `OCIR_*` variables, but the unified blob avoids JSON escaping issues.

### Example `.gitlab-ci.yml`

Use `source <(curl ...)` so that the exported `OCI_*` and `OCIR_*` variables are
available in subsequent `script:` lines without a separate source step.

```yaml
oci-auth-test:
  image: ubuntu:24.04

  # Store OCI_OIDC_CONFIG_B64 as a masked GitLab variable.
  # OCI_CLI_AUTH is set automatically by the setup script — no need to declare it here.

  id_tokens:
    OCI_OIDC_TOKEN:
      aud: https://cloud.oracle.com

  script:
    - apt-get update -qq && apt-get install -y -qq ca-certificates curl
    - source <(curl -sSfL "https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/${OCI_OIDC_AUTH_VERSION:-v2}/scripts/setup-gitlab.sh")
    - oci os ns get
```

See [`examples/gitlab/.gitlab-ci.yml`](examples/gitlab/.gitlab-ci.yml) for the full annotated example. It keeps the two paths independent: one Ubuntu job uses `setup-gitlab.sh` to run `oci`, and one Kaniko job uses `setup-kaniko-auth.sh` to resolve OCIR credentials and write `/kaniko/.docker/config.json`. The example declares `OCI_AUTH_BASE_URL` from `OCI_OIDC_AUTH_VERSION` to keep the script calls short.

### GitLab with OCIR credentials

OCIR credentials are part of `OCI_OIDC_CONFIG_B64` — no separate variable needed. In Ubuntu jobs, `setup-gitlab.sh` resolves the OCIR fields and writes container auth automatically. In Kaniko jobs, `setup-kaniko-auth.sh` reads the same unified variable and writes `/kaniko/.docker/config.json` directly.

```yaml
ocir-push:
  image: ubuntu:24.04
  services:
    - docker:dind

  variables:
    DOCKER_HOST: tcp://docker:2376
    DOCKER_TLS_CERTDIR: /certs
    # Store OCI_OIDC_CONFIG_B64 as a masked variable (contains OCI + OCIR).
    # OCI_CLI_AUTH is set automatically by the setup script.

  id_tokens:
    OCI_OIDC_TOKEN:
      aud: https://cloud.oracle.com

  script:
    - apt-get update -qq && apt-get install -y -qq ca-certificates curl
    # Resolves OCI + OCIR, writes ~/.docker/config.json, exports vars.
    - source <(curl -sSfL "https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/${OCI_OIDC_AUTH_VERSION:-v2}/scripts/setup-gitlab.sh")
    # docker / podman / kaniko can now push without a separate login step.
    - docker build -t "$OCIR_URL/myimage:$CI_COMMIT_SHA" .
    - docker push "$OCIR_URL/myimage:$CI_COMMIT_SHA"
```

To skip writing the auth file (e.g. you only need the `OCIR_*` env vars), set `OCIR_LOGIN=false`.

### GitLab environment file

`setup-gitlab.sh` writes shell exports to `OCI_AUTH_ENV_FILE` (default `$HOME/.oci-auth.env`) and then sources that file automatically when you use `source <(curl ...)`, so subsequent lines in the same Ubuntu job can use `oci` and registry auth immediately.

`setup-kaniko-auth.sh` writes `/kaniko/.docker/config.json` and also writes the resolved `OCIR_*` values to `OCI_AUTH_ENV_FILE` (default `$HOME/.oci-auth.env`). When using the pipe form inside the Kaniko job, add `. "$HOME/.oci-auth.env"` after the helper so `OCIR_URL` is available for `/kaniko/executor`.

If you still prefer `curl | bash` with `setup-gitlab.sh`, the variables do **not** propagate — add `. "$HOME/.oci-auth.env"` manually after the pipe.

Remote source URL:

`https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/${OCI_OIDC_AUTH_VERSION}`

Default: `OCI_OIDC_AUTH_VERSION=v2`

---

## Action inputs (GitHub Actions)

You must supply OCI credentials using **one** of two approaches:

### Option A — single JSON secret (recommended for simplicity)

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `config_json` | ❌ | — | Unified JSON blob with all OCI + OCIR parameters (the `OCI_OIDC_CONFIG` secret). When provided, all individual OCI and OCIR inputs are ignored. |
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

> **Note** — At least one complete set of OCI credentials must be provided. If both `config_json` and individual OCI inputs are supplied, `config_json` takes precedence.

### OCIR inputs (optional)

When provided, the action exports `OCIR_USERNAME`, `OCIR_PASSWORD`, `OCIR_URL`, and `OCIR_REGISTRY` to `GITHUB_ENV` for subsequent steps, and writes container auth to `~/.docker/config.json` (readable by docker, podman, and kaniko). `OCIR_PASSWORD` is masked in the log.

**Option A — unified JSON secret (via `config_json`)**

OCIR fields (`ocir_username`, `ocir_password`, `ocir_url`) are read automatically from the unified `config_json` blob. `ocir_registry` is derived from `ocir_url`. No separate OCIR input needed when using the unified secret.

**Option B — individual inputs**

| Input | Default | Description |
|-------|---------|-------------|
| `ocir_username` | — | OCIR login username in the form `<namespace>/<username>` |
| `ocir_password` | — | OCIR auth token (password) |
| `ocir_url` | — | Registry URL with namespace, e.g. `ocir.<region>.oci.oraclecloud.com/<namespace>` |
| `ocir_registry` | — | Registry host, e.g. `ocir.<region>.oci.oraclecloud.com` |

**Container auth**

| Input | Default | Description |
|-------|---------|-------------|
| `ocir_login` | `true` | Write `~/.docker/config.json` automatically so subsequent steps can run `docker`/`podman`/kaniko without a separate login step. Set to `false` to skip. |

> When none of the OCIR inputs are set, OCIR export is silently skipped. When some but not all individual inputs are set, the action fails with a descriptive error.

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

`v1` remains the GitHub-only release line. `v2` is the shared TypeScript implementation used by both the GitHub Action and the GitLab CLI bootstrap.

| Reference | Meaning |
|-----------|---------|
| `@v2` | Latest patch/minor in the v2 major line *(recommended)* |
| `@v2.0.0` | Exact version pin |
| `@main` | Tip of the default branch — may include breaking changes |

> **v1 users** — `@v1` continues to work. Migrate to `@v2` to get GitLab CI support and the shared TypeScript implementation.

---

## Security

- All sensitive values (`client_id`, `client_secret`, UPST token, `OCIR_PASSWORD`) are immediately masked in the log via `::add-mask::` (GitHub Actions) or should be marked Masked in GitLab CI variables.
- The ephemeral RSA key pair generated for the UPST exchange is discarded after writing to `~/.oci/` and never leaves the runner.
- No credentials are committed to source control.
- OCI credentials are written only to runner-local files under `~/.oci/`.

---

## Examples

The [`examples/`](examples/) folder contains:

- [`oci-oidc-configuration/`](examples/oci-oidc-configuration/) — Terraform module to provision the OCI IDCS app, OIDC service user, OCIR auth-token user, IAM policy, and Identity Propagation Trusts for GitHub and/or GitLab
- [`gitlab/.gitlab-ci.yml`](examples/gitlab/.gitlab-ci.yml) — GitLab CI example using `scripts/setup-gitlab.sh`
- [`github/basic-oci-cli.yml`](examples/github/basic-oci-cli.yml) — GitHub Actions OCI CLI example
- [`github/terraform.yml`](examples/github/terraform.yml) — GitHub Actions Terraform example
- [`github/ocir-push.yml`](examples/github/ocir-push.yml) — GitHub Actions build-and-push to OCIR with Docker, Podman, or Kaniko

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## License

[MIT](LICENSE)
