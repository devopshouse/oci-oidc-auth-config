# Examples — OCI OIDC Auth Config

This folder contains working examples that demonstrate how to use
[`devopshouse/oci-oidc-auth-config`](https://github.com/devopshouse/oci-oidc-auth-config).

---

## Contents

| Path | Description |
|------|-------------|
| [`oci-oidc-configuration/`](oci-oidc-configuration/) | Terraform example that calls the `terraform-oci-oidc-federation` module to provision the Identity Domain, service accounts, IAM policies, IDCS app and trusts required by this action |
| [`github/basic-oci-cli.yml`](github/basic-oci-cli.yml) | Copy-paste workflow — OCI CLI with keyless auth |
| [`github/terraform.yml`](github/terraform.yml) | Copy-paste workflow — Terraform plan/apply with OCI provider |
| [`github/ocir-push.yml`](github/ocir-push.yml) | Copy-paste workflow — build and push to OCIR with Docker, Podman or a BuildKit sidecar |

---

## Quick start

### 1. Provision the OCI prerequisites

Use the [`oci-oidc-configuration/`](oci-oidc-configuration/) Terraform example to create the IDCS confidential application, service users, identity propagation trusts and IAM policies in your tenancy.

After applying, publish `OCI_OIDC_CONFIG`. The secret is either a flat JSON (one account) or a map keyed by service account name; the workflows in [`github/`](github/) assume a map with a `ci` key:

```sh
terraform output -raw ci_oidc_config_json |
  jq -c '{ci: .}' |
  gh secret set OCI_OIDC_CONFIG --repo OWNER/REPO
```

For a flat secret, publish the output as it is and remove `service_account` from the workflow:

```sh
terraform output -raw ci_oidc_config_json |
  gh secret set OCI_OIDC_CONFIG --repo OWNER/REPO
```

For GitLab CI, base64-encode the single-account output and store it as the masked `OCI_OIDC_CONFIG_B64` variable:

```sh
terraform output -raw ci_oidc_config_json | base64 -w0
```

See the main [README](../README.md#2-create-the-oci_oidc_config-secret) for the two formats, organization secrets and how the account is selected.

### 2. Copy a workflow

Pick one of the example workflows from the [`github/`](github/) folder and copy it to `.github/workflows/` in your repository, then adjust the paths and branch names to match your project.
