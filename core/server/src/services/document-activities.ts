import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { documentActivities, documents } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import type { TaskWriteActor } from "../lib/write-actor.js";
import { resolveWriteActorProfile } from "./task-comments.js";

export const DOCUMENT_ACTIVITY_TYPES = [
	"rename",
	"front_matter_change",
	"text_content_change",
	"pdf_creation",
] as const;

export type DocumentActivityType = (typeof DOCUMENT_ACTIVITY_TYPES)[number];

export function isDocumentActivityType(
	value: unknown,
): value is DocumentActivityType {
	return (
		typeof value === "string" &&
		(DOCUMENT_ACTIVITY_TYPES as readonly string[]).includes(value)
	);
}

/**
 * Rapid same-type edits coalesce into one row.
 * text_content_change is intentionally excluded (OS-205): each content_version
 * bump must keep its own activity row so Firm can open a per-version diff.
 */
export const DOCUMENT_ACTIVITY_COALESCE_WINDOW_MS = 10 * 60 * 1000;

const COALESCEABLE = new Set<DocumentActivityType>([
	"rename",
	"front_matter_change",
]);

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type DocumentActivityRow = typeof documentActivities.$inferSelect;

function asDataRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

async function resolveActor(
	workspaceId: string,
	actor: TaskWriteActor | null | undefined,
	executor: DbExecutor,
) {
	return resolveWriteActorProfile(workspaceId, actor, executor);
}

export async function recordDocumentActivity(
	workspaceId: string,
	documentId: string,
	input: {
		type: DocumentActivityType;
		actor?: TaskWriteActor | null;
		actorKind?: "user" | "agent" | "system";
		actorApiKeyId?: string | null;
		data?: Record<string, unknown>;
		clientEventId?: string | null;
		occurredAt?: Date;
		projectId?: string | null;
	},
	executor: DbExecutor = db,
): Promise<DocumentActivityRow> {
	const clientEventId = input.clientEventId?.trim() || null;
	if (clientEventId) {
		const existing = await executor
			.select()
			.from(documentActivities)
			.where(
				and(
					eq(documentActivities.workspaceId, workspaceId),
					eq(documentActivities.clientEventId, clientEventId),
					isNull(documentActivities.deletedAt),
				),
			)
			.limit(1);
		if (existing[0]) return existing[0];
	}

	let projectId = input.projectId ?? null;
	if (projectId === null) {
		const doc = await executor
			.select({ projectId: documents.projectId })
			.from(documents)
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.workspaceId, workspaceId),
				),
			)
			.limit(1);
		projectId = doc[0]?.projectId ?? null;
	}

	const profile = await resolveActor(workspaceId, input.actor, executor);
	const actorKind =
		input.actorKind ??
		(input.actor?.kind === "agent"
			? "agent"
			: input.actor
				? "user"
				: "system");
	const occurredAt = input.occurredAt ?? new Date();
	const data = asDataRecord(input.data);

	if (COALESCEABLE.has(input.type) && !clientEventId) {
		const windowStart = new Date(
			occurredAt.getTime() - DOCUMENT_ACTIVITY_COALESCE_WINDOW_MS,
		);
		const recent = await executor
			.select()
			.from(documentActivities)
			.where(
				and(
					eq(documentActivities.workspaceId, workspaceId),
					eq(documentActivities.documentId, documentId),
					eq(documentActivities.type, input.type),
					isNull(documentActivities.deletedAt),
					gte(documentActivities.occurredAt, windowStart),
					profile.contactId
						? eq(
								documentActivities.actorContactId,
								profile.contactId,
							)
						: profile.userId
							? eq(documentActivities.actorUserId, profile.userId)
							: sql`true`,
				),
			)
			.orderBy(desc(documentActivities.occurredAt))
			.limit(1);

		const prior = recent[0];
		if (prior) {
			const priorData = asDataRecord(prior.data);
			const count =
				typeof priorData.count === "number" ? priorData.count + 1 : 2;
			const [updated] = await executor
				.update(documentActivities)
				.set({
					occurredAt,
					data: { ...priorData, ...data, count },
					actorName: profile.name ?? prior.actorName,
					updatedAt: new Date(),
				})
				.where(eq(documentActivities.id, prior.id))
				.returning();
			if (updated) return updated;
		}
	}

	const now = new Date();
	const [row] = await executor
		.insert(documentActivities)
		.values({
			id: newId(),
			workspaceId,
			documentId,
			projectId,
			type: input.type,
			actorKind,
			actorUserId: profile.userId,
			actorContactId: profile.contactId,
			actorApiKeyId: input.actorApiKeyId ?? null,
			actorName: profile.name,
			occurredAt,
			data,
			clientEventId,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to insert document activity");
	}
	return row;
}

export async function listDocumentActivities(input: {
	workspaceId: string;
	documentId?: string;
	projectId?: string;
	types?: DocumentActivityType[];
	from?: Date;
	to?: Date;
	limit?: number;
	/** ISO occurred_at cursor (exclusive upper bound for next page). */
	cursor?: string | null;
}): Promise<{ activities: DocumentActivityRow[]; nextCursor: string | null }> {
	const limit = Math.min(Math.max(input.limit ?? 40, 1), 200);
	const conditions = [
		eq(documentActivities.workspaceId, input.workspaceId),
		isNull(documentActivities.deletedAt),
	];
	if (input.documentId) {
		conditions.push(eq(documentActivities.documentId, input.documentId));
	}
	if (input.projectId) {
		conditions.push(eq(documentActivities.projectId, input.projectId));
	}
	if (input.types && input.types.length > 0) {
		conditions.push(inArray(documentActivities.type, input.types));
	}
	if (input.from) {
		conditions.push(gte(documentActivities.occurredAt, input.from));
	}
	if (input.to) {
		conditions.push(lt(documentActivities.occurredAt, input.to));
	}
	if (input.cursor) {
		const cursorDate = new Date(input.cursor);
		if (!Number.isNaN(cursorDate.getTime())) {
			conditions.push(lt(documentActivities.occurredAt, cursorDate));
		}
	}

	const rows = await db
		.select()
		.from(documentActivities)
		.where(and(...conditions))
		.orderBy(desc(documentActivities.occurredAt))
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const next =
		rows.length > limit
			? page[page.length - 1]?.occurredAt.toISOString() ?? null
			: null;
	return { activities: page, nextCursor: next };
}

/** Snapshot rows users can remove from the Firm activity rail. */
export const DELETABLE_DOCUMENT_ACTIVITY_TYPES = [
	"text_content_change",
	"pdf_creation",
] as const;

export type DeletableDocumentActivityType =
	(typeof DELETABLE_DOCUMENT_ACTIVITY_TYPES)[number];

export function isDeletableDocumentActivityType(
	value: unknown,
): value is DeletableDocumentActivityType {
	return (
		typeof value === "string" &&
		(DELETABLE_DOCUMENT_ACTIVITY_TYPES as readonly string[]).includes(value)
	);
}

function contentVersionFromData(data: unknown): number | null {
	const record = asDataRecord(data);
	const raw = record.contentVersion;
	if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
		return Math.trunc(raw);
	}
	if (typeof raw === "string" && raw.trim()) {
		const parsed = Number(raw);
		if (Number.isFinite(parsed) && parsed >= 1) return Math.trunc(parsed);
	}
	return null;
}

/**
 * Soft-delete a document activity snapshot. For text_content_change, also
 * soft-deletes the matching document_versions row so diffs cannot reopen it.
 */
export async function deleteDocumentActivity(
	workspaceId: string,
	documentId: string,
	activityId: string,
	executor: DbExecutor = db,
): Promise<DocumentActivityRow | null> {
	const [existing] = await executor
		.select()
		.from(documentActivities)
		.where(
			and(
				eq(documentActivities.workspaceId, workspaceId),
				eq(documentActivities.documentId, documentId),
				eq(documentActivities.id, activityId),
				isNull(documentActivities.deletedAt),
			),
		)
		.limit(1);
	if (!existing || !isDeletableDocumentActivityType(existing.type)) {
		return null;
	}

	const now = new Date();
	const [deleted] = await executor
		.update(documentActivities)
		.set({ deletedAt: now, updatedAt: now })
		.where(
			and(
				eq(documentActivities.id, existing.id),
				isNull(documentActivities.deletedAt),
			),
		)
		.returning();
	if (!deleted) return null;

	if (existing.type === "text_content_change") {
		const contentVersion = contentVersionFromData(existing.data);
		if (contentVersion != null) {
			const { softDeleteDocumentVersion } = await import(
				"./document-versions.js"
			);
			await softDeleteDocumentVersion(
				workspaceId,
				documentId,
				contentVersion,
				executor,
			);
		}
	}

	return deleted;
}
