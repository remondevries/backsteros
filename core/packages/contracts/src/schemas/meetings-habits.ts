import { z } from "zod";

import { isoDateSchema, nullableIsoDateSchema, taskStatusSchema } from "./common.js";
export const whoopRecoveryStateSchema = z.enum(["GREEN", "YELLOW", "RED"]);

export const whoopSleepStagesSchema = z.object({
  remMs: z.number().nullable().optional(),
  lightMs: z.number().nullable().optional(),
  swsMs: z.number().nullable().optional(),
  wakeMs: z.number().nullable().optional(),
});

export const whoopStrainTargetSchema = z.object({
  value: z.number().nullable().optional(),
  optimalLower: z.number().nullable().optional(),
  optimalUpper: z.number().nullable().optional(),
});

export const whoopSnapshotSchema = z.object({
  id: z.string(),
  date: z.string().date(),
  recoveryScore: z.number().nullable().optional(),
  recoveryState: whoopRecoveryStateSchema.nullable().optional(),
  hrvMs: z.number().nullable().optional(),
  rhrBpm: z.number().nullable().optional(),
  sleepPerformance: z.number().nullable().optional(),
  sleepDuration: z.string().optional(),
  strainScore: z.number().nullable().optional(),
  workoutsCount: z.number().int().optional(),
  strainTarget: whoopStrainTargetSchema.nullable().optional(),
  sleepStartedAt: z.string().nullable().optional(),
  sleepEndedAt: z.string().nullable().optional(),
  timeInBed: z.string().optional(),
  sleepEfficiencyPct: z.number().nullable().optional(),
  sleepStages: whoopSleepStagesSchema.optional(),
});

export const habitCadenceSchema = z.enum([
  "daily",
  "every_2_days",
  "weekly",
  "monthly",
]);

export const createHabitSchema = z.object({
  title: z.string().min(1).max(500),
  icon: z.string().max(128).nullable().optional(),
  cadence: habitCadenceSchema.optional(),
  /** Defaults to the Health project when omitted. */
  projectId: z.string().min(1).optional(),
});

export const updateHabitSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    icon: z.string().max(128).nullable().optional(),
    description: z.string().max(10000).nullable().optional(),
    cadence: habitCadenceSchema.optional(),
    projectId: z.string().min(1).optional(),
    /**
     * Reschedule the habit's current open day task to this workspace-local YMD
     * (today or future). Also re-anchors the cadence schedule to that day.
     */
    nextDueYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

/** Record (or update) a habit day as completed or skipped. */
export const recordHabitDaySchema = z.object({
  dueYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["completed", "canceled"]),
});

export const habitSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  /** Optional plain-text notes (same pattern as task.description). */
  description: z.string().nullable(),
  /** Project habit day tasks are filed under. */
  projectId: z.string(),
  cadence: habitCadenceSchema,
  /** Workspace-local YMD the cadence schedule is anchored to. */
  cadenceAnchorYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sortOrder: z.number().int(),
  todayTaskId: z.string().nullable(),
  todayTaskStatus: taskStatusSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const whoopDayResultSchema = z.object({
  authenticated: z.boolean(),
  snapshot: whoopSnapshotSchema.nullable(),
  error: z.string().nullable().optional(),
});

export const whoopSettingsStatusSchema = z.object({
  connected: z.boolean(),
  configured: z.boolean(),
  email: z.string().nullable(),
  reason: z.string().nullable(),
  envPath: z.string(),
});

export type Habit = z.infer<typeof habitSchema>;

export type HabitCadence = z.infer<typeof habitCadenceSchema>;

export type CreateHabitInput = z.infer<typeof createHabitSchema>;

export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;

export type RecordHabitDayInput = z.infer<typeof recordHabitDaySchema>;

export const createMeetingSchema = z.object({
  /** Client-generated id for optimistic creates (same pattern as tasks). */
  id: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(500).optional(),
  summary: z.string().max(100000).nullable().optional(),
  notes: z.string().max(100000).nullable().optional(),
  transcription: z.string().max(100000).nullable().optional(),
  status: taskStatusSchema.optional(),
  projectId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  attendeeContactIds: z.array(z.string()).optional(),
  /** Omit or null = unscheduled / all-day until the host opens the room. */
  startAt: isoDateSchema.nullable().optional(),
  endAt: isoDateSchema.nullable().optional(),
  format: z.enum(["video_call", "in_person", "phone_call"]).optional(),
  location: z.string().max(2000).nullable().optional(),
  locationOrganizationId: z.string().nullable().optional(),
  trackedMinutes: z.number().int().nonnegative().nullable().optional(),
  trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
  /**
   * Attach this meeting as notes for a Google Calendar (etc.) agenda block.
   * Accepts the stored hashed id or a raw provider event id (resolved server-side).
   * Whitespace-only is rejected; omit the field when not linking.
   */
  externalCalendarEventId: z
    .union([z.string().trim().min(1).max(512), z.null()])
    .optional(),
  /** Disambiguate raw Google event ids when the workspace has multiple calendars. */
  calendarId: z.string().trim().min(1).max(1024).optional(),
});

export const updateMeetingSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    summary: z.string().max(100000).nullable().optional(),
    notes: z.string().max(100000).nullable().optional(),
    transcription: z.string().max(100000).nullable().optional(),
    status: taskStatusSchema.optional(),
    projectId: z.string().nullable().optional(),
    organizationId: z.string().nullable().optional(),
    attendeeContactIds: z.array(z.string()).optional(),
    startAt: isoDateSchema.nullable().optional(),
    endAt: isoDateSchema.nullable().optional(),
    format: z.enum(["video_call", "in_person", "phone_call"]).optional(),
    location: z.string().max(2000).nullable().optional(),
    locationOrganizationId: z.string().nullable().optional(),
    trackedMinutes: z.number().int().nonnegative().nullable().optional(),
    trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
    /**
     * Link / unlink Google (etc.) agenda block — null clears the link.
     * Accepts hashed id or raw provider event id; whitespace-only is rejected.
     */
    externalCalendarEventId: z
      .union([z.string().trim().min(1).max(512), z.null()])
      .optional(),
    /** Disambiguate raw Google event ids when the workspace has multiple calendars. */
    calendarId: z.string().trim().min(1).max(1024).optional(),
    /** Clear the Updated inbox flag after the user views the item. */
    acknowledgeInboxUpdate: z.boolean().optional(),
    inboxUpdatedAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).filter((key) => key !== "acknowledgeInboxUpdate")
        .length > 0 || value.acknowledgeInboxUpdate === true,
    {
      message: "At least one field is required",
    },
  );

export const meetingAttendeePortalEmailStatusSchema = z.object({
  inviteSentAt: isoDateSchema.optional(),
  reminderSentAt: isoDateSchema.optional(),
});

export const meetingAttendeePortalEmailsSchema = z.record(
  z.string(),
  meetingAttendeePortalEmailStatusSchema,
);

export type MeetingAttendeePortalEmailStatus = z.infer<
  typeof meetingAttendeePortalEmailStatusSchema
>;

export type MeetingAttendeePortalEmails = z.infer<
  typeof meetingAttendeePortalEmailsSchema
>;

export function normalizeMeetingAttendeePortalEmails(
  raw: unknown,
): MeetingAttendeePortalEmails {
  if (typeof raw === "string") {
    try {
      return normalizeMeetingAttendeePortalEmails(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result: MeetingAttendeePortalEmails = {};
  for (const [contactId, entry] of Object.entries(raw)) {
    if (!contactId.trim() || !entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const status: MeetingAttendeePortalEmailStatus = {};
    if (typeof record.inviteSentAt === "string" && record.inviteSentAt.trim()) {
      status.inviteSentAt = record.inviteSentAt;
    }
    if (
      typeof record.reminderSentAt === "string" &&
      record.reminderSentAt.trim()
    ) {
      status.reminderSentAt = record.reminderSentAt;
    }
    if (status.inviteSentAt || status.reminderSentAt) {
      result[contactId] = status;
    }
  }
  return result;
}

export const meetingSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  summary: z.string().nullable(),
  notes: z.string().nullable(),
  transcription: z.string().nullable(),
  status: taskStatusSchema,
  projectId: z.string().nullable(),
  organizationId: z.string().nullable(),
  attendeeContactIds: z.array(z.string()),
  /** Server-recorded portal invite/reminder sends per attendee contact id. */
  attendeePortalEmails: meetingAttendeePortalEmailsSchema.default({}),
  startAt: isoDateSchema.nullable(),
  endAt: isoDateSchema.nullable(),
  format: z.enum(["video_call", "in_person", "phone_call"]).optional(),
  location: z.string().nullable().optional(),
  locationOrganizationId: z.string().nullable().optional(),
  trackedMinutes: z.number().int().nonnegative().nullable().optional(),
  trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
  /** Linked Google (etc.) agenda block — schedule owned there (ADR-037). */
  externalCalendarEventId: z.string().nullable().optional(),
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export type Meeting = z.infer<typeof meetingSchema>;

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

export const meetingWeekdayHoursSlotSchema = z.object({
  start: z.string().min(1).max(8),
  end: z.string().min(1).max(8),
});

export type MeetingWeekdayHoursSlot = z.infer<typeof meetingWeekdayHoursSlotSchema>;

export const meetingWeekdayHoursEntrySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  enabled: z.boolean(),
  slots: z.array(meetingWeekdayHoursSlotSchema).min(1).max(12),
});

export type MeetingWeekdayHoursEntry = z.infer<
  typeof meetingWeekdayHoursEntrySchema
>;

export const meetingSchedulingSettingsSchema = z.object({
  label: z.string(),
  timezone: z.string(),
  weekdayHours: z.array(meetingWeekdayHoursEntrySchema),
  durationsMinutes: z.array(z.union([z.literal(30), z.literal(60)])),
  minNoticeMinutes: z.number().int().nonnegative(),
  bufferMinutes: z.number().int().nonnegative(),
  horizonDays: z.number().int().positive(),
  enabled: z.boolean(),
});

export type MeetingSchedulingSettings = z.infer<
  typeof meetingSchedulingSettingsSchema
>;

export const updateMeetingSchedulingSettingsSchema = z.object({
  label: z.string().max(200).optional(),
  timezone: z.string().min(1).max(128).optional(),
  weekdayHours: z.array(meetingWeekdayHoursEntrySchema).min(1).max(7).optional(),
  durationsMinutes: z.array(z.union([z.literal(30), z.literal(60)])).optional(),
  minNoticeMinutes: z.number().int().nonnegative().optional(),
  bufferMinutes: z.number().int().nonnegative().optional(),
  horizonDays: z.number().int().positive().max(365).optional(),
  enabled: z.boolean().optional(),
});

export type UpdateMeetingSchedulingSettingsInput = z.infer<
  typeof updateMeetingSchedulingSettingsSchema
>;

export const meetingSlotSchema = z.object({
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  durationMinutes: z.union([z.literal(30), z.literal(60)]),
});

export type MeetingSlot = z.infer<typeof meetingSlotSchema>;

export const listMeetingSlotsQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  durationMinutes: z.coerce
    .number()
    .pipe(z.union([z.literal(30), z.literal(60)])),
});

export const createMeetingBookingSchema = z.object({
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  durationMinutes: z.union([z.literal(30), z.literal(60)]),
  bookerEmail: z.string().email().max(320),
  bookerFirstName: z.string().max(120).optional(),
  bookerLastName: z.string().max(120).optional(),
  note: z.string().max(5000).optional(),
  portalUserId: z.string().max(128).optional(),
  format: z.enum(["video_call", "in_person", "phone_call"]).optional(),
});

export type CreateMeetingBookingInput = z.infer<
  typeof createMeetingBookingSchema
>;

export type WhoopSnapshot = z.infer<typeof whoopSnapshotSchema>;

export type WhoopDayResult = z.infer<typeof whoopDayResultSchema>;

export type WhoopSettingsStatus = z.infer<typeof whoopSettingsStatusSchema>;
