import { sql } from "../db/pool.ts";
import { config } from "../config.ts";
import { tickPet } from "../domain/valuation.ts";

type PetRow = {
  id: number;
  age_years: string;
  health_pct: string;
  desirability: string;
  lifespan: string;
};

/**
 * One valuation tick: advance every active pet's age/health/desirability and
 * flip pets to 'expired' when they reach lifespan. Returns the number updated.
 * Pure transition logic lives in domain/valuation.ts; this only does IO.
 */
export async function runValuationTick(rng: () => number = Math.random): Promise<number> {
  const pets = await sql<PetRow[]>`
    SELECT p.id, p.age_years, p.health_pct, p.desirability, d.lifespan
    FROM pets p
    JOIN pet_dictionary d ON d.id = p.breed_id
    WHERE p.status = 'active'
  `;

  if (pets.length === 0) return 0;

  await sql.begin(async (tx) => {
    for (const p of pets) {
      const next = tickPet(
        {
          ageYears: Number(p.age_years),
          healthPct: Number(p.health_pct),
          desirability: Number(p.desirability),
          status: "active",
        },
        {
          lifespan: Number(p.lifespan),
          agePerTick: config.agePerTick,
          fluctuation: config.fluctuation,
          rng,
        },
      );
      await tx`
        UPDATE pets
        SET age_years = ${next.ageYears},
            health_pct = ${next.healthPct},
            desirability = ${next.desirability},
            status = ${next.status},
            updated_at = now()
        WHERE id = ${p.id}
      `;
    }
  });

  return pets.length;
}

/** Start the recurring in-process valuation engine. Returns a stop handle. */
export function startEngine(): Timer {
  console.log(`[engine] valuation tick every ${config.valuationIntervalMs}ms`);
  return setInterval(async () => {
    try {
      const n = await runValuationTick();
      if (n > 0) console.log(`[engine] valuation tick updated ${n} pets`);
    } catch (err) {
      console.error("[engine] tick failed:", err);
    }
  }, config.valuationIntervalMs);
}
