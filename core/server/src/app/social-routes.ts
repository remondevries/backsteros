/**
 * Social layer settings + provider webhook ingest (OS-98).
 * Template: Mapbox settings + AgentMail webhook ingest.
 */
import type { Context, Hono } from "hono";

import {
  socialConnectAccountInputSchema,
  updateSocialSettingsSchema,
} from "@backsteros/contracts";

import {
  disconnectSocialAccount,
  getSocialSettings,
  handleZernioWebhookDelivery,
  listZernioWebhookSecrets,
  startSocialAccountConnect,
  syncSocialAccounts,
  testSocialConnection,
  updateSocialSettings,
  zernioHeadersFromRequest,
  ZernioApiError,
} from "../social/providers/zernio/index.js";
import { can, forbidden, getAuth } from "./route-helpers.js";

export function registerSocialRoutes(app: Hono) {
  app.get("/api/v1/settings/social", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(await getSocialSettings(auth.workspaceId));
  });

  app.patch("/api/v1/settings/social", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateSocialSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid social settings", code: "bad_request" },
        400,
      );
    }
    return c.json(await updateSocialSettings(auth.workspaceId, parsed.data));
  });

  app.get("/api/v1/settings/social/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(await testSocialConnection(auth.workspaceId));
  });

  app.post("/api/v1/settings/social/sync-accounts", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    try {
      return c.json(await syncSocialAccounts(auth.workspaceId));
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.post("/api/v1/settings/social/connect", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = socialConnectAccountInputSchema.safeParse(
      await c.req.json(),
    );
    if (!parsed.success) {
      return c.json(
        { error: "Invalid connect request", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await startSocialAccountConnect(auth.workspaceId, parsed.data.platform, {
          redirectUrl: parsed.data.redirectUrl,
          reconnectAccountId: parsed.data.reconnectAccountId,
        }),
      );
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.post(
    "/api/v1/settings/social/accounts/:accountId/disconnect",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const accountId = decodeURIComponent(c.req.param("accountId"));
      try {
        return c.json(await disconnectSocialAccount(auth.workspaceId, accountId));
      } catch (error) {
        return socialError(c, error);
      }
    },
  );

  /**
   * Provider webhook ingest. Signature-verified; auth middleware skips this path.
   * Ack fast (204); work runs in a background job.
   */
  app.post("/api/v1/webhooks/social/zernio", async (c) => {
    const rawBody = await c.req.text();
    const headers = zernioHeadersFromRequest((name) => c.req.header(name));
    const secrets = await listZernioWebhookSecrets();
    const result = await handleZernioWebhookDelivery({
      rawBody,
      headers,
      secrets,
    });
    if (!result.ok) {
      return c.body(null, 400);
    }
    return c.body(null, 204);
  });
}

function socialError(c: Context, error: unknown) {
  const message =
    error instanceof ZernioApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Social request failed";
  if (error instanceof ZernioApiError && error.status === 404) {
    return c.json({ error: message, code: "not_found" }, 404);
  }
  return c.json({ error: message, code: "bad_request" }, 400);
}
