/**
 * TV today-counts snapshot + SSE (OS-137).
 * Auth: exclusive `tv.today_counts` API key only.
 */
import type { Context, Hono, Next } from "hono";
import { streamSSE } from "hono/streaming";

import { resolveAuth, logUnauthorizedRequest } from "../middleware/auth.js";
import { subscribeAgentPresence } from "../lib/agent-presence-events.js";
import { subscribeWorkspaceUpdated } from "../lib/workspace-events.js";
import { isTvTodayCountsAuth } from "../lib/tv-today-counts-auth.js";
import { getTvTodayCounts } from "../services/tv-today-counts.js";
import { forbidden, logApiKeyRequest, unauthorized } from "./route-helpers.js";

async function requireTvTodayCountsAuth(c: Context, next: Next) {
  const auth = await resolveAuth(c.req.header("Authorization"));
  if (!auth) {
    const url = new URL(c.req.url);
    void logUnauthorizedRequest({
      method: c.req.method,
      path: `${url.pathname}${url.search}`,
      userAgent: c.req.header("User-Agent"),
      authorization: c.req.header("Authorization"),
    });
    return c.json(unauthorized(), 401);
  }
  if (!isTvTodayCountsAuth(auth)) {
    return c.json(forbidden(), 403);
  }
  c.set("auth", auth);
  await next();
  const url = new URL(c.req.url);
  logApiKeyRequest(auth, c.req.method, `${url.pathname}${url.search}`, c.res.status);
}

export function registerTvTodayCountsRoutes(app: Hono) {
  app.use("/api/tv/v1/*", requireTvTodayCountsAuth);

  app.get("/api/tv/v1/today-counts", async (c) => {
    const auth = c.get("auth");
    const payload = await getTvTodayCounts(auth.workspaceId);
    return c.json(payload);
  });

  app.get("/api/tv/v1/today-counts/stream", async (c) => {
    const auth = c.get("auth");
    const workspaceId = auth.workspaceId;

    return streamSSE(c, async (stream) => {
      let closed = false;
      let pendingWrites = 0;
      const MAX_PENDING_WRITES = 8;
      let lastJson: string | null = null;

      const emitCounts = async () => {
        if (closed || pendingWrites >= MAX_PENDING_WRITES) return;
        pendingWrites += 1;
        try {
          const payload = await getTvTodayCounts(workspaceId);
          const data = JSON.stringify(payload);
          if (data === lastJson) return;
          lastJson = data;
          await stream.writeSSE({
            event: "today-counts",
            data,
          });
        } catch {
          closed = true;
        } finally {
          pendingWrites = Math.max(0, pendingWrites - 1);
        }
      };

      const onChange = () => {
        void emitCounts();
      };

      const unsubscribeTask = subscribeWorkspaceUpdated(workspaceId, (event) => {
        if (event.kind !== "task") return;
        onChange();
      });
      const unsubscribePresence = subscribeAgentPresence(workspaceId, () => {
        onChange();
      });

      stream.onAbort(() => {
        closed = true;
        unsubscribeTask();
        unsubscribePresence();
      });

      // Immediate snapshot on connect (even if identical to a prior session).
      try {
        const payload = await getTvTodayCounts(workspaceId);
        lastJson = JSON.stringify(payload);
        await stream.writeSSE({
          event: "today-counts",
          data: lastJson,
        });
      } catch {
        closed = true;
        unsubscribeTask();
        unsubscribePresence();
        return;
      }

      while (!closed) {
        await stream.sleep(15_000);
        if (closed) break;
        try {
          await stream.writeSSE({ event: "ping", data: "{}" });
        } catch {
          closed = true;
          break;
        }
      }

      unsubscribeTask();
      unsubscribePresence();
    });
  });
}
