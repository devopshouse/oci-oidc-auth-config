terraform {
  required_version = ">= 1.5.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 8.0.0"
    }
  }
}

# Use your existing OCI credentials (API key or instance principal) to
# provision the IDCS resources. This is a one-time setup step — after
# applying, the GitHub Actions workflow uses OIDC (no long-lived keys).
provider "oci" {
  region              = var.region
  config_file_profile = var.oci_config_profile
}

locals {
  # Build OIDC sub claims for every repo/branch combination plus pull_request events.
  github_sub_claims = concat(
    [for repo in var.github_repositories : "repo:${repo}:ref:refs/heads/${var.github_branch}"],
    [for repo in var.github_repositories : "repo:${repo}:pull_request"]
  )
}

# ---------------------------------------------------------------------------
# IDCS — Service user
# ---------------------------------------------------------------------------
resource "oci_identity_domains_user" "github_service_user" {
  idcs_endpoint = var.idcs_endpoint
  schemas       = ["urn:ietf:params:scim:schemas:core:2.0:User"]
  user_name     = var.service_user_name

  name {
    formatted = var.service_user_name
  }

  urnietfparamsscimschemasoracleidcsextensionuser_user {
    service_user = true
  }

  lifecycle {
    ignore_changes = [schemas]
  }
}

# ---------------------------------------------------------------------------
# IDCS — Group
# ---------------------------------------------------------------------------
resource "oci_identity_domains_group" "github_actions_group" {
  idcs_endpoint = var.idcs_endpoint
  schemas       = ["urn:ietf:params:scim:schemas:core:2.0:Group"]
  display_name  = var.iam_group_name

  members {
    type  = "User"
    value = oci_identity_domains_user.github_service_user.id
  }

  lifecycle {
    ignore_changes = [schemas, members]
  }
}

# ---------------------------------------------------------------------------
# IDCS — Confidential Application (OAuth2 client)
# ---------------------------------------------------------------------------
resource "oci_identity_domains_app" "github_actions_app" {
  idcs_endpoint = var.idcs_endpoint
  display_name  = var.app_display_name
  description   = "Confidential Application used for GitHub Actions workload identity federation."

  based_on_template {
    value = var.confidential_app_template_id
  }

  active          = true
  client_type     = "confidential"
  is_oauth_client = true
  allowed_grants  = ["client_credentials"]

  schemas = [
    "urn:ietf:params:scim:schemas:oracle:idcs:App"
  ]

  lifecycle {
    ignore_changes = [schemas]
  }
}

# ---------------------------------------------------------------------------
# IDCS — Identity Propagation Trust (GitHub OIDC → OCI UPST)
# ---------------------------------------------------------------------------
resource "oci_identity_domains_identity_propagation_trust" "github_actions_trust" {
  idcs_endpoint = var.idcs_endpoint
  issuer        = "https://token.actions.githubusercontent.com"
  name          = "GitHub-Actions-Trust"
  description   = "Identity propagation trust for GitHub Actions OIDC."
  type          = "JWT"
  schemas       = ["urn:ietf:params:scim:schemas:oracle:idcs:IdentityPropagationTrust"]

  active              = true
  allow_impersonation = true
  public_key_endpoint = "https://token.actions.githubusercontent.com/.well-known/jwks"

  client_claim_name   = "sub"
  client_claim_values = local.github_sub_claims
  subject_claim_name  = "sub"
  subject_type        = "User"

  impersonation_service_users {
    rule  = "sub eq *"
    value = oci_identity_domains_user.github_service_user.id
  }

  oauth_clients = [oci_identity_domains_app.github_actions_app.name]

  tags {
    key   = "managed-by"
    value = "terraform"
  }

  lifecycle {
    # The OCI provider does not return impersonationServiceUsers on refresh, causing
    # false drift on every plan. Running apply is safe — it re-sets idempotently.
    ignore_changes = [tags]
  }
}

# ---------------------------------------------------------------------------
# IAM — Policy
# ---------------------------------------------------------------------------
resource "oci_identity_policy" "github_actions_policy" {
  compartment_id = var.tenancy_id
  name           = "p-${var.iam_group_name}"
  description    = "Allows ${var.iam_group_name} to manage resources in the target compartment."

  statements = [
    "allow group ${var.iam_group_name} to manage all-resources in compartment id ${var.compartment_id}",
    "allow group ${var.iam_group_name} to manage dynamic-groups in tenancy",
  ]
}

