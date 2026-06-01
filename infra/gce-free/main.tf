# $0 / Always-Free deployment: a single e2-micro Compute Engine VM runs the app
# and Postgres via Docker Compose. The app image is built by Cloud Build into
# Artifact Registry; the VM pulls it. Because the VM is always on, the in-process
# valuation engine ticks natively — no Cloud Scheduler needed.

locals {
  required_apis = [
    "compute.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
  ]
  # Image the VM will pull (built + pushed by the documented Cloud Build step).
  image = "${var.region}-docker.pkg.dev/${var.project_id}/pets/app:latest"
}

resource "google_project_service" "apis" {
  for_each           = toset(local.required_apis)
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "pets"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

resource "random_password" "db" {
  length  = 24
  special = false
}

# --- Network ---------------------------------------------------------------

resource "google_compute_network" "vpc" {
  name                    = "pets-net"
  auto_create_subnetworks = true
  depends_on              = [google_project_service.apis]
}

# Public app traffic on port 80.
resource "google_compute_firewall" "app" {
  name          = "pets-allow-app"
  network       = google_compute_network.vpc.name
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["pets"]
  allow {
    protocol = "tcp"
    ports    = ["80"]
  }
}

# SSH only via Identity-Aware Proxy (no public 22). Use: gcloud compute ssh --tunnel-through-iap
resource "google_compute_firewall" "ssh_iap" {
  name          = "pets-allow-ssh-iap"
  network       = google_compute_network.vpc.name
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["pets"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# --- VM service account (read images from Artifact Registry) ----------------

resource "google_service_account" "vm" {
  account_id   = "pets-vm"
  display_name = "Pets Trading VM"
}

resource "google_project_iam_member" "ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_project_iam_member" "log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.vm.email}"
}

# --- The instance -----------------------------------------------------------

resource "google_compute_instance" "vm" {
  name         = "pets-vm"
  machine_type = var.machine_type
  zone         = var.zone
  tags         = ["pets"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 30 # GB pd-standard — within the Always Free 30GB-month allowance
      type  = "pd-standard"
    }
  }

  network_interface {
    network = google_compute_network.vpc.name
    access_config {} # ephemeral external IP (free while attached to a running VM)
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"]
  }

  metadata_startup_script = templatefile("${path.module}/startup.sh.tpl", {
    image                 = local.image
    region                = var.region
    db_password           = random_password.db.result
    initial_cash          = var.initial_cash
    supply_per_breed      = var.supply_per_breed
    valuation_interval_ms = var.valuation_interval_ms
    age_per_tick          = var.age_per_tick
    poll_interval         = var.poll_interval
  })

  depends_on = [
    google_project_iam_member.ar_reader,
    google_artifact_registry_repository.repo,
  ]
}
