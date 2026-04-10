terraform {
  required_version = ">= 1.5.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "8.8.0"
    }
  }
}

provider "oci" {
  auth                = "SecurityToken"
  region              = var.region
  config_file_profile = var.oci_profile_name
}

variable "region" {
  type        = string
  description = "OCI region identifier (e.g. sa-saopaulo-1)"
}

variable "oci_profile_name" {
  type        = string
  description = "OCI config file profile name"
  default     = "DEFAULT"
}

variable "compartment_id" {
  type        = string
  description = "Compartment OCID — required by oci_identity_availability_domains to exercise real auth"
  default     = "ocid1.compartment.oc1..aaaaaaaa6tlzp5phwk7bh5tk4fbgdlk3cfn266k226gdtm2awvty53fj6bua"
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_id
}

output "availability_domain_count" {
  description = "Number of availability domains in the compartment"
  value       = length(data.oci_identity_availability_domains.ads.availability_domains)
}

output "availability_domain_names" {
  description = "List of availability domain names"
  value       = [for ad in data.oci_identity_availability_domains.ads.availability_domains : ad.name]
}

data "oci_core_instances" "all" {
  compartment_id = var.compartment_id
}

output "instance_count" {
  description = "Number of compute instances in the compartment"
  value       = length(data.oci_core_instances.all.instances)
}

output "instance_names" {
  description = "Display names of compute instances in the compartment"
  value       = [for i in data.oci_core_instances.all.instances : i.display_name]
}
