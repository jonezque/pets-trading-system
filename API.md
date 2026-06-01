# API Reference

All endpoints return **HTML fragments** (for HTMX swaps), except `/healthz`
(JSON) and `/` (full page). Mutations that change shared state respond with an
`HX-Trigger: refresh` header so other panels reload.

Bodies are `application/x-www-form-urlencoded` (HTMX form posts; `trader_id` is
supplied via `hx-vals` where the acting trader isn't in the URL).

## Pages & fragments (GET)

| Method | Path | Returns | Notes |
|--------|------|---------|-------|
| GET | `/` | Full dashboard page | 3 panels + market + leaderboard |
| GET | `/healthz` | `{"status":"ok"}` | Readiness probe |
| GET | `/trader/:id/panel` | Trader panel fragment | Money, inventory, my bids, notifications. Polled. |
| GET | `/market` | Market fragment | Active listings (newest first), asking, last trade, highest bid. Polled. |
| GET | `/leaderboard` | Leaderboard fragment | Traders ranked by portfolio value. Polled. |
| GET | `/pets/:id/analysis` | Analysis modal | Full fundamentals + intrinsic value |

## Mutations (POST)

| Method | Path | Body | Effect |
|--------|------|------|--------|
| POST | `/trader/:id/buy` | `breed_id`, `qty` | Buy `qty` pets from supply at base price |
| POST | `/trader/:id/list` | `pet_id`, `asking_price` | List an owned pet (price > 0) |
| POST | `/listings/:id/withdraw` | `trader_id` | Withdraw listing; active bid rejected, cash released |
| POST | `/listings/:id/bid` | `trader_id`, `amount` | Place a bid (must beat current highest, ≤ available cash, not own pet) |
| POST | `/bids/:id/accept` | `trader_id` (seller) | Accept bid → execute trade immediately |
| POST | `/bids/:id/reject` | `trader_id` (seller) | Reject bid; cash released, listing stays active |
| POST | `/bids/:id/withdraw` | `trader_id` (bidder) | Withdraw own active bid; cash released |

## Validation & errors

Business-rule violations raise a domain `TradeError`; the handler re-renders the
relevant fragment with an inline error message (HTTP 200 so HTMX still swaps).
Enforced rules include:

- Asking price must be > 0; can only list pets you own; one active listing per pet.
- Bids cannot exceed available (unlocked) cash; cannot bid on your own pet;
  must exceed the current highest bid (only the highest counts).
- Accept/reject only by the listing's seller, only on an active bid.

## Example: a full secondary-market trade

```bash
# Trader 1 buys a Labrador (breed 1)
curl -X POST $BASE/trader/1/buy -d "breed_id=1&qty=1"
# Trader 1 lists pet 1 for $50
curl -X POST $BASE/trader/1/list -d "pet_id=1&asking_price=50"
# Trader 2 bids $60
curl -X POST $BASE/listings/1/bid -d "trader_id=2&amount=60"
# Trader 1 accepts bid 1 → pet moves to Trader 2, cash settles
curl -X POST $BASE/bids/1/accept -d "trader_id=1"
```
