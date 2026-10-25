import {
  MAX_TASK_IMAGE_BYTES,
  blobReadsRequireLocalCore,
  bodyLimit,
  can,
  forbidden,
  getAuth,
  normalizeTaskImageMimeType,
  notFound,
  notifyPeerOfEntityWrite,
  reorderTaskAttachmentsSchema,
  resolveTaskAttachmentContentType,
  resolveTaskImageContentType,
  routeTaskId,
  sniffTaskImageContentType,
  taskAttachmentService,
  taskImageService,
  taskImageUploadInputSchema,
  z,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Task images and attachments. */
export function registerTaskMediaRoutes(app: Hono) {
  app.get("/api/v1/tasks/:id/images", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const commentId = c.req.query("commentId")?.trim() || undefined;
    const images = await taskImageService.listTaskImages(
      auth.workspaceId,
      taskId,
      commentId ? { commentId } : undefined,
    );
    return images
      ? c.json({ images })
      : c.json(notFound("Task"), 404);
  });

  // Base64 JSON can be ~4/3 of decoded size; allow headroom for one 10 MB image.
  const MAX_TASK_IMAGE_REQUEST_BYTES = Math.ceil(MAX_TASK_IMAGE_BYTES * 1.4) + 4096;

  app.post(
    "/api/v1/tasks/:id/images",
    bodyLimit({
      maxSize: MAX_TASK_IMAGE_REQUEST_BYTES,
      onError: (c) =>
        c.json(
          {
            error: "Image must be a JPG, PNG, WebP, or GIF up to 10 MB",
            code: "bad_request",
          },
          413,
        ),
    }),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);

      const contentTypeHeader = c.req.header("Content-Type") ?? "";
      const isJson = contentTypeHeader
        .split(";")[0]
        ?.trim()
        .toLowerCase() === "application/json";

      let bytes: Uint8Array;
      let contentType: string | null;
      let filename = c.req.header("X-Filename") ?? undefined;
      let commentId: string | null | undefined;

      if (isJson) {
        let raw: unknown;
        try {
          raw = await c.req.json();
        } catch {
          return c.json(
            {
              error: "Invalid JSON body",
              code: "bad_request",
            },
            400,
          );
        }
        const parsed = taskImageUploadInputSchema
          .extend({ commentId: z.string().min(1).max(64).nullable().optional() })
          .safeParse(raw);
        if (!parsed.success) {
          return c.json(
            {
              error: "Image must be a JPG, PNG, WebP, or GIF up to 10 MB",
              code: "bad_request",
            },
            400,
          );
        }
        const decoded = taskImageService.decodeTaskImageUpload(parsed.data);
        if ("error" in decoded) {
          return c.json({ error: decoded.error, code: "bad_request" }, 400);
        }
        bytes = decoded.bytes;
        contentType = decoded.contentType;
        filename = decoded.filename ?? filename;
        commentId = parsed.data.commentId;
      } else {
        bytes = new Uint8Array(await c.req.arrayBuffer());
        contentType =
          sniffTaskImageContentType(bytes) ??
          normalizeTaskImageMimeType(contentTypeHeader);
      }

      if (
        !contentType ||
        bytes.byteLength === 0 ||
        bytes.byteLength > MAX_TASK_IMAGE_BYTES
      ) {
        return c.json(
          {
            error: "Image must be a JPG, PNG, WebP, or GIF up to 10 MB",
            code: "bad_request",
          },
          400,
        );
      }
      const image = await taskImageService.createTaskImage(
        auth.workspaceId,
        taskId,
        bytes,
        contentType,
        filename,
        { commentId },
      );
      if (!image) return c.json(notFound("Task"), 404);
      const { notifyPeerOfEntityWrite } = await import(
        "../../services/core-replication/nudge.js"
      );
      notifyPeerOfEntityWrite({
        workspaceId: auth.workspaceId,
        reason: "rest",
        entity: "task",
        entityId: taskId,
        taskId,
        operation: "upsert",
      });
      return c.json(image, 201);
    },
  );

  app.get("/api/v1/tasks/:id/images/:imageId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const result = await taskImageService.getTaskImage(
      auth.workspaceId,
      taskId,
      c.req.param("imageId"),
    );
    if (!result) return c.json(notFound("Image"), 404);
    const contentType = resolveTaskImageContentType(
      result.row.contentType,
      result.bytes,
    );
    c.header("Content-Type", contentType);
    c.header("Cache-Control", "private, max-age=300");
    const body = Uint8Array.from(result.bytes);
    return c.body(
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    );
  });

  app.get("/api/v1/tasks/:id/attachments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const attachments = await taskAttachmentService.listTaskAttachments(
      auth.workspaceId,
      taskId,
    );
    return attachments
      ? c.json({ attachments })
      : c.json(notFound("Task"), 404);
  });

  app.post("/api/v1/tasks/:id/attachments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Task attachments can only be stored on local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 25_000_000) {
      return c.json(
        {
          error: "Attachment must be between 1 byte and 25 MB",
          code: "bad_request",
        },
        400,
      );
    }
    const filename = (c.req.header("X-Filename") ?? "attachment.bin").trim();
    if (!filename) {
      return c.json(
        { error: "X-Filename is required", code: "bad_request" },
        400,
      );
    }
    const contentType = resolveTaskAttachmentContentType(
      c.req.header("Content-Type"),
      filename,
    );
    const attachment = await taskAttachmentService.createTaskAttachment(
      auth.workspaceId,
      taskId,
      bytes,
      filename,
      contentType,
    );
    return attachment
      ? c.json(attachment, 201)
      : c.json(notFound("Task"), 404);
  });

  app.post(
    "/api/v1/tasks/:id/attachments/reorder",
    zValidator("json", reorderTaskAttachmentsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      try {
        const rows = await taskAttachmentService.reorderTaskAttachments(
          auth.workspaceId,
          taskId,
          c.req.valid("json").orderedIds,
        );
        if (!rows) return c.json(notFound("Task"), 404);
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

  app.get("/api/v1/tasks/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Task attachments are only available from local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    const result = await taskAttachmentService.getTaskAttachment(
      auth.workspaceId,
      taskId,
      c.req.param("attachmentId"),
    );
    if (!result) return c.json(notFound("Attachment"), 404);
    c.header("Content-Type", result.row.contentType);
    c.header(
      "Content-Disposition",
      `inline; filename="${(result.row.originalFilename || "attachment.bin").replaceAll('"', "")}"`,
    );
    return c.body(Uint8Array.from(result.bytes).buffer);
  });

  app.patch("/api/v1/tasks/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
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
    const row = await taskAttachmentService.updateTaskAttachment(
      auth.workspaceId,
      taskId,
      c.req.param("attachmentId"),
      parsed.data,
    );
    return row ? c.json(row) : c.json(notFound("PDF"), 404);
  });

  app.delete("/api/v1/tasks/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const row = await taskAttachmentService.deleteTaskAttachment(
      auth.workspaceId,
      taskId,
      c.req.param("attachmentId"),
    );
    return row ? c.json(row) : c.json(notFound("PDF"), 404);
  });
}
