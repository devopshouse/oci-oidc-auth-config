# Examples — OCI OIDC Auth Config

This folder contains working examples that demonstrate how to use
[`devopshouse/oci-oidc-auth-config`](https://github.com/devopshouse/oci-oidc-auth-config).

---

## Contents

| Path | Description |
|------|-------------|
| [`oci-oidc-configuration/`](oci-oidc-configuration/) | Terraform module to provision the OCI IDCS app, service user, and IAM policy required by this action; includes notes for OCIR auth-token users |
| [`github/basic-oci-cli.yml`](github/basic-oci-cli.yml) | Copy-paste workflow — OCI CLI with keyless auth |
| [`github/terraform.yml`](github/terraform.yml) | Copy-paste workflow — Terraform plan/apply with OCI provider |
| [`github/ocir-push.yml`](github/ocir-push.yml) | Copy-paste workflow — build and push to OCIR with Docker, Podman, or Kaniko |

---

## Quick start

### 1. Provision the OCI prerequisites

Use the [`oci-oidc-configuration/`](oci-oidc-configuration/) Terraform module to create the IDCS confidential application, service user, identity propagation trust, OCIR auth-token user, and IAM policy in your tenancy.

After applying, the module writes `OCI_OIDC_CONFIG` to each GitHub repository automatically (`github.create_secrets = true` by default). To retrieve the value manually:

```sh
terraform output -raw ci_oidc_config_json
```

For GitLab CI, base64-encode it and store as `OCI_OIDC_CONFIG_B64`:

```sh
terraform output -raw ci_oidc_config_json | base64 -w0
```

The unified secret contains both OCI connection fields and OCIR credentials — no separate OCIR secret needed.

### 2. Set the `OCI_OIDC_CONFIG` secret

For GitHub Actions, the module sets `OCI_OIDC_CONFIG` automatically. For GitLab, add `OCI_OIDC_CONFIG_B64` as a masked CI/CD variable.

See the main [README](../README.md#prerequisites) for full details.

### 3. Copy a workflow

Pick one of the example workflows from the [`github/`](github/) folder and copy it to `.github/workflows/` in your repository, then adjust the paths and branch names to match your project.
