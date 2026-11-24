import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import {
	documents,
	pdfExportBrands,
	pdfExportDocumentSettings,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";

export type PdfExportBrandValue = "rdv" | "lemo-design";

export function isPdfExportBrandValue(
	value: unknown,
): value is PdfExportBrandValue {
	return value === "rdv" || value === "lemo-design";
}

export type PdfExportScopeType = "project" | "space";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export async function getPdfExportBrand(
	workspaceId: string,
	scopeType: PdfExportScopeType,
	scopeId: string,
	executor: DbExecutor = db,
) {
	const [row] = await executor
		.select()
		.from(pdfExportBrands)
		.where(
			and(
				eq(pdfExportBrands.workspaceId, workspaceId),
				eq(pdfExportBrands.scopeType, scopeType),
				eq(pdfExportBrands.scopeId, scopeId),
				isNull(pdfExportBrands.deletedAt),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function putPdfExportBrand(input: {
	workspaceId: string;
	scopeType: PdfExportScopeType;
	scopeId: string;
	brand: PdfExportBrandValue;
	ifMatchVersion?: number;
	updatedByUserId?: string | null;
	updatedByContactId?: string | null;
	executor?: DbExecutor;
}): Promise<
	| { ok: true; row: typeof pdfExportBrands.$inferSelect }
	| { ok: false; conflict: true; row: typeof pdfExportBrands.$inferSelect }
> {
	const executor = input.executor ?? db;
	const existing = await getPdfExportBrand(
		input.workspaceId,
		input.scopeType,
		input.scopeId,
		executor,
	);

	if (!existing) {
		if (input.ifMatchVersion != null && input.ifMatchVersion !== 0) {
			throw new Error("pdf_export_brand_version_mismatch");
		}
		const [row] = await executor
			.insert(pdfExportBrands)
			.values({
				id: newId(),
				workspaceId: input.workspaceId,
				scopeType: input.scopeType,
				scopeId: input.scopeId,
				brand: input.brand,
				version: 1,
				updatedByUserId: input.updatedByUserId ?? null,
				updatedByContactId: input.updatedByContactId ?? null,
			})
			.returning();
		if (!row) throw new Error("Failed to insert pdf export brand");
		return { ok: true, row };
	}

	if (
		input.ifMatchVersion != null &&
		input.ifMatchVersion !== existing.version
	) {
		return { ok: false, conflict: true, row: existing };
	}

	const [row] = await executor
		.update(pdfExportBrands)
		.set({
			brand: input.brand,
			version: existing.version + 1,
			updatedByUserId: input.updatedByUserId ?? null,
			updatedByContactId: input.updatedByContactId ?? null,
			updatedAt: new Date(),
		})
		.where(eq(pdfExportBrands.id, existing.id))
		.returning();
	if (!row) throw new Error("Failed to update pdf export brand");
	return { ok: true, row };
}

export async function getPdfDocumentSettings(
	workspaceId: string,
	documentId: string,
	executor: DbExecutor = db,
) {
	const [row] = await executor
		.select()
		.from(pdfExportDocumentSettings)
		.where(
			and(
				eq(pdfExportDocumentSettings.workspaceId, workspaceId),
				eq(pdfExportDocumentSettings.documentId, documentId),
				isNull(pdfExportDocumentSettings.deletedAt),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function putPdfDocumentSettings(input: {
	workspaceId: string;
	documentId: string;
	settings: Record<string, unknown>;
	ifMatchVersion?: number;
	updatedByUserId?: string | null;
	updatedByContactId?: string | null;
	executor?: DbExecutor;
}): Promise<
	| { ok: true; row: typeof pdfExportDocumentSettings.$inferSelect }
	| {
			ok: false;
			conflict: true;
			row: typeof pdfExportDocumentSettings.$inferSelect;
	  }
> {
	const executor = input.executor ?? db;
	const existing = await getPdfDocumentSettings(
		input.workspaceId,
		input.documentId,
		executor,
	);

	let projectId: string | null = null;
	const [doc] = await executor
		.select({ projectId: documents.projectId })
		.from(documents)
		.where(
			and(
				eq(documents.id, input.documentId),
				eq(documents.workspaceId, input.workspaceId),
			),
		)
		.limit(1);
	projectId = doc?.projectId ?? null;

	if (!existing) {
		if (input.ifMatchVersion != null && input.ifMatchVersion !== 0) {
			throw new Error("pdf_document_settings_version_mismatch");
		}
		const [row] = await executor
			.insert(pdfExportDocumentSettings)
			.values({
				id: newId(),
				workspaceId: input.workspaceId,
				documentId: input.documentId,
				projectId,
				settings: input.settings,
				version: 1,
				updatedByUserId: input.updatedByUserId ?? null,
				updatedByContactId: input.updatedByContactId ?? null,
			})
			.returning();
		if (!row) throw new Error("Failed to insert pdf document settings");
		return { ok: true, row };
	}

	if (
		input.ifMatchVersion != null &&
		input.ifMatchVersion !== existing.version
	) {
		return { ok: false, conflict: true, row: existing };
	}

	const [row] = await executor
		.update(pdfExportDocumentSettings)
		.set({
			settings: input.settings,
			projectId,
			version: existing.version + 1,
			updatedByUserId: input.updatedByUserId ?? null,
			updatedByContactId: input.updatedByContactId ?? null,
			updatedAt: new Date(),
		})
		.where(eq(pdfExportDocumentSettings.id, existing.id))
		.returning();
	if (!row) throw new Error("Failed to update pdf document settings");
	return { ok: true, row };
}
