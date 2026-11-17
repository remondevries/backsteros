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

import { rejectNonOwnerShellForCloudForward } from "../lib/api-key-admin-actor.js";
import {
  API_KEY_CLOUD_UNAVAILABLE_MESSAGE,
  ApiKeyAdminCloudForwardError,
  forwardApiKeyAdminToCloud,
  shouldForwardApiKeyAdminToCloud,
} from "../lib/api-key-admin-cloud-forward.js";
import { evaluateApiKeySecretAccess } from "../lib/api-key-secret-access.js";
import { toApiKey } from "../lib/mappers.js";
import { requestClientAddress } from "../lib/request-address.js";
import type { AuthContext } from "../middleware/auth.js";
import { canManageApiKeys } from "../lib/powersync-auth.js";
import { mirrorCloudMintedApiKeyLocally } from "../services/api-key-admin-local-mirror.js";
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

type CloudMintedShape = {
  id: string;
  workspaceId: string;
  userId?: string | null;
  name: string;
  prefix?: string;
  scopes: string[];
  contactId?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  revokedAt?: string | null;
};

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

  /**
   * OS-181: on hybrid local-core, mutate keys on cloud. Agent/app keys cannot
   * drive the forward. Dynamic Island pair stays on its own local route.
   */
  async function forwardMutationOrFail(input: {
    auth: AuthContext;
    method: "POST" | "PATCH";
    path: string;
    body: unknown;
  }): Promise<
    | { kind: "error"; status: number; body: Record<string, unknown> }
    | { kind: "ok"; status: number; body: unknown }
  > {
    const denied = rejectNonOwnerShellForCloudForward(input.auth);
    if (denied) {
      return { kind: "error", status: denied.status, body: denied.body };
    }
    try {
      const result = await forwardApiKeyAdminToCloud({
        method: input.method,
        path: input.path,
        userId: input.auth.userId!,
        workspaceId: input.auth.workspaceId,
        body: input.body,
      });
      if (result.status >= 400) {
        const errBody =
          result.body && typeof result.body === "object"
            ? (result.body as Record<string, unknown>)
            : { error: `Cloud returned HTTP ${result.status}`, code: "bad_request" };
        return { kind: "error", status: result.status, body: errBody };
      }
      return { kind: "ok", status: result.status, body: result.body };
    } catch (error) {
      if (error instanceof ApiKeyAdminCloudForwardError) {
        return {
          kind: "error",
          status: error.status,
          body: { error: error.message, code: error.code },
        };
      }
      return {
        kind: "error",
        status: 503,
        body: {
          error: API_KEY_CLOUD_UNAVAILABLE_MESSAGE,
          code: "api_key_cloud_unavailable",
        },
      };
    }
  }

  /**
   * Agent persona keys (and the payment-proposal agent key) may only be
   * revealed/rotated from the local shell. Missing keys fall through (404).
   */
  async function denyApiKeySecretAccess(
    auth: AuthContext,
    keyId: string,
  ): Promise<{
    status: 403;
    body: { error: string; code: "forbidden" };
  } | null> {
    const target = await apiKeyService.getApiKeySecretAccessTarget(
      auth.workspaceId,
      keyId,
    );
    if (!target) return null;
    const decision = evaluateApiKeySecretAccess(auth, target);
    if (decision.allowed) return null;
    return {
      status: 403,
      body: { error: decision.reason, code: "forbidden" },
    };
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

      if (shouldForwardApiKeyAdminToCloud()) {
        const forwarded = await forwardMutationOrFail({
          auth,
          method: "POST",
          path: "/internal/core-replication/api-keys",
          body: c.req.valid("json"),
        });
        if (forwarded.kind === "error") {
          return c.json(forwarded.body, forwarded.status as 400);
        }
        const payload = forwarded.body as {
          apiKey?: CloudMintedShape;
          secret?: string;
        };
        if (
          payload?.apiKey &&
          typeof payload.secret === "string" &&
          payload.secret
        ) {
          await mirrorCloudMintedApiKeyLocally({
            apiKey: {
              id: payload.apiKey.id,
              workspaceId: payload.apiKey.workspaceId,
              userId: payload.apiKey.userId,
              name: payload.apiKey.name,
              prefix: payload.apiKey.prefix,
              scopes: payload.apiKey.scopes,
              contactId: payload.apiKey.contactId,
              expiresAt: payload.apiKey.expiresAt,
              createdAt: payload.apiKey.createdAt,
              updatedAt: payload.apiKey.updatedAt,
              revokedAt: payload.apiKey.revokedAt,
            },
            secret: payload.secret,
          }).catch(() => undefined);
        }
        return c.json(forwarded.body, forwarded.status as 201);
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
        if (error instanceof Error && error.message === "AGENT_CONTACT_REQUIRED") {
          return c.json(badRequest("Agent keys require a contact"), 400);
        }
        if (error instanceof Error && error.message === "AGENT_SCOPES_REQUIRED") {
          return c.json(
            badRequest(
              "Agent keys need at least one non-door scope (settings:write is not allowed)",
            ),
            400,
          );
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

      if (shouldForwardApiKeyAdminToCloud()) {
        const keyId = c.req.param("id");
        const forwarded = await forwardMutationOrFail({
          auth,
          method: "PATCH",
          path: `/internal/core-replication/api-keys/${keyId}`,
          body: c.req.valid("json"),
        });
        if (forwarded.kind === "error") {
          return c.json(forwarded.body, forwarded.status as 400);
        }
        return c.json(forwarded.body, forwarded.status as 200);
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
        if (error instanceof Error && error.message === "CONTACT_CLEAR_FORBIDDEN") {
          return c.json(
            badRequest(
              "Cannot clear contact on an API key; create an Access key instead",
            ),
            400,
          );
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

    const denied = await denyApiKeySecretAccess(auth, c.req.param("id"));
    if (denied) return c.json(denied.body, denied.status);

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

    const denied = await denyApiKeySecretAccess(auth, c.req.param("id"));
    if (denied) return c.json(denied.body, denied.status);

    if (shouldForwardApiKeyAdminToCloud()) {
      const keyId = c.req.param("id");
      const forwarded = await forwardMutationOrFail({
        auth,
        method: "POST",
        path: `/internal/core-replication/api-keys/${keyId}/rotate`,
        body: {},
      });
      if (forwarded.kind === "error") {
        return c.json(forwarded.body, forwarded.status as 400);
      }
      const payload = forwarded.body as {
        apiKey?: CloudMintedShape;
        secret?: string;
      };
      if (
        payload?.apiKey &&
        typeof payload.secret === "string" &&
        payload.secret
      ) {
        await mirrorCloudMintedApiKeyLocally({
          apiKey: {
            id: payload.apiKey.id,
            workspaceId: payload.apiKey.workspaceId,
            userId: payload.apiKey.userId,
            name: payload.apiKey.name,
            prefix: payload.apiKey.prefix,
            scopes: payload.apiKey.scopes,
            contactId: payload.apiKey.contactId,
            expiresAt: payload.apiKey.expiresAt,
            createdAt: payload.apiKey.createdAt,
            updatedAt: payload.apiKey.updatedAt,
            revokedAt: payload.apiKey.revokedAt,
          },
          secret: payload.secret,
        }).catch(() => undefined);
      }
      return c.json(forwarded.body, forwarded.status as 200);
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

    if (shouldForwardApiKeyAdminToCloud()) {
      const keyId = c.req.param("id");
      const forwarded = await forwardMutationOrFail({
        auth,
        method: "POST",
        path: `/internal/core-replication/api-keys/${keyId}/revoke`,
        body: {},
      });
      if (forwarded.kind === "error") {
        return c.json(forwarded.body, forwarded.status as 400);
      }
      return c.body(null, 204);
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
