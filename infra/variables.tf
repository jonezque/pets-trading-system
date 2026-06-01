variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type        = string
  description = "GCP region for all resources"
  default     = "europe-west1"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name"
  default     = "pets-trading"
}

variable "image" {
  type        = string
  description = "Full container image ref (e.g. REGION-docker.pkg.dev/PROJECT/pets/app:TAG). Set by CI."
}

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier"
  default     = "db-f1-micro"
}

variable "db_user" {
  type    = string
  default = "pets"
}

variable "db_name" {
  type    = string
  default = "pets"
}

# Game tunables passed through to the container as env vars.
variable "initial_cash" {
  type    = number
  default = 500
}

variable "supply_per_breed" {
  type    = number
  default = 3
}

variable "valuation_interval_ms" {
  type    = number
  default = 60000
}

variable "age_per_tick" {
  type    = number
  default = 1
}

variable "poll_interval" {
  type    = number
  default = 3
}
