# Provision OCI OIDC workload identity federation using the
# devopshouse/terraform-oci-oidc-federation module.
#
# This creates:
#   - An IDCS service user for OIDC impersonation
#   - A dedicated OCIR user with an auth token
#   - An IAM group containing both users
#   - An IDCS confidential application for the token-exchange flow
#   - Identity Propagation Trust(s) for GitHub Actions and/or GitLab CI
#   - An IAM policy granting the group access to the compartment
#   - The OCI_OIDC_CONFIG GitHub Actions secret in each repository
#     (when github.create_secrets = true, the default)
#
# After applying, capture the output:
#   terraform output -raw ci_oidc_config_json
#
# For GitHub: the module writes OCI_OIDC_CONFIG to each repo automatically.
# For GitLab: base64-encode the output and store it as OCI_OIDC_CONFIG_B64:
#   terraform output -raw ci_oidc_config_json | base64 -w0

module "oci_oidc_federation" {
  source = "git::https://github.com/devopshouse/terraform-oci-oidc-federation.git?ref=main"

  ci_platforms           = var.ci_platforms
  git_actions_group_name = var.git_actions_group_name
  github                 = var.github
  gitlab                 = var.gitlab

  oci_compartment_id        = var.oci_compartment_id
  oci_identity_domain_name  = var.oci_identity_domain_name
  oci_region                = var.oci_region
  oci_tenancy_id            = var.oci_tenancy_id
  oci_service_user_name     = var.oci_service_user_name
  ocir_allowed_repositories = var.ocir_allowed_repositories
}
