import {
  DOCUMENTS_DEFAULT_LIMIT,
  DocumentPropertyError,
  ListQueryError,
  assertDocumentListTypeValue,
  buildDocumentRestPayload,
  can,
  commitDocumentContentLeaderFirst,
  commitDocumentPropertiesLeaderFirst,
  commitRestEntityWrite,
  commitRestEntityWriteBatch,
  createDocumentSchema,
  documentRetrievalQuerySchema,
  documentService,
  forbidden,
  getAuth,
  getDocumentProperties,
  isRestLeaderFirstWrite,
  listDocumentsQuerySchema,
  listQueryErrorBody,
  newId,
  notFound,
  parseDocumentListTypeFilter,
  parseDocumentsListLimit,
  parseExactMultiQueryValues,
  parseMultiQueryValues,
  publishDocumentLiveFromAgent,
  putDocumentProperties,
  putDocumentPropertiesSchema,
  readDocumentSection,
  recordDocumentRestSyncEvent,
  reorderSchema,
  replaceDocumentSectionBody,
  requireResolvedRef,
  requireScope,
  resolveSectionIfMatchVersion,
  runAgentRetrieve,
  toDocument,
  unauthorized,
  updateDocumentContentSchema,
  updateDocumentSchema,
  updateDocumentSectionSchema,
  z,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Documents (metadata, content, properties, sections) and journal days. */
export function registerDocumentsRoutes(app: Hono) {
  app.get(
    "/api/v1/documents",
    zValidator("query", listDocumentsQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:read")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      const query = c.req.valid("query");
      const typeValues = parseMultiQueryValues(c.req.queries("type") ?? []);
      try {
        for (const value of typeValues) {
          assertDocumentListTypeValue(value);
        }
      } catch (error) {
        if (error instanceof ListQueryError) {
          return c.json(listQueryErrorBody(error), 400);
        }
        throw error;
      }
      const typeFilter = parseDocumentListTypeFilter(typeValues);
      if (typeFilter.kind === "mixed") {
        return c.json(
          { error: typeFilter.message, code: "bad_request", field: "type" },
          400,
        );
      }

      const audience = parseMultiQueryValues(c.req.queries("audience") ?? []);
      const status = parseMultiQueryValues(c.req.queries("status") ?? []);
      const { limit, appliedDefault } = parseDocumentsListLimit(
        query.limit != null ? String(query.limit) : undefined,
      );
      if (appliedDefault) {
        c.header(
          "X-BacksterOS-Hint",
          `Default limit=${DOCUMENTS_DEFAULT_LIMIT} applied. Pass limit=1..200 explicitly.`,
        );
      }

      let projectId = query.projectId;
      if (projectId) {
        try {
          projectId = await requireResolvedRef(
            auth.workspaceId,
            projectId,
            "projectId",
          );
        } catch (error) {
          if (error instanceof ListQueryError) {
            return c.json(listQueryErrorBody(error), 400);
          }
          throw error;
        }
      }

      const rows = await documentService.listDocuments(auth.workspaceId, {
        type:
          typeFilter.kind === "documentType" ? typeFilter.values : undefined,
        propertyType:
          typeFilter.kind === "propertyType" ? typeFilter.values : undefined,
        audience: audience.length ? audience : undefined,
        status: status.length ? status : undefined,
        projectId,
        limit,
        offset: query.offset,
      });
      return c.json({ documents: rows.map(toDocument) });
    },
  );

  app.get(
    "/api/v1/documents/retrieve",
    zValidator("query", documentRetrievalQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:read")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      const query = c.req.valid("query");
      const result = await runAgentRetrieve({
        workspaceId: auth.workspaceId,
        q: query.q,
        propertyType: parseMultiQueryValues(query.type),
        audience: parseMultiQueryValues(query.audience),
        status: parseMultiQueryValues(query.status),
        project: parseExactMultiQueryValues(query.project),
        budget: query.budget,
        limit: query.limit,
      });
      return c.json({
        results: result.results,
        budget: result.budget,
        truncated: result.truncated,
        skipped: result.skipped,
      });
    },
  );

  app.get("/api/v1/documents/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await documentService.getDocumentById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) {
      return c.json(notFound("Document"), 404);
    }

    return c.json(toDocument(row));
  });

  app.post(
    "/api/v1/documents",
    zValidator("json", createDocumentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const body = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const documentId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "document",
            entityId: documentId,
            operation: "upsert",
            payload: buildDocumentRestPayload(documentId, body),
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!row) {
            return c.json(
              { error: "Document create failed", code: "internal" },
              500,
            );
          }
          publishDocumentLiveFromAgent(auth, row.id, {
            projectId: row.projectId,
            storageKey: row.storageKey,
          });
          return c.json(toDocument(row), 201);
        }
        const row = await documentService.createDocument(
          auth.workspaceId,
          body,
        );
        await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
        publishDocumentLiveFromAgent(auth, row.id, {
          projectId: row.projectId,
          storageKey: row.storageKey,
        });
        return c.json(toDocument(row), 201);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json(notFound("Project"), 404);
        }
        if (error instanceof Error && error.message === "DOCUMENT_PATH_EXISTS") {
          return c.json(
            { error: "Document path already exists", code: "document_path_exists" },
            400,
          );
        }
        if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
          return c.json(
            {
              error: "Local vault access denied — check vault folder permissions",
              code: "storage_access_denied",
            },
            503,
          );
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/documents/:id",
    zValidator("json", updateDocumentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const documentId = c.req.param("id");
        const patch = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const existing = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!existing) {
            return c.json(notFound("Document"), 404);
          }
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "document",
            entityId: documentId,
            operation: "upsert",
            payload: buildDocumentRestPayload(documentId, patch),
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!row) {
            return c.json(notFound("Document"), 404);
          }
          publishDocumentLiveFromAgent(auth, row.id, {
            projectId: row.projectId,
            storageKey: row.storageKey,
          });
          return c.json(toDocument(row));
        }
        const row = await documentService.updateDocument(
          auth.workspaceId,
          documentId,
          patch,
        );
        if (!row) {
          return c.json(notFound("Document"), 404);
        }
        await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
        publishDocumentLiveFromAgent(auth, row.id, {
          projectId: row.projectId,
          storageKey: row.storageKey,
        });
        return c.json(toDocument(row));
      } catch (error) {
        if (error instanceof Error && error.message === "DOCUMENT_PATH_EXISTS") {
          return c.json(
            { error: "Document path already exists", code: "document_path_exists" },
            400,
          );
        }
        if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
          return c.json(
            {
              error: "Local vault access denied — check vault folder permissions",
              code: "storage_access_denied",
            },
            503,
          );
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/documents/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const documentId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await documentService.getDocumentById(
        auth.workspaceId,
        documentId,
      );
      if (!existing) {
        return c.json(notFound("Document"), 404);
      }
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "document",
        entityId: documentId,
        operation: "delete",
        payload: { id: documentId },
      });
      publishDocumentLiveFromAgent(auth, existing.id, {
        projectId: existing.projectId,
        operation: "delete",
        storageKey: existing.storageKey,
      });
      return c.body(null, 204);
    }

    const row = await documentService.deleteDocument(
      auth.workspaceId,
      documentId,
    );
    if (!row) {
      return c.json(notFound("Document"), 404);
    }

    await recordDocumentRestSyncEvent(auth.workspaceId, row, "delete");
    publishDocumentLiveFromAgent(auth, row.id, {
      projectId: row.projectId,
      operation: "delete",
      storageKey: row.storageKey,
    });
    return c.body(null, 204);
  });

  app.get("/api/v1/documents/:id/content", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    try {
      const result = await documentService.getDocumentContent(
        auth.workspaceId,
        c.req.param("id"),
      );
      if (!result) {
        return c.json(notFound("Document"), 404);
      }

      return c.json({
        content: result.content,
        contentType: result.row.contentType,
        contentVersion: result.row.contentVersion,
        byteSize: result.row.byteSize,
        checksum: result.row.checksum,
        updatedAt: result.row.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "STORAGE_OBJECT_NOT_FOUND") {
        return c.json(
          { error: "Document content not found in storage", code: "storage_not_found" },
          404,
        );
      }
      throw error;
    }
  });

  app.patch(
    "/api/v1/documents/:id/content",
    zValidator("json", updateDocumentContentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const body = c.req.valid("json");
        const documentId = c.req.param("id");

        if (isRestLeaderFirstWrite()) {
          const result = await commitDocumentContentLeaderFirst({
            workspaceId: auth.workspaceId,
            documentId,
            content: body.content,
            ifMatchVersion: body.ifMatchVersion,
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!row) {
            return c.json(notFound("Document"), 404);
          }
          publishDocumentLiveFromAgent(auth, documentId, {
            projectId: row.projectId,
            contentVersion: result.contentVersion,
            storageKey: row.storageKey,
          });
          return c.json({
            content: body.content,
            contentType: row.contentType,
            contentVersion: result.contentVersion,
            byteSize: result.byteSize,
            checksum: row.checksum,
            updatedAt: row.updatedAt.toISOString(),
          });
        }

        const row = await documentService.updateDocumentContent(
          auth.workspaceId,
          documentId,
          body,
        );
        if (!row) {
          return c.json(notFound("Document"), 404);
        }
        publishDocumentLiveFromAgent(auth, row.id, {
          projectId: row.projectId,
          contentVersion: row.contentVersion,
          storageKey: row.storageKey,
        });

        return c.json({
          content: body.content,
          contentType: row.contentType,
          contentVersion: row.contentVersion,
          byteSize: row.byteSize,
          checksum: row.checksum,
          updatedAt: row.updatedAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_VERSION_CONFLICT") {
          return c.json(
            {
              error: "Document content version conflict",
              code: "content_version_conflict",
            },
            409,
          );
        }
        if (error instanceof Error && error.message === "EMPTY_BODY_OVER_NONEMPTY") {
          return c.json(
            {
              error: "Refusing to overwrite non-empty document with empty body",
              code: "empty_body_over_nonempty",
            },
            409,
          );
        }
        if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
          return c.json(
            {
              error: "Local vault access denied — check vault folder permissions",
              code: "storage_access_denied",
            },
            503,
          );
        }
        if (error instanceof Error && error.message === "INVALID_YAML") {
          return c.json(
            {
              error: "Invalid YAML front matter",
              code: "invalid_yaml",
            },
            422,
          );
        }
        if (error instanceof Error && error.message === "INVALID_PROPERTY") {
          return c.json(
            {
              error: "Invalid document property value",
              code: "invalid_property",
            },
            422,
          );
        }
        throw error;
      }
    },
  );

  app.get("/api/v1/documents/:id/properties", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const result = await getDocumentProperties(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!result) {
      return c.json(notFound("Document"), 404);
    }
    return c.json(result);
  });

  app.put(
    "/api/v1/documents/:id/properties",
    zValidator("json", putDocumentPropertiesSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const body = c.req.valid("json");
        const documentId = c.req.param("id");

        if (isRestLeaderFirstWrite()) {
          const leaderResult = await commitDocumentPropertiesLeaderFirst({
            workspaceId: auth.workspaceId,
            documentId,
            properties: body.properties,
            ifMatchVersion: body.ifMatchVersion,
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          publishDocumentLiveFromAgent(auth, documentId, {
            projectId: row?.projectId ?? null,
            contentVersion: leaderResult.contentVersion,
            storageKey: row?.storageKey,
          });
          return c.json({
            docKey: leaderResult.docKey,
            properties: leaderResult.properties,
            frontMatterValid: leaderResult.frontMatterValid,
            contentVersion: leaderResult.contentVersion,
          });
        }

        const result = await putDocumentProperties(
          auth.workspaceId,
          documentId,
          body,
        );
        if (!result) {
          return c.json(notFound("Document"), 404);
        }
        publishDocumentLiveFromAgent(auth, result.row.id, {
          projectId: result.row.projectId,
          contentVersion: result.contentVersion,
          storageKey: result.row.storageKey,
        });
        return c.json({
          docKey: result.row.docKey,
          properties: result.properties,
          frontMatterValid: result.row.frontMatterValid,
          contentVersion: result.contentVersion,
        });
      } catch (error) {
        if (error instanceof DocumentPropertyError) {
          if (error.code === "CONTENT_VERSION_CONFLICT") {
            return c.json(
              {
                error: "Document content version conflict",
                code: "content_version_conflict",
              },
              409,
            );
          }
          if (error.code === "INVALID_YAML") {
            return c.json(
              { error: "Invalid YAML front matter", code: "invalid_yaml" },
              422,
            );
          }
          if (error.code === "STORAGE_NOT_FOUND") {
            return c.json(
              {
                error: "Document content not found in storage",
                code: "storage_not_found",
              },
              422,
            );
          }
          return c.json(
            { error: error.message, code: "invalid_property" },
            422,
          );
        }
        if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
          return c.json(notFound("Document"), 404);
        }
        if (error instanceof Error && error.message === "CONTENT_VERSION_CONFLICT") {
          return c.json(
            {
              error: "Document content version conflict",
              code: "content_version_conflict",
            },
            409,
          );
        }
        if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
          return c.json(
            {
              error: "Local vault access denied — check vault folder permissions",
              code: "storage_access_denied",
            },
            503,
          );
        }
        throw error;
      }
    },
  );

  app.get("/api/v1/documents/:id/sections", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const heading = c.req.query("heading");
    if (!heading?.trim()) {
      return c.json(
        { error: "Query parameter heading is required", code: "bad_request" },
        400,
      );
    }

    try {
      const result = await documentService.getDocumentSection(
        auth.workspaceId,
        c.req.param("id"),
        heading,
      );
      if (!result) {
        return c.json(notFound("Document"), 404);
      }
      return c.json({
        heading: result.heading,
        headingPath: result.headingPath,
        slug: result.slug,
        text: result.text,
        contentVersion: result.contentVersion,
      });
    } catch (error) {
      if (error instanceof documentService.DocumentSectionError) {
        if (error.code === "SECTION_NOT_FOUND") {
          return c.json(
            { error: error.message, code: "section_not_found" },
            404,
          );
        }
        return c.json(
          { error: error.message, code: "section_ambiguous" },
          409,
        );
      }
      if (error instanceof Error && error.message === "STORAGE_OBJECT_NOT_FOUND") {
        return c.json(
          { error: "Document content not found in storage", code: "storage_not_found" },
          404,
        );
      }
      throw error;
    }
  });

  // Section body = after heading → next same/higher heading (or EOF).
  // Nested subsections are included; PUT replaces/removes them with the body.
  app.put(
    "/api/v1/documents/:id/sections",
    zValidator("json", updateDocumentSectionSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const body = c.req.valid("json");
        const documentId = c.req.param("id");

        if (isRestLeaderFirstWrite()) {
          const existing = await documentService.getDocumentContent(
            auth.workspaceId,
            documentId,
          );
          if (!existing) {
            return c.json(notFound("Document"), 404);
          }
          const nextContent = replaceDocumentSectionBody(
            existing.content,
            body.heading,
            body.body,
          ).content;
          const leaderResult = await commitDocumentContentLeaderFirst({
            workspaceId: auth.workspaceId,
            documentId,
            content: nextContent,
            ifMatchVersion: resolveSectionIfMatchVersion(
              body.ifMatchVersion,
              existing.row.contentVersion,
            ),
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!row) {
            return c.json(notFound("Document"), 404);
          }
          publishDocumentLiveFromAgent(auth, documentId, {
            projectId: row.projectId,
            contentVersion: leaderResult.contentVersion,
            storageKey: row.storageKey,
          });
          const { section, text } = readDocumentSection(
            nextContent,
            body.heading,
          );
          return c.json({
            heading: section.heading,
            headingPath: section.path,
            slug: section.slug,
            text,
            contentVersion: leaderResult.contentVersion,
          });
        }

        const result = await documentService.updateDocumentSection(
          auth.workspaceId,
          documentId,
          body,
        );
        if (!result) {
          return c.json(notFound("Document"), 404);
        }
        publishDocumentLiveFromAgent(auth, result.row.id, {
          projectId: result.row.projectId,
          contentVersion: result.row.contentVersion,
          storageKey: result.row.storageKey,
        });
        return c.json({
          heading: result.heading,
          headingPath: result.headingPath,
          slug: result.slug,
          text: result.text,
          contentVersion: result.row.contentVersion,
        });
      } catch (error) {
        if (error instanceof documentService.DocumentSectionError) {
          if (error.code === "SECTION_NOT_FOUND") {
            return c.json(
              { error: error.message, code: "section_not_found" },
              404,
            );
          }
          return c.json(
            { error: error.message, code: "section_ambiguous" },
            409,
          );
        }
        if (error instanceof Error && error.message === "CONTENT_VERSION_CONFLICT") {
          return c.json(
            {
              error: "Document content version conflict",
              code: "content_version_conflict",
            },
            409,
          );
        }
        if (error instanceof Error && error.message === "EMPTY_BODY_OVER_NONEMPTY") {
          return c.json(
            {
              error: "Refusing to overwrite non-empty document with empty body",
              code: "empty_body_over_nonempty",
            },
            409,
          );
        }
        if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
          return c.json(
            {
              error: "Local vault access denied — check vault folder permissions",
              code: "storage_access_denied",
            },
            503,
          );
        }
        if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
          return c.json(notFound("Document"), 404);
        }
        if (error instanceof Error && error.message === "INVALID_YAML") {
          return c.json(
            { error: "Invalid YAML front matter", code: "invalid_yaml" },
            422,
          );
        }
        throw error;
      }
    },
  );

  app.get("/api/v1/journal/:date", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:read")) return c.json(forbidden(), 403);
    const parsed = z.string().date().safeParse(c.req.param("date"));
    if (!parsed.success) return c.json({ error: "Invalid journal date", code: "bad_request" }, 400);
    let row = await documentService.getJournalDocument(auth.workspaceId, parsed.data);
    if (!row) {
      if (!can(auth, "documents:write")) return c.json(notFound("Journal entry"), 404);
      if (isRestLeaderFirstWrite()) {
        const documentId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "document",
          entityId: documentId,
          operation: "upsert",
          payload: buildDocumentRestPayload(documentId, {
            type: "journal",
            path: `${parsed.data}.md`,
            title: parsed.data,
            journalDate: parsed.data,
          }),
        });
        row = await documentService.getDocumentById(
          auth.workspaceId,
          documentId,
        );
        if (!row) {
          // Concurrent create may have won with another id — resolve by date.
          row = await documentService.getJournalDocument(
            auth.workspaceId,
            parsed.data,
          );
        }
      } else {
        row = await documentService.getOrCreateJournalDocument(
          auth.workspaceId,
          parsed.data,
        );
        await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
      }
      if (!row) {
        return c.json(
          { error: "Journal create failed", code: "internal" },
          500,
        );
      }
    }
    return c.json(toDocument(row));
  });

  app.post(
    "/api/v1/documents/reorder",
    zValidator("json", reorderSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "documents:write")) return c.json(forbidden(), 403);
      const orderedIds = c.req.valid("json").orderedIds;
      const rows = await (async () => {
        if (isRestLeaderFirstWrite()) {
          await commitRestEntityWriteBatch({
            workspaceId: auth.workspaceId,
            changes: orderedIds.map((id, index) => ({
              entity: "document" as const,
              entityId: id,
              operation: "upsert" as const,
              payload: buildDocumentRestPayload(id, { sortOrder: index }),
            })),
          });
          const loaded = await Promise.all(
            orderedIds.map((id) =>
              documentService.getDocumentById(auth.workspaceId, id),
            ),
          );
          return loaded.filter(
            (row): row is NonNullable<typeof row> => row != null,
          );
        }
        return documentService.reorderDocuments(auth.workspaceId, orderedIds);
      })();
      if (!isRestLeaderFirstWrite()) {
        for (const row of rows) {
          await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
        }
      }
      for (const row of rows) {
        publishDocumentLiveFromAgent(auth, row.id, {
          projectId: row.projectId,
          storageKey: row.storageKey,
        });
      }
      return c.json({ documents: rows.map(toDocument) });
    },
  );

  app.post("/api/v1/documents/:id/move", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:write")) return c.json(forbidden(), 403);
    const parsed = z.object({ parentId: z.string().nullable() }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid parentId", code: "bad_request" }, 400);
    const documentId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await documentService.getDocumentById(
        auth.workspaceId,
        documentId,
      );
      if (!existing) return c.json(notFound("Document"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "document",
        entityId: documentId,
        operation: "upsert",
        payload: buildDocumentRestPayload(documentId, {
          parentId: parsed.data.parentId,
        }),
      });
      const row = await documentService.getDocumentById(
        auth.workspaceId,
        documentId,
      );
      if (!row) return c.json(notFound("Document"), 404);
      publishDocumentLiveFromAgent(auth, row.id, {
        projectId: row.projectId,
        storageKey: row.storageKey,
      });
      return c.json(toDocument(row));
    }
    try {
      const row = await documentService.moveDocument(
        auth.workspaceId,
        documentId,
        parsed.data.parentId,
      );
      if (!row) return c.json(notFound("Document"), 404);
      await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
      publishDocumentLiveFromAgent(auth, row.id, {
        projectId: row.projectId,
        storageKey: row.storageKey,
      });
      return c.json(toDocument(row));
    } catch (error) {
      if (error instanceof Error && error.message === "FOLDER_NOT_FOUND") {
        return c.json(notFound("Folder"), 404);
      }
      if (error instanceof Error && error.message === "INVALID_PARENT") {
        return c.json(
          { error: "Document cannot be its own parent", code: "bad_request" },
          400,
        );
      }
      throw error;
    }
  });
}
