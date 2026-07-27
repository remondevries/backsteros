import type { Context, Hono, Next } from "hono";
import { zValidator } from "@hono/zod-validator";
import { jwtVerify } from "jose";
import { z } from "zod";

import type { AuthContext } from "../middleware/auth.js";
import { resolveAuth } from "../middleware/auth.js";
import {
  getPowerSyncAudience,
  getPowerSyncUrl,
  signPowerSyncToken,
} from "../lib/powersync-auth.js";
import {
  POWERSYNC_OPS,
  POWERSYNC_TABLES,
  SYNC_ENTITIES,
  SYNC_OPERATIONS,
  SYNC_SCHEMA_VERSION,
} from "../lib/sync-constants.js";
import * as syncService from "../services/sync.js";

const syncChangeSchema = z.object({
  entity: z.enum(SYNC_ENTITIES),
  entity_id: z.string(),
  operation: z.enum(SYNC_OPERATIONS),
  payload: z.record(z.unknown()),
  updated_at: z.number().int(),
});

const syncPushSchema = z.object({
  schema_version: z.number().int(),
  device_id: z.string().min(1),
  mutations: z
    .array(
      z.object({
        id: z.string().min(1),
        changes: z.array(syncChangeSchema).min(1),
      }),
    )
    .min(1)
    .max(100),
});

const powerSyncWriteSchema = z.object({
  device_id: z.string().min(1),
  mutation_id: z.string().min(1),
  batch: z
    .array(
      z.object({
        table: z.enum(POWERSYNC_TABLES),
        op: z.enum(POWERSYNC_OPS),
        id: z.string(),
        data: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(500),
});

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

async function withClerkAuth(c: Context, next: Next) {
  const authorization = c.req.header("Authorization");
  if (!authorization) {
    console.warn(
      "[powersync/token] missing Authorization header",
      c.req.header("Origin") ?? "(no origin)",
    );
  }
  const auth = await resolveAuth(authorization);
  if (!auth || auth.kind !== "clerk" || !auth.clerkUserId) {
    return c.json(unauthorized(), 401);
  }
  c.set("auth", auth);
  await next();
}

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice("Bearer ".length).trim();
}

async function withClerkOrPowerSyncAuth(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  const token = getBearerToken(header);
  const secret = process.env.POWERSYNC_JWT_SECRET;

  if (token && secret) {
    try {
      const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
        audience: getPowerSyncAudience(),
      });
      if (
        typeof verified.payload.sub === "string" &&
        typeof verified.payload.workspace_id === "string"
      ) {
        c.set("auth", {
          kind: "clerk",
          userId: null,
          clerkUserId: verified.payload.sub,
          apiKeyId: null,
          workspaceId: verified.payload.workspace_id,
          membershipRole: "member",
          scopes: [],
        } satisfies AuthContext);
        await next();
        return;
      }
    } catch {
      // fall through to Clerk session auth
    }
  }

  const auth = await resolveAuth(header);
  if (auth?.kind === "clerk" && auth.clerkUserId) {
    c.set("auth", auth);
    await next();
    return;
  }

  return c.json(unauthorized(), 401);
}

function getAuth(c: Context): AuthContext {
  return c.get("auth");
}

export function registerSyncRoutes(app: Hono) {
  app.use("/api/v1/sync/*", withClerkAuth);
  app.get("/api/v1/powersync/token", withClerkAuth);
  app.post("/api/v1/powersync/write", withClerkOrPowerSyncAuth);

  app.post("/api/v1/sync/bootstrap", async (c) => {
    const payload = await syncService.bootstrapSync(getAuth(c).workspaceId);
    return c.json(payload);
  });

  app.get("/api/v1/sync/pull", async (c) => {
    const cursor = Number(c.req.query("cursor") ?? "0");
    if (!Number.isFinite(cursor) || cursor < 0) {
      return c.json({ error: "Invalid cursor", code: "bad_request" }, 400);
    }

    const payload = await syncService.pullSync(getAuth(c).workspaceId, cursor);
    return c.json(payload);
  });

  app.post(
    "/api/v1/sync/push",
    zValidator("json", syncPushSchema),
    async (c) => {
      const body = c.req.valid("json");
      if (body.schema_version !== SYNC_SCHEMA_VERSION) {
        return c.json(
          { error: "Unsupported schema version", code: "unsupported_schema" },
          400,
        );
      }

      try {
        const result = await syncService.pushSyncMutations({
          workspaceId: getAuth(c).workspaceId,
          deviceId: body.device_id,
          mutations: body.mutations,
        });
        return c.json(result);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_KEY_EXISTS") {
          return c.json(
            { error: "Project key already exists", code: "project_key_exists" },
            400,
          );
        }
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json({ error: "Project not found", code: "not_found" }, 404);
        }
        throw error;
      }
    },
  );

  app.get("/api/v1/powersync/token", async (c) => {
    const auth = getAuth(c);
    const endpoint = getPowerSyncUrl();
    if (!endpoint) {
      return c.json(
        { error: "PowerSync is not configured", code: "powersync_unconfigured" },
        503,
      );
    }

    const token = await signPowerSyncToken(
      auth.clerkUserId!,
      auth.workspaceId,
    );
    return c.json({
      endpoint,
      token,
      audience: getPowerSyncAudience(),
    });
  });

  app.post(
    "/api/v1/powersync/write",
    zValidator("json", powerSyncWriteSchema),
    async (c) => {
      const body = c.req.valid("json");

      try {
        await syncService.applyPowerSyncBatch({
          workspaceId: getAuth(c).workspaceId,
          deviceId: body.device_id,
          mutationId: body.mutation_id,
          batch: body.batch,
        });
        return c.json({ ok: true });
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_KEY_EXISTS") {
          return c.json(
            { error: "Project key already exists", code: "project_key_exists" },
            400,
          );
        }
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json({ error: "Project not found", code: "not_found" }, 404);
        }
        throw error;
      }
    },
  );
}
