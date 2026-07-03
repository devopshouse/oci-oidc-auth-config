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
  description = "OCID of the compartment where CI resources will be created."
}

variable "oci_profile" {
  type        = string
  description = "OCI CLI config file profile used to provision resources."
  default     = "DEFAULT"
}

variable "oci_identity_domain_name" {
  type        = string
  description = "Display name of the Identity Domain (e.g., Default)."
  default     = "Default"
}

variable "oci_service_user_name" {
  type        = string
  description = "Username for the OCI Identity Domain service user created for CI OIDC impersonation."
  default     = "svc-ci-oidc"
}

variable "git_actions_group_name" {
  type        = string
  description = "IAM group name shared by all CI platforms federated via OIDC."
  default     = "g-ci-oidc"
}

variable "ci_platforms" {
  type        = list(string)
  description = "CI platforms federated via OIDC. Allowed values: github, gitlab."
  default     = ["github"]
}

variable "github" {
  type = object({
    branch       = optional(string, "main")
    repositories = optional(list(object({
      path = string
      ref  = optional(string, null) # overrides github.branch for this repo
    })), [])
    create_secrets = optional(bool, true)
  })
  description = "GitHub Actions OIDC configuration."
  default     = {}
}

variable "gitlab" {
  type = object({
    issuer    = optional(string, "")
    audience  = optional(string, "https://cloud.oracle.com")
    ref       = optional(string, "main")
    ref_type  = optional(string, "branch")
    projects  = optional(any, []) # list(string) or list(object({path,ref?,ref_type?}))
    public_key_endpoint = optional(string, null)
  })
  description = "GitLab CI OIDC configuration. Required when \"gitlab\" ∈ ci_platforms."
  default     = {}
}

variable "ocir_allowed_repositories" {
  type        = list(string)
  description = "OCIR repository names the OCIR user may push/pull. Empty allows broad access in the compartment."
  default     = []
}

variable "github_owner" {
  type        = string
  description = "GitHub organisation or user that owns the repositories. Used to configure the GitHub provider."
  default     = ""
}
