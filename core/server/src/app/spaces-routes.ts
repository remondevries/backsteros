import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import type { AuthContext } from "../middleware/auth.js";
import { requireScope } from "../middleware/auth.js";
import * as documentService from "../services/documents.js";
import * as spacesService from "../services/spaces.js";

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function forbidden() {
  return { error: "Forbidden", code: "forbidden" as const };
}

function notFound(resource: string) {
  return { error: `${resource} not found`, code: "not_found" as const };
}

function getAuth(c: { get: (key: "auth") => AuthContext | undefined }) {
  return c.get("auth");
}

function toDocument(row: {
  id: string;
  workspaceId: string;
  type: string;
  projectId: string | null;
  parentId: string | null;
  kind: string;
  icon: string | null;
  sortOrder: number | null;
  journalDate: string | null;
  path: string;
  title: string;
  storageKey: string;
  contentType: string;
  byteSize: number | null;
  checksum: string | null;
  snippet: string | null;
  contentVersion: number | null;
  contentEtag: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null;
}) {
  return {
    id: row.id,
    type: row.type,
    projectId: row.projectId,
    parentId: row.parentId,
    kind: row.kind,
    icon: row.icon,
    sortOrder: row.sortOrder ?? 0,
    journalDate: row.journalDate,
    path: row.path,
    title: row.title,
    storageKey: row.storageKey,
    contentType: row.contentType,
    byteSize: row.byteSize ?? 0,
    checksum: row.checksum,
    snippet: row.snippet,
    contentVersion: row.contentVersion ?? 1,
    contentEtag: row.contentEtag,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
  };
}

/**
 * Agent-facing Spaces façade — mirrors the desktop overview hierarchy.
 */
export function registerSpacesRoutes(app: Hono) {
  app.get("/api/v1/spaces/categories", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const categories = await spacesService.listSpacesCategories(
      auth!.workspaceId,
    );
    return c.json({ categories });
  });

  app.post("/api/v1/spaces/heal", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    await documentService.ensureSpacesHierarchy(auth!.workspaceId);
    const report = await documentService.healSpacesHierarchy(
      auth!.workspaceId,
    );
    return c.json({ ok: true as const, report });
  });

  app.get("/api/v1/spaces/categories/:categoryId/spaces", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    try {
      const spaces = await spacesService.listSpacesInCategory(
        auth!.workspaceId,
        c.req.param("categoryId"),
      );
      return c.json({ spaces });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CATEGORY") {
        return c.json(
          { error: "Invalid Spaces category", code: "bad_request" },
          400,
        );
      }
      if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") {
        return c.json(notFound("Category"), 404);
      }
      throw error;
    }
  });

  app.post(
    "/api/v1/spaces/categories/:categoryId/spaces",
    zValidator(
      "json",
      z.object({
        title: z.string().min(1),
        icon: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      try {
        const space = await spacesService.createSpaceInCategory(
          auth!.workspaceId,
          c.req.param("categoryId"),
          c.req.valid("json"),
        );
        return c.json({ space }, 201);
      } catch (error) {
        if (error instanceof Error && error.message === "INVALID_CATEGORY") {
          return c.json(
            { error: "Invalid Spaces category", code: "bad_request" },
            400,
          );
        }
        if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") {
          return c.json(notFound("Category"), 404);
        }
        if (error instanceof Error && error.message === "TITLE_REQUIRED") {
          return c.json(
            { error: "Title is required", code: "bad_request" },
            400,
          );
        }
        if (error instanceof Error && error.message === "DOCUMENT_PATH_EXISTS") {
          return c.json(
            { error: "A space with this path already exists", code: "conflict" },
            409,
          );
        }
        throw error;
      }
    },
  );

  app.get("/api/v1/spaces/articles/:id/content", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const result = await documentService.getDocumentContent(
      auth!.workspaceId,
      c.req.param("id"),
    );
    if (!result) return c.json(notFound("Article"), 404);
    return c.json({
      article: toDocument(result.row),
      content: result.content,
    });
  });

  app.put(
    "/api/v1/spaces/articles/:id/content",
    zValidator(
      "json",
      z.object({
        content: z.string(),
        ifMatchVersion: z.number().int().positive().optional(),
      }),
    ),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const body = c.req.valid("json");
      try {
        const row = await documentService.updateDocumentContent(
          auth!.workspaceId,
          c.req.param("id"),
          {
            content: body.content,
            ifMatchVersion: body.ifMatchVersion,
          },
        );
        if (!row) return c.json(notFound("Article"), 404);
        return c.json({ article: toDocument(row) });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "CONTENT_VERSION_CONFLICT"
        ) {
          return c.json(
            { error: "Content version conflict", code: "conflict" },
            409,
          );
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/spaces/articles/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const row = await documentService.deleteDocument(
      auth!.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Article"), 404);
    return c.json({ ok: true as const, id: row.id });
  });

  app.get("/api/v1/spaces/:spaceId", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const space = await spacesService.getSpace(
      auth!.workspaceId,
      c.req.param("spaceId"),
    );
    if (!space) return c.json(notFound("Space"), 404);
    return c.json({ space });
  });

  app.patch(
    "/api/v1/spaces/:spaceId",
    zValidator(
      "json",
      z.object({
        title: z.string().min(1).optional(),
        icon: z.string().nullable().optional(),
        categoryId: z.string().optional(),
      }),
    ),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      try {
        const space = await spacesService.updateSpace(
          auth!.workspaceId,
          c.req.param("spaceId"),
          c.req.valid("json"),
        );
        if (!space) return c.json(notFound("Space"), 404);
        return c.json({ space });
      } catch (error) {
        if (error instanceof Error && error.message === "INVALID_CATEGORY") {
          return c.json(
            { error: "Invalid Spaces category", code: "bad_request" },
            400,
          );
        }
        if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") {
          return c.json(notFound("Category"), 404);
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/spaces/:spaceId", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const row = await spacesService.deleteSpace(
      auth!.workspaceId,
      c.req.param("spaceId"),
    );
    if (!row) return c.json(notFound("Space"), 404);
    return c.json({ ok: true as const, id: row.id });
  });

  app.get("/api/v1/spaces/:spaceId/tree", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const tree = await spacesService.getSpaceTree(
      auth!.workspaceId,
      c.req.param("spaceId"),
    );
    if (!tree) return c.json(notFound("Space"), 404);
    return c.json(tree);
  });

  app.post(
    "/api/v1/spaces/:spaceId/articles",
    zValidator(
      "json",
      z.object({
        title: z.string().min(1),
        content: z.string().optional(),
        parentFolderId: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      try {
        const row = await spacesService.createSpaceArticle(
          auth!.workspaceId,
          c.req.param("spaceId"),
          c.req.valid("json"),
        );
        return c.json({ article: toDocument(row) }, 201);
      } catch (error) {
        if (error instanceof Error && error.message === "SPACE_NOT_FOUND") {
          return c.json(notFound("Space"), 404);
        }
        if (error instanceof Error && error.message === "FOLDER_NOT_FOUND") {
          return c.json(notFound("Folder"), 404);
        }
        if (error instanceof Error && error.message === "FOLDER_NOT_IN_SPACE") {
          return c.json(
            {
              error: "Folder is not inside this space",
              code: "bad_request",
            },
            400,
          );
        }
        throw error;
      }
    },
  );
}
