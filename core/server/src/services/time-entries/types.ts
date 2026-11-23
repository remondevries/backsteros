import type {
  CreateTimeEntryInput,
  ListTimeEntriesQuery,
  StopTimeEntryInput,
  TimeEntryEntityType,
  TimeEntrySource,
  TimeEntrySummaryQuery,
  UpdateTimeEntryInput,
} from "@backsteros/contracts";

import type { db } from "../../db/index.js";
import type { DbTimeEntry } from "../../db/schema.js";

export type DbExecutor = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete" | "execute"
>;

export type TimeEntryRow = DbTimeEntry;

export type TimeEntryActor = {
  userId?: string | null;
  contactId?: string | null;
};

export type EntityContext = {
  projectId: string | null;
  organizationId: string | null;
  exists: boolean;
};

export type StartOpenTimeEntryInput = {
  entityType: TimeEntryEntityType;
  entityId: string;
  actor?: TimeEntryActor | null;
  startedAt?: Date;
  durationSeconds?: number;
  source?: TimeEntrySource;
  note?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  legacyStartActivityId?: string | null;
  id?: string;
};

export type CheckpointOpenTimeEntryInput = {
  entityType: TimeEntryEntityType;
  entityId: string;
  durationSeconds: number;
  now?: Date;
};

export type StopOpenTimeEntryInput = {
  entityType: TimeEntryEntityType;
  entityId: string;
  endedAt?: Date;
  durationSeconds?: number;
  now?: Date;
};

export type ApplyEntityTrackedDurationInput = {
  entityType: TimeEntryEntityType;
  entityId: string;
  nextDurationSeconds: number | null;
  actor?: TimeEntryActor | null;
  now?: Date;
};

export type {
  CreateTimeEntryInput,
  ListTimeEntriesQuery,
  StopTimeEntryInput,
  TimeEntryEntityType,
  TimeEntrySource,
  TimeEntrySummaryQuery,
  UpdateTimeEntryInput,
};
