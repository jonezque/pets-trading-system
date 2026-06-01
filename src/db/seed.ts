import { sql } from "./pool.ts";
import { config } from "../config.ts";
import { DICTIONARY } from "./dictionary.ts";

// Idempotent seed: populates the read-only dictionary, the 3 traders, and the
// initial supply. Safe to run on every boot — it no-ops once data exists.
export async function seed(): Promise<void> {
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pet_dictionary
  `;
  if (count > 0) {
    console.log("[seed] already seeded, skipping");
    return;
  }

  await sql.begin(async (tx) => {
    // Pet dictionary (read-only reference data).
    for (const d of DICTIONARY) {
      const [row] = await tx<{ id: number }[]>`
        INSERT INTO pet_dictionary (type, breed, lifespan, desirability_base, maintenance, base_price)
        VALUES (${d.type}, ${d.breed}, ${d.lifespan}, ${d.desirability}, ${d.maintenance}, ${d.basePrice})
        RETURNING id
      `;
      await tx`INSERT INTO supply (breed_id, remaining) VALUES (${row.id}, ${config.supplyPerBreed})`;
    }

    // Exactly 3 traders, each with the fixed starting cash.
    for (const name of ["Trader A", "Trader B", "Trader C"]) {
      await tx`INSERT INTO traders (name, cash) VALUES (${name}, ${config.initialCash})`;
    }
  });

  console.log(`[seed] seeded ${DICTIONARY.length} breeds, 3 traders, supply=${config.supplyPerBreed}/breed`);
}

if (import.meta.main) {
  await seed();
  await sql.end();
}
