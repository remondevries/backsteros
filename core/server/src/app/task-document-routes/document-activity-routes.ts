import type { Hono } from "../route-deps.js";
import {
	blobReadsRequireLocalCore,
	documentService,
	forbidden,
	getAuth,
	notFound,
	requireScope,
	unauthorized,
	writeActorFromAuth,
	z,
	zValidator,
} from "../route-deps.js";
import {
	deleteDocumentActivity,
	isDocumentActivityType,
	listDocumentActivities,
	recordDocumentActivity,
} from "../../services/document-activities.js";
import {
	documentPdfExportDeps,
} from "../../services/document-pdf-export.js";
import {
	getPdfDocumentSettings,
	getPdfExportBrand,
	putPdfDocumentSettings,
	putPdfExportBrand,
} from "../../services/pdf-export-settings.js";
import { documentVersionRouteDeps } from "../../services/document-versions.js";

/** Client-reported events only (core writes rename / front matter / text itself). */
const recordActivitySchema = z.object({
	type: z.literal("pdf_creation"),
	data: z.record(z.string(), z.unknown()).optional(),
	clientEventId: z.string().min(1).max(200).optional(),
	occurredAt: z.string().datetime().optional(),
});

const putBrandSchema = z.object({
	brand: z.enum(["rdv", "lemo-design"]),
	ifMatchVersion: z.number().int().min(0).optional(),
});

const putDocumentSettingsSchema = z.object({
	settings: z.record(z.string(), z.unknown()),
	ifMatchVersion: z.number().int().min(0).optional(),
});

export function registerDocumentActivityRoutes(app: Hono) {
	app.get("/api/v1/documents/:id/versions/:contentVersion", async (c) => {
		const auth = getAuth(c);
		if (!requireScope("documents:read")(auth)) {
			return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
		}
		const documentId = c.req.param("id");
		const contentVersionRaw = Number(c.req.param("contentVersion"));
		if (!Number.isFinite(contentVersionRaw) || contentVersionRaw < 1) {
			return c.json(
				{ error: "contentVersion must be a positive integer", field: "contentVersion" },
				400,
			);
		}
		const contentVersion = Math.trunc(contentVersionRaw);
		const doc = await documentVersionRouteDeps.getDocumentById(
			auth.workspaceId,
			documentId,
		);
		if (!doc) return c.json(notFound("Document"), 404);

		const withPrevious =
			c.req.query("withPrevious") === "1" ||
			c.req.query("withPrevious") === "true";

		const result =
			await documentVersionRouteDeps.getDocumentVersionWithPrevious(
				auth.workspaceId,
				documentId,
				contentVersion,
			);
		if (!result.version) {
			return c.json(notFound("Document version"), 404);
		}

		return c.json({
			version: documentVersionRouteDeps.serializeDocumentVersion(
				result.version,
			),
			previous: withPrevious
				? result.previous
					? documentVersionRouteDeps.serializeDocumentVersion(
							result.previous,
						)
					: null
				: undefined,
		});
	});

	app.get("/api/v1/documents/:id/activities", async (c) => {
		const auth = getAuth(c);
		if (!requireScope("documents:read")(auth)) {
			return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
		}
		const documentId = c.req.param("id");
		const doc = await documentService.getDocumentById(
			auth.workspaceId,
			documentId,
		);
		if (!doc) return c.json(notFound("Document"), 404);

		const url = new URL(c.req.url);
		const typesRaw = url.searchParams.get("types");
		const types = typesRaw
			? typesRaw
					.split(",")
					.map((t) => t.trim())
					.filter(isDocumentActivityType)
			: undefined;
		const fromRaw = url.searchParams.get("from");
		const toRaw = url.searchParams.get("to");
		const limitRaw = Number(url.searchParams.get("limit") ?? "40");
		const cursor = url.searchParams.get("cursor");

		const result = await listDocumentActivities({
			workspaceId: auth.workspaceId,
			documentId,
			types,
			from: fromRaw ? new Date(fromRaw) : undefined,
			to: toRaw ? new Date(toRaw) : undefined,
			limit: Number.isFinite(limitRaw) ? limitRaw : 40,
			cursor,
		});
		return c.json({
			activities: result.activities,
			nextCursor: result.nextCursor,
		});
	});

	app.post(
		"/api/v1/documents/:id/activities",
		zValidator("json", recordActivitySchema),
		async (c) => {
			const auth = getAuth(c);
			if (!requireScope("documents:write")(auth)) {
				return c.json(
					auth ? forbidden() : unauthorized(),
					auth ? 403 : 401,
				);
			}
			const documentId = c.req.param("id");
			const doc = await documentService.getDocumentById(
				auth.workspaceId,
				documentId,
			);
			if (!doc) return c.json(notFound("Document"), 404);

			const body = c.req.valid("json");
			const idempotency =
				c.req.header("Idempotency-Key")?.trim() ||
				body.clientEventId ||
				null;
			const actor = writeActorFromAuth(auth);
			const row = await recordDocumentActivity(auth.workspaceId, documentId, {
				type: body.type,
				actor,
				actorKind: actor.kind === "agent" ? "agent" : "user",
				actorApiKeyId: auth.apiKeyId ?? null,
				data: body.data,
				clientEventId: idempotency,
				occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
				projectId: doc.projectId,
			});
			return c.json({ activity: row }, 201);
		},
	);

	app.delete("/api/v1/documents/:id/activities/:activityId", async (c) => {
		const auth = getAuth(c);
		if (!requireScope("documents:write")(auth)) {
			return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
		}
		const documentId = c.req.param("id");
		const activityId = c.req.param("activityId");
		const doc = await documentService.getDocumentById(
			auth.workspaceId,
			documentId,
		);
		if (!doc) return c.json(notFound("Document"), 404);

		const deleted = await deleteDocumentActivity(
			auth.workspaceId,
			documentId,
			activityId,
		);
		if (!deleted) return c.json(notFound("Activity"), 404);
		return c.body(null, 204);
	});

	app.get("/api/v1/document-activities", async (c) => {
		const auth = getAuth(c);
		if (!requireScope("documents:read")(auth)) {
			return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
		}
		const url = new URL(c.req.url);
		const typesRaw = url.searchParams.get("types");
		const types = typesRaw
			? typesRaw
					.split(",")
					.map((t) => t.trim())
					.filter(isDocumentActivityType)
			: undefined;
		const fromRaw = url.searchParams.get("from");
		const toRaw = url.searchParams.get("to");
		const limitRaw = Number(url.searchParams.get("limit") ?? "40");
		const result = await listDocumentActivities({
			workspaceId: auth.workspaceId,
			documentId: url.searchParams.get("documentId") ?? undefined,
			projectId: url.searchParams.get("projectId") ?? undefined,
			types,
			from: fromRaw ? new Date(fromRaw) : undefined,
			to: toRaw ? new Date(toRaw) : undefined,
			limit: Number.isFinite(limitRaw) ? limitRaw : 40,
			cursor: url.searchParams.get("cursor"),
		});
		return c.json({
			activities: result.activities,
			nextCursor: result.nextCursor,
		});
	});

	app.get("/api/v1/projects/:id/pdf-export-brand", async (c) => {
		const auth = getAuth(c);
		if (!requireScope("documents:read")(auth)) {
			return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
		}
		const row = await getPdfExportBrand(
			auth.workspaceId,
			"project",
			c.req.param("id"),
		);
		return c.json({
			brand: row?.brand ?? null,
			version: row?.version ?? 0,
		});
	});

	app.put(
		"/api/v1/projects/:id/pdf-export-brand",
		zValidator("json", putBrandSchema),
		async (c) => {
			const auth = getAuth(c);
			if (!requireScope("documents:write")(auth)) {
				return c.json(
					auth ? forbidden() : unauthorized(),
					auth ? 403 : 401,
				);
			}
			const body = c.req.valid("json");
			const result = await putPdfExportBrand({
				workspaceId: auth.workspaceId,
				scopeType: "project",
				scopeId: c.req.param("id"),
				brand: body.brand,
				ifMatchVersion: body.ifMatchVersion,
				updatedByUserId: auth.userId,
				updatedByContactId: auth.contactId ?? null,
			});
			if (!result.ok) {
				return c.json(
					{
						error: "Version conflict",
						code: "version_conflict",
						brand: result.row.brand,
						version: result.row.version,
					},
					409,
				);
			}
			return c.json({
				brand: result.row.brand,
				version: result.row.version,
			});
		},
	);

	app.get("/api/v1/spaces/:id/pdf-export-brand", async (c) => {
		const auth = getAuth(c);
		if (!requireScope("documents:read")(auth)) {
			return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
		}
		const row = await getPdfExportBrand(
			auth.workspaceId,
			"space",
			c.req.param("id"),
		);
		return c.json({
			brand: row?.brand ?? null,
			version: row?.version ?? 0,
		});
	});

	app.put(
		"/api/v1/spaces/:id/pdf-export-brand",
		zValidator("json", putBrandSchema),
		async (c) => {
			const auth = getAuth(c);
			if (!requireScope("documents:write")(auth)) {
				return c.json(
					auth ? forbidden() : unauthorized(),
					auth ? 403 : 401,
				);
			}
			const body = c.req.valid("json");
			const result = await putPdfExportBrand({
				workspaceId: auth.workspaceId,
				scopeType: "space",
				scopeId: c.req.param("id"),
				brand: body.brand,
				ifMatchVersion: body.ifMatchVersion,
				updatedByUserId: auth.userId,
				updatedByContactId: auth.contactId ?? null,
			});
			if (!result.ok) {
				return c.json(
					{
						error: "Version conflict",
						code: "version_conflict",
						brand: result.row.brand,
						version: result.row.version,
					},
					409,
				);
			}
			return c.json({
				brand: result.row.brand,
				version: result.row.version,
			});
		},
	);

	/**
	 * List retrievable PDF exports for a document (pdf_creation activities).
	 * Rows with `letterId` / `pdfPath` can be fetched via GET /letters/:id/pdf.
	 */
	app.get("/api/v1/documents/:id/pdfs", async (c) => {
		const auth = getAuth(c);
		if (!requireScope("documents:read")(auth)) {
			return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
		}
		const documentId = c.req.param("id");
		const doc = await documentService.getDocumentById(
			auth.workspaceId,
			documentId,
		);
		if (!doc) return c.json(notFound("Document"), 404);

		const url = new URL(c.req.url);
		const limitRaw = Number(url.searchParams.get("limit") ?? "40");
		const cursor = url.searchParams.get("cursor");
		const result = await documentPdfExportDeps.listDocumentPdfExports({
			workspaceId: auth.workspaceId,
			documentId,
			limit: Number.isFinite(limitRaw) ? limitRaw : 40,
			cursor,
		});
		return c.json({
			pdfs: result.pdfs,
			nextCursor: result.nextCursor,
		});
	});

	/**
	 * Persist a PDF export for a document as a linked letter + activity.
	 * Body: raw `application/pdf` bytes (Firm/agent render). Requires local-core
	 * blob storage (same as PUT /letters/:id/pdf).
	 */
	app.post("/api/v1/documents/:id/pdf", async (c) => {
		const auth = getAuth(c);
		if (
			!requireScope("documents:write")(auth) ||
			!requireScope("letters:write")(auth)
		) {
			return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
		}
		if (blobReadsRequireLocalCore()) {
			return c.json(
				{
					error: "Document PDFs can only be stored on local-core",
					code: "pdf_requires_local_core",
				},
				503,
			);
		}
		const documentId = c.req.param("id");
		const contentType = (c.req.header("content-type") ?? "").toLowerCase();
		let bytes: Uint8Array;
		let filename =
			c.req.header("X-Filename")?.trim() ||
			c.req.query("filename")?.trim() ||
			null;
		let title = c.req.header("X-Title")?.trim() || c.req.query("title")?.trim() || null;
		let brandRaw =
			c.req.header("X-Brand")?.trim() || c.req.query("brand")?.trim() || null;

		if (contentType.includes("multipart/form-data")) {
			const form = await c.req.formData();
			const file = form.get("file");
			if (!(file instanceof File)) {
				return c.json(
					{ error: "Expected multipart field `file` with a PDF", code: "bad_request" },
					400,
				);
			}
			bytes = new Uint8Array(await file.arrayBuffer());
			filename =
				(typeof form.get("filename") === "string"
					? String(form.get("filename")).trim()
					: null) ||
				file.name ||
				filename;
			title =
				(typeof form.get("title") === "string"
					? String(form.get("title")).trim()
					: null) || title;
			brandRaw =
				(typeof form.get("brand") === "string"
					? String(form.get("brand")).trim()
					: null) || brandRaw;
		} else {
			bytes = new Uint8Array(await c.req.arrayBuffer());
		}

		const brand =
			brandRaw === "rdv" || brandRaw === "lemo-design" ? brandRaw : null;

		const result = await documentPdfExportDeps.createDocumentPdfExport({
			workspaceId: auth.workspaceId,
			documentId,
			bytes,
			filename,
			title,
			brand,
			actor: writeActorFromAuth(auth),
			actorKind: auth.apiKeyId ? "agent" : "user",
			actorApiKeyId: auth.apiKeyId ?? null,
		});

		if (!result.ok) {
			const status =
				result.code === "not_found"
					? 404
					: result.code === "storage_unavailable"
						? 503
						: 400;
			return c.json(
				{
					error: result.error,
					code:
						result.code === "storage_unavailable"
							? "pdf_requires_local_core"
							: result.code,
				},
				status,
			);
		}

		return c.json(
			{
				letter: result.letter,
				activity: {
					id: result.activity.id,
					type: result.activity.type,
					occurredAt: result.activity.occurredAt.toISOString(),
					data: result.activity.data,
				},
				pdfPath: result.pdfPath,
			},
			201,
		);
	});

	app.get("/api/v1/documents/:id/pdf-export-settings", async (c) => {
		const auth = getAuth(c);
		if (!requireScope("documents:read")(auth)) {
			return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
		}
		const documentId = c.req.param("id");
		const doc = await documentService.getDocumentById(
			auth.workspaceId,
			documentId,
		);
		if (!doc) return c.json(notFound("Document"), 404);
		const row = await getPdfDocumentSettings(auth.workspaceId, documentId);
		return c.json({
			settings: row?.settings ?? null,
			version: row?.version ?? 0,
		});
	});

	app.put(
		"/api/v1/documents/:id/pdf-export-settings",
		zValidator("json", putDocumentSettingsSchema),
		async (c) => {
			const auth = getAuth(c);
			if (!requireScope("documents:write")(auth)) {
				return c.json(
					auth ? forbidden() : unauthorized(),
					auth ? 403 : 401,
				);
			}
			const documentId = c.req.param("id");
			const doc = await documentService.getDocumentById(
				auth.workspaceId,
				documentId,
			);
			if (!doc) return c.json(notFound("Document"), 404);
			const body = c.req.valid("json");
			const result = await putPdfDocumentSettings({
				workspaceId: auth.workspaceId,
				documentId,
				settings: body.settings,
				ifMatchVersion: body.ifMatchVersion,
				updatedByUserId: auth.userId,
				updatedByContactId: auth.contactId ?? null,
			});
			if (!result.ok) {
				return c.json(
					{
						error: "Version conflict",
						code: "version_conflict",
						settings: result.row.settings,
						version: result.row.version,
					},
					409,
				);
			}
			return c.json({
				settings: result.row.settings,
				version: result.row.version,
			});
		},
	);
}
