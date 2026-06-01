output "service_url" {
  description = "Public URL of the deployed Pets Trading System"
  value       = google_cloud_run_v2_service.app.uri
}

output "artifact_registry" {
  description = "Docker image repository path"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}"
}

output "db_connection_name" {
  description = "Cloud SQL instance connection name"
  value       = google_sql_database_instance.pg.connection_name
}
