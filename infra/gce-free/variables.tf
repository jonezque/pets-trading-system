variable "project_id" {
  type        = string
  description = "GCP project ID"
}

# Always-Free e2-micro is only free in us-west1, us-central1, or us-east1.
variable "region" {
  type    = string
  default = "us-central1"
}

variable "zone" {
  type    = string
  default = "us-central1-a"
}

variable "machine_type" {
  type        = string
  description = "Must be e2-micro to stay within the Always Free tier"
  default     = "e2-micro"
}

# Game tunables baked into the container env on the VM.
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
