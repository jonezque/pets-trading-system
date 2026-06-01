# 🐾 Pets Trading System

A SaaS-style trading simulation where one participant controls **3 traders** who
buy, sell, list, and bid on unique virtual pets. Pets age and fluctuate in value
on a live valuation engine; portfolios update in real time and a leaderboard
ranks the traders.

Built for the **AI-Driven Systems Engineering Exercise** — see [AI_USAGE.md](AI_USAGE.md)
for how AI tools were used across the lifecycle, and [PLAN.md](PLAN.md) for the design rationale.

## Stack

| Layer | Tech |
|-------|------|
| Backend | **Bun** + **Hono** (JSX server-rendered HTML) |
| Frontend | **HTMX** (polling for live updates) |
| Database | **PostgreSQL** (transactional cash/bids/trades) |
| Container | **Docker** + docker-compose (dev) |
| Cloud | **GCP Cloud Run + Cloud SQL** via **Terraform** |
| CI/CD | **GitHub Actions** |
| Tests | `bun test` (domain + integration) |

## Run locally (Docker Desktop)

```bash
cp .env.example .env        # optional; compose already sets sane defaults
docker compose up --build
# open http://localhost:3000
```

This starts Postgres + the app. On boot the app runs migrations, seeds the
read-only pet dictionary, 3 traders, and supply, then starts the valuation engine.

### Run without Docker

```bash
bun install
# point DATABASE_URL at any Postgres
DATABASE_URL=postgres://pets:pets@localhost:5432/pets bun run dev
```

### Tests

```bash
# needs a Postgres for the integration suite
DATABASE_URL=postgres://pets:pets@localhost:5432/pets bun test
```

## Configuration

All tunables are env vars (see [.env.example](.env.example)):

| Var | Default | Meaning |
|-----|---------|---------|
| `INITIAL_CASH` | 500 | Starting cash per trader (≈5–8 new pets) |
| `SUPPLY_PER_BREED` | 3 | New-supply units per breed |
| `VALUATION_INTERVAL_MS` | 60000 | Valuation engine tick interval |
| `AGE_PER_TICK` | 1 | Years added per tick (accelerated for demos) |
| `FLUCTUATION` | 0.05 | ±health/desirability fluctuation per tick |
| `POLL_INTERVAL` | 3 | Browser poll cadence (seconds) |

## Documentation

- [PLAN.md](PLAN.md) — design, assumptions, tradeoffs
- [ARCHITECTURE.md](ARCHITECTURE.md) — system decomposition & data model
- [API.md](API.md) — routes / endpoints
- [AI_USAGE.md](AI_USAGE.md) — AI tool usage across the lifecycle
- [tests/TEST_CASES.md](tests/TEST_CASES.md) — system test catalog

## Deploy (GCP)

Paths, by goal:

- **Live demo, no credit card** — app on **Render** (free Docker host) + **Supabase**
  Postgres. Quickest clickable URL. See **[DEPLOY_RENDER.md](DEPLOY_RENDER.md)**.
- **$0 / Always-Free on GCP** — single `e2-micro` VM running app + Postgres via Docker
  Compose. See **[DEPLOY_FREE.md](DEPLOY_FREE.md)** ([infra/gce-free/](infra/gce-free/)).
- **Managed services** — Cloud Run + Cloud SQL (better production shape; Cloud SQL
  ~$10/mo, use with the $300 trial credit). [infra/](infra/):

  ```bash
  cd infra
  cp terraform.tfvars.example terraform.tfvars   # set project_id, image
  terraform init && terraform apply
  ```

CI/CD: [.github/workflows](.github/workflows) runs tests + `terraform validate` on
every push; the deploy workflow (Cloud Run) is manual until GCP secrets are set.
