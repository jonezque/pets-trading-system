import { config } from "./config.ts";
import { migrate } from "./db/migrate.ts";
import { seed } from "./db/seed.ts";
import { startEngine } from "./engine/tick.ts";
import { createApp } from "./app.tsx";

// Bootstrap: run migrations + seed (idempotent), start the valuation engine,
// then serve the app. Designed so a fresh container is ready with one command.
await migrate();
await seed();
startEngine();

const app = createApp();

console.log(`[server] listening on http://localhost:${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
