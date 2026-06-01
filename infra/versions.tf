terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # For the exercise we use local state. In a real setup, configure a GCS backend:
  # backend "gcs" { bucket = "<tf-state-bucket>"; prefix = "pets" }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
