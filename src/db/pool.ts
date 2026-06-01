import postgres from "postgres";
import { config } from "../config.ts";

// Single shared connection pool for the process.
// `transform: { undefined: null }` lets us pass undefined as SQL NULL.
export const sql = postgres(config.databaseUrl, {
  max: 10,
  onnotice: () => {}, // silence NOTICE chatter (e.g. "IF NOT EXISTS")
  transform: { undefined: null },
});

export type Sql = typeof sql;
