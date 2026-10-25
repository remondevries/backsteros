/**
 * letter-routes routes (OS-73 split from routes.ts).
 */
import {
  LETTERS_LIST_PAGINATED_ONLY_KEYS,
  ListQueryError,
  MAX_AVATAR_BYTES,
  avatarEntityToSyncEntity,
  avatarSignedUrlQuerySchema,
  blobReadsRequireLocalCore,
  bodyLimit,
  buildAvatarSignedUrl,
  buildBankAccountRestPayload,
  buildContactRestPayload,
  buildLetterRestPayload,
  buildOrganizationRestPayload,
  can,
  circleService,
  collectQueryParams,
  commitRestEntityWrite,
  deleteDevicePushTokenSchema,
  emitLetterMetadataSync,
  financeService,
  forbidden,
  getAuth,
  getAvatarUrlSigningSecret,
  getPublicApiOrigin,
  ignoredLegacyListKeys,
  isAvatarSignedEntityType,
  isOwnerShellAuth,
  isRestLeaderFirstWrite,
  letterSchema,
  listQueryErrorBody,
  newId,
  normalizeAvatarMimeType,
  notFound,
  nudgeContactLive,
  nudgeOrganizationLive,
  nudgePeerEntityLive,
  parseLettersListQuery,
  publicAvatarQuerySchema,
  pushInboxTriageService,
  recordBankAccountRestSyncEvent,
  recordContactRestSyncEvent,
  recordLetterRestSyncEvent,
  recordOrganizationRestSyncEvent,
  reorderLetterAttachmentsSchema,
  requireResolvedRef,
  resolveAvatarContentType,
  sniffAvatarContentType,
  unauthorized,
  upsertDevicePushTokenSchema,
  verifyAvatarSignature,
  z,
  zValidator,
} from "./route-deps.js";
import type {
  Hono,
} from "./route-deps.js";

export function registerLetterRoutes(app: Hono) {
  app.get("/api/v1/letters", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseLettersListQuery(raw);
      parsed = {
        ...parsed,
        projectId: await requireResolvedRef(
          auth.workspaceId,
          parsed.projectId,
          "projectId",
        ),
        organizationId: await requireResolvedRef(
          auth.workspaceId,
          parsed.organizationId,
          "organizationId",
        ),
        contactId: await requireResolvedRef(
          auth.workspaceId,
          parsed.contactId,
          "contactId",
        ),
      };
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    if (parsed.mode === "legacy") {
      const ignored = ignoredLegacyListKeys(
        raw,
        LETTERS_LIST_PAGINATED_ONLY_KEYS,
      );
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      }
      return c.json({
        letters: await circleService.listLetters(auth.workspaceId, {
          projectId: parsed.projectId,
          organizationId: parsed.organizationId,
          contactId: parsed.contactId,
          status: parsed.status,
          triage: parsed.triage === true,
        }),
      });
    }

    return c.json(
      await circleService.listLettersPaginated(auth.workspaceId, parsed),
    );
  });
  app.get("/api/v1/letters/inbox", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    return c.json({ letters: await circleService.listLetters(auth.workspaceId, { triage: true }) });
  });
  app.get("/api/v1/letters/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const row = await circleService.getLetterById(auth.workspaceId, c.req.param("id"));
    return row ? c.json(row) : c.json(notFound("Letter"), 404);
  });
  app.get("/api/v1/letters/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const result = await circleService.getLetterRelations(auth.workspaceId, c.req.param("id"));
    return result ? c.json(result) : c.json(notFound("Letter"), 404);
  });
  app.post("/api/v1/letters", zValidator("json", letterSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const body = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const letterId = newId();
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "letter",
        entityId: letterId,
        operation: "upsert",
        payload: buildLetterRestPayload(letterId, body),
      });
      const row = await circleService.getLetterById(auth.workspaceId, letterId);
      if (!row) return c.json({ error: "Letter create failed", code: "internal" }, 500);
      nudgePeerEntityLive(auth, "letter", row.id, "upsert");
      return c.json(row, 201);
    }
    const row = await circleService.createLetter(auth.workspaceId, body);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "letter", row.id, "upsert");
    return c.json(row, 201);
  });
  app.patch("/api/v1/letters/:id", zValidator("json", letterSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const letterId = c.req.param("id");
    const patch = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getLetterById(auth.workspaceId, letterId);
      if (!existing) return c.json(notFound("Letter"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "letter",
        entityId: letterId,
        operation: "upsert",
        payload: buildLetterRestPayload(letterId, patch),
      });
      const row = await circleService.getLetterById(auth.workspaceId, letterId);
      if (row) nudgePeerEntityLive(auth, "letter", row.id, "upsert");
      return c.json(row);
    }
    const row = await circleService.updateLetter(auth.workspaceId, letterId, patch);
    if (!row) return c.json(notFound("Letter"), 404);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "letter", row.id, "upsert");
    return c.json(row);
  });
  app.delete("/api/v1/letters/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const letterId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getLetterById(auth.workspaceId, letterId);
      if (!existing) return c.json(notFound("Letter"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "letter",
        entityId: letterId,
        operation: "delete",
        payload: { id: letterId },
      });
      nudgePeerEntityLive(auth, "letter", letterId, "delete");
      return c.body(null, 204);
    }
    const row = await circleService.deleteLetter(auth.workspaceId, letterId);
    if (!row) return c.json(notFound("Letter"), 404);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "delete");
    nudgePeerEntityLive(auth, "letter", row.id, "delete");
    return c.body(null, 204);
  });
  app.post("/api/v1/letters/:id/triage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const parsed = letterSchema.pick({
      projectId: true,
      organizationId: true,
      contactId: true,
      status: true,
      dueDate: true,
    }).partial().safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid triage data", code: "bad_request" }, 400);
    const letterId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getLetterById(auth.workspaceId, letterId);
      if (!existing) return c.json(notFound("Letter"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "letter",
        entityId: letterId,
        operation: "upsert",
        payload: buildLetterRestPayload(letterId, parsed.data),
      });
      const row = await circleService.getLetterById(auth.workspaceId, letterId);
      if (row) nudgePeerEntityLive(auth, "letter", row.id, "upsert");
      return c.json(row);
    }
    const row = await circleService.triageLetter(auth.workspaceId, letterId, parsed.data);
    if (!row) return c.json(notFound("Letter"), 404);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "letter", row.id, "upsert");
    return c.json(row);
  });
  app.put("/api/v1/letters/:id/pdf", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Letter PDFs can only be stored on local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 25_000_000) {
      return c.json({ error: "PDF must be between 1 byte and 25 MB", code: "bad_request" }, 400);
    }
    const row = await circleService.putLetterPdf(
      auth.workspaceId,
      c.req.param("id"),
      bytes,
      c.req.header("X-Filename") ?? "letter.pdf",
    );
    return row ? c.json(row) : c.json(notFound("Letter"), 404);
  });
  app.get("/api/v1/letters/:id/pdf", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Letter PDFs are only available from local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    try {
      const result = await circleService.getLetterPdf(auth.workspaceId, c.req.param("id"));
      if (!result) return c.json(notFound("PDF"), 404);
      c.header("Content-Type", result.row.contentType);
      c.header("Content-Disposition", `inline; filename="${(result.row.originalFilename || "letter.pdf").replaceAll('"', "")}"`);
      return c.body(Uint8Array.from(result.bytes).buffer);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "STORAGE_OBJECT_NOT_FOUND"
      ) {
        return c.json(notFound("PDF"), 404);
      }
      throw error;
    }
  });
  app.get("/api/v1/letters/:id/attachments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const attachments = await circleService.listLetterAttachments(
      auth.workspaceId,
      c.req.param("id"),
    );
    return attachments
      ? c.json({ attachments })
      : c.json(notFound("Letter"), 404);
  });
  app.post("/api/v1/letters/:id/attachments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Letter PDFs can only be stored on local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 25_000_000) {
      return c.json({ error: "PDF must be between 1 byte and 25 MB", code: "bad_request" }, 400);
    }
    const result = await circleService.createLetterAttachment(
      auth.workspaceId,
      c.req.param("id"),
      bytes,
      c.req.header("X-Filename") ?? "letter.pdf",
    );
    if (!result) return c.json(notFound("Letter"), 404);
    await emitLetterMetadataSync(auth.workspaceId, c.req.param("id"));
    return c.json(result.attachment, 201);
  });
  app.post(
    "/api/v1/letters/:id/attachments/reorder",
    zValidator("json", reorderLetterAttachmentsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
      try {
        const letterId = c.req.param("id");
        const rows = await circleService.reorderLetterAttachments(
          auth.workspaceId,
          letterId,
          c.req.valid("json").orderedIds,
        );
        if (!rows) return c.json(notFound("Letter"), 404);
        await emitLetterMetadataSync(auth.workspaceId, letterId);
        return c.json({ attachments: rows });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "ATTACHMENT_NOT_FOUND" ||
            error.message === "ATTACHMENT_IDS_INVALID")
        ) {
          return c.json(
            { error: "Invalid attachment order", code: "bad_request" },
            400,
          );
        }
        throw error;
      }
    },
  );
  app.get("/api/v1/letters/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Letter PDFs are only available from local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    try {
      const result = await circleService.getLetterAttachment(
        auth.workspaceId,
        c.req.param("id"),
        c.req.param("attachmentId"),
      );
      if (!result) return c.json(notFound("PDF"), 404);
      c.header("Content-Type", result.row.contentType);
      c.header(
        "Content-Disposition",
        `inline; filename="${(result.row.originalFilename || "letter.pdf").replaceAll('"', "")}"`,
      );
      return c.body(Uint8Array.from(result.bytes).buffer);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "STORAGE_OBJECT_NOT_FOUND"
      ) {
        return c.json(notFound("PDF"), 404);
      }
      throw error;
    }
  });
  app.patch("/api/v1/letters/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({ originalFilename: z.string().trim().min(1).max(255) })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "originalFilename is required", code: "bad_request" },
        400,
      );
    }
    const letterId = c.req.param("id");
    const row = await circleService.updateLetterAttachment(
      auth.workspaceId,
      letterId,
      c.req.param("attachmentId"),
      parsed.data,
    );
    if (!row) return c.json(notFound("PDF"), 404);
    // Primary PDF rename may also retitle the letter + move the vault file.
    await emitLetterMetadataSync(auth.workspaceId, letterId);
    return c.json(row);
  });
  app.delete("/api/v1/letters/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const letterId = c.req.param("id");
    const row = await circleService.deleteLetterAttachment(
      auth.workspaceId,
      letterId,
      c.req.param("attachmentId"),
    );
    if (!row) return c.json(notFound("PDF"), 404);
    await emitLetterMetadataSync(auth.workspaceId, letterId);
    return c.json(row);
  });

  app.put(
    "/api/v1/avatars/:entityType/:entityId",
    bodyLimit({
      maxSize: MAX_AVATAR_BYTES,
      onError: (c) =>
        c.json(
          { error: "Avatar must be an image up to 5 MB", code: "bad_request" },
          413,
        ),
    }),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "avatars:write")) return c.json(forbidden(), 403);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const contentType =
        sniffAvatarContentType(bytes) ??
        normalizeAvatarMimeType(c.req.header("Content-Type"));
      if (
        !contentType ||
        bytes.byteLength === 0 ||
        bytes.byteLength > MAX_AVATAR_BYTES
      ) {
        return c.json(
          {
            error: "Avatar must be a JPG, PNG, WebP, GIF, or SVG up to 5 MB",
            code: "bad_request",
          },
          400,
        );
      }
      const entityType = c.req.param("entityType");
      const entityId = c.req.param("entityId");
      const syncEntity = avatarEntityToSyncEntity(entityType);
      const leaderFirst = isRestLeaderFirstWrite() && syncEntity != null;
      const row = await circleService.putAvatar(
        auth.workspaceId,
        entityType,
        entityId,
        bytes,
        contentType,
        { updateEntityColumns: !leaderFirst },
      );
      if (leaderFirst && syncEntity) {
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: syncEntity,
          entityId,
          operation: "upsert",
          payload:
            syncEntity === "organization"
              ? buildOrganizationRestPayload(entityId, {
                  avatarStorageKey: row.storageKey,
                  avatarContentType: row.contentType,
                })
              : syncEntity === "contact"
                ? buildContactRestPayload(
                    entityId,
                    entityType === "avatar_portal"
                      ? {
                          portalAvatarStorageKey: row.storageKey,
                          portalAvatarContentType: row.contentType,
                        }
                      : {
                          avatarStorageKey: row.storageKey,
                          avatarContentType: row.contentType,
                        },
                  )
                : buildBankAccountRestPayload(entityId, {
                    avatarStorageKey: row.storageKey,
                    avatarContentType: row.contentType,
                  }),
        });
      } else if (syncEntity === "organization") {
        const org = await circleService.getOrganizationById(
          auth.workspaceId,
          entityId,
        );
        if (org) {
          await recordOrganizationRestSyncEvent(auth.workspaceId, org, "upsert");
          nudgeOrganizationLive(auth, org.id, "upsert");
        }
      } else if (syncEntity === "contact") {
        const contact = await circleService.getContactById(
          auth.workspaceId,
          entityId,
        );
        if (contact) {
          await recordContactRestSyncEvent(auth.workspaceId, contact, "upsert");
          nudgeContactLive(auth, contact.id, "upsert");
        }
      } else if (syncEntity === "bank_account") {
        const account = await financeService.getBankAccountById(
          auth.workspaceId,
          entityId,
        );
        if (account) {
          await recordBankAccountRestSyncEvent(
            auth.workspaceId,
            account,
            "upsert",
          );
        }
      }
      return c.json(row);
    },
  );
  app.get(
    "/api/v1/avatars/:entityType/:entityId/signed-url",
    zValidator("query", avatarSignedUrlQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "avatars:read")) return c.json(forbidden(), 403);

      const entityType = c.req.param("entityType");
      const entityId = c.req.param("entityId");
      if (!isAvatarSignedEntityType(entityType)) {
        return c.json(
          { error: "Invalid avatar entity type", code: "bad_request" as const },
          400,
        );
      }

      const secret = getAvatarUrlSigningSecret();
      const origin = getPublicApiOrigin();
      if (!secret || !origin) {
        return c.json(
          {
            error:
              "Avatar signed URLs are not configured (AVATAR_URL_SIGNING_SECRET and PUBLIC_API_URL)",
            code: "service_unavailable" as const,
          },
          503,
        );
      }

      const existing = await circleService.getAvatar(
        auth.workspaceId,
        entityType,
        entityId,
      );
      if (!existing) return c.json(notFound("Avatar"), 404);

      const query = c.req.valid("query");
      const minted = buildAvatarSignedUrl({
        origin,
        workspaceId: auth.workspaceId,
        entityType,
        entityId,
        secret,
        ttlSeconds: query.ttlSeconds,
      });

      return c.json({
        url: minted.url,
        expiresAt: minted.expiresAt.toISOString(),
      });
    },
  );

  app.get(
    "/api/v1/public/avatars/:entityType/:entityId",
    zValidator("query", publicAvatarQuerySchema),
    async (c) => {
      const entityType = c.req.param("entityType");
      const entityId = c.req.param("entityId");
      if (!isAvatarSignedEntityType(entityType)) {
        return c.json(notFound("Avatar"), 404);
      }

      const secret = getAvatarUrlSigningSecret();
      if (!secret) {
        return c.json(notFound("Avatar"), 404);
      }

      const query = c.req.valid("query");
      const payload = {
        workspaceId: query.ws,
        entityType,
        entityId,
        exp: query.exp,
      };
      if (!verifyAvatarSignature(payload, query.sig, secret)) {
        return c.json(notFound("Avatar"), 404);
      }

      const result = await circleService.getAvatar(
        query.ws,
        entityType,
        entityId,
      );
      if (!result) return c.json(notFound("Avatar"), 404);

      const contentType = resolveAvatarContentType(
        result.row.contentType,
        result.bytes,
      );
      const remainingTtl = Math.max(0, query.exp - Math.floor(Date.now() / 1000));
      const cacheSeconds = Math.min(300, remainingTtl);
      c.header("Content-Type", contentType);
      c.header(
        "Cache-Control",
        cacheSeconds > 0
          ? `public, max-age=${cacheSeconds}`
          : "public, max-age=0, must-revalidate",
      );
      const body = Uint8Array.from(result.bytes);
      return c.body(
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      );
    },
  );

  app.get("/api/v1/avatars/:entityType/:entityId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "avatars:read")) return c.json(forbidden(), 403);
    const result = await circleService.getAvatar(auth.workspaceId, c.req.param("entityType"), c.req.param("entityId"));
    if (!result) return c.json(notFound("Avatar"), 404);
    const contentType = resolveAvatarContentType(
      result.row.contentType,
      result.bytes,
    );
    c.header("Content-Type", contentType);
    c.header("Cache-Control", "private, max-age=300");
    const body = Uint8Array.from(result.bytes);
    return c.body(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  });
  app.delete("/api/v1/avatars/:entityType/:entityId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "avatars:write")) return c.json(forbidden(), 403);
    const entityType = c.req.param("entityType");
    const entityId = c.req.param("entityId");
    const syncEntity = avatarEntityToSyncEntity(entityType);
    const leaderFirst = isRestLeaderFirstWrite() && syncEntity != null;
    const row = await circleService.deleteAvatar(
      auth.workspaceId,
      entityType,
      entityId,
      { updateEntityColumns: !leaderFirst },
    );
    if (!row) return c.json(notFound("Avatar"), 404);
    if (leaderFirst && syncEntity) {
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: syncEntity,
        entityId,
        operation: "upsert",
        payload:
          syncEntity === "organization"
            ? buildOrganizationRestPayload(entityId, {
                avatarStorageKey: null,
                avatarContentType: null,
              })
            : syncEntity === "contact"
              ? buildContactRestPayload(
                  entityId,
                  entityType === "avatar_portal"
                    ? {
                        portalAvatarStorageKey: null,
                        portalAvatarContentType: null,
                      }
                    : {
                        avatarStorageKey: null,
                        avatarContentType: null,
                      },
                )
              : buildBankAccountRestPayload(entityId, {
                  avatarStorageKey: null,
                  avatarContentType: null,
                }),
      });
    } else if (syncEntity === "organization") {
      const org = await circleService.getOrganizationById(
        auth.workspaceId,
        entityId,
      );
      if (org) {
        await recordOrganizationRestSyncEvent(auth.workspaceId, org, "upsert");
        nudgeOrganizationLive(auth, org.id, "upsert");
      }
    } else if (syncEntity === "contact") {
      const contact = await circleService.getContactById(
        auth.workspaceId,
        entityId,
      );
      if (contact) {
        await recordContactRestSyncEvent(auth.workspaceId, contact, "upsert");
        nudgeContactLive(auth, contact.id, "upsert");
      }
    } else if (syncEntity === "bank_account") {
      const account = await financeService.getBankAccountById(
        auth.workspaceId,
        entityId,
      );
      if (account) {
        await recordBankAccountRestSyncEvent(
          auth.workspaceId,
          account,
          "upsert",
        );
      }
    }
    return c.json(row);
  });

  app.put(
    "/api/v1/devices/push-token",
    zValidator("json", upsertDevicePushTokenSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!isOwnerShellAuth(auth)) {
        return c.json(unauthorized(), 401);
      }
      const body = c.req.valid("json");
      try {
        await pushInboxTriageService.upsertDevicePushToken({
          workspaceId: auth.workspaceId,
          userId: auth.userId!,
          platform: body.platform,
          token: body.token,
          deviceName: body.deviceName,
        });
        return c.json({ ok: true as const });
      } catch (error) {
        if (error instanceof Error && error.message === "PUSH_TOKEN_REQUIRED") {
          return c.json({ error: "Token required", code: "bad_request" }, 400);
        }
        throw error;
      }
    },
  );
  app.delete(
    "/api/v1/devices/push-token",
    zValidator("json", deleteDevicePushTokenSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!isOwnerShellAuth(auth)) {
        return c.json(unauthorized(), 401);
      }
      const body = c.req.valid("json");
      await pushInboxTriageService.deleteDevicePushToken({
        workspaceId: auth.workspaceId,
        userId: auth.userId!,
        token: body.token,
      });
      return c.json({ ok: true as const });
    },
  );

}
