// Central runtime configuration, parsed once from the environment (12-factor).
// All game tunables live here so behavior is explicit and reproducible.

const LOCAL_DB_FALLBACK = "postgres://pets:pets@localhost:5432/pets";
const dbUrl = process.env.DATABASE_URL || LOCAL_DB_FALLBACK;
if (!process.env.DATABASE_URL) {
  // Loud, so a missing env var on a hosted platform is obvious in logs instead
  // of surfacing later as a confusing ECONNREFUSED 127.0.0.1:5432.
  console.warn(
    "[config] DATABASE_URL is not set — using local fallback " +
      `(${LOCAL_DB_FALLBACK}). This is only valid for local dev; set DATABASE_URL in your hosting environment.`,
  );
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`Env ${name} must be numeric, got "${raw}"`);
  return parsed;
}

export const config = {
  port: num("PORT", 3000),
  databaseUrl: dbUrl,

  /** Fixed starting cash per trader (enough for ~5-8 new pets). */
  initialCash: num("INITIAL_CASH", 500),
  /** New-supply count created per breed at seed time. */
  supplyPerBreed: num("SUPPLY_PER_BREED", 3),
  /** Valuation engine tick interval in milliseconds. */
  valuationIntervalMs: num("VALUATION_INTERVAL_MS", 60_000),
  /** Years of age added to each pet per tick (accelerated so demos show aging). */
  agePerTick: num("AGE_PER_TICK", 1),
  /** Max +/- fluctuation for health & desirability per tick (e.g. 0.05 = +/-5%). */
  fluctuation: num("FLUCTUATION", 0.05),
  /** Browser polling cadence in seconds (rendered into HTMX hx-trigger). */
  pollInterval: num("POLL_INTERVAL", 3),
} as const;
