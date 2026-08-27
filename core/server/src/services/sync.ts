import { and, asc, eq, gt } from "drizzle-orm";

import type {
  CreateProjectInput,
  CreateTaskInput,
  DocumentType,
  Project,
  Task,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@backsteros/contracts";
import {
  bankAccountInputSchema,
  contactInputSchema,
  createHabitSchema,
  createMeetingSchema,
  updateHabitSchema,
  updateMeetingSchema,
  updateTaskCommentSchema,
  financialCategoryInputSchema,
  financialGoalInputSchema,
  financialRecurringInputSchema,
  cashflowPlannerEntryInputSchema,
  letterInputSchema,
  areaInputSchema,
  organizationInputSchema,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  areas,
  bankAccounts,
  documents,
  contacts,
  cashflowPlannerEntries,
  financialCategories,
  financialGoals,
  financialRecurrings,
  habits,
  meetings,
  letters,
  mutationReceipts,
  organizations,
  projects,
  syncEvents,
  taskComments,
  tasks,
  workspaceSettings,
} from "../db/schema.js";
import type { PowerSyncOp, SyncEntity, SyncOperation } from "../lib/sync-constants.js";
import { SYNC_SCHEMA_VERSION } from "../lib/sync-constants.js";
import { isSpacesConfigured } from "../lib/storage.js";
import * as documentService from "./documents.js";
import * as circleService from "./circle-domain.js";
import { sanitizeWorkspaceSettings } from "./cursor-settings.js";
import * as financeService from "./finance/finance.js";
import * as habitService from "./habits.js";
import * as meetingService from "./meetings.js";
import * as taskCommentService from "./task-comments.js";
import * as taskProjectService from "./tasks-projects.js";
import {
  appendSyncEvent,
  getWorkspaceLastSyncId,
  recordRestEntitySyncEvent,
} from "./sync-log.js";

export {
  appendSyncEvent,
  getWorkspaceLastSyncId,
  recordRestEntitySyncEvent,
} from "./sync-log.js";

const PULL_PAGE_SIZE = 100;
type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type SyncChange = {
  entity: SyncEntity;
  entity_id: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  updated_at: number;
};

export type SyncMutation = {
  id: string;
  changes: SyncChange[];
};

function projectSnapshot(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    summary: row.summary,
    description: row.description,
    organization_id: row.organizationId,
    area_id: row.areaId,
    area: row.area,
    start_date: row.startDate?.toISOString() ?? null,
    due_date: row.dueDate?.toISOString() ?? null,
    icon: row.icon,
    color: row.color,
    type: row.type,
    github_repository: row.githubRepository,
    local_working_directory: row.localWorkingDirectory,
    status: row.status,
    priority: row.priority,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function taskSnapshot(row: typeof tasks.$inferSelect) {
  return {
    id: row.id,
    project_id: row.projectId,
    contact_id: row.contactId,
    assignee_id: row.assigneeId,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    sort_order: row.sortOrder,
    due_date: row.dueDate?.toISOString() ?? null,
    due_end_date: row.dueEndDate?.toISOString() ?? null,
    triaged_at: row.triagedAt?.toISOString() ?? null,
    inbox: row.inbox,
    links: JSON.stringify(row.links ?? []),
    agent_chat_id: row.agentChatId ?? null,
    habit_id: row.habitId ?? null,
    completed_at: row.completedAt?.toISOString() ?? null,
    agent_created_at: row.agentCreatedAt?.toISOString() ?? null,
    agent_inbox_approved_at: row.agentInboxApprovedAt?.toISOString() ?? null,
    tracked_minutes: row.trackedMinutes ?? null,
    tracked_duration_seconds: row.trackedDurationSeconds ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function documentSnapshot(row: typeof documents.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    project_id: row.projectId,
    parent_id: row.parentId,
    kind: row.kind,
    icon: row.icon,
    sort_order: row.sortOrder,
    journal_date: row.journalDate,
    path: row.path,
    title: row.title,
    storage_key: row.storageKey,
    content_type: row.contentType,
    byte_size: row.byteSize,
    checksum: row.checksum,
    snippet: row.snippet,
    content_version: row.contentVersion,
    content_etag: row.contentEtag,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function areaSnapshot(row: typeof areas.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    parent: row.parent,
    icon: row.icon,
    color: row.color,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function organizationSnapshot(row: typeof organizations.$inferSelect) {
  return {
    id: row.id, number: row.number, key: row.key, name: row.name,
    summary: row.summary, phone: row.phone, email: row.email, website: row.website,
    address: row.address, city: row.city, postal_code: row.postalCode,
    country: row.country, avatar_storage_key: row.avatarStorageKey,
    avatar_content_type: row.avatarContentType, sort_order: row.sortOrder,
    notes: row.notes, created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(), deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function contactSnapshot(row: typeof contacts.$inferSelect) {
  return {
    id: row.id, number: row.number, key: row.key, organization_id: row.organizationId,
    name: row.name, email: row.email, title: row.title, summary: row.summary,
    avatar_storage_key: row.avatarStorageKey, avatar_content_type: row.avatarContentType,
    sort_order: row.sortOrder, phone: row.phone, role: row.role, notes: row.notes,
    address: row.address, city: row.city, postal_code: row.postalCode, country: row.country,
    social_accounts: JSON.stringify(row.socialAccounts ?? []),
    created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function letterSnapshot(row: typeof letters.$inferSelect) {
  return {
    id: row.id, number: row.number, project_id: row.projectId,
    organization_id: row.organizationId, contact_id: row.contactId, title: row.title,
    icon: row.icon, context: row.context, status: row.status,
    due_date: row.dueDate?.toISOString() ?? null,
    received_date: row.receivedDate?.toISOString() ?? null, direction: row.direction,
    storage_key: row.storageKey, original_filename: row.originalFilename,
    content_type: row.contentType, byte_size: row.byteSize, checksum: row.checksum,
    content_etag: row.contentEtag,
    sort_order: row.sortOrder, created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(), deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

async function maxCursor(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<number> {
  return getWorkspaceLastSyncId(workspaceId, executor);
}

export async function bootstrapSync(workspaceId: string) {
  const [
    projectRows,
    taskRows,
    documentRows,
    organizationRows,
    contactRows,
    letterRows,
    settings,
  ] = await Promise.all([
    taskProjectService.listProjects(workspaceId),
    taskProjectService.listTasks(workspaceId),
    documentService.listDocuments(workspaceId),
    circleService.listOrganizations(workspaceId),
    circleService.listContacts(workspaceId),
    circleService.listLetters(workspaceId),
    circleService.getSettings(workspaceId),
  ]);

  const lastSyncId = await maxCursor(workspaceId);
  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: lastSyncId,
    last_sync_id: lastSyncId,
    spaces_configured: isSpacesConfigured(),
    snapshot: {
      projects: projectRows.map(projectSnapshot),
      tasks: taskRows.map(taskSnapshot),
      documents: documentRows.map(documentSnapshot),
      organizations: organizationRows.map(organizationSnapshot),
      contacts: contactRows.map(contactSnapshot),
      letters: letterRows.map(letterSnapshot),
      workspace_settings: [
        {
          id: workspaceId,
          settings: sanitizeWorkspaceSettings(
            settings as Record<string, unknown>,
          ),
        },
      ],
    },
  };
}

export async function pullSync(workspaceId: string, cursor: number) {
  const events = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.workspaceId, workspaceId),
        gt(syncEvents.cursor, cursor),
      ),
    )
    .orderBy(asc(syncEvents.cursor))
    .limit(PULL_PAGE_SIZE + 1);

  const hasMore = events.length > PULL_PAGE_SIZE;
  const page = hasMore ? events.slice(0, PULL_PAGE_SIZE) : events;
  const nextCursor = page.length > 0 ? page[page.length - 1]!.cursor : cursor;

  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: nextCursor,
    last_sync_id: nextCursor,
    has_more: hasMore,
    events: page.map((row) => ({
      cursor: row.cursor,
      mutation_id: row.mutationId,
      device_id: row.deviceId,
      entity: row.entity,
      entity_id: row.entityId,
      operation: row.operation,
      payload: row.payload,
      created_at: row.createdAt.getTime(),
    })),
  };
}

async function recordSyncEvent(input: {
  workspaceId: string;
  mutationId: string;
  deviceId?: string;
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
}, executor: DbExecutor = db) {
  await appendSyncEvent(input, executor);
}

/**
 * REST / agent document content writes must enter the same sync_events log as
 * PowerSync mutations so replicas and clients share one ordered stream.
 */
export async function recordDocumentContentSyncEvent(input: {
  workspaceId: string;
  documentId: string;
  mutationId: string;
  deviceId?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await recordSyncEvent({
    workspaceId: input.workspaceId,
    mutationId: input.mutationId,
    deviceId: input.deviceId,
    entity: "document",
    entityId: input.documentId,
    operation: "upsert",
    payload: input.payload,
  });
}

/** REST task writes → ordered sync_events (same clock as PowerSync uploads). */
export async function recordTaskRestSyncEvent(
  workspaceId: string,
  row: typeof tasks.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "task",
    entityId: row.id,
    operation,
    payload: taskSnapshot(row),
    mutationId: `rest:task:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

/** REST project writes → ordered sync_events. */
export async function recordProjectRestSyncEvent(
  workspaceId: string,
  row: typeof projects.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "project",
    entityId: row.id,
    operation,
    payload: projectSnapshot(row),
    mutationId: `rest:project:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

/** REST area writes → ordered sync_events. */
export async function recordAreaRestSyncEvent(
  workspaceId: string,
  row: typeof areas.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "area",
    entityId: row.id,
    operation,
    payload: areaSnapshot(row),
    mutationId: `rest:area:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordOrganizationRestSyncEvent(
  workspaceId: string,
  row: typeof organizations.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "organization",
    entityId: row.id,
    operation,
    payload: organizationSnapshot(row),
    mutationId: `rest:organization:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordContactRestSyncEvent(
  workspaceId: string,
  row: typeof contacts.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "contact",
    entityId: row.id,
    operation,
    payload: contactSnapshot(row),
    mutationId: `rest:contact:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordLetterRestSyncEvent(
  workspaceId: string,
  row: typeof letters.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "letter",
    entityId: row.id,
    operation,
    payload: letterSnapshot(row),
    mutationId: `rest:letter:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordHabitRestSyncEvent(
  workspaceId: string,
  row: typeof habits.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "habit",
    entityId: row.id,
    operation,
    payload: habitSnapshot(row),
    mutationId: `rest:habit:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordMeetingRestSyncEvent(
  workspaceId: string,
  row: typeof meetings.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "meeting",
    entityId: row.id,
    operation,
    payload: meetingSnapshot(row),
    mutationId: `rest:meeting:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordTaskCommentRestSyncEvent(
  workspaceId: string,
  row: typeof taskComments.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "task_comment",
    entityId: row.id,
    operation,
    payload: taskCommentSnapshot(row),
    mutationId: `rest:task_comment:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordWorkspaceSettingRestSyncEvent(
  workspaceId: string,
  settings: Record<string, unknown>,
  updatedAt: Date = new Date(),
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "workspace_setting",
    entityId: workspaceId,
    operation: "upsert",
    payload: { id: workspaceId, settings, updated_at: updatedAt.toISOString() },
    mutationId: `rest:workspace_setting:${workspaceId}:${updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordBankAccountRestSyncEvent(
  workspaceId: string,
  row: typeof bankAccounts.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "bank_account",
    entityId: row.id,
    operation,
    payload: bankAccountSnapshot(row),
    mutationId: `rest:bank_account:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordFinancialCategoryRestSyncEvent(
  workspaceId: string,
  row: typeof financialCategories.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "financial_category",
    entityId: row.id,
    operation,
    payload: financialCategorySnapshot(row),
    mutationId: `rest:financial_category:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordFinancialGoalRestSyncEvent(
  workspaceId: string,
  row: typeof financialGoals.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "financial_goal",
    entityId: row.id,
    operation,
    payload: financialGoalSnapshot(row),
    mutationId: `rest:financial_goal:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordFinancialRecurringRestSyncEvent(
  workspaceId: string,
  row: typeof financialRecurrings.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "financial_recurring",
    entityId: row.id,
    operation,
    payload: financialRecurringSnapshot(row),
    mutationId: `rest:financial_recurring:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordCashflowPlannerRestSyncEvent(
  workspaceId: string,
  row: typeof cashflowPlannerEntries.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "cashflow_planner_entry",
    entityId: row.id,
    operation,
    payload: cashflowPlannerEntrySnapshot(row),
    mutationId: `rest:cashflow_planner_entry:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Distinguish missing field (`undefined`) from clear (`null`).
 * PowerSync clients send `assignee_id: null` to unassign; `asString` would drop that.
 */
function asNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "string") return value;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Distinguish missing field (`undefined`) from clear (`null`). */
function asNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  // PowerSync SQLite stores booleans as 0/1 integers.
  if (value === 0) return false;
  if (value === 1) return true;
  return undefined;
}

function isSoftDeletePayload(payload: Record<string, unknown>): boolean {
  const deletedAt = payload.deleted_at ?? payload.deletedAt;
  return deletedAt != null && deletedAt !== "";
}

/** Permanent client/data errors — acknowledge with 2xx so the upload queue is not blocked. */
const POWERSYNC_SKIPPABLE_ERRORS = new Set([
  "TASK_TITLE_REQUIRED",
  "PROJECT_FIELDS_REQUIRED",
  "DOCUMENT_FIELDS_REQUIRED",
  "INVALID_ORGANIZATION",
  "INVALID_CONTACT",
  "INVALID_LETTER",
  "INVALID_WORKSPACE_SETTINGS",
  // Stale local assignee / contact ids should not block the upload queue.
  "ASSIGNEE_NOT_FOUND",
  "CONTACT_NOT_FOUND",
  "PROJECT_NOT_FOUND",
  "HABIT_NOT_FOUND",
  "INVALID_HABIT",
  "INVALID_MEETING",
  "INVALID_MEETING_DATES",
  "MEETING_END_BEFORE_START",
  "INVALID_BANK_ACCOUNT",
  "INVALID_FINANCIAL_CATEGORY",
  "INVALID_FINANCIAL_GOAL",
  "INVALID_FINANCIAL_RECURRING",
  "INVALID_CASHFLOW_PLANNER_ENTRY",
]);

function camelizePayload(
  payload: Record<string, unknown>,
  keys: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [source, target] of Object.entries(keys)) {
    if (Object.prototype.hasOwnProperty.call(payload, source)) {
      result[target] = payload[source];
    } else if (Object.prototype.hasOwnProperty.call(payload, target)) {
      result[target] = payload[target];
    }
  }
  return result;
}

const areaKeys = {
  name: "name",
  parent: "parent",
  icon: "icon",
  color: "color",
  sort_order: "sortOrder",
};
const organizationKeys = {
  number: "number", key: "key", name: "name", summary: "summary", phone: "phone",
  email: "email", website: "website", address: "address", city: "city",
  postal_code: "postalCode", country: "country", sort_order: "sortOrder", notes: "notes",
};
const contactKeys = {
  number: "number", key: "key", organization_id: "organizationId", name: "name",
  email: "email", title: "title", summary: "summary", sort_order: "sortOrder",
  phone: "phone", role: "role", notes: "notes",
  address: "address", city: "city", postal_code: "postalCode", country: "country",
  social_accounts: "socialAccounts",
};

function normalizeContactSyncPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  if (typeof next.socialAccounts === "string") {
    try {
      next.socialAccounts = JSON.parse(next.socialAccounts);
    } catch {
      next.socialAccounts = [];
    }
  }
  return next;
}

const letterKeys = {
  number: "number", project_id: "projectId", organization_id: "organizationId",
  contact_id: "contactId", title: "title", icon: "icon", context: "context",
  status: "status", due_date: "dueDate", received_date: "receivedDate",
  direction: "direction", original_filename: "originalFilename",
  sort_order: "sortOrder",
};
const bankAccountKeys = {
  key: "key",
  name: "name",
  iban_or_mask: "ibanOrMask",
  currency: "currency",
  type: "type",
  color: "color",
  sort_order: "sortOrder",
};
const financialCategoryKeys = {
  name: "name",
  parent_id: "parentId",
  kind: "kind",
  listing: "listing",
  icon: "icon",
  budget_cents: "budgetCents",
  sort_order: "sortOrder",
};
const financialGoalKeys = {
  name: "name",
  listing: "listing",
  icon: "icon",
  goal_amount_cents: "goalAmountCents",
  start_date: "startDate",
  end_date: "endDate",
  contribution_cents: "contributionCents",
  saving_mode: "savingMode",
  sort_order: "sortOrder",
};
const habitKeys = {
  title: "title",
  icon: "icon",
  cadence: "cadence",
  cadence_anchor_ymd: "cadenceAnchorYmd",
  sort_order: "sortOrder",
};
const meetingKeys = {
  title: "title",
  summary: "summary",
  notes: "notes",
  transcription: "transcription",
  status: "status",
  project_id: "projectId",
  organization_id: "organizationId",
  attendee_contact_ids: "attendeeContactIds",
  start_at: "startAt",
  end_at: "endAt",
  tracked_minutes: "trackedMinutes",
  tracked_duration_seconds: "trackedDurationSeconds",
  sort_order: "sortOrder",
};
const taskCommentKeys = {
  task_id: "taskId",
  parent_comment_id: "parentCommentId",
  author_user_id: "authorUserId",
  author_contact_id: "authorContactId",
  author_email: "authorEmail",
  body: "body",
  resolved_at: "resolvedAt",
};
const financialRecurringKeys = {
  name: "name",
  icon: "icon",
  category_id: "categoryId",
  amount_cents: "amountCents",
  next_date: "nextDate",
  archived: "archived",
  sort_order: "sortOrder",
};
const cashflowPlannerEntryKeys = {
  entry_type: "entryType",
  name: "name",
  amount_cents: "amountCents",
  due_date: "dueDate",
  group_label: "groupLabel",
  sort_order: "sortOrder",
};

function bankAccountSnapshot(row: typeof bankAccounts.$inferSelect) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    iban_or_mask: row.ibanOrMask,
    currency: row.currency,
    type: row.type,
    avatar_storage_key: row.avatarStorageKey,
    avatar_content_type: row.avatarContentType,
    color: row.color ?? null,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function financialCategorySnapshot(row: typeof financialCategories.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parentId,
    kind: row.kind,
    listing: row.listing,
    icon: row.icon,
    budget_cents: row.budgetCents,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function financialGoalSnapshot(row: typeof financialGoals.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    listing: row.listing,
    icon: row.icon,
    goal_amount_cents: row.goalAmountCents,
    start_date: row.startDate,
    end_date: row.endDate,
    contribution_cents: row.contributionCents,
    saving_mode: row.savingMode,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function financialRecurringSnapshot(
  row: typeof financialRecurrings.$inferSelect,
) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    category_id: row.categoryId,
    amount_cents: row.amountCents,
    next_date: row.nextDate,
    archived: row.archived ? 1 : 0,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function cashflowPlannerEntrySnapshot(
  row: typeof cashflowPlannerEntries.$inferSelect,
) {
  return {
    id: row.id,
    entry_type: row.entryType,
    name: row.name,
    amount_cents: row.amountCents,
    due_date: row.dueDate,
    group_label: row.groupLabel,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function habitSnapshot(row: typeof habits.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    cadence: row.cadence,
    cadence_anchor_ymd: row.cadenceAnchorYmd,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function normalizeMeetingPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  if (next.attendeeContactIds !== undefined) {
    let raw = next.attendeeContactIds;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (!Array.isArray(raw)) {
      next.attendeeContactIds = [];
    } else {
      next.attendeeContactIds = raw.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      );
    }
  }
  return next;
}

function meetingSnapshot(row: typeof meetings.$inferSelect) {
  const attendeeIds = Array.isArray(row.attendeeContactIds)
    ? row.attendeeContactIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    summary: row.summary,
    notes: row.notes,
    transcription: row.transcription,
    status: row.status,
    project_id: row.projectId,
    organization_id: row.organizationId,
    attendee_contact_ids: JSON.stringify(attendeeIds),
    start_at: row.startAt.toISOString(),
    end_at: row.endAt.toISOString(),
    tracked_minutes: row.trackedMinutes ?? null,
    tracked_duration_seconds: row.trackedDurationSeconds ?? null,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function taskCommentSnapshot(row: typeof taskComments.$inferSelect) {
  return {
    id: row.id,
    task_id: row.taskId,
    parent_comment_id: row.parentCommentId,
    author_user_id: row.authorUserId,
    author_contact_id: row.authorContactId,
    author_email: row.authorEmail,
    body: row.body,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function mapProjectUpsert(
  payload: Record<string, unknown>,
): CreateProjectInput | UpdateProjectInput {
  return {
    key: asString(payload.key),
    name: asString(payload.name),
    summary: asString(payload.summary),
    description: asString(payload.description),
    organizationId: asNullableString(
      payload.organization_id ?? payload.organizationId,
    ),
    areaId: asNullableString(payload.area_id ?? payload.areaId),
    area: asString(payload.area) as Project["area"] | undefined,
    startDate: asNullableString(payload.start_date ?? payload.startDate),
    dueDate: asNullableString(payload.due_date ?? payload.dueDate),
    icon: asString(payload.icon),
    color: asString(payload.color),
    type: asString(payload.type) as Project["type"] | undefined,
    githubRepository: asNullableString(
      payload.github_repository ?? payload.githubRepository,
    ),
    localWorkingDirectory: asNullableString(
      payload.local_working_directory ?? payload.localWorkingDirectory,
    ),
    status: asString(payload.status) as Project["status"] | undefined,
    priority: asNumber(payload.priority),
    sortOrder: asNumber(payload.sort_order ?? payload.sortOrder),
  };
}

function parseTaskLinks(
  value: unknown,
): CreateTaskInput["links"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is { id: string; url: string; createdAt: string } =>
      item != null &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { url?: unknown }).url === "string" &&
      typeof (item as { createdAt?: unknown }).createdAt === "string",
  );
}

function mapTaskUpsert(
  payload: Record<string, unknown>,
): CreateTaskInput | UpdateTaskInput {
  return {
    projectId: asNullableString(payload.project_id ?? payload.projectId),
    contactId: asNullableString(payload.contact_id ?? payload.contactId),
    assigneeId: asNullableString(payload.assignee_id ?? payload.assigneeId),
    title: asString(payload.title),
    description: asString(payload.description),
    status: asString(payload.status) as Task["status"] | undefined,
    priority: asNumber(payload.priority),
    sortOrder: asNumber(payload.sort_order ?? payload.sortOrder),
    dueDate: asNullableString(payload.due_date ?? payload.dueDate),
    dueEndDate: asNullableString(payload.due_end_date ?? payload.dueEndDate),
    triagedAt: asNullableString(payload.triaged_at ?? payload.triagedAt),
    inbox: asBoolean(payload.inbox),
    links: parseTaskLinks(payload.links),
    agentChatId: asNullableString(
      payload.agent_chat_id ?? payload.agentChatId,
    ),
    habitId: asNullableString(payload.habit_id ?? payload.habitId),
    trackedMinutes: asNullableNumber(
      payload.tracked_minutes ?? payload.trackedMinutes,
    ),
    trackedDurationSeconds: asNullableNumber(
      payload.tracked_duration_seconds ?? payload.trackedDurationSeconds,
    ),
  };
}

export async function applySyncChange(
  workspaceId: string,
  change: SyncChange,
  executor: DbExecutor = db,
) {
  switch (change.entity) {
    case "project": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await taskProjectService.deleteProject(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? projectSnapshot(row) : null;
      }

      const existing = await taskProjectService.getProjectById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const input = mapProjectUpsert(change.payload);

      if (existing) {
        const row = await taskProjectService.updateProject(
          workspaceId,
          change.entity_id,
          input,
          executor,
        );
        return row ? projectSnapshot(row) : null;
      }

      if (change.operation === "patch") {
        return null;
      }

      if (!input.key || !input.name) {
        throw new Error("PROJECT_FIELDS_REQUIRED");
      }

      const row = await taskProjectService.createProject(
        workspaceId,
        {
          key: input.key,
          name: input.name,
          summary: input.summary,
          description: input.description,
          organizationId: input.organizationId,
          areaId: input.areaId,
          area: input.area,
          startDate: input.startDate,
          dueDate: input.dueDate,
          icon: input.icon,
          color: input.color,
          status: input.status,
          priority: input.priority,
          sortOrder: input.sortOrder,
        },
        change.entity_id,
        executor,
      );
      return projectSnapshot(row);
    }

    case "task": {
      // Local soft-deletes upload as PATCH { deleted_at } after REST DELETE already
      // removed the row — treat as idempotent delete, never as create.
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await taskProjectService.deleteTask(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? taskSnapshot(row) : null;
      }

      const existing = await taskProjectService.getTaskById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const input = mapTaskUpsert(change.payload);

      if (existing) {
        const row = await taskProjectService.updateTask(
          workspaceId,
          change.entity_id,
          input,
          executor,
        );
        return row ? taskSnapshot(row) : null;
      }

      // PATCH only carries changed columns — cannot invent a row.
      if (change.operation === "patch") {
        return null;
      }

      if (!input.title) {
        throw new Error("TASK_TITLE_REQUIRED");
      }

      const row = await taskProjectService.createTask(
        workspaceId,
        {
          projectId: input.projectId,
          contactId: input.contactId,
          assigneeId: input.assigneeId,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          sortOrder: input.sortOrder,
          dueDate: input.dueDate,
          dueEndDate: input.dueEndDate,
          triagedAt: input.triagedAt,
          inbox: input.inbox,
          links: input.links,
          agentChatId: input.agentChatId,
          habitId: input.habitId,
        },
        change.entity_id,
        executor,
      );
      return taskSnapshot(row);
    }

    case "document": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await documentService.deleteDocument(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? documentSnapshot(row) : null;
      }

      const type = asString(change.payload.type) as DocumentType | undefined;
      const path = asString(change.payload.path);
      const title = asString(change.payload.title);
      const projectId = asString(change.payload.project_id ?? change.payload.projectId);
      const parentId = asString(change.payload.parent_id ?? change.payload.parentId);
      const icon = asString(change.payload.icon);
      const sortOrder = asNumber(change.payload.sort_order ?? change.payload.sortOrder);
      const journalDate = asString(change.payload.journal_date ?? change.payload.journalDate);

      const existing = await documentService.getDocumentById(
        workspaceId,
        change.entity_id,
        executor,
      );
      if (existing) {
        await documentService.patchDocumentContentMetadataFromSyncPayload(
          workspaceId,
          change.entity_id,
          change.payload,
          executor,
        );
        const row = await documentService.updateDocument(
          workspaceId,
          change.entity_id,
          { title, path, parentId, icon, sortOrder, journalDate },
          executor,
        );
        return row ? documentSnapshot(row) : null;
      }

      if (change.operation === "patch") {
        return null;
      }

      if (!type || !path || !title) {
        throw new Error("DOCUMENT_FIELDS_REQUIRED");
      }

      const row = await documentService.createDocument(
        workspaceId,
        {
          type,
          path,
          title,
          projectId,
          parentId,
          kind: asString(change.payload.kind) as "document" | "folder" | undefined,
          icon,
          sortOrder,
          journalDate,
        },
        change.entity_id,
        executor,
      );
      return documentSnapshot(row);
    }

    case "area": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await circleService.deleteArea(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? areaSnapshot(row) : null;
      }
      const existing = await circleService.getAreaById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, areaKeys);
      if (existing) {
        const parsed = areaInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_AREA");
        const row = await circleService.updateArea(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        return row ? areaSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = areaInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_AREA");
      const row = await circleService.createArea(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      return areaSnapshot(row);
    }

    case "organization": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await circleService.deleteOrganization(
          workspaceId, change.entity_id, executor,
        );
        return row ? organizationSnapshot(row) : null;
      }
      const existing = await circleService.getOrganizationById(
        workspaceId, change.entity_id, executor,
      );
      const payload = camelizePayload(change.payload, organizationKeys);
      if (existing) {
        const parsed = organizationInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_ORGANIZATION");
        const row = await circleService.updateOrganization(
          workspaceId, change.entity_id, parsed.data, executor,
        );
        return row ? organizationSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = organizationInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_ORGANIZATION");
      const row = await circleService.createOrganization(
        workspaceId, parsed.data, change.entity_id, executor,
      );
      return organizationSnapshot(row);
    }

    case "contact": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await circleService.deleteContact(
          workspaceId, change.entity_id, executor,
        );
        return row ? contactSnapshot(row) : null;
      }
      const existing = await circleService.getContactById(
        workspaceId, change.entity_id, executor,
      );
      const payload = normalizeContactSyncPayload(
        camelizePayload(change.payload, contactKeys),
      );
      if (existing) {
        const parsed = contactInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_CONTACT");
        const row = await circleService.updateContact(
          workspaceId, change.entity_id, parsed.data, executor,
        );
        return row ? contactSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = contactInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_CONTACT");
      const row = await circleService.createContact(
        workspaceId, parsed.data, change.entity_id, executor,
      );
      return contactSnapshot(row);
    }

    case "letter": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await circleService.deleteLetter(
          workspaceId, change.entity_id, executor,
        );
        return row ? letterSnapshot(row) : null;
      }
      const existing = await circleService.getLetterById(
        workspaceId, change.entity_id, executor,
      );
      const payload = camelizePayload(change.payload, letterKeys);
      if (existing) {
        const parsed = letterInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_LETTER");
        const row = await circleService.updateLetter(
          workspaceId, change.entity_id, parsed.data, executor,
        );
        return row ? letterSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = letterInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_LETTER");
      const row = await circleService.createLetter(
        workspaceId, parsed.data, change.entity_id, executor,
      );
      return letterSnapshot(row);
    }

    case "workspace_setting": {
      const patch = change.operation === "delete"
        ? {}
        : change.payload.settings;
      if (
        patch === null ||
        typeof patch !== "object" ||
        Array.isArray(patch)
      ) {
        throw new Error("INVALID_WORKSPACE_SETTINGS");
      }
      const settings = await circleService.updateSettings(
        workspaceId,
        patch as Record<string, unknown>,
        executor,
      );
      return { id: workspaceId, settings };
    }

    case "bank_account": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await financeService.deleteBankAccount(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? bankAccountSnapshot(row) : null;
      }
      const existing = await financeService.getBankAccountById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, bankAccountKeys);
      if (existing) {
        const parsed = bankAccountInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_BANK_ACCOUNT");
        const row = await financeService.updateBankAccount(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        return row ? bankAccountSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = bankAccountInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_BANK_ACCOUNT");
      const row = await financeService.createBankAccount(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      return bankAccountSnapshot(row);
    }

    case "financial_category": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await financeService.deleteFinancialCategory(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? financialCategorySnapshot(row) : null;
      }
      const existing = await financeService.getFinancialCategoryById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, financialCategoryKeys);
      if (existing) {
        const parsed = financialCategoryInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_FINANCIAL_CATEGORY");
        const row = await financeService.updateFinancialCategory(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        return row ? financialCategorySnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = financialCategoryInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_FINANCIAL_CATEGORY");
      const row = await financeService.createFinancialCategory(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      return financialCategorySnapshot(row);
    }

    case "financial_goal": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await financeService.deleteFinancialGoal(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? financialGoalSnapshot(row) : null;
      }
      const existing = await financeService.getFinancialGoalById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, financialGoalKeys);
      if (existing) {
        const parsed = financialGoalInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_FINANCIAL_GOAL");
        const row = await financeService.updateFinancialGoal(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        return row ? financialGoalSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = financialGoalInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_FINANCIAL_GOAL");
      const row = await financeService.createFinancialGoal(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      return financialGoalSnapshot(row);
    }

    case "financial_recurring": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await financeService.deleteFinancialRecurring(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? financialRecurringSnapshot(row) : null;
      }
      const existing = await financeService.getFinancialRecurringById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, financialRecurringKeys);
      if (payload.archived !== undefined) {
        const archived = asBoolean(payload.archived);
        if (archived === undefined) delete payload.archived;
        else payload.archived = archived;
      }
      if (existing) {
        const parsed = financialRecurringInputSchema
          .partial()
          .safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_FINANCIAL_RECURRING");
        const row = await financeService.updateFinancialRecurring(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        return row ? financialRecurringSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = financialRecurringInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_FINANCIAL_RECURRING");
      const row = await financeService.createFinancialRecurring(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      return financialRecurringSnapshot(row);
    }

    case "cashflow_planner_entry": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await financeService.deleteCashflowPlannerEntry(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? cashflowPlannerEntrySnapshot(row) : null;
      }
      const existing = await financeService.getCashflowPlannerEntryById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(
        change.payload,
        cashflowPlannerEntryKeys,
      );
      if (existing) {
        const parsed = cashflowPlannerEntryInputSchema
          .partial()
          .safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_CASHFLOW_PLANNER_ENTRY");
        const row = await financeService.updateCashflowPlannerEntry(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        return row ? cashflowPlannerEntrySnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = cashflowPlannerEntryInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_CASHFLOW_PLANNER_ENTRY");
      const row = await financeService.createCashflowPlannerEntry(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      return cashflowPlannerEntrySnapshot(row);
    }

    case "habit": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await habitService.deleteHabitRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? habitSnapshot(row) : null;
      }
      const existing = await habitService.getHabitRow(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, habitKeys);
      if (existing) {
        const parsed = updateHabitSchema.safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_HABIT");
        const updated = await habitService.updateHabit(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        if (!updated) return null;
        const row = await habitService.getHabitRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? habitSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = createHabitSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_HABIT");
      const row = await habitService.createHabitRow(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      return habitSnapshot(row);
    }

    case "meeting": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await meetingService.deleteMeetingRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? meetingSnapshot(row) : null;
      }
      const existing = await meetingService.getMeetingRow(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = normalizeMeetingPayload(
        camelizePayload(change.payload, meetingKeys),
      );
      if (existing) {
        const parsed = updateMeetingSchema.safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_MEETING");
        const updated = await meetingService.updateMeeting(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        if (!updated) return null;
        const row = await meetingService.getMeetingRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? meetingSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = createMeetingSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_MEETING");
      const row = await meetingService.createMeetingRow(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      return meetingSnapshot(row);
    }

    case "task_comment": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await taskCommentService.softDeleteTaskCommentRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? taskCommentSnapshot(row) : null;
      }
      const existing = await taskCommentService.getTaskCommentRow(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, taskCommentKeys);
      if (existing) {
        const parsed = updateTaskCommentSchema.safeParse({
          body: payload.body,
          resolvedAt: payload.resolvedAt,
        });
        if (!parsed.success) throw new Error("INVALID_TASK_COMMENT");
        const updated = await taskCommentService.updateTaskComment(
          workspaceId,
          existing.taskId,
          change.entity_id,
          parsed.data,
          executor,
        );
        if (!updated) return null;
        const row = await taskCommentService.getTaskCommentRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? taskCommentSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const taskId =
        typeof payload.taskId === "string" ? payload.taskId.trim() : "";
      const body = typeof payload.body === "string" ? payload.body.trim() : "";
      if (!taskId || !body) throw new Error("INVALID_TASK_COMMENT");
      const row = await taskCommentService.createTaskCommentRow(
        workspaceId,
        change.entity_id,
        {
          taskId,
          body,
          parentCommentId:
            typeof payload.parentCommentId === "string"
              ? payload.parentCommentId
              : null,
          authorUserId:
            typeof payload.authorUserId === "string"
              ? payload.authorUserId
              : null,
          authorContactId:
            typeof payload.authorContactId === "string"
              ? payload.authorContactId
              : null,
          authorEmail:
            typeof payload.authorEmail === "string" ? payload.authorEmail : null,
        },
        executor,
      );
      return row ? taskCommentSnapshot(row) : null;
    }
  }
}

export async function pushSyncMutations(input: {
  workspaceId: string;
  deviceId: string;
  mutations: SyncMutation[];
}) {
  const acceptedMutationIds: string[] = [];

  const { shouldForwardMutationsToLeader, commitMutationsLeaderFirst } =
    await import("./core-replication/leader-mutations.js");

  for (const mutation of input.mutations) {
    if (shouldForwardMutationsToLeader()) {
      const changes = mutation.changes.map((change) => ({
        entity: change.entity,
        entityId: change.entity_id,
        operation: change.operation,
        payload: change.payload,
        eventMutationId: `${mutation.id}:${change.entity}:${change.entity_id}`,
      }));
      await commitMutationsLeaderFirst({
        workspaceId: input.workspaceId,
        mutationId: mutation.id,
        deviceId: input.deviceId,
        changes,
      });
      acceptedMutationIds.push(mutation.id);
      continue;
    }

    await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(mutationReceipts)
        .values({
          workspaceId: input.workspaceId,
          mutationId: mutation.id,
          deviceId: input.deviceId,
        })
        .onConflictDoNothing()
        .returning({ mutationId: mutationReceipts.mutationId });

      if (!receipt) {
        return;
      }

      for (const change of mutation.changes) {
        await applySyncChange(input.workspaceId, change, tx);
        await recordSyncEvent({
          workspaceId: input.workspaceId,
          mutationId: `${mutation.id}:${change.entity}:${change.entity_id}`,
          deviceId: input.deviceId,
          entity: change.entity,
          entityId: change.entity_id,
          operation: change.operation,
          payload: change.payload,
        }, tx);
      }

      await tx
        .update(mutationReceipts)
        .set({ result: { accepted: true } })
        .where(
          and(
            eq(mutationReceipts.workspaceId, input.workspaceId),
            eq(mutationReceipts.mutationId, mutation.id),
          ),
        );
      });
    acceptedMutationIds.push(mutation.id);
  }

  const lastSyncId = await maxCursor(input.workspaceId);
  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: lastSyncId,
    last_sync_id: lastSyncId,
    accepted_mutation_ids: acceptedMutationIds,
  };
}

function mapPowerSyncTable(table: string): SyncEntity | null {
  switch (table) {
    case "projects":
      return "project";
    case "tasks":
      return "task";
    case "documents":
      return "document";
    case "areas":
      return "area";
    case "organizations":
      return "organization";
    case "contacts":
      return "contact";
    case "letters":
      return "letter";
    case "workspace_settings":
      return "workspace_setting";
    case "bank_accounts":
      return "bank_account";
    case "financial_categories":
      return "financial_category";
    case "financial_goals":
      return "financial_goal";
    case "financial_recurrings":
      return "financial_recurring";
    case "cashflow_planner_entries":
      return "cashflow_planner_entry";
    case "habits":
      return "habit";
    case "meetings":
      return "meeting";
    case "task_comments":
      return "task_comment";
    default:
      return null;
  }
}

function mapPowerSyncOp(op: PowerSyncOp): SyncOperation {
  if (op === "DELETE") return "delete";
  if (op === "PUT") return "upsert";
  return "patch";
}

export async function applyPowerSyncBatch(input: {
  workspaceId: string;
  deviceId: string;
  mutationId: string;
  batch: Array<{
    table: string;
    op: PowerSyncOp;
    id: string;
    data?: Record<string, unknown>;
  }>;
}) {
  const { shouldForwardMutationsToLeader, commitMutationsLeaderFirst } =
    await import("./core-replication/leader-mutations.js");

  const changes: Array<{
    entity: SyncEntity;
    entityId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    eventMutationId: string;
  }> = [];

  for (const [index, entry] of input.batch.entries()) {
    const entity = mapPowerSyncTable(entry.table);
    if (!entity) continue;
    const operation = mapPowerSyncOp(entry.op);
    const payload = entry.data ?? {};
    changes.push({
      entity,
      entityId: entry.id,
      operation: operation === "patch" ? "upsert" : operation,
      payload: operation === "delete" ? payload : { ...payload, id: entry.id },
      eventMutationId: `${input.mutationId}:${index}`,
    });
  }

  if (shouldForwardMutationsToLeader()) {
    const [parentReceipt] = await db
      .insert(mutationReceipts)
      .values({
        workspaceId: input.workspaceId,
        mutationId: input.mutationId,
        deviceId: input.deviceId,
      })
      .onConflictDoNothing()
      .returning({ mutationId: mutationReceipts.mutationId });
    if (!parentReceipt) {
      return { ok: true as const, duplicate: true };
    }
    await commitMutationsLeaderFirst({
      workspaceId: input.workspaceId,
      mutationId: input.mutationId,
      deviceId: input.deviceId,
      changes,
    });
    await db
      .update(mutationReceipts)
      .set({ result: { accepted: true, source: "powersync_leader_first" } })
      .where(
        and(
          eq(mutationReceipts.workspaceId, input.workspaceId),
          eq(mutationReceipts.mutationId, input.mutationId),
        ),
      );
    return { ok: true as const, duplicate: false };
  }

  let duplicate = false;
  await db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(mutationReceipts)
      .values({
        workspaceId: input.workspaceId,
        mutationId: input.mutationId,
        deviceId: input.deviceId,
      })
      .onConflictDoNothing()
      .returning({ mutationId: mutationReceipts.mutationId });
    if (!receipt) {
      duplicate = true;
      return;
    }

    for (const [index, entry] of input.batch.entries()) {
      const entity = mapPowerSyncTable(entry.table);
      if (!entity) continue;
      const operation = mapPowerSyncOp(entry.op);
      const payload = entry.data ?? {};
      const change: SyncChange = {
        entity,
        entity_id: entry.id,
        operation,
        payload: operation === "delete" ? payload : { ...payload, id: entry.id },
        updated_at: Date.now(),
      };
      try {
        await applySyncChange(input.workspaceId, change, tx);
      } catch (error) {
        // PowerSync retries 4xx/5xx forever — skip permanent validation failures.
        if (
          error instanceof Error &&
          POWERSYNC_SKIPPABLE_ERRORS.has(error.message)
        ) {
          console.warn(
            `[powersync] skipping ${entry.op} ${entry.table}/${entry.id}: ${error.message}`,
          );
          continue;
        }
        throw error;
      }
      await recordSyncEvent({
        workspaceId: input.workspaceId,
        mutationId: `${input.mutationId}:${index}`,
        deviceId: input.deviceId,
        entity,
        entityId: entry.id,
        operation: operation === "patch" ? "upsert" : operation,
        payload: change.payload,
      }, tx);
    }
    await tx
      .update(mutationReceipts)
      .set({ result: { accepted: true } })
      .where(and(
        eq(mutationReceipts.workspaceId, input.workspaceId),
        eq(mutationReceipts.mutationId, input.mutationId),
      ));
  });

  return { ok: true as const, duplicate };
}
