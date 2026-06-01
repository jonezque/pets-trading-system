// Pure valuation logic — no DB, no framework. Fully unit-testable.

/**
 * Intrinsic Value = Base × (Health/100) × (Desirability/10) × (1 − Age/Lifespan)
 * Floored at 0: an expired pet (age ≥ lifespan) is worth nothing intrinsically,
 * though the market may still bid on it.
 */
export function intrinsicValue(params: {
  basePrice: number;
  health: number;
  desirability: number;
  age: number;
  lifespan: number;
}): number {
  const { basePrice, health, desirability, age, lifespan } = params;
  const ageFactor = 1 - age / lifespan;
  const value = basePrice * (health / 100) * (desirability / 10) * ageFactor;
  return value > 0 ? round2(value) : 0;
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Apply a random ±fraction fluctuation to a value.
 * `rng` returns [0,1); injected so tests are deterministic.
 */
export function fluctuate(value: number, fraction: number, rng: () => number): number {
  const delta = (rng() * 2 - 1) * fraction; // in [-fraction, +fraction]
  return value * (1 + delta);
}

export type PetState = {
  ageYears: number;
  healthPct: number;
  desirability: number;
  status: "active" | "expired";
};

/**
 * Advance one pet by a single valuation tick:
 *  - age increases by `agePerTick`
 *  - health fluctuates ±fraction, clamped to [0, 100]
 *  - desirability fluctuates ±fraction, clamped to [1, 10]
 *  - pet becomes 'expired' once age ≥ lifespan
 */
export function tickPet(
  pet: PetState,
  opts: { lifespan: number; agePerTick: number; fluctuation: number; rng: () => number },
): PetState {
  const { lifespan, agePerTick, fluctuation, rng } = opts;
  const ageYears = round2(pet.ageYears + agePerTick);
  const healthPct = round2(clamp(fluctuate(pet.healthPct, fluctuation, rng), 0, 100));
  const desirability = round2(clamp(fluctuate(pet.desirability, fluctuation, rng), 1, 10));
  const status: "active" | "expired" = ageYears >= lifespan ? "expired" : "active";
  return { ageYears, healthPct, desirability, status };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
