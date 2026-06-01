import { describe, expect, test } from "bun:test";
import { intrinsicValue } from "../src/domain/valuation.ts";
import { computePortfolio } from "../src/domain/portfolio.ts";
import { DICTIONARY } from "../src/db/dictionary.ts";

// Dedicated unit tests for the two formulas defined in the requirements doc.
//
//   1. Intrinsic Value = Base × (Health/100) × (Desirability/10) × (1 − Age/Lifespan)
//   2. Portfolio Value = available cash + locked cash + market value of pets
//
// NOTE on the doc's "20 random scenarios" table: it is explicitly labelled
// *random* and is illustrative only — when recomputed with the dictionary
// lifespans, just 5 of the 20 rows actually satisfy the formula. The others are
// inconsistent (e.g. Macaw's stated 105.77 is mathematically impossible: it
// exceeds Base×(H/100)×(D/10) = 102.7, the value's ceiling at age 0). We
// therefore test against (a) the 5 internally-consistent spec rows and (b)
// independently hand-computed vectors and algebraic properties.

const breed = (name: string) => {
  const d = DICTIONARY.find((x) => x.breed === name);
  if (!d) throw new Error(`unknown breed ${name}`);
  return d;
};

describe("Intrinsic Value — internally-consistent rows from the spec table", () => {
  // [breed, age, health, desirability, expectedIntrinsic] — lifespan & base from the dictionary.
  const rows: [string, number, number, number, number][] = [
    ["Sphynx", 12.29, 77.82, 5, 1.48],
    ["Poodle", 0.77, 94.24, 9, 88.16],
    ["Lovebird", 2.17, 55.95, 5, 3.59],
    ["Guppy", 0.82, 86.18, 4, 1.0],
    ["Goldfish", 8.77, 67.85, 5, 0.21],
  ];

  for (const [name, age, health, desirability, expected] of rows) {
    test(`${name} @ age ${age}, health ${health}, des ${desirability} ≈ ${expected}`, () => {
      const d = breed(name);
      const v = intrinsicValue({ basePrice: d.basePrice, health, desirability, age, lifespan: d.lifespan });
      expect(v).toBeCloseTo(expected, 1);
    });
  }
});

describe("Intrinsic Value — hand-computed exact vectors", () => {
  test("brand-new pet (age 0, full health): Base × Desirability/10", () => {
    // Labrador: 100 × 1.00 × 0.8 × 1 = 80
    expect(intrinsicValue({ basePrice: 100, health: 100, desirability: 8, age: 0, lifespan: 12 })).toBe(80);
    // Macaw: 120 × 1.00 × 0.9 × 1 = 108
    expect(intrinsicValue({ basePrice: 120, health: 100, desirability: 9, age: 0, lifespan: 50 })).toBe(108);
  });

  test("half-lifespan halves the age factor", () => {
    // 100 × 1 × 0.8 × (1 − 6/12) = 40
    expect(intrinsicValue({ basePrice: 100, health: 100, desirability: 8, age: 6, lifespan: 12 })).toBe(40);
  });

  test("partial health scales linearly", () => {
    // 110 × 0.50 × 0.9 × (1 − 0/14) = 49.5
    expect(intrinsicValue({ basePrice: 110, health: 50, desirability: 9, age: 0, lifespan: 14 })).toBe(49.5);
  });

  test("max desirability (10) drops the /10 factor to 1", () => {
    // 50 × 0.8 × 1 × (1 − 2/10) = 32
    expect(intrinsicValue({ basePrice: 50, health: 80, desirability: 10, age: 2, lifespan: 10 })).toBe(32);
  });
});

describe("Intrinsic Value — boundaries", () => {
  test("age == lifespan → 0 (expired)", () => {
    expect(intrinsicValue({ basePrice: 100, health: 100, desirability: 10, age: 12, lifespan: 12 })).toBe(0);
  });

  test("age > lifespan → floored at 0, never negative", () => {
    expect(intrinsicValue({ basePrice: 100, health: 100, desirability: 10, age: 20, lifespan: 12 })).toBe(0);
  });

  test("zero health → 0", () => {
    expect(intrinsicValue({ basePrice: 100, health: 0, desirability: 10, age: 1, lifespan: 12 })).toBe(0);
  });
});

describe("Intrinsic Value — algebraic properties", () => {
  const base = { basePrice: 100, desirability: 7, lifespan: 12 };

  test("strictly decreasing as age increases (other factors fixed)", () => {
    let prev = Infinity;
    for (let age = 0; age <= 12; age += 1) {
      const v = intrinsicValue({ ...base, health: 90, age });
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  test("doubling health doubles value (within the non-floored range)", () => {
    const low = intrinsicValue({ ...base, health: 40, age: 2 });
    const high = intrinsicValue({ ...base, health: 80, age: 2 });
    // precision 1: the formula rounds to 2dp, so doubled values can differ by ~0.01
    expect(high).toBeCloseTo(low * 2, 1);
  });

  test("doubling base price doubles value", () => {
    const a = intrinsicValue({ basePrice: 50, health: 90, desirability: 6, age: 3, lifespan: 10 });
    const b = intrinsicValue({ basePrice: 100, health: 90, desirability: 6, age: 3, lifespan: 10 });
    expect(b).toBeCloseTo(a * 2, 5);
  });

  test("desirability is proportional", () => {
    const d2 = intrinsicValue({ basePrice: 80, health: 100, desirability: 2, age: 0, lifespan: 10 });
    const d4 = intrinsicValue({ basePrice: 80, health: 100, desirability: 4, age: 0, lifespan: 10 });
    expect(d4).toBeCloseTo(d2 * 2, 5);
  });
});

describe("Portfolio Value = available + locked + pets value", () => {
  test("locked = Σ active bids; available = cash − locked", () => {
    const p = computePortfolio({ cash: 500, activeBidAmounts: [60, 40], petValues: [80, 0, 25.5] });
    expect(p.locked).toBe(100);
    expect(p.available).toBe(400);
    expect(p.petsValue).toBe(105.5);
    // cash already includes locked, so total = cash + petsValue = 500 + 105.5
    expect(p.total).toBe(605.5);
  });

  test("no bids, no pets → all cash available", () => {
    expect(computePortfolio({ cash: 500, activeBidAmounts: [], petValues: [] }))
      .toEqual({ available: 500, locked: 0, petsValue: 0, total: 500 });
  });

  test("expired pets (intrinsic 0) contribute nothing to pets value", () => {
    const p = computePortfolio({ cash: 300, activeBidAmounts: [], petValues: [0, 0, 50] });
    expect(p.petsValue).toBe(50);
    expect(p.total).toBe(350);
  });

  test("fully-locked cash leaves zero available", () => {
    const p = computePortfolio({ cash: 200, activeBidAmounts: [200], petValues: [] });
    expect(p.available).toBe(0);
    expect(p.locked).toBe(200);
    expect(p.total).toBe(200);
  });
});
