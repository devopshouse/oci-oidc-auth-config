# Use your existing OCI credentials (API key or instance principal) to
# provision the federation resources. This is a one-time setup step — after
# applying, GitHub Actions and GitLab CI use OIDC (no long-lived keys).
provider "oci" {
  region              = var.oci_region
  config_file_profile = var.oci_profile
}

# The GitHub provider is required when "github" ∈ ci_platforms and
# github.create_secrets = true (the default). Set GITHUB_TOKEN env var or
# pass a token via the provider block below.
provider "github" {
  owner = var.github_owner != "" ? var.github_owner : null
  # token = var.github_token  # or export GITHUB_TOKEN=<pat>
}
