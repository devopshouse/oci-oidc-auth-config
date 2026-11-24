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
| **GitHub Actions** | `uses: devopshouse/oci-oidc-auth-config@v2` - Node 24 action | `v2` |
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

The secret holds the OCI configuration of the service accounts the workflow may use. It comes in two formats, and `config_json` accepts either:

| Format | Secret value | Workflow |
|--------|--------------|----------|
| **Flat** | The six OCI fields of one account | `config_json` only |
| **Map** | An object keyed by service account name, each value holding the six OCI fields | `config_json` and `service_account` with the exact key |

**Flat** (one account per secret):

```json
{
  "oci_idcs_endpoint": "https://<domain>.identity.oraclecloud.com",
  "oci_client_id": "<confidential-app-client-id>",
  "oci_client_secret": "<confidential-app-client-secret>",
  "oci_region": "sa-saopaulo-1",
  "oci_tenancy_id": "ocid1.tenancy.oc1..<unique-id>",
  "oci_compartment_id": "ocid1.compartment.oc1..<unique-id>"
}
```

**Map** (several accounts in one secret; this one has `ci` and `deploy`):

```json
{
  "ci": {
    "oci_idcs_endpoint": "https://<domain>.identity.oraclecloud.com",
    "oci_client_id": "<ci-client-id>",
    "oci_client_secret": "<ci-client-secret>",
    "oci_region": "sa-saopaulo-1",
    "oci_tenancy_id": "ocid1.tenancy.oc1..<unique-id>",
    "oci_compartment_id": "ocid1.compartment.oc1..<unique-id>"
  },
  "deploy": {
    "oci_idcs_endpoint": "https://<domain>.identity.oraclecloud.com",
    "oci_client_id": "<deploy-client-id>",
    "oci_client_secret": "<deploy-client-secret>",
    "oci_region": "sa-saopaulo-1",
    "oci_tenancy_id": "ocid1.tenancy.oc1..<unique-id>",
    "oci_compartment_id": "ocid1.compartment.oc1..<other-compartment-id>"
  }
}
```

Create a GitHub Actions secret named `OCI_OIDC_CONFIG` and paste the JSON object as its value. With a map, select the account in the workflow:

```yaml
- name: Setup OCI OIDC Auth
  uses: devopshouse/oci-oidc-auth-config@v2
  with:
    config_json: ${{ secrets.OCI_OIDC_CONFIG }}
    service_account: deploy
```

How the choice is resolved:

- With `service_account`, the action picks that exact key from the map and fails before requesting a token when the secret is not a map, the key is missing or the entry lacks one of the six fields.
- Without `service_account`, `config_json` must be flat. A map without a selector fails the field validation.
- Without `config_json`, the action reads the six individual `oci_*` inputs.
- A flat `config_json` takes precedence over individual inputs.

The secret picks the OCI client credentials; it does not pick the identity. OCI maps the GitHub token of the running workflow (repository, ref or reusable workflow) to a service user through the trust rules of the federation, so a workflow that selects an account its token is not mapped to is rejected with `No rules matched`. Even so, every workflow that can read a map secret reads all the accounts in it: publish each account only to the repositories its trust authorizes.

The [`terraform-oci-oidc-federation`](https://github.com/devopshouse/terraform-oci-oidc-federation) module publishes the secret for you. `secret_format = "flat"` (the default) writes one secret per account, and `secret_format = "map"` writes one `OCI_OIDC_CONFIG` per repository or organization with every account that targets it. To publish by hand, wrap a flat output under its account name:

```sh
terraform output -raw ci_oidc_config_json |
  jq -c '{ci: .}' |
  gh secret set OCI_OIDC_CONFIG --repo OWNER/REPO
```

For an organization secret, use `gh secret set OCI_OIDC_CONFIG --org OWNER --repos REPO1,REPO2`. A repository secret takes precedence over an organization secret with the same name, so a repository secret must carry every account its workflows use. When you change a secret from flat to map, change the workflows that read it in the same step, because a flat reader cannot parse a map.

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
      service_account: ci

  - name: List compute instances
    run: oci compute instance list
```

### Using a flat JSON secret

Publish the single-account output directly and omit `service_account`:

```sh
terraform output -raw ci_oidc_config_json |
  gh secret set OCI_OIDC_CONFIG --repo OWNER/REPO
```

```yaml
- name: Setup OCI OIDC Auth
  uses: devopshouse/oci-oidc-auth-config@v2
  with:
    config_json: ${{ secrets.OCI_OIDC_CONFIG }}
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
      service_account: ci

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
          service_account: ci

      - uses: hashicorp/setup-terraform@v4

      - run: terraform init -input=false

      - run: |
          terraform apply -auto-approve -input=false \
            -var="region=${{ steps.oci.outputs.oci_region }}" \
            -var="compartment_id=${{ steps.oci.outputs.oci_compartment_id }}"
```

### With OCIR (Docker / Podman / BuildKit)

With `ocir_login: "true"` the action derives the registry host from `oci_region`, reads the tenancy namespace, gets a short-lived Docker bearer token through the UPST, exports `OCIR_REGISTRY`, `OCIR_URL`, `DOCKER_CONFIG` and `REGISTRY_AUTH_FILE` to `GITHUB_ENV` and writes `~/.docker/config.json`. No separate login step, long-lived OCIR auth token or `ocir_*` field is needed; the identity behind `config_json` must hold the OCIR repository permissions. The login is off by default: jobs that only call the OCI API do not need it and the identity does not need registry permissions.

**Docker / Podman**

```yaml
- name: Setup OCI OIDC Auth
  uses: devopshouse/oci-oidc-auth-config@v2
  with:
    config_json: ${{ secrets.OCI_OIDC_CONFIG }}
    service_account: ci
    ocir_login: "true"   # writes ~/.docker/config.json automatically.

# No docker login / podman login step needed.
- name: Build and push
  run: |
    docker build -t "$OCIR_URL/myapp:$GITHUB_SHA" .
    docker push "$OCIR_URL/myapp:$GITHUB_SHA"
```

`docker build` already uses BuildKit on GitHub-hosted runners. On Kubernetes-based runners without privileged container builds, Podman `build` can fail at runtime setup (`fuse-overlayfs` / `ping_group_range`); use a BuildKit sidecar there.

**BuildKit sidecar** (rootless, no Docker daemon in the build step; the replacement for Kaniko, which is deprecated)

Run `buildkitd` rootless next to the runner container in the same pod and point a `remote` buildx builder at its loopback address. The runner builds with `docker/build-push-action` and the registry credentials written by the action; BuildKit never sees a long-lived secret.

```yaml
- name: Setup OCI OIDC Auth
  uses: devopshouse/oci-oidc-auth-config@v2
  with:
    config_json: ${{ secrets.OCI_OIDC_CONFIG }}
    service_account: ci
    ocir_login: "true"

# BuildKit listens on the pod loopback: 127.0.0.1 is only reachable from the runner container.
- name: Use the BuildKit sidecar
  run: docker buildx create --name remote --driver remote --use tcp://127.0.0.1:1234

- name: Build and push
  uses: docker/build-push-action@v7
  with:
    context: .
    push: true
    tags: ${{ env.OCIR_URL }}/myapp:${{ github.sha }}
    cache-from: type=registry,ref=${{ env.OCIR_URL }}/myapp/cache:buildcache
    cache-to: type=registry,ref=${{ env.OCIR_URL }}/myapp/cache:buildcache,mode=max,image-manifest=true,oci-mediatypes=true
```

The address and the sidecar come from your runner pod spec (for example an init container with `restartPolicy: Always` running `buildkitd --addr tcp://127.0.0.1:1234 --oci-worker-no-process-sandbox`); if the runner already creates the builder at start, skip the `buildx create` step. The TCP endpoint has no TLS, so keep it on the loopback of the pod. The cache repository `myapp/cache` must exist in OCIR, and `image-manifest=true,oci-mediatypes=true` is what OCIR accepts for registry cache.

> Docker and Podman are pre-installed on `ubuntu-latest` runners. See [`examples/github/ocir-push.yml`](examples/github/ocir-push.yml) for complete jobs with Docker, Podman and BuildKit.

See the [`examples/github/`](examples/github/) folder for more ready-to-use workflow examples.

---

## GitLab CI usage

GitLab CI cannot execute GitHub Actions directly. Instead, use one of two scripts depending on the job:

- `setup-gitlab.sh` for OCI CLI auth and OCIR login (Ubuntu-based jobs and the `podman-oci` image; `kaniko-oci` is deprecated with Kaniko)
- `setup-kaniko-auth.sh` (legacy) only for JSON blobs that still carry `ocir_*` credentials, on images without Node.js; new setups use the `kaniko-oci` image with `setup-gitlab.sh`

The recommended way to choose which remote revision to fetch is `OCI_OIDC_AUTH_VERSION`
with a tag such as `v1` or `v2`.

### Prerequisites

1. Run the Terraform in [`examples/oci-oidc-configuration/`](examples/oci-oidc-configuration/) with `"gitlab"` in `ci_platforms` and the project paths in `service_accounts[*].gitlab.projects`. This creates the Identity Propagation Trust in OCI IDCS for GitLab.

2. Add a single masked CI/CD variable to your GitLab project or group (**Settings → CI/CD → Variables**):

   | Variable | Description |
   |----------|-------------|
   | `OCI_OIDC_CONFIG_B64` | Base64-encoded output of `terraform output -raw ci_oidc_config_json \| base64 -w0`. Contains all OCI fields in a single JSON blob. |

   `setup-gitlab.sh` reads `OCI_OIDC_CONFIG_B64` (or `OCI_OIDC_CONFIG` for plain JSON), logs in to OCIR with a short-lived bearer token, and exports `OCIR_REGISTRY`, `OCIR_URL`, `DOCKER_CONFIG` and `REGISTRY_AUTH_FILE` to the generated env file.

   The GitLab scripts read a flat JSON only. The map format and `service_account` are specific to the GitHub Action. You can still fall back to the six individual `OCI_*` variables, but the unified blob avoids JSON escaping issues.

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

See [`examples/gitlab/.gitlab-ci.yml`](examples/gitlab/.gitlab-ci.yml) for the full annotated example. It keeps three paths independent: one Ubuntu job uses `setup-gitlab.sh` to run `oci`, and one job each on the `kaniko-oci` and `podman-oci` images uses `setup-gitlab.sh` to log in to OCIR. The example declares `OCI_AUTH_BASE_URL` from `OCI_OIDC_AUTH_VERSION` to keep the script calls short.

### GitLab with OCIR credentials

No OCIR secret is needed: `setup-gitlab.sh` gets a short-lived bearer token through the UPST and writes container auth automatically (`~/.docker/config.json`, or `/kaniko/.docker/config.json` in the `kaniko-oci` image through `DOCKER_CONFIG`). The `podman-oci` image builds and pushes without a Docker daemon, so the job needs no `docker:dind` service and no `DOCKER_*` variables:

```yaml
ocir-push:
  image:
    name: ghcr.io/devopshouse/podman-oci:latest
    entrypoint: [""]

  id_tokens:
    OCI_OIDC_TOKEN:
      aud: https://cloud.oracle.com

  script:
    # Resolves OCI + OCIR, writes ~/.docker/config.json, exports OCIR_URL.
    - source <(curl -sSfL "https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/${OCI_OIDC_AUTH_VERSION:-v2}/scripts/setup-gitlab.sh")
    - podman build -t "$OCIR_URL/myimage:$CI_COMMIT_SHA" .
    - podman push "$OCIR_URL/myimage:$CI_COMMIT_SHA"
```

Store `OCI_OIDC_CONFIG_B64` as a masked variable (OCI fields only); `OCI_CLI_AUTH` is set by the script. Set `aud` to the audience configured in the OCI trust (the `gitlab_oidc_audience` output of the module). The runner needs `hostUsers: false` in the pod spec and nodes with kernel 5.12 or newer for rootless Podman; see [`examples/gitlab/.gitlab-ci.yml`](examples/gitlab/.gitlab-ci.yml).

To skip writing the auth file (e.g. you only need the `OCIR_*` env vars), set `OCIR_LOGIN=false`.

### GitLab environment file

`setup-gitlab.sh` writes shell exports to `OCI_AUTH_ENV_FILE` (default `$HOME/.oci-auth.env`) and then sources that file automatically when you use `source <(curl ...)`, so subsequent lines in the same Ubuntu job can use `oci` and registry auth immediately.

`setup-kaniko-auth.sh` (legacy: it requires `ocir_*` keys in the blob) writes `/kaniko/.docker/config.json` and also writes the resolved `OCIR_*` values to `OCI_AUTH_ENV_FILE` (default `$HOME/.oci-auth.env`). When using the pipe form inside the Kaniko job, add `. "$HOME/.oci-auth.env"` after the helper so `OCIR_URL` is available for `/kaniko/executor`.

If you still prefer `curl | bash` with `setup-gitlab.sh`, the variables do **not** propagate — add `. "$HOME/.oci-auth.env"` manually after the pipe.

Remote source URL:

`https://raw.githubusercontent.com/devopshouse/oci-oidc-auth-config/${OCI_OIDC_AUTH_VERSION}`

Default: `OCI_OIDC_AUTH_VERSION=v2`

---

## Action inputs (GitHub Actions)

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `config_json` | No | — | The `OCI_OIDC_CONFIG` secret: flat OCI configuration or a map keyed by service account name. Takes precedence over individual inputs. |
| `service_account` | For maps | — | Exact key to select from a map. Omit for flat JSON or individual inputs. |
| `oidc_audience` | No | `https://cloud.oracle.com` | Audience claim requested in the GitHub OIDC token. |
| `oci_profile` | No | `DEFAULT` | OCI config profile name written to `~/.oci/config`. |

Provide all six OCI fields shown in the individual-input example when `config_json` is omitted.

### OCIR login

| Input | Default | Description |
|-------|---------|-------------|
| `ocir_login` | `false` | Set to `true` to log in to OCIR with a short-lived bearer token derived from the UPST: exports `OCIR_REGISTRY`, `OCIR_URL`, `DOCKER_CONFIG` and `REGISTRY_AUTH_FILE` to `GITHUB_ENV` and writes `~/.docker/config.json` (readable by docker, podman and buildx). `@v1` had no registry login, so jobs that only call the OCI API need nothing. |

There are no `ocir_username`, `ocir_password` or `ocir_url` inputs, and `ocir_*` keys in `config_json` are ignored.

---

## Action outputs (GitHub Actions)

| Output | Description |
|--------|-------------|
| `oci_region` | OCI region identifier |
| `oci_tenancy_id` | Tenancy OCID |
| `oci_compartment_id` | Compartment OCID |
| `oci_idcs_endpoint` | IDCS identity domain URL |
| `ocir_registry` | OCIR registry host, e.g. `gru.ocir.io` (only when `ocir_login` is true) |
| `ocir_url` | OCIR registry host with the tenancy namespace, e.g. `gru.ocir.io/<namespace>` (only when `ocir_login` is true) |

---

## Releases and versioning

This action follows [Semantic Versioning](https://semver.org/).

`v1` remains the GitHub-only release line. `v2` is the shared TypeScript implementation used by both the GitHub Action and the GitLab CLI bootstrap.

| Reference | Meaning |
|-----------|---------|
| `@v2` | Latest patch/minor in the v2 major line |
| `@v2.0.0` | Exact version pin |

> **v1 users** — `@v1` continues to work. Migrate to `@v2` to get GitLab CI support and the shared TypeScript implementation.

---

## Security

- All sensitive values (`client_id`, `client_secret`, UPST token, OCIR bearer token) are immediately masked in the log via `::add-mask::` (GitHub Actions) or should be marked Masked in GitLab CI variables.
- The ephemeral RSA key pair generated for the UPST exchange is discarded after writing to `~/.oci/` and never leaves the runner.
- No credentials are committed to source control.
- OCI credentials are written only to runner-local files under `~/.oci/`.

---

## Examples

The [`examples/`](examples/) folder contains:

- [`oci-oidc-configuration/`](examples/oci-oidc-configuration/) — Terraform example that calls the `terraform-oci-oidc-federation` module to provision the Identity Domain, service accounts with IAM policies, the OCI IDCS app and the Identity Propagation Trusts for GitHub and/or GitLab
- [`gitlab/.gitlab-ci.yml`](examples/gitlab/.gitlab-ci.yml) — GitLab CI example using `scripts/setup-gitlab.sh`
- [`github/basic-oci-cli.yml`](examples/github/basic-oci-cli.yml) — GitHub Actions OCI CLI example
- [`github/terraform.yml`](examples/github/terraform.yml) — GitHub Actions Terraform example
- [`github/ocir-push.yml`](examples/github/ocir-push.yml) — GitHub Actions build-and-push to OCIR with Docker, Podman or a BuildKit sidecar

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## License

[MIT](LICENSE)
