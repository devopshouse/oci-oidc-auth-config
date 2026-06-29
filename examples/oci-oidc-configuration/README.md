# OCI OIDC Configuration Example

This Terraform example provisions the OCI Identity Domain application, OIDC identity propagation trust, service user, OCIR auth-token user, group membership, and IAM policy used by `devopshouse/oci-oidc-auth-config`.

## Identity Model

The OIDC flow and OCIR auth-token flow use different OCI Identity Domain users:

| User | Purpose | User type |
|------|---------|-----------|
| `service_user_name` | Impersonated by GitHub Actions or GitLab CI through OIDC identity propagation | Service user |
| `<service_user_name>-ocir` | Owns the OCIR auth token used by Docker or other registry clients | Non-service user |

Do not create the OCIR auth token on `service_user_name`. Identity Domain service users are valid for OIDC impersonation, but auth tokens are supported on regular, non-service users. The OCIR user should be named from the service user name, for example `svc-github-actions-oidc-ocir`, so the relationship is obvious without mixing the two credential models.

The OCIR user must be a member of the same IAM group as the OIDC service user. In this example that group is `iam_group_name`, which defaults to `g-github-actions`. Sharing the group lets the OCIR user inherit the registry permissions granted by the IAM policy while the OIDC service user continues to handle CI impersonation.

The `terraform-oci-oidc-federation` module creates the OCIR user internally and emits all credentials as part of the unified `ci_oidc_config_json` output.

## OCIR credentials

The OCIR fields inside `ci_oidc_config_json` are a portable representation of the registry login values:

```json
{
  "ocir_username": "<namespace>/<ocir-user-name>",
  "ocir_password": "<auth-token>",
  "ocir_url": "ocir.<region>.oci.oraclecloud.com/<namespace>",
  "ocir_registry": "ocir.<region>.oci.oraclecloud.com"
}
```

Use these exact formats:

```text
OCIR_USERNAME=<namespace>/<ocir-user-name>
OCIR_PASSWORD=<auth-token>
OCIR_URL=ocir.<region>.oci.oraclecloud.com/<namespace>
OCIR_REGISTRY=ocir.<region>.oci.oraclecloud.com
```

`OCIR_URL` and `OCIR_REGISTRY` do not include an `https://` prefix. The registry host is `ocir.<region>.oci.oraclecloud.com`, not the regional OCI API endpoint.

> **Note:** The `devopshouse/terraform-oci-oidc-federation` module emits lowercase keys (`ocir_username`, `ocir_password`, `ocir_url`) as part of the unified `ci_oidc_config_json` output. `ocir_registry` is optional — the action derives it automatically from the URL when absent.

## GitHub and GitLab Handling

**GitHub Actions:** The `terraform-oci-oidc-federation` module writes the `OCI_OIDC_CONFIG` secret to each repository automatically (`github.create_secrets = true` by default). The unified secret contains both OCI and OCIR credentials. No separate OCIR secret is needed.

**GitLab CI:** Base64-encode the unified output and store as a masked `OCI_OIDC_CONFIG_B64` CI/CD variable:

```sh
terraform output -raw ci_oidc_config_json | base64 -w0
```

`setup-gitlab.sh` and `setup-kaniko-auth.sh` both read `OCI_OIDC_CONFIG_B64` and export `OCIR_USERNAME`, `OCIR_PASSWORD`, `OCIR_URL`, and `OCIR_REGISTRY` automatically. The auth token belongs to `<oci_service_user_name>-ocir`.
