import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";

const server = app.listen(env.PORT, () => {
  console.log(`Spark Clean API listening on http://localhost:${env.PORT}/api/v1`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
