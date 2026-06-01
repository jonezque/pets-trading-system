import { Hono } from "hono";
import { config } from "./config.ts";
import * as q from "./db/queries.ts";
import * as trade from "./domain/trading.ts";
import { TradeError } from "./domain/trading.ts";
import { Layout } from "./views/layout.tsx";
import {
  Dashboard,
  TraderPanel,
  MarketView,
  Leaderboard,
  AnalysisModal,
  type PanelData,
  type MarketData,
} from "./views/fragments.tsx";

// ---- read-model assemblers -------------------------------------------------

async function buildPanel(traderId: number, error?: string): Promise<PanelData> {
  const [trader, money, inventory, myBids, notifications, supply] = await Promise.all([
    q.getTrader(traderId),
    q.getMoney(traderId),
    q.getInventory(traderId),
    q.getMyBids(traderId),
    q.getNotifications(traderId),
    q.getSupply(),
  ]);
  if (!trader) throw new Error(`Trader ${traderId} not found`);
  return { trader, money, inventory, myBids, notifications, buyable: supply.filter((s) => s.remaining > 0), error };
}

async function buildMarket(error?: string): Promise<MarketData> {
  const [listings, supply, traders] = await Promise.all([q.getMarket(), q.getSupply(), q.getTraders()]);
  return { listings, supply, traders, error };
}

// ---- helpers ---------------------------------------------------------------

const refresh = (c: any) => c.header("HX-Trigger", "refresh");

async function body(c: any): Promise<Record<string, string>> {
  return (await c.req.parseBody()) as Record<string, string>;
}

function intParam(c: any, name: string): number {
  return Number(c.req.param(name));
}

// ---- app -------------------------------------------------------------------

export function createApp() {
  const app = new Hono();

  // Structured JSON request log: method, path, status, latency (ms).
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const path = new URL(c.req.url).pathname;
    if (path === "/healthz") return; // skip readiness-probe noise
    console.log(JSON.stringify({
      level: "info",
      method: c.req.method,
      path,
      status: c.res.status,
      ms: Date.now() - start,
    }));
  });

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.get("/", async (c) => {
    const traders = await q.getTraders();
    const panels = await Promise.all(traders.map((t) => buildPanel(t.id)));
    const market = await buildMarket();
    const leaderboard = await q.getLeaderboard();
    return c.html(
      <Layout>
        <Dashboard panels={panels} market={market} leaderboard={leaderboard} />
      </Layout>,
    );
  });

  // --- polled fragments ---
  app.get("/trader/:id/panel", async (c) => c.html(<TraderPanel {...(await buildPanel(intParam(c, "id")))} />));
  app.get("/market", async (c) => c.html(<MarketView {...(await buildMarket())} />));
  app.get("/leaderboard", async (c) => c.html(<Leaderboard rows={await q.getLeaderboard()} />));

  app.get("/pets/:id/analysis", async (c) => {
    const p = await q.getPet(intParam(c, "id"));
    if (!p) return c.html(<div></div>);
    return c.html(
      <AnalysisModal
        breed={p.breed} type={p.type} age={p.age} lifespan={p.lifespan} health={p.health}
        desirability={p.desirability} maintenance={p.maintenance} basePrice={p.basePrice}
        intrinsic={p.intrinsic} status={p.status}
      />,
    );
  });

  // --- panel-targeted mutations (return the acting trader's panel) ---
  const panelAction = (
    handler: (traderId: number, b: Record<string, string>, c: any) => Promise<void>,
    traderFrom: (c: any, b: Record<string, string>) => number,
  ) =>
    async (c: any) => {
      const b = await body(c);
      const traderId = traderFrom(c, b);
      try {
        await handler(traderId, b, c);
        refresh(c);
        return c.html(<TraderPanel {...(await buildPanel(traderId))} />);
      } catch (err) {
        if (err instanceof TradeError) {
          return c.html(<TraderPanel {...(await buildPanel(traderId, err.message))} />);
        }
        throw err;
      }
    };

  app.post("/trader/:id/buy", panelAction(
    (id, b) => trade.buyFromSupply(id, Number(b.breed_id), Number(b.qty)),
    (c) => intParam(c, "id"),
  ));

  app.post("/trader/:id/list", panelAction(
    (id, b) => trade.createListing(id, Number(b.pet_id), Number(b.asking_price)),
    (c) => intParam(c, "id"),
  ));

  app.post("/listings/:id/withdraw", panelAction(
    (traderId, _b, c) => trade.withdrawListing(traderId, intParam(c, "id")),
    (_c, b) => Number(b.trader_id),
  ));

  app.post("/bids/:id/accept", panelAction(
    (traderId, _b, c) => trade.acceptBid(traderId, intParam(c, "id")),
    (_c, b) => Number(b.trader_id),
  ));

  app.post("/bids/:id/reject", panelAction(
    (traderId, _b, c) => trade.rejectBid(traderId, intParam(c, "id")),
    (_c, b) => Number(b.trader_id),
  ));

  app.post("/bids/:id/withdraw", panelAction(
    (traderId, _b, c) => trade.withdrawBid(traderId, intParam(c, "id")),
    (_c, b) => Number(b.trader_id),
  ));

  // --- market-targeted mutation (bidding returns the market fragment) ---
  app.post("/listings/:id/bid", async (c) => {
    const b = await body(c);
    try {
      await trade.placeBid(Number(b.trader_id), intParam(c, "id"), Number(b.amount));
      refresh(c);
      return c.html(<MarketView {...(await buildMarket())} />);
    } catch (err) {
      if (err instanceof TradeError) return c.html(<MarketView {...(await buildMarket(err.message))} />);
      throw err;
    }
  });

  return app;
}
