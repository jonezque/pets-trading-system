import { config } from "../config.ts";
import type {
  Trader,
  Money,
  InventoryItem,
  Listing,
  SupplyRow,
  LeaderRow,
  Notification,
} from "../db/queries.ts";

const poll = config.pollInterval;
const m = (n: number) => `$${n.toFixed(2)}`;

// Pollable fragments refresh on an interval AND whenever a mutation fires the
// `refresh` event on <body> (via the HX-Trigger response header).
// `morph:outerHTML` patches the DOM in place (via idiomorph) instead of
// replacing it, so a poll never steals focus from an input being edited.
const pollAttrs = (url: string) => ({
  "hx-get": url,
  "hx-trigger": `every ${poll}s, refresh from:body`,
  "hx-swap": "morph:outerHTML",
});

// ---- Trader panel ----------------------------------------------------------

export type PanelData = {
  trader: Trader;
  money: Money;
  inventory: InventoryItem[];
  myBids: { bidId: number; petId: number; breed: string; amount: number; status: string }[];
  notifications: Notification[];
  buyable: SupplyRow[];
  error?: string;
};

export function TraderPanel(d: PanelData) {
  const { trader, money, inventory, myBids, notifications, buyable } = d;
  return (
    <section id={`panel-${trader.id}`} class="card" {...pollAttrs(`/trader/${trader.id}/panel`)}>
      <div class="panel-title">
        <h2>{trader.name}</h2>
        <span class="chip total small">{m(money.total)}</span>
      </div>
      {d.error ? <div class="err">{d.error}</div> : null}

      <div class="money">
        <div><div class="k">Available</div><div class="v">{m(money.available)}</div></div>
        <div><div class="k">Locked</div><div class="v">{m(money.locked)}</div></div>
        <div><div class="k">Pets value</div><div class="v">{m(money.petsValue)}</div></div>
        <div class="total"><div class="k">Portfolio</div><div class="v">{m(money.total)}</div></div>
      </div>

      <h2>Buy new pet</h2>
      <form class="inline" hx-post={`/trader/${trader.id}/buy`} hx-target={`#panel-${trader.id}`} hx-swap="outerHTML">
        <select id={`buy-breed-${trader.id}`} name="breed_id">
          {buyable.map((b) => (
            <option value={b.breedId}>{b.breed} — {m(b.basePrice)} ({b.remaining} left)</option>
          ))}
        </select>
        <input id={`buy-qty-${trader.id}`} type="number" name="qty" value="1" min="1" />
        <button type="submit" disabled={buyable.length === 0}>Buy</button>
      </form>

      <h2 style="margin-top:12px">Inventory ({inventory.length})</h2>
      {inventory.length === 0 ? <p class="muted small">No pets yet.</p> : (
        <table>
          <thead><tr><th>Pet</th><th>Age/Life</th><th>Health</th><th>Intrinsic</th><th></th></tr></thead>
          <tbody>
            {inventory.map((p) => <InventoryRow trader={trader} p={p} />)}
          </tbody>
        </table>
      )}

      {myBids.length > 0 ? (
        <>
          <h2 style="margin-top:12px">My bids</h2>
          <table>
            <tbody>
              {myBids.map((b) => (
                <tr>
                  <td>{b.breed}</td>
                  <td>{m(b.amount)}</td>
                  <td><span class={`chip ${b.status}`}>{b.status}</span></td>
                  <td>
                    {b.status === "active" ? (
                      <button class="ghost" hx-post={`/bids/${b.bidId}/withdraw`} hx-vals={`{"trader_id":${trader.id}}`}
                        hx-target={`#panel-${trader.id}`} hx-swap="outerHTML">Withdraw</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <h2 style="margin-top:12px">Notifications</h2>
      <div>
        {notifications.length === 0 ? <p class="muted small">None.</p> :
          notifications.map((n) => (
            <div class="notif"><b>{n.kind}</b> · {n.message}</div>
          ))}
      </div>
    </section>
  );
}

function InventoryRow({ trader, p }: { trader: Trader; p: InventoryItem }) {
  return (
    <tr>
      <td>
        <a href="#" hx-get={`/pets/${p.id}/analysis`} hx-target="#modal" hx-swap="innerHTML">{p.breed}</a>{" "}
        {p.status === "expired" ? <span class="chip expired">expired</span> : null}
        {p.listingId ? <span class="chip listed">listed {m(p.askingPrice!)}</span> : null}
      </td>
      <td class="small">{p.age.toFixed(1)}/{p.lifespan}</td>
      <td><div class="bar"><span style={`width:${p.health}%`}></span></div></td>
      <td>{m(p.intrinsic)}</td>
      <td>
        <div class="row-actions">
          {!p.listingId ? (
            <form class="inline" hx-post={`/trader/${trader.id}/list`} hx-target={`#panel-${trader.id}`} hx-swap="outerHTML">
              <input type="hidden" name="pet_id" value={p.id} />
              <input id={`list-price-${p.id}`} type="number" name="asking_price" placeholder="price" min="1" step="1" />
              <button type="submit">List</button>
            </form>
          ) : (
            <>
              <button class="ghost" hx-post={`/listings/${p.listingId}/withdraw`} hx-vals={`{"trader_id":${trader.id}}`}
                hx-target={`#panel-${trader.id}`} hx-swap="outerHTML">Withdraw</button>
              {p.bidId ? (
                <>
                  <span class="small">bid {m(p.bidAmount!)} ({p.bidderName})</span>
                  <button class="good" hx-post={`/bids/${p.bidId}/accept`} hx-vals={`{"trader_id":${trader.id}}`}
                    hx-target={`#panel-${trader.id}`} hx-swap="outerHTML">Accept</button>
                  <button class="danger" hx-post={`/bids/${p.bidId}/reject`} hx-vals={`{"trader_id":${trader.id}}`}
                    hx-target={`#panel-${trader.id}`} hx-swap="outerHTML">Reject</button>
                </>
              ) : null}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---- Market ----------------------------------------------------------------

export type MarketData = {
  listings: Listing[];
  supply: SupplyRow[];
  traders: Trader[];
  error?: string;
};

export function MarketView(d: MarketData) {
  const { listings, traders } = d;
  return (
    <section id="market" class="card" {...pollAttrs("/market")}>
      <h2>Market — {listings.length} active listings</h2>
      {d.error ? <div class="err">{d.error}</div> : null}
      {listings.length === 0 ? <p class="muted small">No active listings.</p> : (
        <table>
          <thead>
            <tr><th>Pet</th><th>Seller</th><th>Asking</th><th>Last trade</th><th>Highest bid</th><th>Place bid</th></tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <tr>
                <td>
                  <a href="#" hx-get={`/pets/${l.petId}/analysis`} hx-target="#modal" hx-swap="innerHTML">{l.breed}</a>{" "}
                  {l.status === "expired" ? <span class="chip expired">expired</span> : null}
                  <span class="muted small"> · intrinsic {m(l.intrinsic)}</span>
                </td>
                <td>{l.sellerName}</td>
                <td>{m(l.askingPrice)}</td>
                <td>{l.lastTradePrice !== null ? m(l.lastTradePrice) : "—"}</td>
                <td>{l.highestBid !== null ? m(l.highestBid) : <span class="muted">—</span>}</td>
                <td>
                  <form class="inline" hx-post={`/listings/${l.listingId}/bid`} hx-target="#market" hx-swap="outerHTML">
                    <select id={`bid-trader-${l.listingId}`} name="trader_id">
                      {traders.filter((t) => t.id !== l.sellerId).map((t) => (
                        <option value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <input id={`bid-amount-${l.listingId}`} type="number" name="amount" placeholder="$" min="1" step="1" />
                    <button type="submit">Bid</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---- Leaderboard -----------------------------------------------------------

export function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  return (
    <section id="leaderboard" class="card" {...pollAttrs("/leaderboard")}>
      <h2>Leaderboard</h2>
      <table>
        <thead><tr><th>#</th><th>Trader</th><th>Available</th><th>Locked</th><th>Pets</th><th>Total</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr>
              <td>{i + 1}</td>
              <td>{r.name}</td>
              <td class="small">{m(r.available)}</td>
              <td class="small">{m(r.locked)}</td>
              <td class="small">{m(r.petsValue)}</td>
              <td><b>{m(r.total)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---- Analysis modal --------------------------------------------------------

export type AnalysisData = {
  breed: string; type: string; age: number; lifespan: number; health: number;
  desirability: number; maintenance: number; basePrice: number; intrinsic: number;
  status: string;
};

export function AnalysisModal(p: AnalysisData) {
  return (
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:50"
      onclick="if(event.target===this)this.replaceChildren()">
      <div class="card" style="min-width:340px;max-width:420px">
        <div class="panel-title">
          <h2>{p.breed} <span class="muted small">({p.type})</span></h2>
          <button class="ghost" onclick="document.getElementById('modal').replaceChildren()">✕</button>
        </div>
        <table>
          <tbody>
            <tr><td class="muted">Status</td><td>{p.status === "expired" ? <span class="chip expired">expired</span> : <span class="chip active">active</span>}</td></tr>
            <tr><td class="muted">Age / Lifespan</td><td>{p.age.toFixed(2)} / {p.lifespan} yrs</td></tr>
            <tr><td class="muted">Health</td><td>{p.health.toFixed(1)}%</td></tr>
            <tr><td class="muted">Desirability</td><td>{p.desirability.toFixed(2)} / 10</td></tr>
            <tr><td class="muted">Maintenance</td><td>{p.maintenance}</td></tr>
            <tr><td class="muted">Base price</td><td>{m(p.basePrice)}</td></tr>
            <tr><td class="muted">Intrinsic value</td><td><b>{m(p.intrinsic)}</b></td></tr>
          </tbody>
        </table>
        <p class="small muted">Intrinsic = Base × (Health/100) × (Desirability/10) × (1 − Age/Lifespan)</p>
      </div>
    </div>
  );
}

// ---- Dashboard shell -------------------------------------------------------

export function Dashboard({ panels, market, leaderboard }: {
  panels: PanelData[]; market: MarketData; leaderboard: LeaderRow[];
}) {
  return (
    <>
      <header>
        <h1>🐾 Pets Trading System</h1>
        <span class="tag">3 traders · live valuations every {config.valuationIntervalMs / 1000}s · polling {poll}s</span>
      </header>
      <main>
        <div class="grid">{panels.map((p) => <TraderPanel {...p} />)}</div>
        <div class="wide">
          <MarketView {...market} />
          <Leaderboard rows={leaderboard} />
        </div>
      </main>
      <div id="modal"></div>
    </>
  );
}
