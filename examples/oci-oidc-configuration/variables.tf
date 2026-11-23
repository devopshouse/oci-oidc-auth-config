variable "oci_region" {
  type        = string
  description = "OCI region identifier (e.g. sa-saopaulo-1)."
}

variable "oci_tenancy_id" {
  type        = string
  description = "OCID of the OCI tenancy."
}

variable "oci_compartment_id" {
  type        = string
  description = "OCID of the compartment granted to the CI identity."
}

variable "oci_profile" {
  type        = string
  description = "OCI CLI config file profile used to provision resources."
  default     = "DEFAULT"
}

variable "oci_identity_domain_name" {
  type        = string
  description = "Display name of the existing Identity Domain that receives the CI identities."
  default     = "Default"
}

variable "name_prefix" {
  type        = string
  description = "Prefix of the generated user, group, application and policy names."
  default     = "ci"
}

variable "ci_platforms" {
  type        = list(string)
  description = "CI platforms federated via OIDC. Allowed values: github, gitlab."
  default     = ["github"]
}

variable "github_owner" {
  type        = string
  description = "GitHub organisation or user that owns the repositories; configures the GitHub provider."
}

variable "github_repositories" {
  type        = list(string)
  description = "owner/repo paths authorized to impersonate the identity; each also receives the OCI_OIDC_CONFIG secret."
  default     = []
}

variable "github_organizations" {
  type        = list(string)
  description = "Organizations whose every repository and ref may impersonate the identity; the one equal to github_owner also receives the secret at organization level (private repositories)."
  default     = []
}

variable "github_create_secrets" {
  type        = bool
  description = "false keeps the trust and publishes no GitHub Actions secret (repository or organization)."
  default     = true
}

variable "github_refs" {
  type        = list(string)
  description = "Full refs accepted for every repository; [\"*\"] accepts any ref."
  default     = ["refs/heads/main"]
}

variable "gitlab_oidc" {
  type = object({
    issuer              = optional(string, "")
    audience            = optional(string, "https://cloud.oracle.com")
    public_key_endpoint = optional(string)
  })
  description = "GitLab issuer and pipeline audience; required when ci_platforms includes gitlab."
  default     = {}
}

variable "gitlab_project_refs" {
  type = list(object({
    path     = string
    ref      = optional(string)
    ref_type = optional(string)
  }))
  description = "GitLab projects authorized to impersonate the identity; ref and ref_type default to main and branch."
  default     = []
}
