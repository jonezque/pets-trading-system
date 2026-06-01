import { describe, expect, test } from "bun:test";
import { intrinsicValue, tickPet, clamp, fluctuate } from "../src/domain/valuation.ts";
import { computePortfolio } from "../src/domain/portfolio.ts";

describe("intrinsicValue (formula vectors from spec)", () => {
  test("V1 Poodle 0.77/94.24/9 base110 lifespan14 ≈ 88.16", () => {
    expect(intrinsicValue({ basePrice: 110, health: 94.24, desirability: 9, age: 0.77, lifespan: 14 }))
      .toBeCloseTo(88.16, 1);
  });
  test("V2 Goldfish 8.77/67.85/5 base5 lifespan10 ≈ 0.21", () => {
    expect(intrinsicValue({ basePrice: 5, health: 67.85, desirability: 5, age: 8.77, lifespan: 10 }))
      .toBeCloseTo(0.21, 2);
  });
  test("V3 Guppy 0.82/86.18/4 base4 lifespan3 ≈ 1.00", () => {
    expect(intrinsicValue({ basePrice: 4, health: 86.18, desirability: 4, age: 0.82, lifespan: 3 }))
      .toBeCloseTo(1.0, 1);
  });
  test("V4 expired pet (age ≥ lifespan) floors at 0", () => {
    expect(intrinsicValue({ basePrice: 100, health: 100, desirability: 10, age: 12, lifespan: 12 })).toBe(0);
    expect(intrinsicValue({ basePrice: 100, health: 100, desirability: 10, age: 20, lifespan: 12 })).toBe(0);
  });
  test("brand-new full-health pet ≈ base × desirability/10", () => {
    expect(intrinsicValue({ basePrice: 100, health: 100, desirability: 8, age: 0, lifespan: 12 })).toBe(80);
  });
});

describe("clamp & fluctuate", () => {
  test("clamp bounds", () => {
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(50, 0, 100)).toBe(50);
  });
  test("fluctuate neutral rng (0.5) → no change", () => {
    expect(fluctuate(100, 0.05, () => 0.5)).toBe(100);
  });
  test("fluctuate max rng (1) → +fraction", () => {
    expect(fluctuate(100, 0.05, () => 1)).toBeCloseTo(105, 5);
  });
  test("fluctuate min rng (0) → −fraction", () => {
    expect(fluctuate(100, 0.05, () => 0)).toBeCloseTo(95, 5);
  });
});

describe("tickPet", () => {
  const opts = { lifespan: 12, agePerTick: 1, fluctuation: 0.05, rng: () => 0.5 };
  test("V7 neutral tick ages pet, leaves health/desirability", () => {
    const next = tickPet({ ageYears: 3, healthPct: 80, desirability: 6, status: "active" }, opts);
    expect(next.ageYears).toBe(4);
    expect(next.healthPct).toBe(80);
    expect(next.desirability).toBe(6);
    expect(next.status).toBe("active");
  });
  test("V4 pet expires at lifespan", () => {
    const next = tickPet({ ageYears: 11, healthPct: 100, desirability: 8, status: "active" }, opts);
    expect(next.ageYears).toBe(12);
    expect(next.status).toBe("expired");
  });
  test("V5 health clamped to [0,100]", () => {
    const next = tickPet({ ageYears: 0, healthPct: 99, desirability: 10, status: "active" },
      { ...opts, rng: () => 1 });
    expect(next.healthPct).toBeLessThanOrEqual(100);
  });
  test("V6 desirability clamped to [1,10]", () => {
    const next = tickPet({ ageYears: 0, healthPct: 50, desirability: 9.9, status: "active" },
      { ...opts, rng: () => 1 });
    expect(next.desirability).toBeLessThanOrEqual(10);
  });
});

describe("computePortfolio", () => {
  test("F1 total = available + locked + pets value", () => {
    const p = computePortfolio({ cash: 500, activeBidAmounts: [60, 40], petValues: [80, 0, 25.5] });
    expect(p.locked).toBe(100);
    expect(p.available).toBe(400);
    expect(p.petsValue).toBe(105.5);
    // cash already includes locked, so total = cash + petsValue = 500 + 105.5
    expect(p.total).toBe(605.5);
  });
  test("no bids, no pets", () => {
    const p = computePortfolio({ cash: 500, activeBidAmounts: [], petValues: [] });
    expect(p).toEqual({ available: 500, locked: 0, petsValue: 0, total: 500 });
  });
});
