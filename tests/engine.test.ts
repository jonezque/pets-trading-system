import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/pool.ts";
import { runValuationTick } from "../src/engine/tick.ts";
import * as trade from "../src/domain/trading.ts";
import * as q from "../src/db/queries.ts";
import { resetDb, traderIds, breedId, firstPetOf } from "./helpers.ts";

// Integration test for the valuation engine against a real database: verifies a
// tick actually ages pets, flips them to expired at lifespan, and keeps health/
// desirability within bounds. (Pure transition math is covered in domain.test.ts.)
// Assumes config defaults AGE_PER_TICK=1, FLUCTUATION=0.05.

let A: number;

beforeEach(async () => {
  await resetDb();
  [A] = await traderIds();
});

describe("runValuationTick", () => {
  test("ages every active pet by AGE_PER_TICK and bumps updated_at", async () => {
    await trade.buyFromSupply(A, await breedId("Labrador"), 1);
    const petId = await firstPetOf(A);

    const updated = await runValuationTick(() => 0.5); // neutral rng: health/desirability unchanged
    expect(updated).toBe(1);

    const pet = (await q.getPet(petId))!;
    expect(pet.age).toBe(1);
    expect(pet.health).toBe(100);
    expect(pet.status).toBe("active");
  });

  test("flips a pet to expired at lifespan and zeroes intrinsic value", async () => {
    // Guppy lifespan = 3, so 3 ticks of AGE_PER_TICK=1 reaches expiry.
    await trade.buyFromSupply(A, await breedId("Guppy"), 1);
    const petId = await firstPetOf(A);

    await runValuationTick(() => 0.5);
    await runValuationTick(() => 0.5);
    expect((await q.getPet(petId))!.status).toBe("active");

    await runValuationTick(() => 0.5); // age 3 == lifespan
    const expired = (await q.getPet(petId))!;
    expect(expired.age).toBe(3);
    expect(expired.status).toBe("expired");
    expect(expired.intrinsic).toBe(0);

    // No active pets remain → next tick updates nothing.
    expect(await runValuationTick(() => 0.5)).toBe(0);
  });

  test("health stays within [0,100] under repeated upward fluctuation", async () => {
    await trade.buyFromSupply(A, await breedId("Macaw"), 1); // long lifespan, won't expire
    const petId = await firstPetOf(A);

    for (let i = 0; i < 10; i++) {
      await runValuationTick(() => 1); // always +5%
      const pet = (await q.getPet(petId))!;
      expect(pet.health).toBeLessThanOrEqual(100);
      expect(pet.health).toBeGreaterThanOrEqual(0);
      expect(pet.desirability).toBeLessThanOrEqual(10);
      expect(pet.desirability).toBeGreaterThanOrEqual(1);
    }
  });

  test("health decreases under downward fluctuation", async () => {
    await trade.buyFromSupply(A, await breedId("Macaw"), 1);
    const petId = await firstPetOf(A);
    await runValuationTick(() => 0); // always −5%
    expect((await q.getPet(petId))!.health).toBeLessThan(100);
  });
});
