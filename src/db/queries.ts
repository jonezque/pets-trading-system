import { sql } from "./pool.ts";
import { intrinsicValue, round2 } from "../domain/valuation.ts";
import { computePortfolio } from "../domain/portfolio.ts";

// Read models for the views. All money/metric values are coerced to numbers and
// intrinsic value is computed on the fly from current pet state.

export type Trader = { id: number; name: string };

export type PetView = {
  id: number;
  breed: string;
  type: string;
  age: number;
  health: number;
  desirability: number;
  lifespan: number;
  maintenance: number;
  basePrice: number;
  intrinsic: number;
  status: "active" | "expired";
  ownerId: number;
};

export async function getTraders(): Promise<Trader[]> {
  return await sql<Trader[]>`SELECT id, name FROM traders ORDER BY id`;
}

export async function getTrader(id: number): Promise<Trader | undefined> {
  const [t] = await sql<Trader[]>`SELECT id, name FROM traders WHERE id = ${id}`;
  return t;
}

function toPetView(r: any): PetView {
  const age = Number(r.age_years);
  const health = Number(r.health_pct);
  const desirability = Number(r.desirability);
  const lifespan = Number(r.lifespan);
  const basePrice = Number(r.base_price);
  return {
    id: r.id,
    breed: r.breed,
    type: r.type,
    age,
    health,
    desirability,
    lifespan,
    maintenance: Number(r.maintenance),
    basePrice,
    intrinsic: intrinsicValue({ basePrice, health, desirability, age, lifespan }),
    status: r.status,
    ownerId: r.owner_id,
  };
}

export async function getPet(petId: number): Promise<PetView | undefined> {
  const [r] = await sql`
    SELECT p.*, d.breed, d.type, d.lifespan, d.maintenance, d.base_price
    FROM pets p JOIN pet_dictionary d ON d.id = p.breed_id
    WHERE p.id = ${petId}
  `;
  return r ? toPetView(r) : undefined;
}

export type InventoryItem = PetView & {
  listingId: number | null;
  askingPrice: number | null;
  bidId: number | null;
  bidAmount: number | null;
  bidderName: string | null;
};

/** A trader's inventory with per-pet listing state and any active bid on it. */
export async function getInventory(traderId: number): Promise<InventoryItem[]> {
  const rows = await sql`
    SELECT p.*, d.breed, d.type, d.lifespan, d.maintenance, d.base_price,
           l.id AS listing_id, l.asking_price,
           b.id AS bid_id, b.amount AS bid_amount, bt.name AS bidder_name
    FROM pets p
    JOIN pet_dictionary d ON d.id = p.breed_id
    LEFT JOIN listings l ON l.pet_id = p.id AND l.status = 'active'
    LEFT JOIN bids b ON b.listing_id = l.id AND b.status = 'active'
    LEFT JOIN traders bt ON bt.id = b.bidder_id
    WHERE p.owner_id = ${traderId}
    ORDER BY p.id
  `;
  return rows.map((r: any) => ({
    ...toPetView(r),
    listingId: r.listing_id ?? null,
    askingPrice: r.asking_price !== null ? Number(r.asking_price) : null,
    bidId: r.bid_id ?? null,
    bidAmount: r.bid_amount !== null ? Number(r.bid_amount) : null,
    bidderName: r.bidder_name ?? null,
  }));
}

export type Money = { available: number; locked: number; petsValue: number; total: number };

export async function getMoney(traderId: number): Promise<Money> {
  const [t] = await sql<{ cash: string }[]>`SELECT cash FROM traders WHERE id = ${traderId}`;
  const bids = await sql<{ amount: string }[]>`
    SELECT b.amount FROM bids b WHERE b.bidder_id = ${traderId} AND b.status = 'active'
  `;
  const pets = await getInventory(traderId);
  return computePortfolio({
    cash: Number(t.cash),
    activeBidAmounts: bids.map((b) => Number(b.amount)),
    petValues: pets.map((p) => p.intrinsic),
  });
}

export type Listing = {
  listingId: number;
  petId: number;
  breed: string;
  type: string;
  sellerId: number;
  sellerName: string;
  askingPrice: number;
  intrinsic: number;
  status: PetView["status"];
  highestBid: number | null;
  highestBidderId: number | null;
  lastTradePrice: number | null;
  createdAt: string;
};

/** Active market listings, newest first, with current highest bid + last trade price. */
export async function getMarket(): Promise<Listing[]> {
  const rows = await sql`
    SELECT l.id AS listing_id, l.pet_id, l.asking_price, l.seller_id, l.created_at,
           s.name AS seller_name,
           d.breed, d.type, d.lifespan, d.base_price, d.maintenance,
           p.age_years, p.health_pct, p.desirability, p.status,
           hb.amount AS highest_bid, hb.bidder_id AS highest_bidder_id,
           lt.price AS last_trade_price
    FROM listings l
    JOIN pets p ON p.id = l.pet_id
    JOIN pet_dictionary d ON d.id = p.breed_id
    JOIN traders s ON s.id = l.seller_id
    LEFT JOIN bids hb ON hb.listing_id = l.id AND hb.status = 'active'
    LEFT JOIN LATERAL (
      SELECT price FROM trades t WHERE t.pet_id = l.pet_id ORDER BY executed_at DESC LIMIT 1
    ) lt ON true
    WHERE l.status = 'active'
    ORDER BY l.created_at DESC
  `;
  return rows.map((r: any) => {
    const pv = toPetView(r);
    return {
      listingId: r.listing_id,
      petId: r.pet_id,
      breed: r.breed,
      type: r.type,
      sellerId: r.seller_id,
      sellerName: r.seller_name,
      askingPrice: Number(r.asking_price),
      intrinsic: pv.intrinsic,
      status: pv.status,
      highestBid: r.highest_bid !== null ? Number(r.highest_bid) : null,
      highestBidderId: r.highest_bidder_id ?? null,
      lastTradePrice: r.last_trade_price !== null ? Number(r.last_trade_price) : null,
      createdAt: String(r.created_at),
    };
  });
}

export type SupplyRow = { breedId: number; breed: string; type: string; basePrice: number; remaining: number };

export async function getSupply(): Promise<SupplyRow[]> {
  const rows = await sql`
    SELECT d.id AS breed_id, d.breed, d.type, d.base_price, s.remaining
    FROM supply s JOIN pet_dictionary d ON d.id = s.breed_id
    ORDER BY d.type, d.breed
  `;
  return rows.map((r: any) => ({
    breedId: r.breed_id,
    breed: r.breed,
    type: r.type,
    basePrice: Number(r.base_price),
    remaining: r.remaining,
  }));
}

export type LeaderRow = { id: number; name: string; total: number; available: number; locked: number; petsValue: number };

/** Leaderboard: every trader's portfolio value, ranked descending. */
export async function getLeaderboard(): Promise<LeaderRow[]> {
  const traders = await getTraders();
  const rows: LeaderRow[] = [];
  for (const t of traders) {
    const m = await getMoney(t.id);
    rows.push({ id: t.id, name: t.name, ...m });
  }
  return rows.sort((a, b) => b.total - a.total);
}

export type Notification = {
  id: number;
  kind: string;
  message: string;
  price: number | null;
  createdAt: string;
};

export async function getNotifications(traderId: number, limit = 30): Promise<Notification[]> {
  const rows = await sql`
    SELECT id, kind, message, price, created_at
    FROM notifications WHERE trader_id = ${traderId}
    ORDER BY created_at DESC, id DESC LIMIT ${limit}
  `;
  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    message: r.message,
    price: r.price !== null ? Number(r.price) : null,
    createdAt: String(r.created_at),
  }));
}

/** A bidder's view of their own bids (status only on their own bids). */
export async function getMyBids(traderId: number): Promise<
  { bidId: number; petId: number; breed: string; amount: number; status: string }[]
> {
  const rows = await sql`
    SELECT b.id AS bid_id, b.amount, b.status, p.id AS pet_id, d.breed
    FROM bids b
    JOIN listings l ON l.id = b.listing_id
    JOIN pets p ON p.id = l.pet_id
    JOIN pet_dictionary d ON d.id = p.breed_id
    WHERE b.bidder_id = ${traderId} AND b.status IN ('active','outbid','rejected','withdrawn')
    ORDER BY b.created_at DESC LIMIT 20
  `;
  return rows.map((r: any) => ({
    bidId: r.bid_id,
    petId: r.pet_id,
    breed: r.breed,
    amount: Number(r.amount),
    status: r.status,
  }));
}

export { round2 };
