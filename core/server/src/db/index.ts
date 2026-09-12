import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

/**
 * Prefer IPv4 loopback. `localhost` can resolve to `::1` first; OrbStack's
 * Postgres publish is often IPv4-only, which leaves postgres.js sockets hung
 * until CONNECT_TIMEOUT while `/health` still looks fine.
 */
function preferIpv4Loopback(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      return parsed.toString();
    }
  } catch {
    // Keep the original string if URL parsing fails.
  }
  return url;
}

const client = postgres(preferIpv4Loopback(connectionString), {
  max: 10,
  prepare: false,
  // Fail fast instead of stacking ~30s auth waits when the pool is wedged.
  connect_timeout: 10,
  // Drop idle connections so a post-blip pool can open fresh sockets.
  idle_timeout: 20,
  // Recycle long-lived connections (OrbStack / publish path can go stale).
  max_lifetime: 60 * 30,
  keep_alive: 60,
});

export const db = drizzle(client, { schema });
export const sqlClient = client;
