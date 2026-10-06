import type { Hono } from "hono";

import { isOwnerShellAuth } from "../middleware/auth.js";
import { isCloudCoreRole } from "../lib/powersync-auth.js";
import { toApiKey } from "../lib/mappers.js";
import { rotateDynamicIslandApiKey } from "../lib/dynamic-island-local-key.js";
import { assertWorkspaceOwner } from "../services/ops.js";
import { getAuth, unauthorized } from "./route-helpers.js";

/**
 * Owner-only local-core pairing for the Dynamic Island poller (OS-88).
 * Does not write ~/.config — the CLI (or another local client) stores the secret.
 */
export function registerDynamicIslandRoutes(app: Hono) {
  app.post("/api/v1/dynamic-island/pair", async (c) => {
    if (isCloudCoreRole()) {
      return c.json({ error: "Not found", code: "not_found" as const }, 404);
    }

    const auth = getAuth(c);
    if (!isOwnerShellAuth(auth)) {
      return c.json(
        { error: "Owner shell session required", code: "unauthorized" as const },
        401,
      );
    }
    if (!auth.userId) {
      return c.json(unauthorized(), 401);
    }

    const isOwner = await assertWorkspaceOwner(
      auth.workspaceId,
      auth.userId,
      auth.membershipRole,
    );
    if (!isOwner) {
      return c.json({ error: "Owner only", code: "forbidden" as const }, 403);
    }

    const { row, secret, revokedIds } = await rotateDynamicIslandApiKey({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
    });
    const { notifyPeerOfEntityWrite } = await import(
      "../services/core-replication/nudge.js"
    );
    for (const entityId of revokedIds) {
      notifyPeerOfEntityWrite({
        workspaceId: auth.workspaceId,
        reason: "api_key",
        entity: "api_key",
        entityId,
        operation: "delete",
      });
    }
    notifyPeerOfEntityWrite({
      workspaceId: auth.workspaceId,
      reason: "api_key",
      entity: "api_key",
      entityId: row.id,
      operation: "upsert",
    });

    return c.json({ apiKey: toApiKey(row), secret }, 201);
  });
}
