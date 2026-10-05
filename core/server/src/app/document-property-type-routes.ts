import type { Context, Hono } from "hono";
import { z } from "zod";

import {
  agentMustProposeDocumentPropertyTypes,
  createDocumentPropertyTypeSchema,
  listDocumentPropertyTypesQuerySchema,
  updateDocumentPropertyTypeSchema,
} from "@backsteros/contracts";

import { newId } from "../lib/crypto.js";
import type { AuthContext } from "../middleware/auth.js";
import { requireScope } from "../middleware/auth.js";
import { apiKeyContactIsWorkspaceOwner } from "../services/api-keys.js";
import * as documentPropertyTypeService from "../services/document-property-types.js";
import {
  buildDocumentPropertyTypeRestPayload,
  commitRestEntityWrite,
  isRestLeaderFirstWrite,
} from "../services/rest-leader-write.js";
import { recordRestEntitySyncEvent } from "../services/sync-log.js";

const deleteQuerySchema = z.object({
  confirm: z.enum(["true", "false"]).optional(),
});

function getAuth(c: Context): AuthContext {
  return c.get("auth");
}

function forbidden() {
  return { error: "Insufficient scope", code: "forbidden" as const };
}

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function mapError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "DOCUMENT_PROPERTY_TYPE_KEY_TAKEN") {
    return {
      status: 409 as const,
      body: {
        error: "A property type with that key already exists",
        code: "document_property_type_key_taken",
      },
    };
  }
  if (error.message === "DOCUMENT_PROPERTY_TYPE_IN_USE") {
    const usageCount =
      "usageCount" in error && typeof error.usageCount === "number"
        ? error.usageCount
        : 0;
    return {
      status: 409 as const,
      body: {
        error:
          "This property type is still used on documents. Confirm to remove the type without stripping values.",
        code: "document_property_type_in_use",
        usageCount,
      },
    };
  }
  if (error.message === "INVALID_DOCUMENT_PROPERTY_TYPE") {
    return {
      status: 400 as const,
      body: {
        error: "Invalid document property type",
        code: "invalid_document_property_type",
      },
    };
  }
  return null;
}

async function mustPropose(auth: AuthContext): Promise<boolean> {
  const isWorkspaceOwnerKey = await apiKeyContactIsWorkspaceOwner(auth);
  return agentMustProposeDocumentPropertyTypes({
    kind: auth.kind,
    contactId: auth.contactId,
    isWorkspaceOwnerKey,
  });
}

async function writeType(
  auth: AuthContext,
  input: {
    entityId: string;
    operation: "upsert" | "delete";
    payload: Record<string, unknown>;
    apply: () => Promise<unknown>;
  },
) {
  if (isRestLeaderFirstWrite()) {
    await commitRestEntityWrite({
      workspaceId: auth.workspaceId,
      entity: "document_property_type",
      entityId: input.entityId,
      operation: input.operation,
      payload: input.payload,
    });
    return;
  }
  await input.apply();
  await recordRestEntitySyncEvent({
    workspaceId: auth.workspaceId,
    entity: "document_property_type",
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
  });
}

function agentForbidden() {
  return {
    error: "Agents may only propose new property types",
    code: "forbidden" as const,
  };
}

export function registerDocumentPropertyTypeRoutes(app: Hono) {
  app.get("/api/v1/document-property-types", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const parsed = listDocumentPropertyTypesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Invalid query", code: "invalid_query" }, 400);
    }
    const types = await documentPropertyTypeService.listDocumentPropertyTypes(
      auth.workspaceId,
      parsed.data,
    );
    return c.json({ types });
  });

  app.post("/api/v1/document-property-types", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const parsed = createDocumentPropertyTypeSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid document property type",
          code: "invalid_document_property_type",
        },
        400,
      );
    }
    const propose = await mustPropose(auth);
    const id = newId();
    const payload = buildDocumentPropertyTypeRestPayload(id, {
      ...parsed.data,
      status: propose ? "proposed" : "active",
      proposedByContactId: propose ? auth.contactId : null,
    });
    try {
      await writeType(auth, {
        entityId: id,
        operation: "upsert",
        payload,
        apply: () =>
          documentPropertyTypeService.createDocumentPropertyType(
            auth.workspaceId,
            {
              id,
              ...parsed.data,
              status: propose ? "proposed" : "active",
              proposedByContactId: propose ? auth.contactId : null,
            },
          ),
      });
      const row = await documentPropertyTypeService.getDocumentPropertyTypeById(
        auth.workspaceId,
        id,
      );
      if (!row) {
        return c.json({ error: "Create failed", code: "internal" }, 500);
      }
      return c.json(
        documentPropertyTypeService.mapDocumentPropertyType(row),
        propose ? 202 : 201,
      );
    } catch (error) {
      const mapped = mapError(error);
      if (mapped) return c.json(mapped.body, mapped.status);
      throw error;
    }
  });

  app.patch("/api/v1/document-property-types/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    if (await mustPropose(auth)) return c.json(agentForbidden(), 403);
    const parsed = updateDocumentPropertyTypeSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid document property type",
          code: "invalid_document_property_type",
        },
        400,
      );
    }
    const id = c.req.param("id");
    const existing = await documentPropertyTypeService.getDocumentPropertyTypeById(
      auth.workspaceId,
      id,
    );
    if (!existing || existing.deletedAt) {
      return c.json({ error: "Not found", code: "not_found" }, 404);
    }
    try {
      await writeType(auth, {
        entityId: id,
        operation: "upsert",
        payload: buildDocumentPropertyTypeRestPayload(id, parsed.data),
        apply: () =>
          documentPropertyTypeService.updateDocumentPropertyType(
            auth.workspaceId,
            id,
            parsed.data,
          ),
      });
      const row = await documentPropertyTypeService.getDocumentPropertyTypeById(
        auth.workspaceId,
        id,
      );
      if (!row) return c.json({ error: "Not found", code: "not_found" }, 404);
      return c.json(documentPropertyTypeService.mapDocumentPropertyType(row));
    } catch (error) {
      const mapped = mapError(error);
      if (mapped) return c.json(mapped.body, mapped.status);
      throw error;
    }
  });

  app.delete("/api/v1/document-property-types/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    if (await mustPropose(auth)) return c.json(agentForbidden(), 403);
    const parsed = deleteQuerySchema.safeParse(c.req.query());
    const confirm = parsed.success && parsed.data.confirm === "true";
    const id = c.req.param("id");
    try {
      if (!isRestLeaderFirstWrite()) {
        const deleted =
          await documentPropertyTypeService.deleteDocumentPropertyType(
            auth.workspaceId,
            id,
            { confirm },
          );
        if (!deleted) {
          return c.json({ error: "Not found", code: "not_found" }, 404);
        }
        await recordRestEntitySyncEvent({
          workspaceId: auth.workspaceId,
          entity: "document_property_type",
          entityId: id,
          operation: "delete",
          payload: { id, deleted_at: new Date().toISOString() },
        });
      } else {
        const existing =
          await documentPropertyTypeService.getDocumentPropertyTypeById(
            auth.workspaceId,
            id,
          );
        if (!existing || existing.deletedAt) {
          return c.json({ error: "Not found", code: "not_found" }, 404);
        }
        const usage =
          await documentPropertyTypeService.countDocumentsUsingPropertyKey(
            auth.workspaceId,
            existing.key,
          );
        if (usage > 0 && !confirm) {
          const error = new Error("DOCUMENT_PROPERTY_TYPE_IN_USE");
          (error as Error & { usageCount?: number }).usageCount = usage;
          throw error;
        }
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "document_property_type",
          entityId: id,
          operation: "delete",
          payload: { id, deleted_at: new Date().toISOString() },
        });
      }
      return c.body(null, 204);
    } catch (error) {
      const mapped = mapError(error);
      if (mapped) return c.json(mapped.body, mapped.status);
      throw error;
    }
  });

  app.post("/api/v1/document-property-types/:id/approve", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    if (await mustPropose(auth)) return c.json(agentForbidden(), 403);
    const id = c.req.param("id");
    const existing = await documentPropertyTypeService.getDocumentPropertyTypeById(
      auth.workspaceId,
      id,
    );
    if (!existing || existing.deletedAt) {
      return c.json({ error: "Not found", code: "not_found" }, 404);
    }
    await writeType(auth, {
      entityId: id,
      operation: "upsert",
      payload: buildDocumentPropertyTypeRestPayload(id, { status: "active" }),
      apply: () =>
        documentPropertyTypeService.setDocumentPropertyTypeStatus(
          auth.workspaceId,
          id,
          "active",
        ),
    });
    const row = await documentPropertyTypeService.getDocumentPropertyTypeById(
      auth.workspaceId,
      id,
    );
    if (!row) return c.json({ error: "Not found", code: "not_found" }, 404);
    return c.json(documentPropertyTypeService.mapDocumentPropertyType(row));
  });

  app.post("/api/v1/document-property-types/:id/reject", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    if (await mustPropose(auth)) return c.json(agentForbidden(), 403);
    const id = c.req.param("id");
    const existing = await documentPropertyTypeService.getDocumentPropertyTypeById(
      auth.workspaceId,
      id,
    );
    if (!existing || existing.deletedAt) {
      return c.json({ error: "Not found", code: "not_found" }, 404);
    }
    await writeType(auth, {
      entityId: id,
      operation: "upsert",
      payload: buildDocumentPropertyTypeRestPayload(id, {
        status: "rejected",
      }),
      apply: () =>
        documentPropertyTypeService.setDocumentPropertyTypeStatus(
          auth.workspaceId,
          id,
          "rejected",
        ),
    });
    const row = await documentPropertyTypeService.getDocumentPropertyTypeById(
      auth.workspaceId,
      id,
    );
    if (!row) return c.json({ error: "Not found", code: "not_found" }, 404);
    return c.json(documentPropertyTypeService.mapDocumentPropertyType(row));
  });
}
