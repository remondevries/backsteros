import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type {
  CreateMeetingInput,
  Meeting,
  UpdateMeetingInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  entityCounters,
  meetings,
  type DbMeeting,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { toIso } from "../lib/mappers.js";

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
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export async function listMeetings(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<Meeting[]> {
  const rows = await executor
    .select()
    .from(meetings)
    .where(
      and(eq(meetings.workspaceId, workspaceId), isNull(meetings.deletedAt)),
    )
    .orderBy(asc(meetings.startAt), asc(meetings.number));
  return rows.map(toMeeting);
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
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error("INVALID_MEETING_DATES");
  }
  if (endAt <= startAt) {
    throw new Error("MEETING_END_BEFORE_START");
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
      startAt,
      endAt,
      sortOrder: Date.now(),
    })
    .returning();
  return row!;
}

export async function createMeeting(
  workspaceId: string,
  input: CreateMeetingInput,
  id = newId(),
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
    input.startAt != null ? new Date(input.startAt) : existing.startAt;
  const endAt = input.endAt != null ? new Date(input.endAt) : existing.endAt;
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error("INVALID_MEETING_DATES");
  }
  if (endAt <= startAt) {
    throw new Error("MEETING_END_BEFORE_START");
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
      startAt,
      endAt,
      updatedAt: new Date(),
    })
    .where(
      and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, id)),
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
