# Provision OCI OIDC workload identity federation with the
# devopshouse/terraform-oci-oidc-federation module.
#
# One service account ("ci") creates:
#   - a service user, an IAM group and a confidential application for the token exchange
#   - Identity Propagation Trusts for GitHub Actions and/or GitLab CI
#   - an IAM policy granting the group access to the compartment
#   - the OCI_OIDC_CONFIG GitHub Actions secret in each repository of secret_repositories
#
# After applying, capture the JSON of the account:
#   terraform output -raw ci_oidc_config_json
#
# GitHub: the module writes OCI_OIDC_CONFIG to each secret repository.
# GitLab: base64-encode the output and store it as the masked variable OCI_OIDC_CONFIG_B64:
#   terraform output -raw ci_oidc_config_json | base64 -w0

module "oci_oidc_federation" {
  source = "git::https://github.com/devopshouse/terraform-oci-oidc-federation.git?ref=feat/service-accounts-v2"

  oci_tenancy_id           = var.oci_tenancy_id
  oci_compartment_id       = var.oci_compartment_id
  oci_region               = var.oci_region
  oci_identity_domain_name = var.oci_identity_domain_name
  github_owner             = var.github_owner
  name_prefix              = var.name_prefix

  ci_platforms            = var.ci_platforms
  default_service_account = "ci"
  gitlab_oidc             = var.gitlab_oidc

  service_accounts = {
    ci = {
      github = {
        repositories        = [for path in var.github_repositories : { path = path, refs = var.github_refs }]
        secret_repositories = var.github_repositories
      }
      gitlab = {
        project_refs = var.gitlab_project_refs
      }
      policies = {
        compartment = {
          compartment_id = var.oci_compartment_id
          statements     = ["manage all-resources in compartment id ${var.oci_compartment_id}"]
        }
      }
    }
  }
}
