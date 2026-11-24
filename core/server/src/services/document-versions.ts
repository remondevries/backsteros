import { and, desc, eq, isNull, lt } from "drizzle-orm";

import { db } from "../db/index.js";
import { documentVersions } from "../db/schema.js";
import { newId } from "../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type DocumentVersionRow = typeof documentVersions.$inferSelect;

export type DocumentVersionActor = {
	kind?: "user" | "agent" | "system";
	userId?: string | null;
	contactId?: string | null;
	name?: string | null;
};

/**
 * Insert or update the full-text row for (documentId, contentVersion).
 * Coalesced / retried writes keep the latest text and bump updated_at.
 */
export async function upsertDocumentVersion(
	input: {
		workspaceId: string;
		documentId: string;
		contentVersion: number;
		content: string;
		actor?: DocumentVersionActor | null;
	},
	executor: DbExecutor = db,
): Promise<DocumentVersionRow> {
	const now = new Date();
	const actorKind = input.actor?.kind ?? "system";
	const actorUserId = input.actor?.userId ?? null;
	const actorContactId = input.actor?.contactId ?? null;
	const actorName = input.actor?.name?.trim() || null;

	const [row] = await executor
		.insert(documentVersions)
		.values({
			id: newId(),
			workspaceId: input.workspaceId,
			documentId: input.documentId,
			contentVersion: input.contentVersion,
			content: input.content,
			actorKind,
			actorUserId,
			actorContactId,
			actorName,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				documentVersions.documentId,
				documentVersions.contentVersion,
			],
			set: {
				content: input.content,
				actorKind,
				actorUserId,
				actorContactId,
				actorName,
				updatedAt: now,
				deletedAt: null,
			},
		})
		.returning();

	if (!row) {
		throw new Error("Failed to upsert document version");
	}
	return row;
}

export async function getDocumentVersion(
	workspaceId: string,
	documentId: string,
	contentVersion: number,
	executor: DbExecutor = db,
): Promise<DocumentVersionRow | null> {
	const [row] = await executor
		.select()
		.from(documentVersions)
		.where(
			and(
				eq(documentVersions.workspaceId, workspaceId),
				eq(documentVersions.documentId, documentId),
				eq(documentVersions.contentVersion, contentVersion),
				isNull(documentVersions.deletedAt),
			),
		)
		.limit(1);
	return row ?? null;
}

/** Previous stored version with content_version strictly less than `contentVersion`. */
export async function getPreviousDocumentVersion(
	workspaceId: string,
	documentId: string,
	contentVersion: number,
	executor: DbExecutor = db,
): Promise<DocumentVersionRow | null> {
	const [row] = await executor
		.select()
		.from(documentVersions)
		.where(
			and(
				eq(documentVersions.workspaceId, workspaceId),
				eq(documentVersions.documentId, documentId),
				lt(documentVersions.contentVersion, contentVersion),
				isNull(documentVersions.deletedAt),
			),
		)
		.orderBy(desc(documentVersions.contentVersion))
		.limit(1);
	return row ?? null;
}

export async function getDocumentVersionWithPrevious(
	workspaceId: string,
	documentId: string,
	contentVersion: number,
	executor: DbExecutor = db,
): Promise<{
	version: DocumentVersionRow | null;
	previous: DocumentVersionRow | null;
}> {
	const version = await getDocumentVersion(
		workspaceId,
		documentId,
		contentVersion,
		executor,
	);
	if (!version) {
		return { version: null, previous: null };
	}
	const previous = await getPreviousDocumentVersion(
		workspaceId,
		documentId,
		contentVersion,
		executor,
	);
	return { version, previous };
}

export function serializeDocumentVersion(row: DocumentVersionRow) {
	return {
		id: row.id,
		documentId: row.documentId,
		contentVersion: row.contentVersion,
		content: row.content,
		actorKind: row.actorKind,
		actorUserId: row.actorUserId,
		actorContactId: row.actorContactId,
		actorName: row.actorName,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

/** Test / route seams. */
export const documentVersionRouteDeps = {
	getDocumentById: async (workspaceId: string, documentId: string) => {
		const { getDocumentById } = await import("./documents.js");
		return getDocumentById(workspaceId, documentId);
	},
	getDocumentVersionWithPrevious,
	serializeDocumentVersion,
};
