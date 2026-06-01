# Architecture

## Overview

The Pets Trading System is a single Bun/Hono service that renders server-side
HTML fragments consumed by HTMX, backed by PostgreSQL, and deployed as one
container to GCP Cloud Run with a Cloud SQL Postgres instance.

```
 Browser (HTMX)                Cloud Run container (Bun)              Cloud SQL
┌────────────────┐           ┌──────────────────────────────┐      ┌──────────┐
│ Dashboard       │  HTTP     │ Hono routes ──► domain ──► db │ TCP  │ Postgres │
│  3 trader panels│ ───────►  │              services  queries│────► │          │
│  market         │ ◄─────── │  valuation engine (setInterval)│      └──────────┘
│  leaderboard    │ fragments │  JSX views (HTML fragments)    │
└────────────────┘  + poll   └──────────────────────────────┘
```

## Layering (separation of concerns)

| Layer | Path | Responsibility | Depends on |
|-------|------|----------------|------------|
| Presentation | `src/views/*.tsx` | JSX → HTML fragments | (pure) |
| HTTP | `src/app.tsx` | route handlers, parse input, assemble read models | services, queries, views |
| Domain | `src/domain/*.ts` | business rules (trading, valuation, portfolio) | db pool |
| Persistence | `src/db/*` | migrations, seed, pooled queries | pool |
| Engine | `src/engine/tick.ts` | recurring valuation tick | domain, db |
| Config | `src/config.ts` | env-driven tunables | — |

**`valuation.ts` and `portfolio.ts` are pure** (no DB/framework) so the core
math is unit-tested in isolation. IO-bound logic (the tick, trading services)
is integration-tested against a real Postgres.

## Data model

```
pet_dictionary (read-only, 20 breeds)──┐
                                        │
supply (remaining per breed)────────────┤
                                        ▼
traders ──< pets >── listings ──< bids
   │                    │
   └──< notifications   └──< trades (ledger / last price)
```

- **pets** — unique instances; each tracks its own `age_years`, `health_pct`,
  `desirability`, and `status` (active/expired).
- **listings** — partial unique index enforces *one active listing per pet*.
- **bids** — partial unique index enforces *one active (highest) bid per listing*.
- **traders.cash** is total owned cash; **locked** is derived as the sum of a
  trader's active bid amounts; **available = cash − locked**.
- Money columns are `NUMERIC` to avoid floating-point drift.

### Derived values

```
intrinsic_value = base_price × (health/100) × (desirability/10) × (1 − age/lifespan)   [floored at 0]
portfolio_value = available + locked + Σ intrinsic_value(owned pets)
```

## Key flows

- **Buy from supply** — checks supply + available cash, decrements supply,
  spawns pets (age 0, health 100), records a `retail` trade. Atomic.
- **Place bid** — validates ownership/cash/highest-bid, marks the previous
  highest `outbid` (releasing its cash) and notifies, locks new cash, notifies
  seller + bidder. Atomic.
- **Accept** — transfers the pet, moves cash both ways, marks bid `accepted` /
  listing `sold`, records a `secondary` trade, notifies both parties. Atomic.

All multi-step mutations run inside a `sql.begin` transaction with `FOR UPDATE`
row locks on the contended rows (trader cash, listing, current bid).

## Real-time strategy

HTMX **polling**: pollable fragments carry `hx-trigger="every Ns, refresh from:body"`.
Successful mutations return an `HX-Trigger: refresh` header, which fires a
`refresh` event on `<body>` so every fragment reloads immediately — combining a
steady poll (for valuation ticks) with instant cross-panel updates on actions.

## Runtime / operating environment

- **Process**: one stateless container; the valuation engine is an in-process
  `setInterval`. Cloud Run runs with `min-instances=1` so the timer keeps
  running (sufficient for a demo; no autoscaling concerns).
- **Dependencies**: PostgreSQL only. No external services, queues, or caches.
- **Environments**: `dev` (docker-compose, local Postgres) and `prod/test`
  (Cloud Run + Cloud SQL). They differ only by env vars + DB target.
- **Config**: 12-factor; everything via env (`src/config.ts`).
- **Secrets**: `DATABASE_URL` in GCP Secret Manager, injected into Cloud Run.

## Observability

- Structured boot/engine logs (`[migrate]`, `[seed]`, `[engine]`, `[server]`).
- `/healthz` readiness endpoint (used by Cloud Run startup probe).
- Domain events logged (valuation tick count). Trades/bids are persisted in the
  `trades` table and `notifications`, giving an audit trail beyond logs.

## Notable tradeoffs

- **HTMX + server-rendered fragments** over an SPA — far less client complexity;
  the whole app is one deployable with no separate build/bundle step.
- **Polling** over SSE/WebSockets — simpler and deploys cleanly on Cloud Run;
  acceptable latency for a turn-based demo.
- **Raw SQL + tiny migration runner** over an ORM — transparent, reviewable,
  and the schema invariants (partial unique indexes) are explicit.
- **Derived locked/available cash** over a separate ledger — fewer moving parts;
  correctness follows from the single source of truth (active bids).
