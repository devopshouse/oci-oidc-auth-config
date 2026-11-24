# OCI OIDC Configuration Example

This Terraform example provisions the OCI Identity Domain application, OIDC identity propagation trusts, service user, IAM group and IAM policy used by `devopshouse/oci-oidc-auth-config`. It consumes the [`devopshouse/terraform-oci-oidc-federation`](https://github.com/devopshouse/terraform-oci-oidc-federation) module at `?ref=v2`.

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

**GitHub Actions:** the module provisions the trust. This example sets `create_secrets = false`, so publish `OCI_OIDC_CONFIG` yourself. It is either a flat JSON or a map keyed by service account name. For a map with the `ci` key:

```sh
terraform output -raw ci_oidc_config_json |
  jq -c '{ci: .}' |
  gh secret set OCI_OIDC_CONFIG --repo OWNER/REPO
```

Use `service_account: ci` in the action. For a flat secret, publish the output as it is and omit `service_account`. For organization trust, publish the secret at organization level and select the repositories that should receive it.

To have `terraform apply` publish the secret, set `create_secrets = true` and list the repositories in `secret_repositories`. The module then writes one flat secret per account (`secret_format = "flat"`, the default) or one `OCI_OIDC_CONFIG` map per repository with every account that targets it (`secret_format = "map"`).

**GitLab CI:** base64-encode the output and store it as a masked `OCI_OIDC_CONFIG_B64` CI/CD variable:

```sh
terraform output -raw ci_oidc_config_json | base64 -w0
```

`setup-gitlab.sh` reads `OCI_OIDC_CONFIG_B64` and exports `OCIR_URL`. Set `id_tokens.OCI_OIDC_TOKEN.aud` to the `gitlab_oidc_audience` output.
