# Pets Trading System — Implementation Plan

> AI-Driven Systems Engineering Exercise. A SaaS-style "Trading Pets" system where one
> human participant controls 3 traders who buy, sell, and manage virtual pets.

## 0. Stack Decisions (confirmed)

| Concern | Choice | Why |
| --- | --- | --- |
| Backend runtime | **Bun** | Fast, native TS, single binary, great DX |
| Web framework | **Hono + JSX** | Tiny Bun-native router; first-class JSX → renders HTML fragments for HTMX |
| Frontend | **HTMX** (+ small vanilla JS) | Server-rendered HTML fragments; no SPA build complexity |
| Real-time | **HTMX polling** (`hx-trigger="every Ns"`) | Simple, stateless, deploys cleanly on Cloud Run (no sticky connections) |
| Database | **PostgreSQL** | Relational integrity for cash/bids/trades; transactions |
| DB driver | `postgres` (postgres.js) or Bun's `Bun.sql` | Lightweight, parameterized queries |
| Migrations | Plain SQL files + a tiny runner | Transparent, reviewable, no heavy ORM |
| Containerization | **Docker** (backend + db via docker-compose for dev) | "All backend in Docker" |
| Cloud | **GCP Cloud Run + Cloud SQL (Postgres)** | Single image, scale-to-zero, managed PG |
| IaC | **Terraform** | Declarative, GCP-supported |
| CI/CD | **GitHub Actions** → Artifact Registry → Cloud Run | Build, push, deploy, migrate |
| Tests | **`bun test`** + markdown test catalog | Domain unit + integration tests |

---

## 1. Architecture Overview

```
                       ┌─────────────────────────────────────────┐
   Browser (HTMX)      │            Cloud Run (1 container)        │
  ┌───────────────┐    │  ┌─────────────────────────────────────┐ │
  │ Dashboard      │   │  │  Hono app (Bun)                      │ │
  │ ┌─────┬─────┬─┐ │◄──┼──┤  • routes → HTML fragments (JSX)     │ │
  │ │ A   │ B   │C│ │HTTP│  │  • domain services (trading rules)   │ │
  │ │panel│panel│ │ │──►│  │  • valuation engine (interval tick)  │ │
  │ └─────┴─────┴─┘ │   │  │  • polling endpoints                 │ │
  │  Market | Board │   │  └──────────────┬──────────────────────┘ │
  └───────────────┘    └─────────────────┼────────────────────────┘
       polls every Ns                    │ TCP (Cloud SQL connector)
                                          ▼
                                  ┌───────────────┐
                                  │  Cloud SQL PG  │
                                  └───────────────┘
```

**Layering (clean separation):**

- **Presentation** (`/views`): JSX components that render HTML fragments (panels, market, leaderboard, notifications, analysis modal).
- **HTTP** (`/routes`): Hono handlers — parse input, call services, return fragments. Thin.
- **Domain/Services** (`/domain`): all business rules — buying, listing, bidding, accept/reject/withdraw, valuation, portfolio. **Framework-agnostic, fully unit-testable.**
- **Persistence** (`/db`): SQL queries + migrations + connection pool. Transactions wrap multi-step ops (bid placement with cash lock, trade execution).
- **Engine** (`/engine`): background `setInterval` valuation tick (configurable).

**Environments:** `dev` (docker-compose locally) and `prod/test` (Cloud Run + Cloud SQL). All config via env vars (12-factor).

---

## 2. Data Model

```
pet_dictionary (READ-ONLY, seeded — 20 breeds)
  id PK, type, breed, lifespan, desirability_base, maintenance, base_price

supply
  breed_id FK → pet_dictionary, remaining INT     -- default 3 per breed (configurable)

traders
  id PK, name, cash NUMERIC                        -- cash = total owned cash (incl. locked)
                                                   -- available = cash - locked, locked = Σ active bids

pets  (unique instances; lifecycle tracked individually)
  id PK, breed_id FK, owner_id FK → traders,
  age_years NUMERIC, health_pct NUMERIC, desirability NUMERIC,
  status ENUM('active','expired'), born_at TIMESTAMPTZ, updated_at

listings
  id PK, pet_id FK, seller_id FK, asking_price NUMERIC(>0),
  status ENUM('active','withdrawn','sold'), created_at
  -- partial unique index: only ONE active listing per pet

bids
  id PK, listing_id FK, bidder_id FK, amount NUMERIC,
  status ENUM('active','outbid','rejected','withdrawn','accepted'), created_at
  -- only ONE active bid per listing (highest)

trades  (ledger / most-recent-price source)
  id PK, pet_id FK, seller_id, buyer_id, price NUMERIC,
  kind ENUM('retail','secondary'), executed_at

notifications
  id PK, trader_id FK, kind, pet_id, price, counterparty_id, message, created_at, read BOOL
```

**Derived values (computed, not stored stale):**
- `intrinsic_value = base_price × (health/100) × (desirability/10) × (1 − age/lifespan)`, floored at 0.
- `locked_cash(trader)` = Σ amount of active bids.
- `available_cash` = `cash − locked_cash`.
- `portfolio_value` = `available + locked + Σ intrinsic_value(owned active+expired pets)` *(market value ≈ intrinsic value; expired ⇒ 0 but still tradable).*

---

## 3. Key Assumptions (made explicit per the rubric)

1. **Time scaling.** Age is in *years* but ticks are *minutes*. We add `AGE_PER_TICK` years each valuation tick (default `1.0`) so pets visibly age and expire within a demo. Configurable via env.
2. **Supply granularity.** "3 per type" read as **3 per breed** (configurable `SUPPLY_PER_BREED`, default 3) — matches "unique instances, decreases as purchased."
3. **Market value for portfolio** = current **intrinsic value** (per-pet). Expired pets contribute 0 but remain in inventory and biddable.
4. **Bid must beat the current highest active bid** to become active (Q6 "only highest bid counts"). Bids ≤ current highest, or > available cash, are **rejected**. Bids may still be above/below the *asking price* (Q8).
5. **No authentication.** One participant; trader identity is the `trader_id` carried in the request/panel. Each panel only shows its own private info (no cross-trader cash/inventory leakage in the rendered fragments) — satisfies Q4.
6. **±5% fluctuation** applied multiplicatively per tick to health and desirability, clamped to `[0,100]` and `[1,10]` respectively.
7. **Initial cash** = fixed amount sized to buy 5–8 new pets (default `$500`, configurable).

---

## 4. Business Rules & Edge Cases (drives test coverage)

| Action | Rules enforced |
| --- | --- |
| **Buy new pet** | From supply at base_price; multiple allowed if cash & supply allow; supply decremented; pet spawned age=0, health=100; trade row kind=`retail`; **not** secondary. Reject if insufficient cash or supply=0. |
| **List pet** | asking_price > 0; pet owned by seller; no existing active listing for that pet. |
| **Withdraw listing** | Active bid → `rejected`, bidder cash released + notified; listing `withdrawn`; pet stays with seller. |
| **Place bid** | Not own pet (Q7); amount ≤ available cash (Q13); amount > current highest active bid; locks cash; previous highest → `outbid` + cash released + notified; seller notified (received / new highest). |
| **Withdraw bid** | Active bid → `withdrawn`; cash released; seller notified. |
| **Accept bid** (seller) | Trade executes atomically: pet → buyer, buyer's locked→paid, seller credited, listing `sold`, bid `accepted`, both notified; trade row kind=`secondary`, sets most-recent-price. |
| **Reject bid** (seller) | Bid `rejected`; bidder cash released + notified. |
| **Valuation tick** | age += AGE_PER_TICK; health/desirability ±5% clamped; recompute intrinsic; age ≥ lifespan ⇒ `expired` (intrinsic 0). |

**Non-happy paths to test:** insufficient cash, zero supply, self-bid, under-cut bid, double-listing, bid > available after another lock, withdraw releasing exact cash, expired-pet bidding, asking price ≤ 0, accept after outbid, concurrent-ish sequential ordering.

---

## 5. API / Routes (HTMX fragment-oriented)

```
GET  /                          → full dashboard (3 panels + market + leaderboard)
GET  /trader/:id/panel          → inventory, cash, locked, portfolio  (polled)
GET  /trader/:id/notifications  → chronological notifications          (polled)
GET  /market                    → listings, asking, last trade price, supply (polled)
GET  /leaderboard               → portfolio ranking                    (polled)
GET  /pets/:id/analysis         → drill-down fundamentals (modal)

POST /trader/:id/buy            {breed_id, qty}
POST /trader/:id/list           {pet_id, asking_price}
POST /listings/:id/withdraw
POST /listings/:id/bid          {trader_id, amount}
POST /bids/:id/accept | /reject | /withdraw

GET  /healthz                   → liveness/readiness (Cloud Run)
```

Mutating routes return the updated fragment(s) so HTMX swaps in place; polling refreshes valuations/notifications every `POLL_INTERVAL` (default 3s).

---

## 6. Repository Layout

```
pets/
├─ src/
│  ├─ index.ts              # Hono app + server bootstrap + engine start
│  ├─ config.ts             # env parsing (cash, intervals, supply, age/tick)
│  ├─ routes/               # HTTP handlers
│  ├─ domain/               # trading.ts, valuation.ts, portfolio.ts (pure rules)
│  ├─ db/                   # pool.ts, queries.ts, migrations/*.sql, seed.ts
│  ├─ views/                # *.tsx fragments (dashboard, panel, market, ...)
│  └─ engine/               # tick.ts (interval valuation)
├─ tests/
│  ├─ TEST_CASES.md         # AI-identified system test catalog (markdown)
│  ├─ domain.test.ts        # unit tests on rules
│  └─ integration.test.ts   # route + db tests
├─ infra/                   # Terraform (Cloud Run, Cloud SQL, AR, IAM, secrets)
├─ .github/workflows/       # ci.yml (build/test), deploy.yml (image+terraform)
├─ Dockerfile               # Bun runtime image
├─ docker-compose.yml       # dev: app + postgres
├─ .env.example
├─ ARCHITECTURE.md  API.md  AI_USAGE.md  README.md
└─ PLAN.md (this file)
```

---

## 7. Infrastructure (Terraform / GCP)

- **Artifact Registry** repo for the Docker image.
- **Cloud SQL** Postgres instance (db-f1-micro for dev/test), database + user; password in **Secret Manager**.
- **Cloud Run** service: image, env vars, Secret Manager refs, Cloud SQL connection (via connector / Unix socket), min-instances 0, concurrency.
- **Service Account** with least-privilege (Cloud SQL Client, Secret Accessor).
- Migrations run on container startup (idempotent runner) or as a one-off Cloud Run Job.
- State: local backend for the exercise (note: GCS backend for real use).

## 8. CI/CD (GitHub Actions)

- `ci.yml`: on PR → `bun install`, `bun test`, lint/typecheck (spins up Postgres service for integration tests).
- `deploy.yml`: on main → build & push image to Artifact Registry → `terraform apply` → deploy revision. Auth via Workload Identity Federation (no long-lived keys).

## 9. Observability (bonus)

- Structured JSON request logs (method, path, status, latency) → Cloud Logging.
- `/healthz` for readiness; valuation-tick heartbeat log.
- Domain event logs (trade executed, bid outbid) as audit signal.
- Optional: simple counters (trades, active listings) exposed for inspection.

---

## 10. AI-Usage Mapping (rubric coverage)

| Rubric area | Artifact produced with AI |
| --- | --- |
| Identify system test cases | `tests/TEST_CASES.md` (edge/failure-mode catalog, traced to requirements) |
| Operating environment | `ARCHITECTURE.md` runtime/deps/scaling section + `.env.example` |
| UX designs | UX rationale + ASCII/wireframe notes for dashboard, panels, analysis, leaderboard |
| Technical/architectural design | This plan + `ARCHITECTURE.md` diagrams & tradeoffs |
| Front-end code | HTMX + JSX views (iteratively refined) |
| Back-end code | Hono routes + domain services + validation |
| Test automation | `bun test` suites |
| IaC | Terraform under `infra/` |
| Resource config | Cloud Run env, Secret Manager, Cloud SQL, IAM |
| Deployment pipeline | GitHub Actions workflows |
| Monitoring (bonus) | Logging + healthz + audit events |

---

## 11. Build Sequence (phased)

1. **Scaffold**: Bun + Hono, config, Dockerfile, docker-compose (app+pg), `/healthz`.
2. **Data layer**: migrations, seed pet dictionary + 3 traders + supply, query helpers.
3. **Domain core**: valuation formula + engine tick; portfolio calc. *(unit tests first)*
4. **Trading services**: buy / list / withdraw-listing / bid / outbid / withdraw-bid / accept / reject, with transactions + notifications. *(unit + integration tests)*
5. **Views**: dashboard, 3 panels, market, leaderboard, analysis modal, notifications; wire HTMX polling + actions.
6. **Test catalog + automation**: `TEST_CASES.md`, fill out `bun test`.
7. **IaC + pipeline**: Terraform, GitHub Actions, deploy to Cloud Run + Cloud SQL.
8. **Docs + walkthrough**: `ARCHITECTURE.md`, `API.md`, `AI_USAGE.md`, README, demo script.

---

## 12. Notes

- This is a **testing/demo project — no scale concerns**. Single container, single Cloud SQL instance, `min-instances=1` so the in-process valuation `setInterval` keeps ticking. No Cloud Scheduler / autoscaling complexity.
- **Polling vs push**: chosen polling for simplicity; if updates feel laggy in demo, drop `POLL_INTERVAL` to 1–2s.
- **Numeric money** stored as `NUMERIC` to avoid float drift.
```
