# Deploy on GCP — $0 Always-Free tier

This deploys the whole system onto a single **Always-Free `e2-micro` Compute
Engine VM** running the app + Postgres via Docker Compose. The app image is
built by **Cloud Build** (free tier) into **Artifact Registry** and pulled by
the VM. Because the VM runs 24/7, the valuation engine ticks natively — no extra
scheduler needed.

> **Cost:** $0 within the Always Free limits (1 `e2-micro` in us-central1/us-east1/us-west1,
> 30 GB pd-standard, 1 GB egress/month, Cloud Build 120 build-min/day, Artifact
> Registry 0.5 GB). A **billing account must still be enabled** (a card is
> required) but you are not charged while within these limits. New accounts also
> get $300 / 90 days of credit as a safety net.

## Prerequisites

- A GCP project with **billing enabled**.
- [`gcloud`](https://cloud.google.com/sdk/docs/install) and
  [`terraform`](https://developer.hashicorp.com/terraform/install) installed locally.
- Authenticated:

  ```bash
  gcloud auth login
  gcloud auth application-default login
  gcloud config set project YOUR_PROJECT_ID
  ```

## Deploy (4 steps)

```bash
cd infra/gce-free

# 1. Provision: APIs, Artifact Registry, VPC + firewall, service account, the VM.
#    (The VM boots and waits for the image — it retries every 20s.)
terraform init
terraform apply -var project_id=YOUR_PROJECT_ID

# 2. Build & push the app image with Cloud Build (run from the repo root).
cd ../..
gcloud builds submit --tag "$(terraform -chdir=infra/gce-free output -raw image)" .

# 3. The VM pulls and starts automatically within ~30s. Get the URL:
terraform -chdir=infra/gce-free output -raw app_url

# 4. Open that URL in your browser.
```

That's it. `terraform output build_command` prints the exact build command, and
`terraform output ssh_command` prints the IAP SSH command.

## Verify / troubleshoot

```bash
# SSH in (via Identity-Aware Proxy — no public SSH port is open):
gcloud compute ssh pets-vm --zone us-central1-a --tunnel-through-iap

# On the VM:
sudo cat /var/log/pets-startup.log     # provisioning log
sudo systemctl status pets             # app stack status
cd /opt/pets && sudo docker compose ps # container health
sudo docker compose logs app           # app logs (structured JSON request logs)
```

If the page isn't up yet, the VM is most likely still pulling the image — wait a
minute after step 2 and retry. Re-deploying a new image version:

```bash
gcloud builds submit --tag "$(terraform -chdir=infra/gce-free output -raw image)" .
gcloud compute ssh pets-vm --zone us-central1-a --tunnel-through-iap \
  --command 'cd /opt/pets && sudo docker compose pull && sudo docker compose up -d'
```

## Tear down (stop all billing)

```bash
terraform -chdir=infra/gce-free destroy -var project_id=YOUR_PROJECT_ID
```

## Notes & tradeoffs

- **Single VM, not managed services.** This is the cheapest GCP-only option. The
  managed-services variant (Cloud Run + Cloud SQL) lives in [`infra/`](infra/) and
  is the better production shape, but Cloud SQL is **not** in the Always Free tier
  (~$10/mo) — use it with the $300 trial credit. Keeping both shows the
  cost/architecture tradeoff explicitly.
- **e2-micro is small** (1 vCPU burst, 1 GB RAM); a 1 GB swap file is added to
  cushion Postgres + Bun. Fine for a single-participant demo, not for load.
- **HTTP only** (port 80). For HTTPS you'd put it behind a proxy / managed cert —
  out of scope for a free demo.
- **Postgres data** persists in a Docker named volume on the VM's disk.
