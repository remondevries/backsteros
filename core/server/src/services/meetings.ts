import {
  and,
  asc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type {
  CreateMeetingInput,
  Meeting,
  UpdateMeetingInput,
} from "@backsteros/contracts";
import {
  normalizeMeetingAttendeePortalEmails,
  shouldClearInboxUpdatedOnUserWrite,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  entityCounters,
  meetings,
  type DbMeeting,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  decodeUpdatedAtCursor,
  encodeUpdatedAtCursor,
  type ParsedMeetingsListQuery,
} from "../lib/list-query.js";
import { toIso } from "../lib/mappers.js";
import {
  softDeleteMeetingCrmActivities,
  syncMeetingCrmActivities,
} from "./crm-activities.js";
import {
  mirrorLinkedMeetingScheduleLocally,
  pushLinkedMeetingScheduleToGoogle,
} from "./google-calendar-settings.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export const MEETING_DISPLAY_KEY = "M";

export function formatMeetingDisplayId(number: number): string {
  return `${MEETING_DISPLAY_KEY}-${number}`;
}

export function parseMeetingDisplayId(displayId: string): number | null {
  const match = displayId.trim().match(/^M-(\d+)$/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function nextMeetingNumber(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [maxRow] = await executor
    .select({
      maxNumber: sql<number>`coalesce(max(${meetings.number}), 0)`,
    })
    .from(meetings)
    .where(eq(meetings.workspaceId, workspaceId));
  const minNext = Number(maxRow?.maxNumber ?? 0) + 1;

  const [counter] = await executor
    .insert(entityCounters)
    .values({
      workspaceId,
      entity: "meeting",
      scopeId: "__workspace__",
      nextValue: minNext + 1,
    })
    .onConflictDoUpdate({
      target: [
        entityCounters.workspaceId,
        entityCounters.entity,
        entityCounters.scopeId,
      ],
      set: {
        nextValue: sql`greatest(${entityCounters.nextValue}, ${minNext}) + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ nextValue: entityCounters.nextValue });
  return counter!.nextValue - 1;
}

export function toMeeting(row: DbMeeting): Meeting {
  const attendeeIds = Array.isArray(row.attendeeContactIds)
    ? row.attendeeContactIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  return {
    id: row.id,
    number: row.number ?? 0,
    title: row.title,
    summary: row.summary ?? null,
    notes: row.notes ?? null,
    transcription: row.transcription ?? null,
    status: (row.status ?? "ready_to_start") as Meeting["status"],
    projectId: row.projectId ?? null,
    organizationId: row.organizationId ?? null,
    attendeeContactIds: attendeeIds,
    attendeePortalEmails: normalizeMeetingAttendeePortalEmails(
      row.attendeePortalEmails,
    ),
    startAt: row.startAt ? row.startAt.toISOString() : null,
    endAt: row.endAt ? row.endAt.toISOString() : null,
    format: (row.format ?? "video_call") as Meeting["format"],
    location: row.location ?? null,
    locationOrganizationId: row.locationOrganizationId ?? null,
    trackedMinutes: row.trackedMinutes ?? null,
    trackedDurationSeconds: row.trackedDurationSeconds ?? null,
    externalCalendarEventId: row.externalCalendarEventId ?? null,
    inboxUpdatedAt: toIso(row.inboxUpdatedAt),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

/** List rows omit transcription (OS-59) — fetch via GET /meetings/:id. */
export function toMeetingListItem(row: DbMeeting): Meeting {
  return { ...toMeeting(row), transcription: null };
}

function buildMeetingListConditions(
  workspaceId: string,
  filters: ParsedMeetingsListQuery,
): SQL[] {
  const conditions: SQL[] = [eq(meetings.workspaceId, workspaceId)];
  if (filters.updatedSince) {
    conditions.push(gte(meetings.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(meetings.deletedAt));
  }
  if (filters.projectId) {
    conditions.push(eq(meetings.projectId, filters.projectId));
  }
  if (filters.organizationId) {
    conditions.push(eq(meetings.organizationId, filters.organizationId));
  }
  if (filters.contactId) {
    conditions.push(
      sql`${meetings.attendeeContactIds} @> ${JSON.stringify([filters.contactId])}::jsonb`,
    );
  }
  if (filters.statuses.length) {
    conditions.push(inArray(meetings.status, filters.statuses));
  }
  if (filters.from) {
    conditions.push(gte(meetings.startAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(meetings.startAt, filters.to));
  }
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(meetings.title, pattern),
        ilike(meetings.summary, pattern),
        ilike(meetings.notes, pattern),
      )!,
    );
  }
  return conditions;
}

export async function listMeetings(
  workspaceId: string,
  filters: ParsedMeetingsListQuery = {
    mode: "legacy",
    limit: 50,
    statuses: [],
  },
  executor: DbExecutor = db,
): Promise<Meeting[]> {
  const conditions = buildMeetingListConditions(workspaceId, filters);
  const rows = await executor
    .select()
    .from(meetings)
    .where(and(...conditions))
    .orderBy(asc(meetings.startAt), asc(meetings.number));
  return rows.map(toMeetingListItem);
}

export type ListMeetingsPaginatedResult = {
  items: Meeting[];
  nextCursor: string | null;
};

export async function listMeetingsPaginated(
  workspaceId: string,
  filters: ParsedMeetingsListQuery,
  executor: DbExecutor = db,
  nowMs: number = Date.now(),
): Promise<ListMeetingsPaginatedResult> {
  const conditions = buildMeetingListConditions(workspaceId, filters);
  if (filters.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(filters.cursor, nowMs);
    conditions.push(
      sql`(
        date_trunc('milliseconds', ${meetings.updatedAt}) < date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
        OR (
          date_trunc('milliseconds', ${meetings.updatedAt}) = date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
          AND ${meetings.id} > ${cursor.id}
        )
      )`,
    );
  }
  const rows = await executor
    .select()
    .from(meetings)
    .where(and(...conditions))
    .orderBy(
      sql`date_trunc('milliseconds', ${meetings.updatedAt}) desc`,
      asc(meetings.id),
    )
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const page = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toMeetingListItem),
    nextCursor:
      hasMore && last
        ? encodeUpdatedAtCursor(
            { id: last.id, updatedAt: last.updatedAt },
            nowMs,
          )
        : null,
  };
}

export async function getMeetingRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<DbMeeting | null> {
  const [row] = await executor
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.workspaceId, workspaceId),
        eq(meetings.id, id),
        isNull(meetings.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getMeetingById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<Meeting | null> {
  const row = await getMeetingRow(workspaceId, id, executor);
  return row ? toMeeting(row) : null;
}

export async function createMeetingRow(
  workspaceId: string,
  input: CreateMeetingInput,
  id = newId(),
  executor: DbExecutor = db,
  number?: number,
): Promise<DbMeeting> {
  const startAt =
    input.startAt === undefined || input.startAt === null
      ? null
      : new Date(input.startAt);
  const endAt =
    input.endAt === undefined || input.endAt === null
      ? null
      : new Date(input.endAt);
  if (startAt && Number.isNaN(startAt.getTime())) {
    throw new Error("INVALID_MEETING_DATES");
  }
  if (endAt && Number.isNaN(endAt.getTime())) {
    throw new Error("INVALID_MEETING_DATES");
  }
  if (startAt && endAt && endAt <= startAt) {
    throw new Error("MEETING_END_BEFORE_START");
  }
  if (!startAt && endAt) {
    throw new Error("INVALID_MEETING_DATES");
  }
  const externalCalendarEventId =
    input.externalCalendarEventId === undefined
      ? null
      : input.externalCalendarEventId?.trim() || null;
  if (externalCalendarEventId) {
    const [existingLink] = await executor
      .select({ id: meetings.id })
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          eq(meetings.externalCalendarEventId, externalCalendarEventId),
          isNull(meetings.deletedAt),
        ),
      )
      .limit(1);
    if (existingLink) {
      throw new Error("EXTERNAL_CALENDAR_EVENT_ALREADY_LINKED");
    }
  }
  const assignedNumber = number ?? (await nextMeetingNumber(workspaceId, executor));
  const [row] = await executor
    .insert(meetings)
    .values({
      id,
      workspaceId,
      number: assignedNumber,
      title: (input.title?.trim() || "New meeting").slice(0, 500),
      summary: input.summary ?? null,
      notes: input.notes ?? null,
      transcription: input.transcription ?? null,
      status: input.status ?? "ready_to_start",
      projectId: input.projectId ?? null,
      organizationId: input.organizationId ?? null,
      attendeeContactIds: input.attendeeContactIds ?? [],
      format: input.format ?? "video_call",
      location: input.location ?? null,
      locationOrganizationId: input.locationOrganizationId ?? null,
      trackedMinutes: input.trackedMinutes ?? null,
      trackedDurationSeconds: input.trackedDurationSeconds ?? null,
      externalCalendarEventId,
      startAt,
      endAt,
      sortOrder: Date.now(),
    })
    .returning();
  const created = row!;
  await syncMeetingCrmActivities(
    workspaceId,
    {
      meetingId: created.id,
      startAt: created.startAt,
      attendeeContactIds: Array.isArray(created.attendeeContactIds)
        ? created.attendeeContactIds.filter(
            (cid): cid is string => typeof cid === "string",
          )
        : [],
      organizationId: created.organizationId,
    },
    executor,
  );
  return created;
}

export async function createMeeting(
  workspaceId: string,
  input: CreateMeetingInput,
  id = input.id?.trim() || newId(),
  executor: DbExecutor = db,
): Promise<Meeting> {
  const row = await createMeetingRow(workspaceId, input, id, executor);
  return toMeeting(row);
}

export async function updateMeeting(
  workspaceId: string,
  id: string,
  input: UpdateMeetingInput,
  executor: DbExecutor = db,
): Promise<Meeting | null> {
  const existing = await getMeetingRow(workspaceId, id, executor);
  if (!existing) return null;

  const startAt =
    input.startAt === undefined
      ? existing.startAt
      : input.startAt === null
        ? null
        : new Date(input.startAt);
  const endAt =
    input.endAt === undefined
      ? existing.endAt
      : input.endAt === null
        ? null
        : new Date(input.endAt);
  if (startAt && Number.isNaN(startAt.getTime())) {
    throw new Error("INVALID_MEETING_DATES");
  }
  if (endAt && Number.isNaN(endAt.getTime())) {
    throw new Error("INVALID_MEETING_DATES");
  }
  if (startAt && endAt && endAt <= startAt) {
    throw new Error("MEETING_END_BEFORE_START");
  }
  if (!startAt && endAt) {
    throw new Error("INVALID_MEETING_DATES");
  }

  let inboxUpdatedAt: Date | null | undefined = undefined;
  if (
    shouldClearInboxUpdatedOnUserWrite(input) ||
    input.inboxUpdatedAt === null
  ) {
    inboxUpdatedAt = null;
  } else if (typeof input.inboxUpdatedAt === "string") {
    const parsed = new Date(input.inboxUpdatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      inboxUpdatedAt = parsed;
    }
  }

  const [row] = await executor
    .update(meetings)
    .set({
      ...(input.title != null ? { title: input.title.trim().slice(0, 500) } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.transcription !== undefined
        ? { transcription: input.transcription }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.organizationId !== undefined
        ? { organizationId: input.organizationId }
        : {}),
      ...(input.attendeeContactIds !== undefined
        ? { attendeeContactIds: input.attendeeContactIds }
        : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.locationOrganizationId !== undefined
        ? { locationOrganizationId: input.locationOrganizationId }
        : {}),
      ...(input.trackedMinutes !== undefined
        ? { trackedMinutes: input.trackedMinutes }
        : {}),
      ...(input.trackedDurationSeconds !== undefined
        ? { trackedDurationSeconds: input.trackedDurationSeconds }
        : {}),
      ...(inboxUpdatedAt !== undefined ? { inboxUpdatedAt } : {}),
      startAt,
      endAt,
      updatedAt: new Date(),
    })
    .where(
      and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, id)),
    )
    .returning();
  if (!row) return null;
  await syncMeetingCrmActivities(workspaceId, {
    meetingId: row.id,
    startAt: row.startAt,
    attendeeContactIds: Array.isArray(row.attendeeContactIds)
      ? row.attendeeContactIds.filter(
          (cid): cid is string => typeof cid === "string",
        )
      : [],
    organizationId: row.organizationId,
  }, executor);

  const scheduleTouched =
    input.title !== undefined ||
    input.startAt !== undefined ||
    input.endAt !== undefined ||
    input.location !== undefined;
  if (scheduleTouched && row.externalCalendarEventId) {
    const linked = {
      title: row.title,
      startAt: row.startAt,
      endAt: row.endAt,
      location: row.location ?? null,
      externalCalendarEventId: row.externalCalendarEventId,
    };
    // Mirror locally before returning so clients never wait on Google.
    try {
      await mirrorLinkedMeetingScheduleLocally(workspaceId, linked);
    } catch (error) {
      console.warn(
        "[google-calendar] local mirror linked meeting failed:",
        error instanceof Error ? error.message : error,
      );
    }
    void pushLinkedMeetingScheduleToGoogle(workspaceId, linked).catch(
      (error) => {
        console.warn(
          "[google-calendar] push linked meeting failed:",
          error instanceof Error ? error.message : error,
        );
      },
    );
  }

  return toMeeting(row);
}

export async function recordAttendeePortalEmail(
  workspaceId: string,
  meetingId: string,
  contactId: string,
  kind: "invite" | "reminder",
  executor: DbExecutor = db,
): Promise<Meeting | null> {
  const existing = await getMeetingRow(workspaceId, meetingId, executor);
  if (!existing) return null;

  const current = normalizeMeetingAttendeePortalEmails(
    existing.attendeePortalEmails,
  );
  const now = new Date().toISOString();
  const entry = { ...(current[contactId] ?? {}) };
  if (kind === "invite") {
    entry.inviteSentAt = now;
  } else {
    entry.reminderSentAt = now;
  }

  const [row] = await executor
    .update(meetings)
    .set({
      attendeePortalEmails: { ...current, [contactId]: entry },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(meetings.workspaceId, workspaceId),
        eq(meetings.id, meetingId),
        isNull(meetings.deletedAt),
      ),
    )
    .returning();
  return row ? toMeeting(row) : null;
}

export async function deleteMeetingRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<DbMeeting | null> {
  const [row] = await executor
    .update(meetings)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(meetings.workspaceId, workspaceId),
        eq(meetings.id, id),
        isNull(meetings.deletedAt),
      ),
    )
    .returning();
  if (row) {
    await softDeleteMeetingCrmActivities(workspaceId, id, executor);
  }
  return row ?? null;
}

export async function deleteMeeting(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const row = await deleteMeetingRow(workspaceId, id, executor);
  return Boolean(row);
}
