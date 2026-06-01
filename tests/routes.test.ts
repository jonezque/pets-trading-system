import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/pool.ts";
import { createApp } from "../src/app.tsx";
import { resetDb, traderIds } from "./helpers.ts";

// HTTP/route-layer tests: drive the real Hono app via app.request and assert on
// the returned HTML fragments and the HX-Trigger refresh header.

const app = createApp();
let A: number, B: number;

beforeEach(async () => {
  await resetDb();
  [A, B] = await traderIds();
});

function post(path: string, data: Record<string, string | number>) {
  const body = new URLSearchParams(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])));
  return app.request(path, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

describe("read endpoints", () => {
  test("GET /healthz → 200 JSON", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET / renders the dashboard with 3 panels + market + leaderboard", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Pets Trading System");
    expect(html).toContain('id="panel-1"');
    expect(html).toContain('id="panel-2"');
    expect(html).toContain('id="panel-3"');
    expect(html).toContain('id="market"');
    expect(html).toContain('id="leaderboard"');
  });

  test("GET /trader/:id/panel returns that trader's panel fragment", async () => {
    const res = await app.request(`/trader/${A}/panel`);
    const html = await res.text();
    expect(html).toContain(`id="panel-${A}"`);
    expect(html).toContain("Buy new pet");
  });
});

describe("mutations set HX-Trigger and update fragments", () => {
  test("POST buy returns panel, fires refresh, inventory grows", async () => {
    const [breed] = await sql<{ id: number }[]>`SELECT id FROM pet_dictionary WHERE breed = 'Labrador'`;
    const res = await post(`/trader/${A}/buy`, { breed_id: breed.id, qty: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get("HX-Trigger")).toBe("refresh");
    expect(await res.text()).toContain("Inventory (1)");
  });

  test("full bid flow over HTTP: list → bid shows highest in market", async () => {
    const [breed] = await sql<{ id: number }[]>`SELECT id FROM pet_dictionary WHERE breed = 'Poodle'`;
    await post(`/trader/${A}/buy`, { breed_id: breed.id, qty: 1 }); // pet id 1
    const listRes = await post(`/trader/${A}/list`, { pet_id: 1, asking_price: 50 });
    expect(await listRes.text()).toContain("listed");

    const bidRes = await post(`/listings/1/bid`, { trader_id: B, amount: 60 });
    expect(bidRes.status).toBe(200);
    expect(bidRes.headers.get("HX-Trigger")).toBe("refresh");
    const market = await bidRes.text();
    expect(market).toContain('id="market"');
    expect(market).toContain("$60.00"); // highest bid shown
  });
});

describe("error path (TradeError) renders inline error, no refresh", () => {
  test("buying with insufficient cash shows error and does NOT fire refresh", async () => {
    const [macaw] = await sql<{ id: number }[]>`SELECT id FROM pet_dictionary WHERE breed = 'Macaw'`;
    const [poodle] = await sql<{ id: number }[]>`SELECT id FROM pet_dictionary WHERE breed = 'Poodle'`;
    // Drain cash first (3 x $120 = $360, leaving $140), then overspend within supply.
    await post(`/trader/${A}/buy`, { breed_id: macaw.id, qty: 3 });
    const res = await post(`/trader/${A}/buy`, { breed_id: poodle.id, qty: 2 }); // 2 x $110 = $220 > $140
    expect(res.status).toBe(200); // 200 so HTMX still swaps the fragment
    expect(res.headers.get("HX-Trigger")).toBeNull();
    expect(await res.text()).toContain("Insufficient cash");
  });

  test("bidding on your own pet shows error in the market fragment", async () => {
    const [breed] = await sql<{ id: number }[]>`SELECT id FROM pet_dictionary WHERE breed = 'Bengal'`;
    await post(`/trader/${A}/buy`, { breed_id: breed.id, qty: 1 });
    await post(`/trader/${A}/list`, { pet_id: 1, asking_price: 40 });
    const res = await post(`/listings/1/bid`, { trader_id: A, amount: 45 });
    expect(res.headers.get("HX-Trigger")).toBeNull();
    expect(await res.text()).toContain("cannot bid on your own pet");
  });
});
