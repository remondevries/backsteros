/**
 * Social layer settings + provider webhook ingest (OS-98).
 * Template: Mapbox settings + AgentMail webhook ingest.
 */
import type { Context, Hono } from "hono";

import {
  createSocialPlannedPostSchema,
  editSocialFeedPostInputSchema,
  likeSocialFeedPostInputSchema,
  publishSocialPostInputSchema,
  socialConnectAccountInputSchema,
  socialFeedCommentsQuerySchema,
  socialFeedQuerySchema,
  unlikeSocialFeedPostInputSchema,
  updateSocialPlannedPostSchema,
  updateSocialSettingsSchema,
} from "@backsteros/contracts";

import {
  createSocialPlannedPost,
  deleteSocialPlannedPost,
  getSocialPlannedPostMediaBytes,
  listSocialPlannedPosts,
  updateSocialPlannedPost,
} from "../social/planned-posts.js";
import {
  disconnectSocialAccount,
  editSocialFeedPost,
  getSocialSettings,
  handleZernioWebhookDelivery,
  likeSocialFeedPost,
  listSocialFeedComments,
  listSocialFeedPosts,
  listZernioWebhookSecrets,
  publishSocialPost,
  startSocialAccountConnect,
  syncSocialAccounts,
  testSocialConnection,
  unlikeSocialFeedPost,
  updateSocialSettings,
  zernioHeadersFromRequest,
  ZernioApiError,
} from "../social/providers/zernio/index.js";
import { can, forbidden, getAuth, notFound } from "./route-helpers.js";

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

  app.get("/api/v1/social/feed", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:read")) return c.json(forbidden(), 403);
    const parsed = socialFeedQuerySchema.safeParse({
      platform: c.req.query("platform"),
      accountKind: c.req.query("accountKind"),
    });
    if (!parsed.success) {
      return c.json(
        { error: "Invalid social feed query", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(await listSocialFeedPosts(auth.workspaceId, parsed.data));
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.get("/api/v1/social/feed/comments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:read")) return c.json(forbidden(), 403);
    const parsed = socialFeedCommentsQuerySchema.safeParse({
      platform: c.req.query("platform"),
      accountKind: c.req.query("accountKind"),
      postId: c.req.query("postId"),
    });
    if (!parsed.success) {
      return c.json(
        { error: "Invalid social feed comments query", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await listSocialFeedComments(auth.workspaceId, parsed.data),
      );
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.post("/api/v1/social/publish", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:write")) return c.json(forbidden(), 403);
    const parsed = publishSocialPostInputSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid publish request", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(await publishSocialPost(auth.workspaceId, parsed.data));
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.post("/api/v1/social/feed/like", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:write")) return c.json(forbidden(), 403);
    const parsed = likeSocialFeedPostInputSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid like request", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(await likeSocialFeedPost(auth.workspaceId, parsed.data));
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.post("/api/v1/social/feed/unlike", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:write")) return c.json(forbidden(), 403);
    const parsed = unlikeSocialFeedPostInputSchema.safeParse(
      await c.req.json(),
    );
    if (!parsed.success) {
      return c.json(
        { error: "Invalid unlike request", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(await unlikeSocialFeedPost(auth.workspaceId, parsed.data));
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.post("/api/v1/social/feed/edit", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:write")) return c.json(forbidden(), 403);
    const parsed = editSocialFeedPostInputSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid edit request", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(await editSocialFeedPost(auth.workspaceId, parsed.data));
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.get("/api/v1/social/planned-posts", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:read")) return c.json(forbidden(), 403);
    const posts = await listSocialPlannedPosts(auth.workspaceId);
    return c.json({ posts });
  });

  app.post("/api/v1/social/planned-posts", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:write")) return c.json(forbidden(), 403);
    const parsed = createSocialPlannedPostSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid planned post", code: "bad_request" },
        400,
      );
    }
    try {
      const created = await createSocialPlannedPost(
        auth.workspaceId,
        parsed.data,
      );
      return c.json(created, 201);
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.patch("/api/v1/social/planned-posts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:write")) return c.json(forbidden(), 403);
    const id = decodeURIComponent(c.req.param("id"));
    const parsed = updateSocialPlannedPostSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid planned post patch", code: "bad_request" },
        400,
      );
    }
    try {
      const updated = await updateSocialPlannedPost(
        auth.workspaceId,
        id,
        parsed.data,
      );
      if (!updated) return c.json(notFound("Planned post"), 404);
      return c.json(updated);
    } catch (error) {
      return socialError(c, error);
    }
  });

  app.delete("/api/v1/social/planned-posts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:write")) return c.json(forbidden(), 403);
    const id = decodeURIComponent(c.req.param("id"));
    const deleted = await deleteSocialPlannedPost(auth.workspaceId, id);
    if (!deleted) return c.json(notFound("Planned post"), 404);
    return c.body(null, 204);
  });

  app.get("/api/v1/social/planned-posts/:id/media/:mediaId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "social:read")) return c.json(forbidden(), 403);
    const id = decodeURIComponent(c.req.param("id"));
    const mediaId = decodeURIComponent(c.req.param("mediaId"));
    const media = await getSocialPlannedPostMediaBytes(
      auth.workspaceId,
      id,
      mediaId,
    );
    if (!media) return c.json(notFound("Planned post media"), 404);
    c.header("Content-Type", media.contentType);
    if (media.filename) {
      c.header(
        "Content-Disposition",
        `inline; filename="${media.filename.replace(/"/g, "")}"`,
      );
    }
    c.header("Cache-Control", "private, max-age=3600");
    return c.body(Buffer.from(media.bytes));
  });

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
