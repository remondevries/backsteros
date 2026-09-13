import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  documentSchema,
  createSpaceSiteKeySchema,
  updateSpacePublishSettingsSchema,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { documents, type DbDocument } from "../db/schema.js";
import type { AuthContext } from "../middleware/auth.js";
import { requireScope } from "../middleware/auth.js";
import {
  normalizeAvatarMimeType,
  sniffAvatarContentType,
} from "../lib/avatar-content-type.js";
import { getObject } from "../lib/storage.js";
import { MAX_AVATAR_BYTES } from "../lib/upload-limits.js";
import {
  authenticateSpaceSiteKey,
  createSpaceSiteKey,
  getOrCreateSpacePublishSettings,
  hostFromRequest,
  revokeSpaceSiteKey,
  updateSpacePublishSettings,
} from "../services/space-publish.js";
import {
  deleteSpaceCover,
  getSpaceCover,
  putSpaceCover,
} from "../services/space-cover.js";
import { parseSpacesMarkdown } from "../lib/spaces-publish-frontmatter.js";

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

function siteKeyFromRequest(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const dedicated = c.req.header("X-Space-Site-Key")?.trim();
  if (dedicated) return dedicated;
  const auth = c.req.header("Authorization")?.trim();
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function listDescendantDocumentIds(
  workspaceId: string,
  spaceDocumentId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({
      id: documents.id,
      parentId: documents.parentId,
      kind: documents.kind,
    })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.type, "knowledge"),
        isNull(documents.deletedAt),
      ),
    );

  const childrenByParent = new Map<string | null, string[]>();
  for (const row of rows) {
    const key = row.parentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(row.id);
    childrenByParent.set(key, list);
  }

  const ids = new Set<string>();
  const stack = [spaceDocumentId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = childrenByParent.get(current) ?? [];
    for (const childId of children) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      stack.push(childId);
    }
  }
  return ids;
}

async function resolvePublicAuth(
  c: {
    req: {
      header: (name: string) => string | undefined;
      param: (name: string) => string;
    };
  },
) {
  const spaceDocumentId = c.req.param("spaceDocumentId");
  const siteKey = siteKeyFromRequest(c);
  if (!siteKey) return { ok: false as const, code: "unauthorized" as const };

  const host = hostFromRequest({
    origin: c.req.header("Origin"),
    referer: c.req.header("Referer"),
    host: c.req.header("Host"),
  });

  return authenticateSpaceSiteKey(spaceDocumentId, siteKey, host);
}

/** Authenticated space publish settings + public articles. */
export function registerSpacesPublishRoutes(app: Hono) {
  app.get("/api/v1/spaces/:spaceDocumentId/publish-settings", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const spaceDocumentId = c.req.param("spaceDocumentId");
    const settings = await getOrCreateSpacePublishSettings(
      auth!.workspaceId,
      spaceDocumentId,
    );
    if (!settings) return c.json(notFound("Space"), 404);
    return c.json(settings);
  });

  app.put(
    "/api/v1/spaces/:spaceDocumentId/publish-settings",
    zValidator("json", updateSpacePublishSettingsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const spaceDocumentId = c.req.param("spaceDocumentId");
      const body = c.req.valid("json");
      const settings = await updateSpacePublishSettings(
        auth!.workspaceId,
        spaceDocumentId,
        body,
      );
      if (!settings) return c.json(notFound("Space"), 404);
      return c.json(settings);
    },
  );

  app.post(
    "/api/v1/spaces/:spaceDocumentId/site-key",
    zValidator("json", createSpaceSiteKeySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const spaceDocumentId = c.req.param("spaceDocumentId");
      const body = c.req.valid("json");
      const result = await createSpaceSiteKey(
        auth!.workspaceId,
        spaceDocumentId,
        body.label,
      );
      if ("error" in result) {
        if (result.error === "limit") {
          return c.json(
            {
              error: "Maximum number of site keys reached (20)",
              code: "bad_request" as const,
            },
            400,
          );
        }
        return c.json(notFound("Space"), 404);
      }
      return c.json(
        {
          siteKey: result.siteKey,
          key: result.key,
          settings: result.settings,
        },
        201,
      );
    },
  );

  app.delete(
    "/api/v1/spaces/:spaceDocumentId/site-key/:keyId",
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const spaceDocumentId = c.req.param("spaceDocumentId");
      const keyId = c.req.param("keyId");
      const settings = await revokeSpaceSiteKey(
        auth!.workspaceId,
        spaceDocumentId,
        keyId,
      );
      if (!settings) return c.json(notFound("Site key"), 404);
      return c.json(settings);
    },
  );

  app.get("/api/v1/public/spaces/:spaceDocumentId/articles", async (c) => {
    const authResult = await resolvePublicAuth(c);
    if (!authResult.ok) {
      return c.json(
        authResult.code === "forbidden" ? forbidden() : unauthorized(),
        authResult.code === "forbidden" ? 403 : 401,
      );
    }

    const spaceDocumentId = c.req.param("spaceDocumentId");
    const descendantIds = await listDescendantDocumentIds(
      authResult.workspaceId,
      spaceDocumentId,
    );
    if (descendantIds.size === 0) {
      return c.json({ articles: [] });
    }

    const rows = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, authResult.workspaceId),
          eq(documents.kind, "document"),
          eq(documents.publishStatus, "published"),
          eq(documents.audience, "group"),
          isNull(documents.deletedAt),
          inArray(documents.id, [...descendantIds]),
        ),
      );

    const articles = rows
      .filter((row: DbDocument) => Boolean(row.publishSlug?.trim()))
      .map((row: DbDocument) => ({
        id: row.id,
        title: row.title,
        slug: row.publishSlug!.trim(),
        seoTitle: row.seoTitle ?? null,
        seoDescription: row.seoDescription ?? null,
        path: row.path,
        updatedAt: row.updatedAt.toISOString(),
      }))
      .sort((a: { slug: string }, b: { slug: string }) =>
        a.slug.localeCompare(b.slug),
      );

    return c.json({ articles });
  });

  app.get(
    "/api/v1/public/spaces/:spaceDocumentId/article",
    zValidator(
      "query",
      z.object({ slug: z.string().min(1).max(500) }),
    ),
    async (c) => {
      const authResult = await resolvePublicAuth(c);
      if (!authResult.ok) {
        return c.json(
          authResult.code === "forbidden" ? forbidden() : unauthorized(),
          authResult.code === "forbidden" ? 403 : 401,
        );
      }

      const spaceDocumentId = c.req.param("spaceDocumentId");
      const { slug } = c.req.valid("query");
      const descendantIds = await listDescendantDocumentIds(
        authResult.workspaceId,
        spaceDocumentId,
      );

      const [row] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, authResult.workspaceId),
            eq(documents.kind, "document"),
            eq(documents.publishStatus, "published"),
            eq(documents.audience, "group"),
            eq(documents.publishSlug, slug),
            isNull(documents.deletedAt),
            inArray(documents.id, [...descendantIds]),
          ),
        )
        .limit(1);

      if (!row || !descendantIds.has(row.id)) {
        return c.json(notFound("Article"), 404);
      }

      let content = "";
      try {
        const object = await getObject(row.storageKey);
        content = object.body;
      } catch {
        content = "";
      }

      // Prefer DB meta; ensure consumers also get front matter in content.
      const { body } = parseSpacesMarkdown(content);
      const withMeta = content.includes("---\n")
        ? content
        : [
            "---",
            `title: ${JSON.stringify(row.title)}`,
            `status: published`,
            `slug: ${JSON.stringify(row.publishSlug ?? slug)}`,
            row.seoTitle ? `seoTitle: ${JSON.stringify(row.seoTitle)}` : null,
            row.seoDescription
              ? `seoDescription: ${JSON.stringify(row.seoDescription)}`
              : null,
            "audience: group",
            "---",
            "",
            body || content,
          ]
            .filter((line) => line != null)
            .join("\n");

      return c.json({
        id: row.id,
        title: row.title,
        slug: row.publishSlug!.trim(),
        seoTitle: row.seoTitle ?? null,
        seoDescription: row.seoDescription ?? null,
        path: row.path,
        updatedAt: row.updatedAt.toISOString(),
        content: withMeta,
      });
    },
  );

  app.put(
    "/api/v1/spaces/:spaceDocumentId/cover",
    bodyLimit({
      maxSize: MAX_AVATAR_BYTES,
      onError: (c) =>
        c.json(
          {
            error: "Cover must be an image up to 5 MB",
            code: "bad_request",
          },
          413,
        ),
    }),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const spaceDocumentId = c.req.param("spaceDocumentId");
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const contentType =
        sniffAvatarContentType(bytes) ??
        normalizeAvatarMimeType(c.req.header("Content-Type"));
      if (
        !contentType ||
        contentType === "image/svg+xml" ||
        bytes.byteLength === 0 ||
        bytes.byteLength > MAX_AVATAR_BYTES
      ) {
        return c.json(
          {
            error: "Cover must be a JPG, PNG, WebP, or GIF up to 5 MB",
            code: "bad_request",
          },
          400,
        );
      }
      const document = await putSpaceCover(
        auth!.workspaceId,
        spaceDocumentId,
        bytes,
        contentType,
      );
      if (!document) return c.json(notFound("Space"), 404);
      return c.json(documentSchema.parse(document));
    },
  );

  app.get("/api/v1/spaces/:spaceDocumentId/cover", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const spaceDocumentId = c.req.param("spaceDocumentId");
    const cover = await getSpaceCover(auth!.workspaceId, spaceDocumentId);
    if (!cover) return c.json(notFound("Cover"), 404);
    return new Response(Buffer.from(cover.bytes), {
      status: 200,
      headers: {
        "Content-Type": cover.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  });

  app.delete("/api/v1/spaces/:spaceDocumentId/cover", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const spaceDocumentId = c.req.param("spaceDocumentId");
    const document = await deleteSpaceCover(
      auth!.workspaceId,
      spaceDocumentId,
    );
    if (!document) return c.json(notFound("Space"), 404);
    return c.json(documentSchema.parse(document));
  });

  /** Site-key auth — for OG/SEO embeds when an article has no featured image. */
  app.get("/api/v1/public/spaces/:spaceDocumentId/cover", async (c) => {
    const authResult = await resolvePublicAuth(c);
    if (!authResult.ok) {
      return c.json(
        authResult.code === "forbidden" ? forbidden() : unauthorized(),
        authResult.code === "forbidden" ? 403 : 401,
      );
    }
    const spaceDocumentId = c.req.param("spaceDocumentId");
    const cover = await getSpaceCover(authResult.workspaceId, spaceDocumentId);
    if (!cover) return c.json(notFound("Cover"), 404);
    return new Response(Buffer.from(cover.bytes), {
      status: 200,
      headers: {
        "Content-Type": cover.contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  });
}
