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
  updateContactSchema,
  contactRelationshipInputSchema,
  updateContactRelationshipSchema,
  crmRelationshipLabelInputSchema,
  updateCrmRelationshipLabelSchema,
  crmGroupInputSchema,
  updateCrmGroupSchema,
  crmGroupMemberInputSchema,
  createCrmActivityNoteSchema,
  createHabitSchema,
  createMeetingSchema,
  createTaskActivitySchema,
  updateHabitSchema,
  updateMeetingSchema,
  updateTaskCommentSchema,
  updateFinancialTransactionSchema,
  updateEmailThreadMetadataSchema,
  updateEmailThreadCommentSchema,
  createRecurringTaskSchema,
  updateRecurringTaskSchema,
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
  contactRelationships,
  crmActivities,
  crmGroupMembers,
  crmGroups,
  crmRelationshipLabels,
  cashflowPlannerEntries,
  emailThreadComments,
  emailThreads,
  financialCategories,
  financialGoals,
  financialRecurrings,
  financialTransactions,
  habits,
  meetings,
  letters,
  mentions,
  mutationReceipts,
  organizations,
  projects,
  recurringTasks,
  syncEvents,
  taskActivities,
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
import type { HabitTaskSyncChange } from "./habits.js";
import * as meetingService from "./meetings.js";
import * as emailThreadsService from "./email-threads.js";
import * as recurringTaskService from "./recurring-tasks.js";
import * as taskCommentService from "./task-comments.js";
import * as taskActivityService from "./task-activities.js";
import * as taskProjectService from "./tasks-projects.js";
import * as crmGroupsService from "./crm-groups.js";
import * as crmRelationshipLabelsService from "./crm-relationship-labels.js";
import * as crmActivitiesService from "./crm-activities.js";
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
type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

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
  const relatedContactIds = Array.isArray(row.relatedContactIds)
    ? row.relatedContactIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  const relatedOrganizationIds = Array.isArray(row.relatedOrganizationIds)
    ? row.relatedOrganizationIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  return {
    id: row.id,
    project_id: row.projectId,
    contact_id: row.contactId,
    assignee_id: row.assigneeId,
    related_contact_ids: JSON.stringify(relatedContactIds),
    related_organization_ids: JSON.stringify(relatedOrganizationIds),
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
    linked_commit_sha: row.linkedCommitSha ?? null,
    habit_id: row.habitId ?? null,
    completed_at: row.completedAt?.toISOString() ?? null,
    agent_created_at: row.agentCreatedAt?.toISOString() ?? null,
    agent_inbox_approved_at: row.agentInboxApprovedAt?.toISOString() ?? null,
    inbox_updated_at: row.inboxUpdatedAt?.toISOString() ?? null,
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
    id: row.id,
    number: row.number,
    key: row.key,
    name: row.name,
    summary: row.summary,
    phone: row.phone,
    email: row.email,
    emails: JSON.stringify(row.emails ?? []),
    phones: JSON.stringify(row.phones ?? []),
    website: row.website,
    address: row.address,
    city: row.city,
    postal_code: row.postalCode,
    country: row.country,
    region: row.region ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    size: row.size ?? null,
    social_accounts: JSON.stringify(row.socialAccounts ?? []),
    chamber_of_commerce: row.chamberOfCommerce ?? null,
    tax_number: row.taxNumber ?? null,
    avatar_storage_key: row.avatarStorageKey,
    avatar_content_type: row.avatarContentType,
    sort_order: row.sortOrder,
    notes: row.notes,
    moneybird_contact_id: row.moneybirdContactId ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function contactSnapshot(row: typeof contacts.$inferSelect) {
  return {
    id: row.id,
    number: row.number,
    key: row.key,
    organization_id: row.organizationId,
    name: row.name,
    first_name: row.firstName,
    last_name: row.lastName,
    email: row.email,
    emails: JSON.stringify(row.emails ?? []),
    title: row.title,
    summary: row.summary,
    avatar_storage_key: row.avatarStorageKey,
    avatar_content_type: row.avatarContentType,
    sort_order: row.sortOrder,
    phone: row.phone,
    phones: JSON.stringify(row.phones ?? []),
    role: row.role,
    notes: row.notes,
    address: row.address,
    city: row.city,
    postal_code: row.postalCode,
    country: row.country,
    region: row.region ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    social_accounts: JSON.stringify(row.socialAccounts ?? []),
    birthday: row.birthday ?? null,
    languages: JSON.stringify(row.languages ?? []),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
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

/** Full letter metadata payload for REST leader-first / sync_events (no PDF bytes). */
export function buildLetterSyncPayloadFromRow(
  row: typeof letters.$inferSelect,
): Record<string, unknown> {
  return letterSnapshot(row);
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

/** REST document metadata writes → ordered sync_events (parity with tasks). */
export async function recordDocumentRestSyncEvent(
  workspaceId: string,
  row: typeof documents.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "document",
    entityId: row.id,
    operation,
    payload: documentSnapshot(row),
    mutationId: `rest:document:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
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

/** Snake payload for leader-first / sync apply of an existing task row. */
export function taskRowToSyncPayload(
  row: typeof tasks.$inferSelect,
): Record<string, unknown> {
  return taskSnapshot(row);
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

export async function recordMentionRestSyncEvent(
  workspaceId: string,
  row: typeof mentions.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "mention",
    entityId: row.id,
    operation,
    payload: mentionSnapshot(row),
    mutationId: `rest:mention:${row.id}:${operation}:${row.createdAt.getTime()}:${crypto.randomUUID()}`,
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

export async function recordTaskActivityRestSyncEvent(
  workspaceId: string,
  row: typeof taskActivities.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "task_activity",
    entityId: row.id,
    operation,
    payload: taskActivitySnapshot(row),
    mutationId: `rest:task_activity:${row.id}:${operation}:${row.createdAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function loadTaskActivityRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<typeof taskActivities.$inferSelect | null> {
  return taskActivityService.getTaskActivityRow(workspaceId, id, executor);
}

export async function recordContactRelationshipRestSyncEvent(
  workspaceId: string,
  row: typeof contactRelationships.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "contact_relationship",
    entityId: row.id,
    operation,
    payload: contactRelationshipSnapshot(row),
    mutationId: `rest:contact_relationship:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordCrmRelationshipLabelRestSyncEvent(
  workspaceId: string,
  row: typeof crmRelationshipLabels.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "crm_relationship_label",
    entityId: row.id,
    operation,
    payload: crmRelationshipLabelSnapshot(row),
    mutationId: `rest:crm_relationship_label:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordCrmGroupRestSyncEvent(
  workspaceId: string,
  row: typeof crmGroups.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "crm_group",
    entityId: row.id,
    operation,
    payload: crmGroupSnapshot(row),
    mutationId: `rest:crm_group:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordCrmGroupMemberRestSyncEvent(
  workspaceId: string,
  row: typeof crmGroupMembers.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "crm_group_member",
    entityId: row.id,
    operation,
    payload: crmGroupMemberSnapshot(row),
    mutationId: `rest:crm_group_member:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordCrmActivityRestSyncEvent(
  workspaceId: string,
  row: typeof crmActivities.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "crm_activity",
    entityId: row.id,
    operation,
    payload: crmActivitySnapshot(row),
    mutationId: `rest:crm_activity:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

/** Meeting attendee/org feed rows are derived — also emit first-class crm_activity events. */
export async function recordMeetingDerivedCrmActivityRestSyncEvents(
  workspaceId: string,
  meetingId: string,
): Promise<void> {
  const rows = await crmActivitiesService.listCrmActivitiesForMeeting(
    workspaceId,
    meetingId,
  );
  for (const row of rows) {
    await recordCrmActivityRestSyncEvent(
      workspaceId,
      row,
      row.deletedAt ? "delete" : "upsert",
    );
  }
}

async function appendMeetingDerivedCrmActivitySyncEvents(
  workspaceId: string,
  meetingId: string,
  parentMutationId: string,
  deviceId: string | undefined,
  executor: DbExecutor,
): Promise<void> {
  const rows = await crmActivitiesService.listCrmActivitiesForMeeting(
    workspaceId,
    meetingId,
    executor,
  );
  for (const row of rows) {
    await recordSyncEvent(
      {
        workspaceId,
        mutationId: `${parentMutationId}:crm_activity:${row.id}`,
        deviceId,
        entity: "crm_activity",
        entityId: row.id,
        operation: row.deletedAt ? "delete" : "upsert",
        payload: crmActivitiesService.crmActivityToSyncPayload(row),
      },
      executor,
    );
  }
}

function mergeHabitTaskSyncChanges(
  prior: HabitTaskSyncChange[],
  next: HabitTaskSyncChange[],
): HabitTaskSyncChange[] {
  const byId = new Map<string, HabitTaskSyncChange>();
  for (const change of prior) byId.set(change.task.id, change);
  for (const change of next) byId.set(change.task.id, change);
  return [...byId.values()];
}

/**
 * Emit task sync_events for habit side-effects.
 * `priorChanges` should include updateHabit rename/project moves; ensure covers creates.
 */
async function appendHabitDerivedTaskSyncEvents(
  workspaceId: string,
  parentMutationId: string,
  deviceId: string | undefined,
  executor: DbExecutor,
  priorChanges: HabitTaskSyncChange[] = [],
): Promise<void> {
  const ensured = await habitService.ensureHabitTasksForDate(
    workspaceId,
    undefined,
    executor,
  );
  const changes = mergeHabitTaskSyncChanges(
    priorChanges,
    ensured.changedTasks,
  );
  for (const change of changes) {
    await recordSyncEvent(
      {
        workspaceId,
        mutationId: `${parentMutationId}:task:${change.task.id}`,
        deviceId,
        entity: "task",
        entityId: change.task.id,
        operation: change.operation,
        payload:
          change.operation === "delete"
            ? {
                id: change.task.id,
                deleted_at:
                  change.task.deletedAt?.toISOString() ??
                  new Date().toISOString(),
              }
            : taskRowToSyncPayload(change.task),
      },
      executor,
    );
  }
}

/** Shared merge for leader-mutation habit follow-ups. */
export function mergeHabitDerivedTaskChanges(
  prior: HabitTaskSyncChange[],
  ensured: HabitTaskSyncChange[],
): HabitTaskSyncChange[] {
  return mergeHabitTaskSyncChanges(prior, ensured);
}

export async function loadContactRelationshipRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<typeof contactRelationships.$inferSelect | null> {
  const [row] = await executor
    .select()
    .from(contactRelationships)
    .where(
      and(
        eq(contactRelationships.workspaceId, workspaceId),
        eq(contactRelationships.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function loadCrmRelationshipLabelRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<typeof crmRelationshipLabels.$inferSelect | null> {
  const [row] = await executor
    .select()
    .from(crmRelationshipLabels)
    .where(
      and(
        eq(crmRelationshipLabels.workspaceId, workspaceId),
        eq(crmRelationshipLabels.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function loadCrmGroupRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<typeof crmGroups.$inferSelect | null> {
  const [row] = await executor
    .select()
    .from(crmGroups)
    .where(
      and(eq(crmGroups.workspaceId, workspaceId), eq(crmGroups.id, id)),
    )
    .limit(1);
  return row ?? null;
}

export async function loadCrmGroupMemberRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<typeof crmGroupMembers.$inferSelect | null> {
  const [row] = await executor
    .select()
    .from(crmGroupMembers)
    .where(
      and(
        eq(crmGroupMembers.workspaceId, workspaceId),
        eq(crmGroupMembers.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function loadCrmActivityRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<typeof crmActivities.$inferSelect | null> {
  const [row] = await executor
    .select()
    .from(crmActivities)
    .where(
      and(eq(crmActivities.workspaceId, workspaceId), eq(crmActivities.id, id)),
    )
    .limit(1);
  return row ?? null;
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

export async function recordFinancialTransactionRestSyncEvent(
  workspaceId: string,
  row: typeof financialTransactions.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "financial_transaction",
    entityId: row.id,
    operation,
    payload: financialTransactionSnapshot(row),
    mutationId: `rest:financial_transaction:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordEmailThreadRestSyncEvent(
  workspaceId: string,
  row: typeof emailThreads.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "email_thread",
    entityId: row.id,
    operation,
    payload: emailThreadSnapshot(row),
    mutationId: `rest:email_thread:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordEmailThreadCommentRestSyncEvent(
  workspaceId: string,
  row: typeof emailThreadComments.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "email_thread_comment",
    entityId: row.id,
    operation,
    payload: emailThreadCommentSnapshot(row),
    mutationId: `rest:email_thread_comment:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
  });
}

export async function recordRecurringTaskRestSyncEvent(
  workspaceId: string,
  row: typeof recurringTasks.$inferSelect,
  operation: SyncOperation,
): Promise<void> {
  await recordRestEntitySyncEvent({
    workspaceId,
    entity: "recurring_task",
    entityId: row.id,
    operation,
    payload: recurringTaskSnapshot(row),
    mutationId: `rest:recurring_task:${row.id}:${operation}:${row.updatedAt.getTime()}:${crypto.randomUUID()}`,
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

function parseOptionalDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" || value.length === 0) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseOptionalNullableDate(value: unknown): Date | null | undefined {
  if (value === null) return null;
  return parseOptionalDate(value);
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
  "RELATED_CONTACT_NOT_FOUND",
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
  "INVALID_FINANCIAL_TRANSACTION",
  "INVALID_EMAIL_THREAD",
  "INVALID_EMAIL_THREAD_COMMENT",
  "INVALID_RECURRING_TASK",
  "INVALID_TASK_COMMENT",
  "INVALID_TASK_ACTIVITY",
  "INVALID_CONTACT_RELATIONSHIP",
  "INVALID_CRM_RELATIONSHIP_LABEL",
  "INVALID_CRM_GROUP",
  "INVALID_CRM_GROUP_MEMBER",
  "INVALID_CRM_ACTIVITY",
  "INVALID_NOTE_BODY",
  "INVALID_OCCURRED_AT",
  "SELF_RELATIONSHIP",
  "RELATIONSHIP_EXISTS",
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
  number: "number",
  key: "key",
  name: "name",
  summary: "summary",
  phone: "phone",
  email: "email",
  emails: "emails",
  phones: "phones",
  website: "website",
  address: "address",
  city: "city",
  postal_code: "postalCode",
  country: "country",
  region: "region",
  latitude: "latitude",
  longitude: "longitude",
  size: "size",
  social_accounts: "socialAccounts",
  chamber_of_commerce: "chamberOfCommerce",
  tax_number: "taxNumber",
  avatar_storage_key: "avatarStorageKey",
  avatar_content_type: "avatarContentType",
  sort_order: "sortOrder",
  notes: "notes",
  moneybird_contact_id: "moneybirdContactId",
};
const contactKeys = {
  number: "number",
  key: "key",
  organization_id: "organizationId",
  name: "name",
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  emails: "emails",
  title: "title",
  summary: "summary",
  sort_order: "sortOrder",
  phone: "phone",
  phones: "phones",
  role: "role",
  notes: "notes",
  address: "address",
  city: "city",
  postal_code: "postalCode",
  country: "country",
  region: "region",
  latitude: "latitude",
  longitude: "longitude",
  social_accounts: "socialAccounts",
  birthday: "birthday",
  languages: "languages",
  avatar_storage_key: "avatarStorageKey",
  avatar_content_type: "avatarContentType",
};

function normalizeOrganizationSyncPayload(
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
  if (typeof next.emails === "string") {
    try {
      next.emails = JSON.parse(next.emails);
    } catch {
      next.emails = [];
    }
  }
  if (typeof next.phones === "string") {
    try {
      next.phones = JSON.parse(next.phones);
    } catch {
      next.phones = [];
    }
  }
  return next;
}

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
  if (typeof next.emails === "string") {
    try {
      next.emails = JSON.parse(next.emails);
    } catch {
      next.emails = [];
    }
  }
  if (typeof next.phones === "string") {
    try {
      next.phones = JSON.parse(next.phones);
    } catch {
      next.phones = [];
    }
  }
  if (typeof next.languages === "string") {
    try {
      next.languages = JSON.parse(next.languages);
    } catch {
      next.languages = [];
    }
  }
  return next;
}

const letterKeys = {
  number: "number", project_id: "projectId", organization_id: "organizationId",
  contact_id: "contactId", title: "title", icon: "icon", context: "context",
  status: "status", due_date: "dueDate", received_date: "receivedDate",
  direction: "direction", original_filename: "originalFilename",
  storage_key: "storageKey", content_type: "contentType", byte_size: "byteSize",
  checksum: "checksum", content_etag: "contentEtag",
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
  moneybird_financial_account_id: "moneybirdFinancialAccountId",
  moneybird_last_synced_at: "moneybirdLastSyncedAt",
  avatar_storage_key: "avatarStorageKey",
  avatar_content_type: "avatarContentType",
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
  description: "description",
  project_id: "projectId",
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
  format: "format",
  location: "location",
  location_organization_id: "locationOrganizationId",
  project_id: "projectId",
  organization_id: "organizationId",
  attendee_contact_ids: "attendeeContactIds",
  start_at: "startAt",
  end_at: "endAt",
  tracked_minutes: "trackedMinutes",
  tracked_duration_seconds: "trackedDurationSeconds",
  sort_order: "sortOrder",
  acknowledge_inbox_update: "acknowledgeInboxUpdate",
  inbox_updated_at: "inboxUpdatedAt",
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
const taskActivityKeys = {
  task_id: "taskId",
  type: "type",
  actor_user_id: "actorUserId",
  actor_contact_id: "actorContactId",
  actor_email: "actorEmail",
  actor_name: "actorName",
  data: "data",
};
const contactRelationshipKeys = {
  type: "type",
  note: "note",
};
const crmRelationshipLabelKeys = {
  side_a_label: "sideALabel",
  side_a_slug: "sideASlug",
  side_b_label: "sideBLabel",
  side_b_slug: "sideBSlug",
  color: "color",
  sort_order: "sortOrder",
};
const crmGroupKeys = {
  name: "name",
  description: "description",
  color: "color",
  icon: "icon",
  sort_order: "sortOrder",
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
const financialTransactionKeys = {
  bank_account_id: "bankAccountId",
  organization_id: "organizationId",
  project_id: "projectId",
  category_id: "categoryId",
  goal_id: "goalId",
  recurring_id: "recurringId",
  notes: "notes",
  display_name: "displayName",
  booked_on: "bookedOn",
  amount_cents: "amountCents",
  currency: "currency",
  payee: "payee",
  counterparty: "counterparty",
  memo: "memo",
  balance_after_cents: "balanceAfterCents",
  external_id: "externalId",
  fingerprint: "fingerprint",
  source_code: "sourceCode",
  source_type: "sourceType",
  raw: "raw",
  import_batch_id: "importBatchId",
};
const emailThreadKeys = {
  inbox_id: "inboxId",
  thread_key: "threadKey",
  number: "number",
  organization_id: "organizationId",
  contact_id: "contactId",
  assignee_id: "assigneeId",
  project_id: "projectId",
  status: "status",
  priority: "priority",
  due_date: "dueDate",
  acknowledge_inbox_update: "acknowledgeInboxUpdate",
  inbox_updated_at: "inboxUpdatedAt",
};
const emailThreadCommentKeys = {
  inbox_id: "inboxId",
  thread_key: "threadKey",
  email_thread_id: "emailThreadId",
  body: "body",
  author: "author",
};
const recurringTaskKeys = {
  title: "title",
  description: "description",
  project_id: "projectId",
  inbox: "inbox",
  cron_expression: "cronExpression",
  enabled: "enabled",
  next_run_at: "nextRunAt",
  last_run_at: "lastRunAt",
  last_task_id: "lastTaskId",
};
const mentionKeys = {
  user_id: "userId",
  source_type: "sourceType",
  source_id: "sourceId",
  excerpt: "excerpt",
  read_at: "readAt",
  created_at: "createdAt",
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

function financialTransactionSnapshot(
  row: typeof financialTransactions.$inferSelect,
) {
  return {
    id: row.id,
    bank_account_id: row.bankAccountId,
    organization_id: row.organizationId,
    project_id: row.projectId,
    category_id: row.categoryId,
    goal_id: row.goalId,
    recurring_id: row.recurringId,
    notes: row.notes,
    display_name: row.displayName,
    booked_on: row.bookedOn,
    amount_cents: row.amountCents,
    currency: row.currency,
    payee: row.payee,
    counterparty: row.counterparty,
    memo: row.memo,
    balance_after_cents: row.balanceAfterCents,
    external_id: row.externalId,
    fingerprint: row.fingerprint,
    source_code: row.sourceCode,
    source_type: row.sourceType,
    raw: row.raw,
    // Never round-trip import_batch_id: batches are local-only (not replicated).
    import_batch_id: null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function emailThreadSnapshot(row: typeof emailThreads.$inferSelect) {
  return {
    id: row.id,
    inbox_id: row.inboxId,
    thread_key: row.threadKey,
    number: row.number,
    organization_id: row.organizationId,
    contact_id: row.contactId,
    assignee_id: row.assigneeId,
    project_id: row.projectId,
    status: row.status,
    priority: row.priority,
    due_date: row.dueDate?.toISOString() ?? null,
    inbox_updated_at: row.inboxUpdatedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function emailThreadCommentSnapshot(
  row: typeof emailThreadComments.$inferSelect,
) {
  return {
    id: row.id,
    email_thread_id: row.emailThreadId,
    body: row.body,
    author: row.author,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function recurringTaskSnapshot(row: typeof recurringTasks.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    project_id: row.projectId,
    inbox: row.inbox,
    cron_expression: row.cronExpression,
    enabled: row.enabled,
    next_run_at: row.nextRunAt.toISOString(),
    last_run_at: row.lastRunAt?.toISOString() ?? null,
    last_task_id: row.lastTaskId,
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
    description: row.description,
    project_id: row.projectId,
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
    format: row.format ?? "video_call",
    location: row.location ?? null,
    location_organization_id: row.locationOrganizationId ?? null,
    project_id: row.projectId,
    organization_id: row.organizationId,
    attendee_contact_ids: JSON.stringify(attendeeIds),
    start_at: row.startAt.toISOString(),
    end_at: row.endAt.toISOString(),
    tracked_minutes: row.trackedMinutes ?? null,
    tracked_duration_seconds: row.trackedDurationSeconds ?? null,
    inbox_updated_at: row.inboxUpdatedAt?.toISOString() ?? null,
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

function taskActivitySnapshot(row: typeof taskActivities.$inferSelect) {
  return {
    id: row.id,
    task_id: row.taskId,
    type: row.type,
    actor_user_id: row.actorUserId,
    actor_contact_id: row.actorContactId,
    actor_email: row.actorEmail,
    actor_name: row.actorName,
    data:
      typeof row.data === "string"
        ? row.data
        : JSON.stringify(row.data ?? {}),
    created_at: row.createdAt.toISOString(),
  };
}

function mentionSnapshot(row: typeof mentions.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    source_type: row.sourceType,
    source_id: row.sourceId,
    excerpt: row.excerpt,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

function contactRelationshipSnapshot(
  row: typeof contactRelationships.$inferSelect,
) {
  return {
    id: row.id,
    from_contact_id: row.fromContactId,
    to_contact_id: row.toContactId,
    type: row.type,
    note: row.note,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function crmRelationshipLabelSnapshot(
  row: typeof crmRelationshipLabels.$inferSelect,
) {
  return {
    id: row.id,
    side_a_label: row.sideALabel,
    side_a_slug: row.sideASlug,
    side_b_label: row.sideBLabel,
    side_b_slug: row.sideBSlug,
    color: row.color,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function crmGroupSnapshot(row: typeof crmGroups.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function crmGroupMemberSnapshot(row: typeof crmGroupMembers.$inferSelect) {
  return {
    id: row.id,
    group_id: row.groupId,
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function crmActivitySnapshot(row: typeof crmActivities.$inferSelect) {
  return {
    id: row.id,
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    kind: row.kind,
    body: row.body,
    body_preview: row.bodyPreview,
    meeting_id: row.meetingId,
    occurred_at: row.occurredAt.toISOString(),
    created_by: row.createdBy,
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

function parseStringIdArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
}

function mapTaskUpsert(
  payload: Record<string, unknown>,
): CreateTaskInput | UpdateTaskInput {
  return {
    projectId: asNullableString(payload.project_id ?? payload.projectId),
    contactId: asNullableString(payload.contact_id ?? payload.contactId),
    assigneeId: asNullableString(payload.assignee_id ?? payload.assigneeId),
    relatedContactIds: parseStringIdArray(
      payload.related_contact_ids ?? payload.relatedContactIds,
    ),
    relatedOrganizationIds: parseStringIdArray(
      payload.related_organization_ids ?? payload.relatedOrganizationIds,
    ),
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
    linkedCommitSha: asNullableString(
      payload.linked_commit_sha ?? payload.linkedCommitSha,
    ),
    habitId: asNullableString(payload.habit_id ?? payload.habitId),
    trackedMinutes: asNullableNumber(
      payload.tracked_minutes ?? payload.trackedMinutes,
    ),
    trackedDurationSeconds: asNullableNumber(
      payload.tracked_duration_seconds ?? payload.trackedDurationSeconds,
    ),
    agentInboxApprovedAt: asNullableString(
      payload.agent_inbox_approved_at ?? payload.agentInboxApprovedAt,
    ),
    acknowledgeInboxUpdate: asBoolean(
      payload.acknowledge_inbox_update ?? payload.acknowledgeInboxUpdate,
    ),
    agentCreatedAt: asNullableString(
      payload.agent_created_at ?? payload.agentCreatedAt,
    ),
    inboxUpdatedAt: asNullableString(
      payload.inbox_updated_at ?? payload.inboxUpdatedAt,
    ),
  };
}

export type ApplySyncChangeOptions = {
  /**
   * When applying a habit update, collects task side-effects (renames, project
   * moves, ensure) so callers can emit task sync_events.
   */
  habitTaskChangesOut?: HabitTaskSyncChange[];
};

export async function applySyncChange(
  workspaceId: string,
  change: SyncChange,
  executor: DbExecutor = db,
  options?: ApplySyncChangeOptions,
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
          relatedContactIds: input.relatedContactIds,
          relatedOrganizationIds: input.relatedOrganizationIds,
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
          linkedCommitSha: input.linkedCommitSha,
          habitId: input.habitId,
          trackedMinutes: input.trackedMinutes,
          trackedDurationSeconds: input.trackedDurationSeconds,
          agentCreatedAt: input.agentCreatedAt,
          inboxUpdatedAt: input.inboxUpdatedAt,
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
      const payload = normalizeOrganizationSyncPayload(
        camelizePayload(change.payload, organizationKeys),
      );
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
        const parsed = updateContactSchema.safeParse(payload);
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

    case "financial_transaction": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const existing = await financeService.getTransactionById(
          workspaceId,
          change.entity_id,
          executor,
        );
        if (!existing) return null;
        await financeService.batchDeleteTransactions(
          workspaceId,
          [change.entity_id],
          executor,
        );
        return financialTransactionSnapshot(existing);
      }
      const existing = await financeService.getTransactionById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(
        change.payload,
        financialTransactionKeys,
      );
      if (!existing) {
        if (change.operation === "patch") return null;
        const row = await financeService.insertTransactionFromSync(
          workspaceId,
          change.entity_id,
          payload,
          executor,
        );
        if (!row) throw new Error("INVALID_FINANCIAL_TRANSACTION");
        return financialTransactionSnapshot(row);
      }
      const parsed = updateFinancialTransactionSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_FINANCIAL_TRANSACTION");
      const row = await financeService.updateTransaction(
        workspaceId,
        change.entity_id,
        parsed.data,
        executor,
      );
      if (row === "account_not_found") {
        throw new Error("INVALID_FINANCIAL_TRANSACTION");
      }
      return row ? financialTransactionSnapshot(row) : null;
    }

    case "email_thread": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const existing = await emailThreadsService.getEmailThreadById(
          workspaceId,
          change.entity_id,
          executor,
        );
        if (!existing) return null;
        await emailThreadsService.deleteEmailThreadLocal(
          workspaceId,
          existing.inboxId,
          existing.threadKey,
          executor,
        );
        return emailThreadSnapshot(existing);
      }
      const payload = camelizePayload(change.payload, emailThreadKeys);
      const inboxId =
        typeof payload.inboxId === "string" ? payload.inboxId.trim() : "";
      const threadKey =
        typeof payload.threadKey === "string" ? payload.threadKey.trim() : "";
      if (!inboxId || !threadKey) throw new Error("INVALID_EMAIL_THREAD");
      const parsed = updateEmailThreadMetadataSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_EMAIL_THREAD");
      const preferredNumber = asNumber(payload.number);
      const meta = await emailThreadsService.updateEmailThreadMetadata(
        workspaceId,
        inboxId,
        threadKey,
        parsed.data,
        executor,
        change.entity_id,
        preferredNumber,
      );
      if (!meta) return null;
      const row = await emailThreadsService.getEmailThreadById(
        workspaceId,
        meta.id,
        executor,
      );
      return row ? emailThreadSnapshot(row) : null;
    }

    case "email_thread_comment": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const existing = await emailThreadsService.getEmailThreadCommentRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        if (!existing || existing.deletedAt) return null;
        const ok = await emailThreadsService.deleteEmailThreadComment(
          workspaceId,
          change.entity_id,
          executor,
        );
        if (!ok) return null;
        const row = await emailThreadsService.getEmailThreadCommentRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? emailThreadCommentSnapshot(row) : null;
      }
      const existing = await emailThreadsService.getEmailThreadCommentRow(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, emailThreadCommentKeys);
      if (existing && !existing.deletedAt) {
        const parsed = updateEmailThreadCommentSchema.safeParse({
          body: payload.body,
        });
        if (!parsed.success) throw new Error("INVALID_EMAIL_THREAD_COMMENT");
        const updated = await emailThreadsService.updateEmailThreadComment(
          workspaceId,
          change.entity_id,
          parsed.data.body,
          executor,
        );
        if (!updated) return null;
        const row = await emailThreadsService.getEmailThreadCommentRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? emailThreadCommentSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const inboxId =
        typeof payload.inboxId === "string" ? payload.inboxId.trim() : "";
      const threadKey =
        typeof payload.threadKey === "string" ? payload.threadKey.trim() : "";
      const body =
        typeof payload.body === "string" ? payload.body.trim() : "";
      if (!inboxId || !threadKey || !body) {
        throw new Error("INVALID_EMAIL_THREAD_COMMENT");
      }
      const author =
        payload.author === "agent" || payload.author === "user"
          ? payload.author
          : "user";
      await emailThreadsService.createEmailThreadComment(
        workspaceId,
        inboxId,
        threadKey,
        { body, author },
        change.entity_id,
        executor,
        {
          emailThreadId: asString(
            payload.emailThreadId ?? change.payload.email_thread_id,
          ),
        },
      );
      const row = await emailThreadsService.getEmailThreadCommentRow(
        workspaceId,
        change.entity_id,
        executor,
      );
      return row ? emailThreadCommentSnapshot(row) : null;
    }

    case "recurring_task": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await recurringTaskService.deleteRecurringTask(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? recurringTaskSnapshot(row) : null;
      }
      const existing = await recurringTaskService.getRecurringTaskById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, recurringTaskKeys);
      const runnerState = {
        nextRunAt: parseOptionalDate(payload.nextRunAt),
        lastRunAt: parseOptionalNullableDate(payload.lastRunAt),
        lastTaskId: asNullableString(payload.lastTaskId),
      };
      const hasRunnerState =
        runnerState.nextRunAt !== undefined ||
        runnerState.lastRunAt !== undefined ||
        runnerState.lastTaskId !== undefined;
      if (existing && !existing.deletedAt) {
        const parsed = updateRecurringTaskSchema.safeParse(payload);
        if (parsed.success) {
          const updated = await recurringTaskService.updateRecurringTask(
            workspaceId,
            change.entity_id,
            parsed.data,
            executor,
          );
          if (!updated) return null;
        } else if (!hasRunnerState) {
          throw new Error("INVALID_RECURRING_TASK");
        }
        if (hasRunnerState) {
          await recurringTaskService.applyRecurringTaskSyncState(
            workspaceId,
            change.entity_id,
            runnerState,
            executor,
          );
        }
        const row = await recurringTaskService.getRecurringTaskById(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? recurringTaskSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = createRecurringTaskSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_RECURRING_TASK");
      const created = await recurringTaskService.createRecurringTask(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      if (hasRunnerState) {
        await recurringTaskService.applyRecurringTaskSyncState(
          workspaceId,
          created.id,
          runnerState,
          executor,
        );
      }
      const row = await recurringTaskService.getRecurringTaskById(
        workspaceId,
        created.id,
        executor,
      );
      return row ? recurringTaskSnapshot(row) : null;
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
        const updatePayload: Record<string, unknown> = { ...payload };
        if (updatePayload.cadenceAnchorYmd !== undefined) {
          updatePayload.nextDueYmd = updatePayload.cadenceAnchorYmd;
          delete updatePayload.cadenceAnchorYmd;
        }
        const parsed = updateHabitSchema.safeParse(updatePayload);
        if (!parsed.success) throw new Error("INVALID_HABIT");
        const updated = await habitService.updateHabit(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        if (!updated) return null;
        if (options?.habitTaskChangesOut) {
          options.habitTaskChangesOut.push(...updated.changedTasks);
        }
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

    case "task_activity": {
      const existing = await taskActivityService.getTaskActivityRow(
        workspaceId,
        change.entity_id,
        executor,
      );
      if (existing) {
        return taskActivitySnapshot(existing);
      }
      if (change.operation === "patch" || change.operation === "delete") {
        return null;
      }
      const payload = camelizePayload(change.payload, taskActivityKeys);
      const taskId =
        typeof payload.taskId === "string" ? payload.taskId.trim() : "";
      let data: Record<string, unknown> = {};
      if (typeof payload.data === "string") {
        try {
          const parsed = JSON.parse(payload.data);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            data = parsed as Record<string, unknown>;
          }
        } catch {
          data = {};
        }
      } else if (
        payload.data &&
        typeof payload.data === "object" &&
        !Array.isArray(payload.data)
      ) {
        data = payload.data as Record<string, unknown>;
      }
      const parsed = createTaskActivitySchema.safeParse({
        type: payload.type,
        data,
      });
      if (!taskId || !parsed.success) throw new Error("INVALID_TASK_ACTIVITY");
      const actorUserId =
        typeof payload.actorUserId === "string" ? payload.actorUserId : null;
      const actorContactId =
        typeof payload.actorContactId === "string"
          ? payload.actorContactId
          : null;
      const row = await taskActivityService.createClientTaskActivity(
        workspaceId,
        taskId,
        parsed.data.type,
        parsed.data.data ?? {},
        actorContactId
          ? { userId: null, contactId: actorContactId, kind: "contact" }
          : actorUserId
            ? { userId: actorUserId, kind: "user" }
            : { userId: null, kind: "agent" },
        executor,
        change.entity_id,
      );
      return row ? taskActivitySnapshot(row) : null;
    }

    case "contact_relationship": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const ok = await crmGroupsService.deleteContactRelationship(
          workspaceId,
          change.entity_id,
          executor,
        );
        if (!ok) return null;
        const row = await loadContactRelationshipRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? contactRelationshipSnapshot(row) : null;
      }
      const existing = await crmGroupsService.getContactRelationshipById(
        workspaceId,
        change.entity_id,
        executor,
      );
      if (existing) {
        const parsed = updateContactRelationshipSchema.safeParse(
          camelizePayload(change.payload, contactRelationshipKeys),
        );
        if (!parsed.success) throw new Error("INVALID_CONTACT_RELATIONSHIP");
        const row = await crmGroupsService.updateContactRelationship(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        if (!row) return null;
        const dbRow = await loadContactRelationshipRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return dbRow ? contactRelationshipSnapshot(dbRow) : null;
      }
      if (change.operation === "patch") return null;
      const fromContactId = asString(
        change.payload.from_contact_id ?? change.payload.fromContactId,
      );
      const parsed = contactRelationshipInputSchema.safeParse({
        toContactId:
          change.payload.to_contact_id ?? change.payload.toContactId,
        type: change.payload.type,
        note: change.payload.note,
      });
      if (!fromContactId || !parsed.success) {
        throw new Error("INVALID_CONTACT_RELATIONSHIP");
      }
      const row = await crmGroupsService.createContactRelationship(
        workspaceId,
        fromContactId,
        parsed.data,
        change.entity_id,
        executor,
      );
      const dbRow = await loadContactRelationshipRow(
        workspaceId,
        row.id,
        executor,
      );
      return dbRow ? contactRelationshipSnapshot(dbRow) : null;
    }

    case "crm_relationship_label": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const ok = await crmRelationshipLabelsService.deleteCrmRelationshipLabel(
          workspaceId,
          change.entity_id,
          executor,
        );
        if (!ok) return null;
        const row = await loadCrmRelationshipLabelRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? crmRelationshipLabelSnapshot(row) : null;
      }
      const existing = await crmRelationshipLabelsService.getCrmRelationshipLabelById(
        workspaceId,
        change.entity_id,
        executor,
      );
      if (existing) {
        const parsed = updateCrmRelationshipLabelSchema.safeParse(
          camelizePayload(change.payload, crmRelationshipLabelKeys),
        );
        if (!parsed.success) throw new Error("INVALID_CRM_RELATIONSHIP_LABEL");
        const row = await crmRelationshipLabelsService.updateCrmRelationshipLabel(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        if (!row) return null;
        const dbRow = await loadCrmRelationshipLabelRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return dbRow ? crmRelationshipLabelSnapshot(dbRow) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = crmRelationshipLabelInputSchema.safeParse(
        camelizePayload(change.payload, crmRelationshipLabelKeys),
      );
      if (!parsed.success) throw new Error("INVALID_CRM_RELATIONSHIP_LABEL");
      const row = await crmRelationshipLabelsService.createCrmRelationshipLabel(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      const dbRow = await loadCrmRelationshipLabelRow(
        workspaceId,
        row.id,
        executor,
      );
      return dbRow ? crmRelationshipLabelSnapshot(dbRow) : null;
    }

    case "crm_group": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const ok = await crmGroupsService.deleteCrmGroup(
          workspaceId,
          change.entity_id,
          executor,
        );
        if (!ok) return null;
        const row = await loadCrmGroupRow(workspaceId, change.entity_id, executor);
        return row ? crmGroupSnapshot(row) : null;
      }
      const existing = await crmGroupsService.getCrmGroupById(
        workspaceId,
        change.entity_id,
        executor,
      );
      if (existing) {
        const parsed = updateCrmGroupSchema.safeParse(
          camelizePayload(change.payload, crmGroupKeys),
        );
        if (!parsed.success) throw new Error("INVALID_CRM_GROUP");
        const row = await crmGroupsService.updateCrmGroup(
          workspaceId,
          change.entity_id,
          parsed.data,
          executor,
        );
        if (!row) return null;
        const dbRow = await loadCrmGroupRow(workspaceId, change.entity_id, executor);
        return dbRow ? crmGroupSnapshot(dbRow) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = crmGroupInputSchema.safeParse(
        camelizePayload(change.payload, crmGroupKeys),
      );
      if (!parsed.success) throw new Error("INVALID_CRM_GROUP");
      const row = await crmGroupsService.createCrmGroup(
        workspaceId,
        parsed.data,
        change.entity_id,
        executor,
      );
      const dbRow = await loadCrmGroupRow(workspaceId, row.id, executor);
      return dbRow ? crmGroupSnapshot(dbRow) : null;
    }

    case "crm_group_member": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const groupId = asString(
          change.payload.group_id ?? change.payload.groupId,
        );
        if (!groupId) throw new Error("INVALID_CRM_GROUP_MEMBER");
        const ok = await crmGroupsService.removeCrmGroupMember(
          workspaceId,
          groupId,
          change.entity_id,
          executor,
        );
        if (!ok) return null;
        const row = await loadCrmGroupMemberRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? crmGroupMemberSnapshot(row) : null;
      }
      const existing = await crmGroupsService.getCrmGroupMemberById(
        workspaceId,
        change.entity_id,
        executor,
      );
      if (existing) {
        const dbRow = await loadCrmGroupMemberRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return dbRow ? crmGroupMemberSnapshot(dbRow) : null;
      }
      if (change.operation === "patch") return null;
      const groupId = asString(
        change.payload.group_id ?? change.payload.groupId,
      );
      const parsed = crmGroupMemberInputSchema.safeParse({
        subjectType:
          change.payload.subject_type ?? change.payload.subjectType,
        subjectId: change.payload.subject_id ?? change.payload.subjectId,
      });
      if (!groupId || !parsed.success) throw new Error("INVALID_CRM_GROUP_MEMBER");
      const row = await crmGroupsService.addCrmGroupMember(
        workspaceId,
        groupId,
        parsed.data,
        change.entity_id,
        executor,
      );
      const dbRow = await loadCrmGroupMemberRow(workspaceId, row.id, executor);
      return dbRow ? crmGroupMemberSnapshot(dbRow) : null;
    }

    case "crm_activity": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const ok = await crmActivitiesService.softDeleteCrmActivity(
          workspaceId,
          change.entity_id,
          executor,
        );
        if (!ok) return null;
        const row = await loadCrmActivityRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? crmActivitySnapshot(row) : null;
      }
      const kind = asString(change.payload.kind) ?? "note";
      const subjectType = asString(
        change.payload.subject_type ?? change.payload.subjectType,
      );
      const subjectId = asString(
        change.payload.subject_id ?? change.payload.subjectId,
      );
      if (kind === "meeting") {
        const meetingId = asString(
          change.payload.meeting_id ?? change.payload.meetingId,
        );
        const occurredAt = asString(
          change.payload.occurred_at ?? change.payload.occurredAt,
        );
        if (!subjectType || !subjectId || !meetingId || !occurredAt) {
          throw new Error("INVALID_CRM_ACTIVITY");
        }
        await crmActivitiesService.upsertMeetingKindCrmActivity(
          workspaceId,
          {
            id: change.entity_id,
            subjectType: subjectType as "contact" | "organization",
            subjectId,
            meetingId,
            occurredAt,
            deletedAt: asNullableString(
              change.payload.deleted_at ?? change.payload.deletedAt,
            ),
          },
          executor,
        );
        const dbRow = await loadCrmActivityRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return dbRow ? crmActivitySnapshot(dbRow) : null;
      }
      const existing = await crmActivitiesService.getCrmActivityById(
        workspaceId,
        change.entity_id,
        executor,
      );
      if (existing) {
        const dbRow = await loadCrmActivityRow(
          workspaceId,
          change.entity_id,
          executor,
        );
        return dbRow ? crmActivitySnapshot(dbRow) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = createCrmActivityNoteSchema.safeParse({
        kind: "note",
        body: change.payload.body,
        occurredAt: change.payload.occurred_at ?? change.payload.occurredAt,
      });
      if (!subjectType || !subjectId || !parsed.success) {
        throw new Error("INVALID_CRM_ACTIVITY");
      }
      const row = await crmActivitiesService.createCrmActivityNote(
        workspaceId,
        {
          subjectType: subjectType as "contact" | "organization",
          subjectId,
        },
        parsed.data,
        asNullableString(
          change.payload.created_by ?? change.payload.createdBy,
        ),
        change.entity_id,
        executor,
      );
      const dbRow = await loadCrmActivityRow(workspaceId, row.id, executor);
      return dbRow ? crmActivitySnapshot(dbRow) : null;
    }

    case "mention": {
      if (change.operation === "delete") {
        return null;
      }
      const existing = await circleService.getMentionById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const payload = camelizePayload(change.payload, mentionKeys);
      if (existing) {
        if (payload.readAt != null || change.payload.read_at != null) {
          const row = await circleService.markMentionRead(
            workspaceId,
            change.entity_id,
            executor,
          );
          return row ? mentionSnapshot(row) : mentionSnapshot(existing);
        }
        return mentionSnapshot(existing);
      }
      if (change.operation === "patch") return null;
      const sourceType =
        typeof payload.sourceType === "string" ? payload.sourceType.trim() : "";
      const sourceId =
        typeof payload.sourceId === "string" ? payload.sourceId.trim() : "";
      if (!sourceType || !sourceId) throw new Error("INVALID_MENTION");
      const row = await circleService.createMention(
        workspaceId,
        {
          userId:
            typeof payload.userId === "string" || payload.userId === null
              ? (payload.userId as string | null)
              : undefined,
          sourceType,
          sourceId,
          excerpt:
            typeof payload.excerpt === "string" || payload.excerpt === null
              ? (payload.excerpt as string | null)
              : undefined,
          readAt:
            typeof payload.readAt === "string" || payload.readAt === null
              ? (payload.readAt as string | null)
              : undefined,
        },
        change.entity_id,
        executor,
      );
      return mentionSnapshot(row);
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
        const eventMutationId = `${mutation.id}:${change.entity}:${change.entity_id}`;
        const habitTaskChangesOut: HabitTaskSyncChange[] = [];
        await applySyncChange(input.workspaceId, change, tx, {
          habitTaskChangesOut,
        });
        await recordSyncEvent({
          workspaceId: input.workspaceId,
          mutationId: eventMutationId,
          deviceId: input.deviceId,
          entity: change.entity,
          entityId: change.entity_id,
          operation: change.operation,
          payload: change.payload,
        }, tx);
        if (change.entity === "meeting") {
          await appendMeetingDerivedCrmActivitySyncEvents(
            input.workspaceId,
            change.entity_id,
            eventMutationId,
            input.deviceId,
            tx,
          );
        }
        if (change.entity === "habit") {
          await appendHabitDerivedTaskSyncEvents(
            input.workspaceId,
            eventMutationId,
            input.deviceId,
            tx,
            habitTaskChangesOut,
          );
        }
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
    case "contact_relationships":
      return "contact_relationship";
    case "crm_relationship_labels":
      return "crm_relationship_label";
    case "crm_groups":
      return "crm_group";
    case "crm_group_members":
      return "crm_group_member";
    case "crm_activities":
      return "crm_activity";
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
        const habitTaskChangesOut: HabitTaskSyncChange[] = [];
        await applySyncChange(input.workspaceId, change, tx, {
          habitTaskChangesOut,
        });
        const eventMutationId = `${input.mutationId}:${index}`;
        await recordSyncEvent({
          workspaceId: input.workspaceId,
          mutationId: eventMutationId,
          deviceId: input.deviceId,
          entity,
          entityId: entry.id,
          operation: operation === "patch" ? "upsert" : operation,
          payload: change.payload,
        }, tx);
        if (entity === "meeting") {
          await appendMeetingDerivedCrmActivitySyncEvents(
            input.workspaceId,
            entry.id,
            eventMutationId,
            input.deviceId,
            tx,
          );
        }
        if (entity === "habit") {
          await appendHabitDerivedTaskSyncEvents(
            input.workspaceId,
            eventMutationId,
            input.deviceId,
            tx,
            habitTaskChangesOut,
          );
        }
        continue;
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
