#!/bin/bash
# Provisions the e2-micro: Docker + a Compose stack (Postgres + the app image
# from Artifact Registry), supervised by a systemd unit that retries until the
# image has been pushed. Logs to /var/log/pets-startup.log.
set -uxo pipefail
exec > /var/log/pets-startup.log 2>&1

apt-get update
apt-get install -y curl

# 1 GiB swap cushions the e2-micro's 1 GB RAM (Postgres + Bun + builds).
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Docker Engine (bundles the compose plugin).
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

mkdir -p /opt/pets

cat > /opt/pets/docker-compose.yml <<'COMPOSE'
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pets
      POSTGRES_PASSWORD: "${db_password}"
      POSTGRES_DB: pets
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pets -d pets"]
      interval: 5s
      timeout: 3s
      retries: 12
  app:
    image: "${image}"
    depends_on:
      db:
        condition: service_healthy
    environment:
      PORT: "3000"
      DATABASE_URL: "postgres://pets:${db_password}@db:5432/pets"
      INITIAL_CASH: "${initial_cash}"
      SUPPLY_PER_BREED: "${supply_per_breed}"
      VALUATION_INTERVAL_MS: "${valuation_interval_ms}"
      AGE_PER_TICK: "${age_per_tick}"
      POLL_INTERVAL: "${poll_interval}"
    ports:
      - "80:3000"
    restart: unless-stopped
volumes:
  pgdata:
COMPOSE

# Bring the stack up; retry until the image exists in Artifact Registry.
# Auth to AR uses the VM service account's access token from the metadata server
# (no gcloud dependency).
cat > /opt/pets/run.sh <<'RUN'
#!/bin/bash
set -uo pipefail
cd /opt/pets
until \
  TOKEN=$(curl -s -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4) \
  && echo "$TOKEN" | docker login -u oauth2accesstoken --password-stdin "https://${region}-docker.pkg.dev" \
  && docker compose up -d --pull always; do
  echo "image not ready yet; retrying in 20s..."
  sleep 20
done
RUN
chmod +x /opt/pets/run.sh

cat > /etc/systemd/system/pets.service <<'UNIT'
[Unit]
Description=Pets Trading System
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/pets
ExecStart=/opt/pets/run.sh
ExecStop=/usr/bin/docker compose -f /opt/pets/docker-compose.yml down
UNIT

systemctl daemon-reload
systemctl enable --now pets.service
