import { describe, expect, test } from "bun:test";
import { tickPet, clamp, fluctuate } from "../src/domain/valuation.ts";

// Formula tests (intrinsic value + portfolio) live in formula.test.ts.
// This file covers the valuation engine's per-tick transition helpers.

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

