import { and, eq } from "drizzle-orm";

import type { SyncEntity, SyncOperation } from "../../lib/sync-constants.js";
import type { DbExecutor } from "./types.js";
import { db } from "../../db/index.js";
import { appendSyncEvent, recordRestEntitySyncEvent } from "../sync-log.js";
import {
  areas,
  bankAccounts,
  cashflowPlannerEntries,
  contactRelationships,
  contacts,
  crmActivities,
  crmGroupMembers,
  crmGroups,
  crmRelationshipLabels,
  documents,
  emailThreadComments,
  emailThreads,
  financialCategories,
  financialGoals,
  financialRecurrings,
  financialTransactions,
  habits,
  letters,
  meetings,
  mentions,
  organizations,
  projects,
  recurringTasks,
  taskActivities,
  taskComments,
  tasks,
} from "../../db/schema.js";
import {
  areaSnapshot,
  bankAccountSnapshot,
  cashflowPlannerEntrySnapshot,
  contactRelationshipSnapshot,
  contactSnapshot,
  crmActivitySnapshot,
  crmGroupMemberSnapshot,
  crmGroupSnapshot,
  crmRelationshipLabelSnapshot,
  documentSnapshot,
  emailThreadCommentSnapshot,
  emailThreadSnapshot,
  financialCategorySnapshot,
  financialGoalSnapshot,
  financialRecurringSnapshot,
  financialTransactionSnapshot,
  habitSnapshot,
  letterSnapshot,
  meetingSnapshot,
  mentionSnapshot,
  organizationSnapshot,
  projectSnapshot,
  recurringTaskSnapshot,
  taskActivitySnapshot,
  taskCommentSnapshot,
  taskSnapshot,
} from "./snapshots.js";
import * as taskActivityService from "../task-activities.js";
export async function recordSyncEvent(input: {
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
