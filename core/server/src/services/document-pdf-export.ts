import * as circleService from "./crm-domain.js";
import {
	listDocumentActivities,
	recordDocumentActivity,
	type DocumentActivityRow,
} from "./document-activities.js";
import * as documentService from "./documents.js";
import type { TaskWriteActor } from "../lib/write-actor.js";

const MAX_PDF_BYTES = 25_000_000;

export type DocumentPdfBrand = "rdv" | "lemo-design";

export type DocumentPdfListItem = {
	activityId: string;
	letterId: string | null;
	occurredAt: string;
	channel: string | null;
	brand: string | null;
	filename: string | null;
	byteSize: number | null;
	contentVersion: number | null;
	/** Relative core path — fetch with letters:read on local-core. */
	pdfPath: string | null;
};

export type CreateDocumentPdfInput = {
	workspaceId: string;
	documentId: string;
	bytes: Uint8Array;
	filename?: string | null;
	title?: string | null;
	brand?: DocumentPdfBrand | null;
	context?: string | null;
	actor: TaskWriteActor;
	actorKind?: "user" | "agent" | "system";
	actorApiKeyId?: string | null;
};

function asData(row: DocumentActivityRow): Record<string, unknown> {
	if (!row.data || typeof row.data !== "object" || Array.isArray(row.data)) {
		return {};
	}
	return row.data as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function serializeDocumentPdfActivity(
	row: DocumentActivityRow,
): DocumentPdfListItem {
	const data = asData(row);
	const letterId = stringOrNull(data.letterId);
	return {
		activityId: row.id,
		letterId,
		occurredAt: row.occurredAt.toISOString(),
		channel: stringOrNull(data.channel),
		brand: stringOrNull(data.brand),
		filename: stringOrNull(data.filename),
		byteSize: numberOrNull(data.byteSize),
		contentVersion: numberOrNull(data.contentVersion),
		pdfPath: letterId
			? `/api/v1/letters/${encodeURIComponent(letterId)}/pdf`
			: null,
	};
}

function safePdfFilename(title: string, brand?: string | null): string {
	const base = (title.trim() || "document")
		.replace(/[^\w.-]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 80);
	const suffix = brand === "lemo-design" ? "lemo-design" : brand === "rdv" ? "rdv" : "export";
	return `${base || "document"}-${suffix}.pdf`;
}

/**
 * Persist a document PDF export as a letter linked via `sourceDocumentId`,
 * then record (or coalesce) a `pdf_creation` activity with `letterId` so
 * agents can list history and fetch bytes from `/letters/:id/pdf`.
 */
export async function createDocumentPdfExport(
	input: CreateDocumentPdfInput,
): Promise<
	| {
			ok: true;
			letter: NonNullable<
				Awaited<ReturnType<typeof circleService.getLetterById>>
			>;
			activity: DocumentActivityRow;
			pdfPath: string;
	  }
	| { ok: false; code: "not_found" | "bad_request" | "storage_unavailable"; error: string }
> {
	const documentId = input.documentId.trim();
	if (!documentId) {
		return { ok: false, code: "bad_request", error: "Document id is required" };
	}
	if (
		input.bytes.byteLength === 0 ||
		input.bytes.byteLength > MAX_PDF_BYTES
	) {
		return {
			ok: false,
			code: "bad_request",
			error: "PDF must be between 1 byte and 25 MB",
		};
	}
	// %PDF magic — agents/Firm should only send real PDFs.
	const head = String.fromCharCode(
		input.bytes[0] ?? 0,
		input.bytes[1] ?? 0,
		input.bytes[2] ?? 0,
		input.bytes[3] ?? 0,
	);
	if (head !== "%PDF") {
		return {
			ok: false,
			code: "bad_request",
			error: "Body must be a PDF (missing %PDF header)",
		};
	}

	const doc = await documentService.getDocumentById(
		input.workspaceId,
		documentId,
	);
	if (!doc) {
		return { ok: false, code: "not_found", error: "Document not found" };
	}

	const title =
		input.title?.trim() ||
		(typeof doc.title === "string" && doc.title.trim()
			? doc.title.trim()
			: "Document");
	const filename =
		input.filename?.trim() ||
		safePdfFilename(title, input.brand ?? null);
	const brand = input.brand === "lemo-design" || input.brand === "rdv"
		? input.brand
		: null;

	let letter: Awaited<ReturnType<typeof circleService.createLetter>>;
	try {
		letter = await circleService.createLetter(input.workspaceId, {
			title,
			projectId: doc.projectId ?? null,
			direction: "outgoing",
			status: "backlog",
			context:
				input.context?.trim() ||
				`Exported from document ${documentId}.`,
			originalFilename: filename,
			sourceDocumentId: documentId,
			sourceContentVersion:
				typeof doc.contentVersion === "number"
					? doc.contentVersion
					: null,
			receivedDate: new Date().toISOString(),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Letter create failed";
		if (message === "PROJECT_NOT_FOUND") {
			return { ok: false, code: "bad_request", error: message };
		}
		throw err;
	}

	let withPdf: Awaited<ReturnType<typeof circleService.putLetterPdf>>;
	try {
		withPdf = await circleService.putLetterPdf(
			input.workspaceId,
			letter.id,
			input.bytes,
			filename,
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "";
		if (
			message.includes("local-core") ||
			message.includes("storage") ||
			message.includes("LOCAL")
		) {
			return {
				ok: false,
				code: "storage_unavailable",
				error: "PDF storage requires local-core",
			};
		}
		throw err;
	}
	if (!withPdf) {
		return { ok: false, code: "not_found", error: "Letter not found after create" };
	}

	const clientEventId = `document-pdf:${documentId}:${withPdf.id}`;
	const activity = await recordDocumentActivity(
		input.workspaceId,
		documentId,
		{
			type: "pdf_creation",
			actor: input.actor,
			actorKind: input.actorKind,
			actorApiKeyId: input.actorApiKeyId ?? null,
			projectId: doc.projectId ?? null,
			clientEventId,
			data: {
				channel: "letter",
				letterId: withPdf.id,
				brand,
				contentVersion: withPdf.sourceContentVersion ?? null,
				contentHash: withPdf.checksum ?? null,
				filename: withPdf.originalFilename || filename,
				byteSize: withPdf.byteSize ?? input.bytes.byteLength,
			},
		},
	);

	return {
		ok: true,
		letter: withPdf,
		activity,
		pdfPath: `/api/v1/letters/${encodeURIComponent(withPdf.id)}/pdf`,
	};
}

export async function listDocumentPdfExports(input: {
	workspaceId: string;
	documentId: string;
	limit?: number;
	cursor?: string | null;
}): Promise<{ pdfs: DocumentPdfListItem[]; nextCursor: string | null }> {
	const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);
	const result = await listDocumentActivities({
		workspaceId: input.workspaceId,
		documentId: input.documentId,
		types: ["pdf_creation"],
		limit,
		cursor: input.cursor ?? null,
	});
	return {
		pdfs: result.activities.map(serializeDocumentPdfActivity),
		nextCursor: result.nextCursor,
	};
}

/** Test / route seams. */
export const documentPdfExportDeps = {
	createDocumentPdfExport,
	listDocumentPdfExports,
	getDocumentById: documentService.getDocumentById,
};
