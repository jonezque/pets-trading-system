output "app_url" {
  description = "Public URL of the app (allow ~1-2 min after image push for the VM to pull & start)"
  value       = "http://${google_compute_instance.vm.network_interface[0].access_config[0].nat_ip}"
}

output "external_ip" {
  value = google_compute_instance.vm.network_interface[0].access_config[0].nat_ip
}

output "image" {
  description = "Image ref to build & push so the VM can pull it"
  value       = local.image
}

output "build_command" {
  description = "Run from the repo root to build & push via Cloud Build"
  value       = "gcloud builds submit --tag ${local.image} ."
}

output "ssh_command" {
  value = "gcloud compute ssh pets-vm --zone ${var.zone} --tunnel-through-iap"
}
