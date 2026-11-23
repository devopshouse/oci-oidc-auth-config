# Use your existing OCI credentials (API key or instance principal) to provision the federation
# resources. This is a one-time setup step: afterwards GitHub Actions and GitLab CI use OIDC,
# with no long-lived keys.
provider "oci" {
  region              = var.oci_region
  config_file_profile = var.oci_profile
}

# Required when "github" is in ci_platforms. Set GITHUB_TOKEN or configure a GitHub App.
provider "github" {
  owner = var.github_owner
}
