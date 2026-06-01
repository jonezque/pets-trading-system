import { sql } from "../src/db/pool.ts";
import { config } from "../src/config.ts";
import { migrate } from "../src/db/migrate.ts";
import { seed } from "../src/db/seed.ts";

// Reset the database to a clean seeded state between tests. Keeps the read-only
// dictionary + the 3 traders, but wipes all game state and restores cash/supply.
export async function resetDb(): Promise<void> {
  await migrate();
  await seed();
  await sql`TRUNCATE notifications, trades, bids, listings, pets RESTART IDENTITY CASCADE`;
  await sql`UPDATE traders SET cash = ${config.initialCash}`;
  await sql`UPDATE supply SET remaining = ${config.supplyPerBreed}`;
}

export async function traderIds(): Promise<number[]> {
  const rows = await sql<{ id: number }[]>`SELECT id FROM traders ORDER BY id`;
  return rows.map((r) => r.id);
}

export async function breedId(breed: string): Promise<number> {
  const [r] = await sql<{ id: number }[]>`SELECT id FROM pet_dictionary WHERE breed = ${breed}`;
  return r.id;
}

export async function cashOf(traderId: number): Promise<number> {
  const [r] = await sql<{ cash: string }[]>`SELECT cash FROM traders WHERE id = ${traderId}`;
  return Number(r.cash);
}

export async function firstPetOf(traderId: number): Promise<number> {
  const [r] = await sql<{ id: number }[]>`SELECT id FROM pets WHERE owner_id = ${traderId} ORDER BY id LIMIT 1`;
  return r.id;
}

export async function activeBidId(listingId: number): Promise<number | null> {
  const [r] = await sql<{ id: number }[]>`SELECT id FROM bids WHERE listing_id = ${listingId} AND status = 'active'`;
  return r?.id ?? null;
}

export async function activeListingId(petId: number): Promise<number | null> {
  const [r] = await sql<{ id: number }[]>`SELECT id FROM listings WHERE pet_id = ${petId} AND status = 'active'`;
  return r?.id ?? null;
}
