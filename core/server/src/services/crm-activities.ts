import type {
  CreateCrmActivityNoteInput,
  CrmActivity,
  CrmActivityKind,
  CrmGroupSubjectType,
} from "@backsteros/contracts";
import {
  CRM_ACTIVITY_NOTE_MAX_CHARS,
  CRM_ACTIVITY_PREVIEW_MAX_CHARS,
} from "@backsteros/contracts";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import { db } from "../db/index.js";
import { crmActivities, meetings } from "../db/schema.js";
import { newId } from "../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type CrmActivitySubject = {
  subjectType: CrmGroupSubjectType;
  subjectId: string;
};

function previewFromBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= CRM_ACTIVITY_PREVIEW_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, CRM_ACTIVITY_PREVIEW_MAX_CHARS - 1)}…`;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapActivityRow(
  row: typeof crmActivities.$inferSelect,
  meeting?: { title: string; startAt: Date } | null,
): CrmActivity {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    subjectType: row.subjectType as CrmGroupSubjectType,
    subjectId: row.subjectId,
    kind: row.kind as CrmActivityKind,
    body: row.body,
    bodyPreview: row.bodyPreview,
    meetingId: row.meetingId,
    meetingTitle: meeting?.title ?? null,
    meetingStartAt: toIso(meeting?.startAt ?? null),
    occurredAt: row.occurredAt.toISOString(),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

function encodeFeedCursor(occurredAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ occurredAt: occurredAt.toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeFeedCursor(
  cursor: string | undefined,
): { occurredAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { occurredAt?: string; id?: string };
    if (!parsed.occurredAt || !parsed.id) return null;
    const occurredAt = new Date(parsed.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function createCrmActivityNote(
  workspaceId: string,
  subject: CrmActivitySubject,
  input: CreateCrmActivityNoteInput,
  createdBy?: string | null,
  executor: DbExecutor = db,
): Promise<CrmActivity> {
  const body = input.body.trim();
  if (!body || body.length > CRM_ACTIVITY_NOTE_MAX_CHARS) {
    throw new Error("INVALID_NOTE_BODY");
  }
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("INVALID_OCCURRED_AT");
  }
  const id = newId();
  const [row] = await executor
    .insert(crmActivities)
    .values({
      id,
      workspaceId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      kind: "note",
      body,
      bodyPreview: previewFromBody(body),
      meetingId: null,
      occurredAt,
      createdBy: createdBy ?? null,
    })
    .returning();
  return mapActivityRow(row!);
}

export async function listCrmActivityFeed(
  workspaceId: string,
  subject: CrmActivitySubject,
  options: { cursor?: string; limit?: number } = {},
  executor: DbExecutor = db,
): Promise<{ activities: CrmActivity[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const cursor = decodeFeedCursor(options.cursor);

  const conditions = [
    eq(crmActivities.workspaceId, workspaceId),
    eq(crmActivities.subjectType, subject.subjectType),
    eq(crmActivities.subjectId, subject.subjectId),
    isNull(crmActivities.deletedAt),
  ];
  if (cursor) {
    conditions.push(
      or(
        lt(crmActivities.occurredAt, cursor.occurredAt),
        and(
          eq(crmActivities.occurredAt, cursor.occurredAt),
          lt(crmActivities.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await executor
    .select({
      activity: crmActivities,
      meetingTitle: meetings.title,
      meetingStartAt: meetings.startAt,
    })
    .from(crmActivities)
    .leftJoin(meetings, eq(crmActivities.meetingId, meetings.id))
    .where(and(...conditions))
    .orderBy(desc(crmActivities.occurredAt), desc(crmActivities.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const activities = page.map((row) =>
    mapActivityRow(
      row.activity,
      row.activity.kind === "meeting" && row.meetingTitle
        ? { title: row.meetingTitle, startAt: row.meetingStartAt! }
        : null,
    ),
  );
  const last = page[page.length - 1]?.activity;
  const nextCursor =
    rows.length > limit && last
      ? encodeFeedCursor(last.occurredAt, last.id)
      : null;
  return { activities, nextCursor };
}

type MeetingActivitySyncInput = {
  meetingId: string;
  startAt: Date;
  attendeeContactIds: string[];
  organizationId: string | null;
};

/**
 * Materialize kind=meeting feed rows for attendees + org.
 * Soft-deletes stale subject rows when attendees/org change.
 */
export async function syncMeetingCrmActivities(
  workspaceId: string,
  input: MeetingActivitySyncInput,
  executor: DbExecutor = db,
): Promise<void> {
  const subjects: CrmActivitySubject[] = [];
  const seen = new Set<string>();
  for (const contactId of input.attendeeContactIds) {
    if (!contactId || seen.has(`contact:${contactId}`)) continue;
    seen.add(`contact:${contactId}`);
    subjects.push({ subjectType: "contact", subjectId: contactId });
  }
  if (input.organizationId) {
    subjects.push({
      subjectType: "organization",
      subjectId: input.organizationId,
    });
  }

  const existing = await executor
    .select()
    .from(crmActivities)
    .where(
      and(
        eq(crmActivities.workspaceId, workspaceId),
        eq(crmActivities.meetingId, input.meetingId),
        eq(crmActivities.kind, "meeting"),
        isNull(crmActivities.deletedAt),
      ),
    );

  const desiredKeys = new Set(
    subjects.map((s) => `${s.subjectType}:${s.subjectId}`),
  );
  const now = new Date();

  for (const row of existing) {
    const key = `${row.subjectType}:${row.subjectId}`;
    if (!desiredKeys.has(key)) {
      await executor
        .update(crmActivities)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(crmActivities.id, row.id));
    }
  }

  for (const subject of subjects) {
    const match = existing.find(
      (row) =>
        row.subjectType === subject.subjectType &&
        row.subjectId === subject.subjectId,
    );
    if (match) {
      await executor
        .update(crmActivities)
        .set({
          occurredAt: input.startAt,
          updatedAt: now,
          deletedAt: null,
        })
        .where(eq(crmActivities.id, match.id));
      continue;
    }
    await executor.insert(crmActivities).values({
      id: newId(),
      workspaceId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      kind: "meeting",
      body: null,
      bodyPreview: null,
      meetingId: input.meetingId,
      occurredAt: input.startAt,
      createdBy: null,
    });
  }
}

export async function softDeleteMeetingCrmActivities(
  workspaceId: string,
  meetingId: string,
  executor: DbExecutor = db,
): Promise<void> {
  const now = new Date();
  await executor
    .update(crmActivities)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(crmActivities.workspaceId, workspaceId),
        eq(crmActivities.meetingId, meetingId),
        eq(crmActivities.kind, "meeting"),
        isNull(crmActivities.deletedAt),
      ),
    );
}
