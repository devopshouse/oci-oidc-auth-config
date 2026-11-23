# GitHub: the module writes this JSON as OCI_OIDC_CONFIG in each secret repository.
# GitLab: base64-encode it and store it as OCI_OIDC_CONFIG_B64:
#   terraform output -raw ci_oidc_config_json | base64 -w0
output "ci_oidc_config_json" {
  description = "JSON for the OCI_OIDC_CONFIG CI secret of the ci account."
  sensitive   = true
  value       = module.oci_oidc_federation.ci_oidc_config_json
}

output "github_secret_targets" {
  description = "account/owner/repo destinations of the published GitHub Actions secret."
  value       = module.oci_oidc_federation.github_secret_targets
}

output "gitlab_oidc_audience" {
  description = "Audience for .gitlab-ci.yml id_tokens.OCI_OIDC_TOKEN.aud (null when gitlab is not in ci_platforms)."
  value       = module.oci_oidc_federation.gitlab_oidc_audience
}
