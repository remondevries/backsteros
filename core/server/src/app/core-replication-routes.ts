import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  applyReplicatedAvatar,
  applyReplicatedAvatarDeletion,
} from "../services/core-replication/avatar-replication.js";
import {
  buildPullResponse,
  getReplicationRole,
  isReplicatedTable,
  receiveReplicationPush,
  REPLICATED_TABLES,
  type ReplicationChange,
} from "../services/core-replication/index.js";

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim();
}

function requireReplicationSecret(authorization: string | undefined): boolean {
  const secret = process.env.CORE_REPLICATION_SECRET?.trim();
  if (!secret) return false;
  return getBearerToken(authorization) === secret;
}

const pushBodySchema = z.object({
  changes: z.array(
    z.object({
      table: z.string(),
      rowId: z.string(),
      operation: z.enum(["upsert", "delete"]),
      payload: z.record(z.unknown()),
      origin: z.enum(["local", "cloud"]),
      updatedAt: z.string().optional(),
    }),
  ),
});

const pullQuerySchema = z.object({
  workspaceId: z.string().min(1),
  since: z.string().optional(),
  tables: z.string().optional(),
});

const avatarBodySchema = z.object({
  workspaceId: z.string().min(1),
  entityType: z.enum(["contact", "organization", "bank_account"]),
  entityId: z.string().min(1),
  contentType: z.string().min(1),
  bytesBase64: z.string().min(1),
});

const avatarDeleteQuerySchema = z.object({
  workspaceId: z.string().min(1),
  entityType: z.enum(["contact", "organization", "bank_account"]),
  entityId: z.string().min(1),
});

export function registerCoreReplicationRoutes(app: Hono) {
  app.post(
    "/api/v1/internal/replication/push",
    zValidator("json", pushBodySchema),
    async (c) => {
      if (!requireReplicationSecret(c.req.header("Authorization"))) {
        return c.json(unauthorized(), 401);
      }

      const body = c.req.valid("json");
      const changes = body.changes.filter((change): change is ReplicationChange =>
        isReplicatedTable(change.table),
      );
      const result = await receiveReplicationPush({ changes });
      return c.json(result);
    },
  );

  app.get(
    "/api/v1/internal/replication/pull",
    zValidator("query", pullQuerySchema),
    async (c) => {
      if (!requireReplicationSecret(c.req.header("Authorization"))) {
        return c.json(unauthorized(), 401);
      }

      const role = getReplicationRole();
      if (!role) {
        return c.json({ error: "Replication role not configured" }, 500);
      }

      const query = c.req.valid("query");
      const tables = query.tables
        ? query.tables.split(",").map((value) => value.trim())
        : [...REPLICATED_TABLES];
      const response = await buildPullResponse({
        workspaceId: query.workspaceId,
        since: query.since ?? null,
        tables,
        origin: role,
      });
      return c.json(response);
    },
  );

  app.post(
    "/api/v1/internal/replication/avatars",
    zValidator("json", avatarBodySchema),
    async (c) => {
      if (!requireReplicationSecret(c.req.header("Authorization"))) {
        return c.json(unauthorized(), 401);
      }

      const body = c.req.valid("json");
      const bytes = Buffer.from(body.bytesBase64, "base64");
      await applyReplicatedAvatar({
        workspaceId: body.workspaceId,
        entityType: body.entityType,
        entityId: body.entityId,
        contentType: body.contentType,
        bytes: new Uint8Array(bytes),
      });
      return c.json({ ok: true });
    },
  );

  app.delete(
    "/api/v1/internal/replication/avatars",
    zValidator("query", avatarDeleteQuerySchema),
    async (c) => {
      if (!requireReplicationSecret(c.req.header("Authorization"))) {
        return c.json(unauthorized(), 401);
      }

      const query = c.req.valid("query");
      await applyReplicatedAvatarDeletion({
        workspaceId: query.workspaceId,
        entityType: query.entityType,
        entityId: query.entityId,
      });
      return c.json({ ok: true });
    },
  );
}
