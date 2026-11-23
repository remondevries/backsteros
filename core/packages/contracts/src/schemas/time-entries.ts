import { z } from "zod";

import { isoDateSchema, nullableIsoDateSchema } from "./common.js";

export const TIME_ENTRY_ENTITY_TYPES = ["task", "meeting", "document"] as const;
export const timeEntryEntityTypeSchema = z.enum(TIME_ENTRY_ENTITY_TYPES);
export type TimeEntryEntityType = z.infer<typeof timeEntryEntityTypeSchema>;

export const TIME_ENTRY_SOURCES = [
  "timer",
  "manual",
  "import",
  "migration",
  "adjustment",
] as const;
export const timeEntrySourceSchema = z.enum(TIME_ENTRY_SOURCES);
export type TimeEntrySource = z.infer<typeof timeEntrySourceSchema>;

export const timeEntrySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  entityType: timeEntryEntityTypeSchema,
  entityId: z.string(),
  actorUserId: z.string().nullable(),
  actorContactId: z.string().nullable(),
  startedAt: isoDateSchema,
  endedAt: nullableIsoDateSchema,
  durationSeconds: z.number().int().nonnegative(),
  source: timeEntrySourceSchema,
  note: z.string().nullable(),
  projectId: z.string().nullable(),
  organizationId: z.string().nullable(),
  legacyStartActivityId: z.string().nullable().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});
export type TimeEntry = z.infer<typeof timeEntrySchema>;

export const listTimeEntriesQuerySchema = z.object({
  entityType: timeEntryEntityTypeSchema.optional(),
  entityId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  actorContactId: z.string().min(1).optional(),
  openOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value == null ? undefined : value === "true")),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
});
export type ListTimeEntriesQuery = z.infer<typeof listTimeEntriesQuerySchema>;

export const createTimeEntrySchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    entityType: timeEntryEntityTypeSchema,
    entityId: z.string().min(1),
    actorContactId: z.string().min(1).nullable().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().nullable().optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
    source: timeEntrySourceSchema.optional(),
    note: z.string().max(2000).nullable().optional(),
    projectId: z.string().min(1).nullable().optional(),
    organizationId: z.string().min(1).nullable().optional(),
    /** When true (default for timer without endedAt), leave entry open. */
    open: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const open = value.open === true || (value.open !== false && value.endedAt == null);
    if (open && value.endedAt != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Open entries cannot set endedAt",
        path: ["endedAt"],
      });
    }
    if (!open && value.durationSeconds == null && value.endedAt == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Closed entries require endedAt or durationSeconds",
        path: ["durationSeconds"],
      });
    }
  });
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;

export const updateTimeEntrySchema = z
  .object({
    actorContactId: z.string().min(1).nullable().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().nullable().optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
    note: z.string().max(2000).nullable().optional(),
    projectId: z.string().min(1).nullable().optional(),
    organizationId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (value) =>
      value.actorContactId !== undefined ||
      value.startedAt !== undefined ||
      value.endedAt !== undefined ||
      value.durationSeconds !== undefined ||
      value.note !== undefined ||
      value.projectId !== undefined ||
      value.organizationId !== undefined,
    { message: "At least one field is required" },
  );
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;

export const stopTimeEntrySchema = z.object({
  endedAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
});
export type StopTimeEntryInput = z.infer<typeof stopTimeEntrySchema>;

/** Soft-checkpoint an open entry using the entity's total tracked seconds. */
export const checkpointTimeEntrySchema = z.object({
  durationSeconds: z.number().int().nonnegative(),
});
export type CheckpointTimeEntryInput = z.infer<
  typeof checkpointTimeEntrySchema
>;

export const TIME_ENTRY_SUMMARY_GROUP_BY = [
  "day",
  "project",
  "entity",
  "actor",
] as const;
export const timeEntrySummaryGroupBySchema = z.enum(TIME_ENTRY_SUMMARY_GROUP_BY);
export type TimeEntrySummaryGroupBy = z.infer<
  typeof timeEntrySummaryGroupBySchema
>;

export const timeEntrySummaryQuerySchema = z.object({
  groupBy: timeEntrySummaryGroupBySchema.default("day"),
  entityType: timeEntryEntityTypeSchema.optional(),
  entityId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  actorContactId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type TimeEntrySummaryQuery = z.infer<typeof timeEntrySummaryQuerySchema>;

export const timeEntrySummaryBucketSchema = z.object({
  key: z.string(),
  label: z.string().nullable().optional(),
  durationSeconds: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
});
export type TimeEntrySummaryBucket = z.infer<
  typeof timeEntrySummaryBucketSchema
>;

export const timeEntrySummaryResponseSchema = z.object({
  groupBy: timeEntrySummaryGroupBySchema,
  totalDurationSeconds: z.number().int().nonnegative(),
  buckets: z.array(timeEntrySummaryBucketSchema),
});
export type TimeEntrySummaryResponse = z.infer<
  typeof timeEntrySummaryResponseSchema
>;

export const listTimeEntriesResponseSchema = z.object({
  entries: z.array(timeEntrySchema),
  nextCursor: z.string().nullable(),
});
export type ListTimeEntriesResponse = z.infer<
  typeof listTimeEntriesResponseSchema
>;
