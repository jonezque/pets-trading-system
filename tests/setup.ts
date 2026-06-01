import { afterAll } from "bun:test";
import { sql } from "../src/db/pool.ts";

// Preloaded once for the whole test run (see bunfig.toml). The DB connection
// pool is a shared singleton, so it must be closed exactly once — at the very
// end — not in each test file's afterAll (which would close it for the files
// that run afterward).
afterAll(async () => {
  await sql.end();
});
