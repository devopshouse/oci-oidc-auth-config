variable "region" {
  type        = string
  description = "OCI region identifier (e.g. sa-saopaulo-1)."
}

variable "oci_config_profile" {
  type        = string
  description = "OCI CLI config file profile used to provision resources."
  default     = "DEFAULT"
}

variable "idcs_endpoint" {
  type        = string
  description = "Identity Domain URL (e.g. https://idcs-<hash>.identity.oraclecloud.com)."
}

variable "tenancy_id" {
  type        = string
  description = "OCID of the OCI tenancy."
}

variable "compartment_id" {
  type        = string
  description = "OCID of the compartment where IAM policies will be created."
}

variable "github_repositories" {
  type        = list(string)
  description = "GitHub repositories allowed to federate, in 'org/repo' format."
  # example: ["my-org/my-repo", "my-org/another-repo"]
}

variable "github_branch" {
  type        = string
  description = "Git branch allowed in the GitHub OIDC sub claim."
  default     = "main"
}

variable "app_display_name" {
  type        = string
  description = "Display name for the IDCS confidential application."
  default     = "GitHub-Actions-Confidential-App"
}

variable "service_user_name" {
  type        = string
  description = "Username for the OCI Identity Domain service user created for GitHub Actions impersonation."
  default     = "svc-github-actions-oidc"
}

variable "iam_group_name" {
  type        = string
  description = "Name of the OCI Identity Domain group for GitHub Actions."
  default     = "g-github-actions"
}

variable "confidential_app_template_id" {
  type        = string
  description = "Identity Domains template identifier for a Confidential Application."
  default     = "CustomWebAppTemplateId"
}

# ---------------------------------------------------------------------------
# GitLab CI OIDC federation (optional)
# ---------------------------------------------------------------------------

variable "enable_gitlab" {
  type        = bool
  description = "Whether to create the GitLab CI Identity Propagation Trust."
  default     = false
}

variable "gitlab_projects" {
  type        = list(string)
  description = "GitLab projects allowed to federate, in 'group/project' format."
  default     = []
}

variable "gitlab_ref" {
  type        = string
  description = "Git ref (branch or tag name) allowed in the GitLab OIDC sub claim."
  default     = "main"
}

variable "gitlab_ref_type" {
  type        = string
  description = "Ref type used in the sub claim: 'branch' or 'tag'."
  default     = "branch"
}

variable "gitlab_issuer" {
  type        = string
  description = "GitLab OIDC issuer URL. Override for self-managed instances."
  default     = "https://gitlab.com"
}

variable "gitlab_audience" {
  type        = string
  description = "Audience claim expected in GitLab OIDC tokens."
  default     = "https://cloud.oracle.com/gitlab"
}
