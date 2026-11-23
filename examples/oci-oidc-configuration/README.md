# OCI OIDC Configuration Example

This Terraform example provisions the OCI Identity Domain application, OIDC identity propagation trusts, service user, IAM group and IAM policy used by `devopshouse/oci-oidc-auth-config`. It consumes the `devopshouse/terraform-oci-oidc-federation` module at `?ref=feat/service-accounts-v2`.

## Identity Model

The module creates one identity per entry of `service_accounts`. This example defines the account `ci`:

| Resource | Purpose |
|----------|---------|
| Service user `svc-<name_prefix>-ci` | Impersonated by GitHub Actions or GitLab CI through OIDC identity propagation |
| Group `g-<name_prefix>-ci` | Receives the IAM policy |
| Confidential application `<name_prefix>-ci-app` | Token exchange; its client id and secret go into the CI JSON |
| Identity Propagation Trusts | Map GitHub and GitLab subjects to the service user |

Identity Domain service users cannot hold API keys or auth tokens. A regular user for local runs or for an OCIR docker login goes in `local_user` of the account; it joins the account group.

## CI JSON

`ci_oidc_config_json` has the six keys the action reads:

```json
{
  "oci_idcs_endpoint": "https://idcs-<id>.identity.oraclecloud.com",
  "oci_client_id": "<application-client-id>",
  "oci_client_secret": "<application-client-secret>",
  "oci_region": "<region>",
  "oci_tenancy_id": "<tenancy-ocid>",
  "oci_compartment_id": "<compartment-ocid>"
}
```

The action logs in to OCIR with a bearer token obtained through the same identity (UPST); the JSON carries no registry credentials. `ocir` rules in a service account grant the registry permissions through the IAM policy.

## GitHub and GitLab Handling

**GitHub Actions:** the module writes `OCI_OIDC_CONFIG` to each repository listed in `github_repositories`. Each repository must be authorized in the trust, which this example does with the same list.

**GitLab CI:** base64-encode the output and store it as a masked `OCI_OIDC_CONFIG_B64` CI/CD variable:

```sh
terraform output -raw ci_oidc_config_json | base64 -w0
```

`setup-gitlab.sh` reads `OCI_OIDC_CONFIG_B64` and exports `OCIR_URL`. Set `id_tokens.OCI_OIDC_TOKEN.aud` to the `gitlab_oidc_audience` output.
