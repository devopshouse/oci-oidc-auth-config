# Examples — OCI OIDC Auth Config

This folder contains working examples that demonstrate how to use
[`devopshouse/oci-oidc-auth-config`](https://github.com/devopshouse/oci-oidc-auth-config).

---

## Contents

| Path | Description |
|------|-------------|
| [`oci-oidc-configuration/`](oci-oidc-configuration/) | Terraform module to provision the OCI IDCS app, service user, and IAM policy required by this action |
| [`main.tf`](main.tf) | Terraform module used by the internal integration test (lists availability domains and compute instances) |
| [`workflows/basic-oci-cli.yml`](workflows/basic-oci-cli.yml) | Copy-paste workflow — OCI CLI with keyless auth |
| [`workflows/terraform.yml`](workflows/terraform.yml) | Copy-paste workflow — Terraform plan/apply with OCI provider |

---

## Quick start

### 1. Provision the OCI prerequisites

Use the [`oci-oidc-configuration/`](oci-oidc-configuration/) Terraform module to create the IDCS confidential application, service user, identity propagation trust, and IAM policy in your tenancy.

After applying, capture the `oci_integration_config_json` output — that is the value for your GitHub secret.

### 2. Create the `OCI_CONFIG_JSON` secret

In your repository go to **Settings → Secrets and variables → Actions → New repository secret** and add a secret named `OCI_CONFIG_JSON` with the following JSON structure:

```json
{
  "oci_idcs_endpoint":  "https://<domain>.identity.oraclecloud.com",
  "oci_client_id":      "<OAuth2 client ID>",
  "oci_client_secret":  "<OAuth2 client secret>",
  "oci_region":         "sa-saopaulo-1",
  "oci_tenancy_id":     "ocid1.tenancy.oc1..<...>",
  "oci_compartment_id": "ocid1.compartment.oc1..<...>"
}
```

See the main [README](../README.md#prerequisites) for full details.

### 3. Copy a workflow

Pick one of the example workflows from the [`workflows/`](workflows/) folder and copy it to `.github/workflows/` in your repository, then adjust the paths and branch names to match your project.
