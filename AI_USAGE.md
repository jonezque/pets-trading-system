# AI Usage Across the Lifecycle

This project was built with AI (Claude) used as a thinking partner across the
full SDLC, not just for code generation. This document maps each rubric area to
how AI was used and what it produced.

| Lifecycle area | How AI was used | Artifact |
|----------------|-----------------|----------|
| **Requirements analysis** | Parsed the spec + 29 clarifying Q&As, surfaced ambiguities (time scaling, "supply per type", market value definition) and resolved them as explicit assumptions | [PLAN.md §3](PLAN.md) |
| **System test cases** | Reasoned about behavior, edge cases, and failure modes (self-bid, under-cut bid, supply exhaustion, expired-pet bidding, cash-lock release) traced to requirements | [tests/TEST_CASES.md](tests/TEST_CASES.md) |
| **Operating environment** | Defined runtime assumptions: single stateless container, in-process valuation engine, Postgres-only dependency, dev vs prod env parity | [ARCHITECTURE.md](ARCHITECTURE.md) |
| **UX design** | Decided the 3-panel single-dashboard layout, per-listing bidding with trader selector, seller-side accept/reject, drill-down analysis modal, color-coded status chips | `src/views/*` + PLAN.md |
| **Technical / architectural design** | Explored service boundaries, chose layered architecture (pure domain vs IO), data model with partial unique indexes for invariants, polling vs SSE tradeoff | [ARCHITECTURE.md](ARCHITECTURE.md) |
| **Front-end code** | Generated HTMX + JSX fragments, polling + `HX-Trigger` refresh pattern, inline forms and modals | `src/views/fragments.tsx`, `layout.tsx` |
| **Back-end code** | Generated Hono routes, transactional trading services, valuation/portfolio domain, query read-models | `src/domain/`, `src/app.tsx`, `src/db/` |
| **Test automation** | Wrote `bun test` domain (formula vectors, clamping) and integration (full trade flows, cash locking) suites | `tests/domain.test.ts`, `tests/integration.test.ts` |
| **IaC** | Generated Terraform for Cloud Run + Cloud SQL + Artifact Registry + Secret Manager + IAM | `infra/` |
| **Resource configuration** | Configured env vars, secret injection, Cloud SQL socket connection, least-privilege service account, startup probe | `infra/main.tf` |
| **Deployment pipeline** | Defined GitHub Actions: CI (tests w/ Postgres service + Terraform validate) and deploy (build → push → apply via Workload Identity) | `.github/workflows/` |
| **Observability (bonus)** | Defined structured logs, `/healthz`, engine heartbeat, persisted trade/notification audit trail | ARCHITECTURE.md §Observability |

## Where AI accelerated *thinking*, not just typing

- **Edge-case reasoning**: AI enumerated non-happy paths (bid ≤ current highest,
  accept after withdrawal, multi-pet simultaneous locks) that became test cases
  *before* implementation — driving the design of invariants (partial unique
  indexes, `FOR UPDATE` locking).
- **Assumption surfacing**: the spec's "age in years" vs "ticks per minute"
  tension was caught and resolved with a configurable `AGE_PER_TICK`, documented
  rather than silently chosen.
- **Tradeoff articulation**: polling vs SSE, ORM vs raw SQL, derived vs ledgered
  locked cash — each decided deliberately and recorded.

## Manual correction & refinement

AI output was reviewed and corrected throughout — e.g. an incorrect test
assertion on portfolio totals (cash already includes locked cash) was caught by
running the suite; the JSX file extension and Cloud SQL socket URL form were
fixed during verification. The system was **booted and a full trade flow
exercised end-to-end** before finalizing.
