# The oci_integration_config_json output is ready to paste as a GitHub Actions secret.
output "oci_integration_config_json" {
  description = "Ready-to-use JSON value for the OCI_CONFIG_JSON GitHub Actions secret."
  sensitive   = true
  value = jsonencode({
    oci_idcs_endpoint  = var.idcs_endpoint
    oci_client_id      = oci_identity_domains_app.github_actions_app.name
    oci_client_secret  = oci_identity_domains_app.github_actions_app.client_secret
    oci_region         = var.region
    oci_tenancy_id     = oci_identity_domains_app.github_actions_app.tenancy_ocid
    oci_compartment_id = var.compartment_id
  })
}

output "oci_client_id" {
  description = "OAuth client ID of the confidential app — maps to oci_client_id in the config JSON."
  value       = oci_identity_domains_app.github_actions_app.name
}

output "oci_client_secret" {
  description = "OAuth client secret — maps to oci_client_secret in the config JSON."
  value       = oci_identity_domains_app.github_actions_app.client_secret
  sensitive   = true
}

output "oci_tenancy_id" {
  description = "Tenancy OCID — maps to oci_tenancy_id in the config JSON."
  value       = oci_identity_domains_app.github_actions_app.tenancy_ocid
}

output "service_user_ocid" {
  description = "OCID of the service user configured for impersonation."
  value       = oci_identity_domains_user.github_service_user.ocid
}

output "github_subject_claims" {
  description = "OIDC sub claims registered in the Identity Propagation Trust."
  value       = local.github_sub_claims
}
