# Infrastructure for the Pets Trading System on GCP:
# Artifact Registry (image) -> Cloud Run (container) -> Cloud SQL (Postgres),
# with the DB connection string held in Secret Manager.

locals {
  required_apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.required_apis)
  service            = each.value
  disable_on_destroy = false
}

# --- Container registry ------------------------------------------------------

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "pets"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

# --- Database ----------------------------------------------------------------

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "google_sql_database_instance" "pg" {
  name             = "${var.service_name}-pg"
  database_version = "POSTGRES_16"
  region           = var.region
  # Demo project: allow Terraform to destroy without manual lock removal.
  deletion_protection = false

  settings {
    tier = var.db_tier
    ip_configuration {
      ipv4_enabled = true
    }
    backup_configuration {
      enabled = false
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "db" {
  name     = var.db_name
  instance = google_sql_database_instance.pg.name
}

resource "google_sql_user" "user" {
  name     = var.db_user
  instance = google_sql_database_instance.pg.name
  password = random_password.db.result
}

# --- Secret: DATABASE_URL (Cloud SQL via unix socket) ------------------------

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${var.service_name}-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  # postgres.js connects over the Cloud SQL unix socket mounted at /cloudsql.
  secret_data = "postgres://${var.db_user}:${random_password.db.result}@/${var.db_name}?host=/cloudsql/${google_sql_database_instance.pg.connection_name}"
}

# --- Runtime service account -------------------------------------------------

resource "google_service_account" "run" {
  account_id   = "${var.service_name}-run"
  display_name = "Pets Trading Cloud Run runtime"
}

resource "google_secret_manager_secret_iam_member" "run_secret" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

resource "google_project_iam_member" "run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.run.email}"
}

# --- Cloud Run service -------------------------------------------------------

resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region

  template {
    service_account = google_service_account.run.email

    # min_instance_count = 1 keeps the in-process valuation engine ticking.
    scaling {
      min_instance_count = 1
      max_instance_count = 2
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.pg.connection_name]
      }
    }

    containers {
      image = var.image

      ports {
        container_port = 3000
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "INITIAL_CASH"
        value = tostring(var.initial_cash)
      }
      env {
        name  = "SUPPLY_PER_BREED"
        value = tostring(var.supply_per_breed)
      }
      env {
        name  = "VALUATION_INTERVAL_MS"
        value = tostring(var.valuation_interval_ms)
      }
      env {
        name  = "AGE_PER_TICK"
        value = tostring(var.age_per_tick)
      }
      env {
        name  = "POLL_INTERVAL"
        value = tostring(var.poll_interval)
      }

      startup_probe {
        http_get {
          path = "/healthz"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 6
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_iam_member.run_secret,
    google_project_iam_member.run_sql_client,
  ]
}

# Public access for the demo.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
