import { can, forbidden, getAuth, whoopService, z } from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** WHOOP status and day data. */
export function registerWhoopRoutes(app: Hono) {
  app.get("/api/v1/whoop/status", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:read")) return c.json(forbidden(), 403);
    return c.json(whoopService.getWhoopSettingsStatus());
  });

  app.get("/api/v1/whoop/day", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:read")) return c.json(forbidden(), 403);
    const parsed = z.string().date().safeParse(c.req.query("date"));
    if (!parsed.success) {
      return c.json({ error: "Invalid date (YYYY-MM-DD)", code: "bad_request" }, 400);
    }
    return c.json(await whoopService.fetchWhoopDaySnapshot(parsed.data));
  });
}
