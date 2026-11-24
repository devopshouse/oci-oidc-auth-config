# Provision OCI OIDC workload identity federation with the
# devopshouse/terraform-oci-oidc-federation module.
#
# One service account ("ci") creates:
#   - a service user, an IAM group and a confidential application for the token exchange
#   - Identity Propagation Trusts for GitHub Actions and/or GitLab CI
#   - an IAM policy granting the group access to the compartment
#
# The OCI_OIDC_CONFIG GitHub secret is published by hand after apply (see README.md).
# To let the module publish it, set create_secrets = true and secret_repositories on the
# account, and secret_format = "map" on the module for one map secret per repository.

module "oci_oidc_federation" {
  source = "git::https://github.com/devopshouse/terraform-oci-oidc-federation.git?ref=v2"

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
        organizations  = var.github_organizations
        repositories   = [for path in var.github_repositories : { path = path, refs = var.github_refs }]
        create_secrets = false
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
