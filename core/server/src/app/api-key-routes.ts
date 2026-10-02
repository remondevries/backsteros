/**
 * API key management routes (OS-73 split from routes.ts).
 */
import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createApiKeySchema,
  updateApiKeySchema,
} from "@backsteros/contracts";

import { toApiKey } from "../lib/mappers.js";
import type { AuthContext } from "../middleware/auth.js";
import { canManageApiKeys } from "../lib/powersync-auth.js";
import * as apiKeyService from "../services/api-keys.js";
import {
  forbidden,
  getAuth,
  notFound,
  unauthorized,
} from "./route-helpers.js";

export function registerApiKeyRoutes(app: Hono) {
  async function authCanManageApiKeys(auth: AuthContext): Promise<boolean> {
    const contactIsWorkspaceOwner =
      auth.kind === "api_key" && Boolean(auth.contactId)
        ? await apiKeyService.apiKeyContactIsWorkspaceOwner(auth)
        : false;
    return canManageApiKeys(auth, { contactIsWorkspaceOwner });
  }

  app.get("/api/v1/api-keys", async (c) => {
    const auth = getAuth(c);
    if (!(await authCanManageApiKeys(auth))) {
      return c.json(
        auth.kind === "api_key" ? forbidden() : unauthorized(),
        auth.kind === "api_key" ? 403 : 401,
      );
    }

    const rows = await apiKeyService.listApiKeys(auth.workspaceId);
    return c.json({ apiKeys: rows.map(toApiKey) });
  });

  app.post(
    "/api/v1/api-keys",
    zValidator("json", createApiKeySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!(await authCanManageApiKeys(auth))) {
        return c.json(
          auth.kind === "api_key" ? forbidden() : unauthorized(),
          auth.kind === "api_key" ? 403 : 401,
        );
      }

      try {
        const { row, secret } = await apiKeyService.createApiKey(
          auth.workspaceId,
          auth.userId!,
          c.req.valid("json"),
        );
        const { notifyPeerOfEntityWrite } = await import(
          "../services/core-replication/nudge.js"
        );
        notifyPeerOfEntityWrite({
          workspaceId: auth.workspaceId,
          reason: "api_key",
          entity: "api_key",
          entityId: row.id,
          operation: "upsert",
        });
        return c.json({ apiKey: toApiKey(row), secret }, 201);
      } catch (error) {
        if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
          return c.json(notFound("Contact"), 404);
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/api-keys/:id",
    zValidator("json", updateApiKeySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!(await authCanManageApiKeys(auth))) {
        return c.json(
          auth.kind === "api_key" ? forbidden() : unauthorized(),
          auth.kind === "api_key" ? 403 : 401,
        );
      }

      try {
        const row = await apiKeyService.updateApiKey(
          auth.workspaceId,
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!row) {
          return c.json(notFound("API key"), 404);
        }
        const { notifyPeerOfEntityWrite } = await import(
          "../services/core-replication/nudge.js"
        );
        notifyPeerOfEntityWrite({
          workspaceId: auth.workspaceId,
          reason: "api_key",
          entity: "api_key",
          entityId: row.id,
          operation: "upsert",
        });
        return c.json(toApiKey(row));
      } catch (error) {
        if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
          return c.json(notFound("Contact"), 404);
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/api-keys/:id", async (c) => {
    const auth = getAuth(c);
    if (!(await authCanManageApiKeys(auth))) {
      return c.json(
        auth.kind === "api_key" ? forbidden() : unauthorized(),
        auth.kind === "api_key" ? 403 : 401,
      );
    }

    const row = await apiKeyService.revokeApiKey(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) {
      return c.json(notFound("API key"), 404);
    }
    const { notifyPeerOfEntityWrite } = await import(
      "../services/core-replication/nudge.js"
    );
    notifyPeerOfEntityWrite({
      workspaceId: auth.workspaceId,
      reason: "api_key",
      entity: "api_key",
      entityId: row.id,
      operation: "delete",
    });

    return c.body(null, 204);
  });
}
