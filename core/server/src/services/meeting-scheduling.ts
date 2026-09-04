import { and, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";

import type {
  CreateMeetingBookingInput,
  CreateMeetingInput,
  Meeting,
  MeetingSchedulingSettings,
  MeetingSlot,
  UpdateMeetingSchedulingSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  meetingSchedulingSettings,
  meetings,
  tasks,
  type DbMeetingSchedulingSettings,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  createMeetingRow,
  formatMeetingDisplayId,
  toMeeting,
} from "./meetings.js";
import { EXTERNAL_MEETING_BOOKING_STATUS } from "./meetings-status.js";
import {
  DEFAULT_WEEKDAY_HOURS,
  normalizeWeekdayHours,
} from "./meeting-scheduling-weekday-hours.js";
import {
  generateSlotsForRange,
  intervalsOverlap,
  type TimeInterval,
} from "./meeting-scheduling-slots.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export {
  expandInterval,
  generateSlotsForRange,
  intervalsOverlap,
  isoWeekdayInTimeZone,
  parseTimeToMinutes,
  ymdInTimeZone,
  zonedLocalToUtc,
} from "./meeting-scheduling-slots.js";

export function toPublicSettings(
  row: DbMeetingSchedulingSettings,
): MeetingSchedulingSettings {
  const weekdayHours = normalizeWeekdayHours(
    row.weekdayHours,
    row.workingHours,
  );
  const durations: (30 | 60)[] = Array.isArray(row.durationsMinutes)
    ? row.durationsMinutes.filter(
        (n): n is 30 | 60 => n === 30 || n === 60,
      )
    : [30, 60];
  return {
    label: row.label,
    timezone: row.timezone,
    weekdayHours,
    durationsMinutes: durations.length > 0 ? durations : [30, 60],
    minNoticeMinutes: row.minNoticeMinutes,
    bufferMinutes: row.bufferMinutes,
    horizonDays: row.horizonDays,
    enabled: row.enabled,
  };
}

export async function getOrCreateSchedulingSettings(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<MeetingSchedulingSettings> {
  const existing = await getSchedulingSettingsRow(workspaceId, executor);
  if (existing) return toPublicSettings(existing);

  const weekdayHours = DEFAULT_WEEKDAY_HOURS;
  const [row] = await executor
    .insert(meetingSchedulingSettings)
    .values({
      id: `scheduling-${workspaceId}`,
      workspaceId,
      weekdayHours,
      workingHours: {
        weekdays: [1, 2, 3, 4, 5],
        start: "09:00",
        end: "17:00",
      },
    })
    .returning();
  return toPublicSettings(row!);
}

export async function updateSchedulingSettings(
  workspaceId: string,
  input: UpdateMeetingSchedulingSettingsInput,
  executor: DbExecutor = db,
): Promise<MeetingSchedulingSettings> {
  const existing = await getSchedulingSettingsRow(workspaceId, executor);
  if (!existing) {
    await getOrCreateSchedulingSettings(workspaceId, executor);
  }
  const current = await getSchedulingSettingsRow(workspaceId, executor);
  if (!current) throw new Error("SCHEDULING_SETTINGS_NOT_FOUND");

  const nextWeekdayHours = input.weekdayHours
    ? normalizeWeekdayHours(input.weekdayHours, current.workingHours)
    : normalizeWeekdayHours(current.weekdayHours, current.workingHours);

  const legacyWeekdays = nextWeekdayHours
    .filter((entry) => entry.enabled)
    .map((entry) => entry.weekday);
  const firstEnabled = nextWeekdayHours.find((entry) => entry.enabled);
  const firstSlot = firstEnabled?.slots[0];

  const [row] = await executor
    .update(meetingSchedulingSettings)
    .set({
      ...(input.label != null ? { label: input.label.trim().slice(0, 200) } : {}),
      ...(input.timezone != null ? { timezone: input.timezone.trim() } : {}),
      weekdayHours: nextWeekdayHours,
      workingHours: {
        weekdays: legacyWeekdays,
        start: firstSlot?.start ?? "09:00",
        end: firstSlot?.end ?? "17:00",
      },
      ...(input.durationsMinutes !== undefined
        ? { durationsMinutes: input.durationsMinutes }
        : {}),
      ...(input.minNoticeMinutes !== undefined
        ? { minNoticeMinutes: input.minNoticeMinutes }
        : {}),
      ...(input.bufferMinutes !== undefined
        ? { bufferMinutes: input.bufferMinutes }
        : {}),
      ...(input.horizonDays !== undefined
        ? { horizonDays: input.horizonDays }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      updatedAt: new Date(),
    })
    .where(eq(meetingSchedulingSettings.workspaceId, workspaceId))
    .returning();
  return toPublicSettings(row!);
}

export async function getSchedulingSettingsRow(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<DbMeetingSchedulingSettings | null> {
  const [row] = await executor
    .select()
    .from(meetingSchedulingSettings)
    .where(eq(meetingSchedulingSettings.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function getSchedulingSettings(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<MeetingSchedulingSettings | null> {
  const row = await getSchedulingSettingsRow(workspaceId, executor);
  if (!row || !row.enabled) return null;
  return toPublicSettings(row);
}

async function listBusyIntervals(
  workspaceId: string,
  rangeStart: Date,
  rangeEnd: Date,
  executor: DbExecutor = db,
): Promise<TimeInterval[]> {
  const meetingRows = await executor
    .select({ startAt: meetings.startAt, endAt: meetings.endAt })
    .from(meetings)
    .where(
      and(
        eq(meetings.workspaceId, workspaceId),
        isNull(meetings.deletedAt),
        lt(meetings.startAt, rangeEnd),
        gt(meetings.endAt, rangeStart),
      ),
    );

  const taskRows = await executor
    .select({ dueDate: tasks.dueDate, dueEndDate: tasks.dueEndDate })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        isNotNull(tasks.dueDate),
        isNotNull(tasks.dueEndDate),
        lt(tasks.dueDate, rangeEnd),
        gt(tasks.dueEndDate, rangeStart),
        sql`${tasks.status} NOT IN ('canceled', 'duplicated', 'completed')`,
      ),
    );

  const intervals: TimeInterval[] = [];
  for (const row of meetingRows) {
    intervals.push({
      startMs: row.startAt.getTime(),
      endMs: row.endAt.getTime(),
    });
  }
  for (const row of taskRows) {
    if (!row.dueDate || !row.dueEndDate) continue;
    if (row.dueEndDate.getTime() <= row.dueDate.getTime()) continue;
    intervals.push({
      startMs: row.dueDate.getTime(),
      endMs: row.dueEndDate.getTime(),
    });
  }
  return intervals;
}

export async function listMeetingSlots(
  workspaceId: string,
  query: { from: string; to: string; durationMinutes: 30 | 60 },
  now = new Date(),
  executor: DbExecutor = db,
): Promise<MeetingSlot[]> {
  const row = await getSchedulingSettingsRow(workspaceId, executor);
  if (!row || !row.enabled) return [];

  const settings = toPublicSettings(row);
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return [];
  }

  const horizonEnd = new Date(now.getTime() + settings.horizonDays * 86_400_000);
  const effectiveTo = to.getTime() > horizonEnd.getTime() ? horizonEnd : to;

  const busyIntervals = await listBusyIntervals(
    workspaceId,
    from,
    effectiveTo,
    executor,
  );

  return generateSlotsForRange({
    settings,
    from,
    to: effectiveTo,
    durationMinutes: query.durationMinutes,
    busyIntervals,
    now,
  });
}

function formatBookerName(input: CreateMeetingBookingInput): string {
  const parts = [input.bookerFirstName?.trim(), input.bookerLastName?.trim()].filter(
    Boolean,
  );
  return parts.join(" ") || input.bookerEmail.trim();
}

function formatMeetingFormatLabel(
  format: CreateMeetingBookingInput["format"] | undefined,
): string {
  switch (format ?? "video_call") {
    case "in_person":
      return "In person";
    case "video_call":
      return "Video call";
    case "phone_call":
      return "Phone call";
    default:
      return "Video call";
  }
}

function buildMeetingSummary(input: CreateMeetingBookingInput): string {
  const lines = [
    `Booker: ${formatBookerName(input)}`,
    `Email: ${input.bookerEmail.trim()}`,
    `Format: ${formatMeetingFormatLabel(input.format ?? "video_call")}`,
  ];
  if (input.portalUserId?.trim()) {
    lines.push(`Portal user: ${input.portalUserId.trim()}`);
  }
  if (input.note?.trim()) {
    lines.push("", input.note.trim());
  }
  return lines.join("\n");
}

export type PlannedMeetingBooking = {
  id: string;
  input: CreateMeetingInput;
};

/** Validate slot availability and build meeting create input (no DB write). */
export async function planMeetingBooking(
  workspaceId: string,
  input: CreateMeetingBookingInput,
  now = new Date(),
  executor: DbExecutor = db,
  id: string = newId(),
): Promise<PlannedMeetingBooking> {
  const row = await getSchedulingSettingsRow(workspaceId, executor);
  if (!row || !row.enabled) {
    throw new Error("SCHEDULING_DISABLED");
  }

  const settings = toPublicSettings(row);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error("INVALID_MEETING_DATES");
  }
  if (endAt.getTime() <= startAt.getTime()) {
    throw new Error("MEETING_END_BEFORE_START");
  }

  const expectedDurationMs = input.durationMinutes * 60_000;
  if (endAt.getTime() - startAt.getTime() !== expectedDurationMs) {
    throw new Error("INVALID_SLOT_DURATION");
  }

  const slots = await listMeetingSlots(
    workspaceId,
    {
      from: new Date(startAt.getTime() - 1).toISOString(),
      to: new Date(endAt.getTime() + 1).toISOString(),
      durationMinutes: input.durationMinutes,
    },
    now,
    executor,
  );

  const matched = slots.some(
    (slot) =>
      slot.startAt === startAt.toISOString() && slot.endAt === endAt.toISOString(),
  );
  if (!matched) {
    throw new Error("SLOT_UNAVAILABLE");
  }

  const busyIntervals = await listBusyIntervals(
    workspaceId,
    new Date(startAt.getTime() - settings.bufferMinutes * 60_000),
    new Date(endAt.getTime() + settings.bufferMinutes * 60_000),
    executor,
  );
  const startMs = startAt.getTime();
  const endMs = endAt.getTime();
  const conflict = busyIntervals.some((busy) =>
    intervalsOverlap(startMs, endMs, busy.startMs, busy.endMs),
  );
  if (conflict) {
    throw new Error("SLOT_UNAVAILABLE");
  }

  const bookerName = formatBookerName(input);
  return {
    id,
    input: {
      title: `Meeting with ${bookerName}`.slice(0, 500),
      summary: buildMeetingSummary(input),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      format: input.format ?? "video_call",
      status: EXTERNAL_MEETING_BOOKING_STATUS,
      projectId: row.defaultProjectId ?? null,
      organizationId: row.defaultOrganizationId ?? null,
    },
  };
}

export async function createMeetingBooking(
  workspaceId: string,
  input: CreateMeetingBookingInput,
  now = new Date(),
  executor: DbExecutor = db,
): Promise<Meeting> {
  const planned = await planMeetingBooking(
    workspaceId,
    input,
    now,
    executor,
  );
  const created = await createMeetingRow(
    workspaceId,
    planned.input,
    planned.id,
    executor,
  );

  return toMeeting(created);
}

export function meetingDisplayIdFromMeeting(meeting: Meeting): string {
  return formatMeetingDisplayId(meeting.number);
}
