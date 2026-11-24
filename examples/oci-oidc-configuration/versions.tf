terraform {
  required_version = ">= 1.14.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 6.0"
    }
    github = {
      source  = "integrations/github"
      version = ">= 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = ">= 4.0"
    }
  }
}
