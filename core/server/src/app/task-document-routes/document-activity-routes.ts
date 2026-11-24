import type { Hono } from "../route-deps.js";
import {
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
	isDocumentActivityType,
	listDocumentActivities,
	recordDocumentActivity,
} from "../../services/document-activities.js";
import {
	getPdfDocumentSettings,
	getPdfExportBrand,
	putPdfDocumentSettings,
	putPdfExportBrand,
} from "../../services/pdf-export-settings.js";

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
