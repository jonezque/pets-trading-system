# System Test Cases

AI-assisted catalog of system-level test scenarios for the Pets Trading System,
reasoned about across happy paths, edge cases, and failure modes. Each case is
traced to a requirement (spec section / clarifying question) and marked with the
automated test that covers it where applicable.

Legend: ✅ automated (`bun test`) · 📋 manual/UI · 🔢 formula vector

Automated suites: `domain.test.ts` (tick transitions), `formula.test.ts` (both
formulas), `engine.test.ts` (aging/expiry/clamping vs DB), `routes.test.ts`
(HTTP layer + HX-Trigger + error path), `integration.test.ts` (trading flows +
data scoping). 60 tests.

---

## 1. Valuation & Pet Lifecycle

| # | Scenario | Expected | Trace | Cov |
|---|----------|----------|-------|-----|
| V1 | Intrinsic value for known fundamentals (Poodle 0.77yr/94.24%/9) | ≈ 88.16 | §Formula | 🔢✅ |
| V2 | Intrinsic value Goldfish 8.77yr/67.85%/5 | ≈ 0.21 | §Formula | 🔢✅ |
| V3 | Intrinsic value Guppy 0.82yr/86.18%/4 | ≈ 1.00 | §Formula | 🔢✅ |
| V4 | Age ≥ lifespan | status → expired, intrinsic = 0 | Q18, §2.5 | ✅ |
| V5 | Health fluctuation never exceeds [0,100] | clamped | §2.2, Q16 | ✅ |
| V6 | Desirability fluctuation clamped to [1,10] | clamped | §2.2 | ✅ |
| V7 | Tick with neutral RNG (0.5) | health/desirability unchanged, age +AGE_PER_TICK | §2.2 | ✅ |
| V8 | Expired pet still owned & biddable | remains in inventory | Q18 | ✅ |
| V9 | Valuation tick refreshes all panels (poll) | UI updates within poll interval | §2.5, Q26 | 📋 |

## 2. New-Supply Purchases

| # | Scenario | Expected | Trace | Cov |
|---|----------|----------|-------|-----|
| P1 | Buy 1 pet from supply | cash −price, pet added age 0/health 100, supply −1, retail trade | §2.3, 5.1 | ✅ |
| P2 | Buy multiple at once | all created if cash & supply allow | Q5 | ✅ |
| P3 | Buy with insufficient cash | rejected, no state change | Q13 | ✅ |
| P4 | Buy when supply exhausted | rejected | §2.2 | ✅ |
| P5 | Retail purchase is not a secondary trade | trade.kind = retail, seller NULL | §2.3 | ✅ |
| P6 | Buy quantity ≤ 0 or non-integer | rejected | input validation | ✅ |

## 3. Listings

| # | Scenario | Expected | Trace | Cov |
|---|----------|----------|-------|-----|
| L1 | List owned pet, price > 0 | active listing created | §2.3 | ✅ |
| L2 | List with price ≤ 0 | rejected | §2.3 | ✅ |
| L3 | List a pet you don't own | rejected | ownership | ✅ |
| L4 | List a pet already actively listed | rejected (one active listing/pet) | Q11 | ✅ |
| L5 | List multiple different pets | allowed | Q11, §2.3 | ✅ |
| L6 | Withdraw listing with no bids | listing withdrawn, pet retained | 5.6 | ✅ |
| L7 | Withdraw listing with active bid | bid rejected, cash released, bidder notified | 5.6, Q10 | ✅ |
| L8 | Relist after withdrawal | allowed | Q10 | ✅ |

## 4. Bidding

| # | Scenario | Expected | Trace | Cov |
|---|----------|----------|-------|-----|
| B1 | Bid below asking price | allowed (seller decides) | Q8 | ✅ |
| B2 | Bid above asking price | allowed | Q8 | ✅ |
| B3 | Bid on own pet | rejected | Q7 | ✅ |
| B4 | Bid exceeding available (unlocked) cash | rejected | Q13 | ✅ |
| B5 | Cash locked while bid active | available = cash − locked | §2.5, Q13 | ✅ |
| B6 | Higher bid replaces current highest | old bid → outbid, its cash released, bidder notified | 5.5, Q6 | ✅ |
| B7 | Bid ≤ current highest | rejected (only highest counts) | Q6 | ✅ |
| B8 | Withdraw active bid | bid withdrawn, cash released, seller notified | 5.3, Q9 | ✅ |
| B9 | Multiple active bids across different pets | all locked simultaneously | §2.5 | ✅ |
| B10 | Bidder sees only own bid status | active/outbid/rejected/withdrawn | §2.3 | 📋 |
| B11 | Only one active bid per pet | enforced by unique index | Q27 | ✅ |

## 5. Trade Execution

| # | Scenario | Expected | Trace | Cov |
|---|----------|----------|-------|-----|
| T1 | Seller accepts bid | pet → buyer, seller +price, buyer −price, listing sold, both notified | 5.2, Q12 | ✅ |
| T2 | Accept executes immediately | synchronous, inventory + cash updated | Q12 | ✅ |
| T3 | Seller rejects bid | bid rejected, cash released, bidder notified, listing stays active | §2.3 | ✅ |
| T4 | Accepted trade sets most-recent trade price | market shows last price | §2.4 | ✅ |
| T5 | Accept after listing withdrawn | rejected (listing not active) | invariant | ✅ |
| T6 | Accept a non-active bid | rejected | invariant | ✅ |

## 6. Portfolio & Leaderboard

| # | Scenario | Expected | Trace | Cov |
|---|----------|----------|-------|-----|
| F1 | Portfolio = available + locked + pets value | correct sum | §2.1, Q23 | ✅ |
| F2 | Leaderboard ranks by total portfolio | descending order | 5.8, Q23 | ✅ |
| F3 | Trader data scoping | inventory + locked cash scoped to the owning trader only | Q4 | ✅ |

## 7. Notifications

| # | Scenario | Expected | Trace | Cov |
|---|----------|----------|-------|-----|
| N1 | Bid received | seller notified with pet/price/counterparty | Q24 | ✅ |
| N2 | Bid accepted | both parties notified | 5.2 | ✅ |
| N3 | Bid rejected | bidder notified | Q24 | ✅ |
| N4 | Bid withdrawn | seller notified | 5.3 | ✅ |
| N5 | Outbid | previous bidder notified | 5.5 | ✅ |
| N6 | Chronological order (newest first) | ordered by created_at desc | §2.4 | ✅ |

## 8. System / UI Behavior (manual)

| # | Scenario | Expected | Trace | Cov |
|---|----------|----------|-------|-----|
| S1 | Three trader panels visible simultaneously | all render | §2.1, Q3 | 📋 |
| S2 | Market default order newest-first | newest listing on top | §2.4, Q21 | 📋✅ |
| S3 | Analysis drill-down shows full fundamentals | age/health/desirability/maintenance/intrinsic | §2.4, Q22 | 📋 |
| S4 | Action triggers immediate refresh of affected panels | HX-Trigger refresh fires | §2.5, Q26 | 📋 |
| S5 | New supply count visible & decrements on buy | market/buy form updates | §2.4 | 📋✅ |
