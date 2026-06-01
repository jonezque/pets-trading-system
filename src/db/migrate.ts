import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "./pool.ts";

// Minimal, transparent migration runner: applies every *.sql file in
// ./migrations exactly once, in lexical order, tracked in a ledger table.
export async function migrate(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const dir = join(import.meta.dir, "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  const applied = new Set(
    (await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`).map(
      (r) => r.filename,
    ),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const ddl = await Bun.file(join(dir, file)).text();
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
    console.log(`[migrate] applied ${file}`);
  }
}

// Allow running standalone: `bun src/db/migrate.ts`
if (import.meta.main) {
  await migrate();
  await sql.end();
}
