import postgres from "postgres";
import { config } from "../config.ts";

// Local dev/test (docker-compose `db`, or localhost) needs no TLS and can use
// prepared statements. Hosted Postgres (Supabase/Neon) requires TLS and is
// usually reached through a connection pooler that doesn't support prepared
// statements — so for remote hosts we enable SSL and disable prepares.
const url = config.databaseUrl;
const isLocal = /@(localhost|127\.0\.0\.1|db):/.test(url);

// Single shared connection pool for the process.
// `transform: { undefined: null }` lets us pass undefined as SQL NULL.
export const sql = postgres(url, {
  max: 10,
  onnotice: () => {}, // silence NOTICE chatter (e.g. "IF NOT EXISTS")
  transform: { undefined: null },
  ssl: isLocal ? false : "require",
  prepare: isLocal,
});

export type Sql = typeof sql;
