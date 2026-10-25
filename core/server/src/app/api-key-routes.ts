/**
 * API key management routes (OS-73 split from routes.ts).
 */
import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createApiKeySchema,
  listApiKeyAuditLogsQuerySchema,
  listApiKeyRequestLogsQuerySchema,
  updateApiKeySchema,
  type ApiKeyAuditLog,
  type ApiKeyRequestLog,
} from "@backsteros/contracts";

import { toApiKey } from "../lib/mappers.js";
import { requestClientAddress } from "../lib/request-address.js";
import type { AuthContext } from "../middleware/auth.js";
import { canManageApiKeys } from "../lib/powersync-auth.js";
import * as apiKeyService from "../services/api-keys.js";
import type { DbApiKeyAuditLog, DbApiKeyRequestLog } from "../db/schema.js";
import {
  forbidden,
  getAuth,
  notFound,
  unauthorized,
} from "./route-helpers.js";

function badRequest(message: string) {
  return { error: message, code: "bad_request" as const };
}

function toApiKeyAuditLog(row: DbApiKeyAuditLog): ApiKeyAuditLog {
  return {
    id: row.id,
    apiKeyId: row.apiKeyId,
    apiKeyName: row.apiKeyName,
    action: row.action as ApiKeyAuditLog["action"],
    actorUserId: row.actorUserId,
    actorKind: row.actorKind,
    actorApiKeyId: row.actorApiKeyId,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
  };
}

function toApiKeyRequestLog(row: DbApiKeyRequestLog): ApiKeyRequestLog {
  return {
    id: row.id,
    apiKeyId: row.apiKeyId,
    apiKeyName: row.apiKeyName,
    method: row.method,
    path: row.path,
    status: row.status,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
  };
}

function actorFromAuth(auth: AuthContext, address: string | null) {
  return {
    userId: auth.userId,
    kind: auth.kind,
    apiKeyId: auth.apiKeyId,
    address,
  };
}

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

  app.get(
    "/api/v1/api-keys/audit-logs",
    zValidator("query", listApiKeyAuditLogsQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!(await authCanManageApiKeys(auth))) {
        return c.json(
          auth.kind === "api_key" ? forbidden() : unauthorized(),
          auth.kind === "api_key" ? 403 : 401,
        );
      }

      const { limit } = c.req.valid("query");
      const rows = await apiKeyService.listApiKeyAuditLogs(auth.workspaceId, {
        limit,
      });
      return c.json({ auditLogs: rows.map(toApiKeyAuditLog) });
    },
  );

  app.get(
    "/api/v1/api-keys/request-logs",
    zValidator("query", listApiKeyRequestLogsQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!(await authCanManageApiKeys(auth))) {
        return c.json(
          auth.kind === "api_key" ? forbidden() : unauthorized(),
          auth.kind === "api_key" ? 403 : 401,
        );
      }

      const { limit } = c.req.valid("query");
      const rows = await apiKeyService.listApiKeyRequestLogs(auth.workspaceId, {
        limit,
      });
      return c.json({ requestLogs: rows.map(toApiKeyRequestLog) });
    },
  );

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
          actorFromAuth(auth, requestClientAddress(c)),
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
        if (
          error instanceof Error &&
          (error.message === "INVALID_EXPIRES_AT" ||
            error.message === "EXPIRES_AT_IN_PAST" ||
            error.message === "EXPIRES_AT_BEYOND_ACTOR")
        ) {
          return c.json(
            badRequest(
              error.message === "EXPIRES_AT_BEYOND_ACTOR"
                ? "expiresAt cannot outlive the acting API key"
                : "Invalid expiresAt",
            ),
            400,
          );
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
          actorFromAuth(auth, requestClientAddress(c)),
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
        if (
          error instanceof Error &&
          (error.message === "INVALID_EXPIRES_AT" ||
            error.message === "EXPIRES_AT_IN_PAST" ||
            error.message === "EXPIRES_AT_BEYOND_ACTOR")
        ) {
          return c.json(
            badRequest(
              error.message === "EXPIRES_AT_BEYOND_ACTOR"
                ? "expiresAt cannot outlive the acting API key"
                : "Invalid expiresAt",
            ),
            400,
          );
        }
        throw error;
      }
    },
  );

  app.get("/api/v1/api-keys/:id/secret", async (c) => {
    const auth = getAuth(c);
    if (!(await authCanManageApiKeys(auth))) {
      return c.json(
        auth.kind === "api_key" ? forbidden() : unauthorized(),
        auth.kind === "api_key" ? 403 : 401,
      );
    }

    const secret = await apiKeyService.revealApiKeySecret(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!secret) {
      return c.json(notFound("API key secret"), 404);
    }
    return c.json({ secret });
  });

  app.post("/api/v1/api-keys/:id/rotate", async (c) => {
    const auth = getAuth(c);
    if (!(await authCanManageApiKeys(auth))) {
      return c.json(
        auth.kind === "api_key" ? forbidden() : unauthorized(),
        auth.kind === "api_key" ? 403 : 401,
      );
    }

    try {
      const rotated = await apiKeyService.rotateApiKey(
        auth.workspaceId,
        c.req.param("id"),
        actorFromAuth(auth, requestClientAddress(c)),
      );
      if (!rotated) {
        return c.json(notFound("API key"), 404);
      }
      const { notifyPeerOfEntityWrite } = await import(
        "../services/core-replication/nudge.js"
      );
      notifyPeerOfEntityWrite({
        workspaceId: auth.workspaceId,
        reason: "api_key",
        entity: "api_key",
        entityId: rotated.row.id,
        operation: "upsert",
      });
      return c.json({ apiKey: toApiKey(rotated.row), secret: rotated.secret });
    } catch (error) {
      if (error instanceof Error && error.message === "API_KEY_EXPIRED") {
        return c.json(
          badRequest(
            "Cannot rotate an expired key; extend or clear expiresAt first",
          ),
          400,
        );
      }
      if (
        error instanceof Error &&
        error.message === "EXPIRES_AT_BEYOND_ACTOR"
      ) {
        return c.json(
          badRequest(
            "Cannot rotate a key that outlives the acting API key; shorten its expiry first",
          ),
          400,
        );
      }
      throw error;
    }
  });

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
      actorFromAuth(auth, requestClientAddress(c)),
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
