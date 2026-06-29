# Ready-to-use unified secret for both OCI and OCIR access.
# GitHub: the module writes this automatically as OCI_OIDC_CONFIG in each repo
#   when github.create_secrets = true (the default).
# GitLab: base64-encode it and store as OCI_OIDC_CONFIG_B64:
#   terraform output -raw ci_oidc_config_json | base64 -w0
output "ci_oidc_config_json" {
  description = "Ready-to-use JSON value for the OCI_OIDC_CONFIG CI secret (OCI + OCIR unified)."
  sensitive   = true
  value       = module.oci_oidc_federation.ci_oidc_config_json
}

output "iam_group_ocid" {
  description = "OCID of the Identity Domains group shared by all CI platforms."
  value       = module.oci_oidc_federation.iam_group_ocid
}

output "github_subject_claims" {
  description = "Subject claims registered in the GitHub Actions trust."
  value       = module.oci_oidc_federation.github_subject_claims
}

output "gitlab_subject_claims" {
  description = "Subject claims registered in the GitLab CI trust (empty when gitlab ∉ ci_platforms)."
  value       = module.oci_oidc_federation.gitlab_subject_claims
}

output "gitlab_oidc_audience" {
  description = "Audience for .gitlab-ci.yml id_tokens.OCI_OIDC_TOKEN.aud (null when gitlab ∉ ci_platforms)."
  value       = module.oci_oidc_federation.gitlab_oidc_audience
}
