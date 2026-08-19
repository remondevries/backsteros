import type {
  ApiKey,
  Area,
  BankAccount,
  Document,
  FinancialCategory,
  FinancialGoal,
  FinancialImportBatch,
  FinancialRecurring,
  FinancialTransaction,
  Project,
  SearchResult,
  Task,
  TaskActivity,
  TaskComment,
} from "@backsteros/contracts";

import type {
  DbApiKey,
  DbArea,
  DbBankAccount,
  DbDocument,
  DbFinancialCategory,
  DbFinancialGoal,
  DbFinancialImportBatch,
  DbFinancialRecurring,
  DbFinancialTransaction,
  DbProject,
  DbTask,
  DbTaskActivity,
  DbTaskComment,
} from "../db/schema.js";
import {
  activityActorName,
  type TaskCommentListRow,
} from "../services/task-comments.js";
import type { TaskActivityListRow } from "../services/task-activities.js";

export function toIso(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }
  return date.toISOString();
}

export function toProject(row: DbProject): Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    summary: row.summary,
    description: row.description,
    organizationId: row.organizationId,
    areaId: row.areaId,
    area: row.area as Project["area"],
    startDate: toIso(row.startDate),
    dueDate: toIso(row.dueDate),
    icon: row.icon,
    color: row.color,
    type: row.type as Project["type"],
    githubRepository: row.githubRepository ?? null,
    localWorkingDirectory: row.localWorkingDirectory ?? null,
    status: row.status as Project["status"],
    priority: row.priority,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toTask(row: DbTask): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    contactId: row.contactId,
    assigneeId: row.assigneeId,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status as Task["status"],
    priority: row.priority,
    sortOrder: row.sortOrder,
    dueDate: toIso(row.dueDate),
    triagedAt: toIso(row.triagedAt),
    inbox: row.inbox,
    links: row.links ?? [],
    agentChatId: row.agentChatId ?? null,
    habitId: row.habitId ?? null,
    completedAt: toIso(row.completedAt),
    agentCreatedAt: toIso(row.agentCreatedAt),
    agentInboxApprovedAt: toIso(row.agentInboxApprovedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toTaskComment(
  row: DbTaskComment | TaskCommentListRow,
): TaskComment {
  const listRow = row as TaskCommentListRow;
  const authorContactId = row.authorContactId ?? null;
  const isGenericAgent = row.authorUserId == null && authorContactId == null;
  return {
    id: row.id,
    taskId: row.taskId,
    parentCommentId: row.parentCommentId ?? null,
    authorUserId: row.authorUserId,
    authorContactId,
    authorEmail: row.authorEmail,
    authorName: isGenericAgent
      ? "Agent"
      : activityActorName({
          actorUserId: row.authorUserId,
          actorContactId: authorContactId,
          actorEmail: row.authorEmail ?? listRow.userEmail ?? listRow.contactEmail ?? null,
          userDisplayName: listRow.userDisplayName ?? null,
          contactName: listRow.contactName ?? null,
        }),
    body: row.body,
    resolvedAt: toIso(row.resolvedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toTaskActivity(
  row: DbTaskActivity | TaskActivityListRow,
): TaskActivity {
  const data =
    row.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};
  const listRow = row as TaskActivityListRow;
  return {
    id: row.id,
    taskId: row.taskId,
    type: row.type as TaskActivity["type"],
    actorUserId: row.actorUserId,
    actorContactId: row.actorContactId ?? null,
    actorEmail: row.actorEmail,
    actorName: activityActorName({
      actorUserId: row.actorUserId,
      actorContactId: row.actorContactId,
      actorEmail: row.actorEmail ?? listRow.userEmail ?? null,
      actorName: row.actorName,
      userDisplayName: listRow.userDisplayName ?? null,
    }),
    data,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toApiKey(row: DbApiKey): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as ApiKey["scopes"],
    contactId: row.contactId ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: toIso(row.revokedAt),
  };
}

export function toDocument(row: DbDocument): Document {
  return {
    id: row.id,
    type: row.type as Document["type"],
    projectId: row.projectId,
    parentId: row.parentId,
    kind: row.kind as Document["kind"],
    icon: row.icon,
    sortOrder: row.sortOrder,
    journalDate: row.journalDate,
    path: row.path,
    title: row.title,
    storageKey: row.storageKey,
    contentType: row.contentType,
    byteSize: row.byteSize,
    checksum: row.checksum,
    snippet: row.snippet,
    contentVersion: row.contentVersion,
    contentEtag: row.contentEtag,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toArea(row: DbArea): Area {
  const parent =
    row.parent === "personal" ||
    row.parent === "business" ||
    row.parent === "clients"
      ? row.parent
      : null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    parent,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toSearchResult(row: DbDocument): SearchResult {
  return {
    id: row.id,
    type: row.type as SearchResult["type"],
    projectId: row.projectId,
    path: row.path,
    title: row.title,
    snippet: row.snippet,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBankAccount(row: DbBankAccount): BankAccount {
  const type =
    row.type === "credit_card" ||
    row.type === "savings" ||
    row.type === "investment" ||
    row.type === "bank_account"
      ? row.type
      : "bank_account";
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    key: row.key,
    name: row.name,
    ibanOrMask: row.ibanOrMask,
    currency: row.currency,
    type,
    avatarStorageKey: row.avatarStorageKey,
    avatarContentType: row.avatarContentType,
    color: row.color ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toFinancialCategory(row: DbFinancialCategory): FinancialCategory {
  const kind =
    row.kind === "income" || row.kind === "expense" || row.kind === "transfer"
      ? row.kind
      : "expense";
  const listing = row.listing === "excluded" ? "excluded" : "regular";
  const budgetCents =
    row.budgetCents == null || row.budgetCents === 0 ? null : row.budgetCents;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    parentId: row.parentId,
    kind,
    listing,
    icon: row.icon ?? null,
    budgetCents,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toFinancialGoal(
  row: DbFinancialGoal,
  savedCents = 0,
): FinancialGoal {
  const listing =
    row.listing === "ready_to_spend" || row.listing === "archive"
      ? row.listing
      : "active";
  const savingMode =
    row.savingMode === "daily" ||
    row.savingMode === "weekly" ||
    row.savingMode === "yearly"
      ? row.savingMode
      : "monthly";
  const goalAmountCents =
    row.goalAmountCents == null || row.goalAmountCents === 0
      ? null
      : row.goalAmountCents;
  const contributionCents =
    row.contributionCents == null || row.contributionCents === 0
      ? null
      : row.contributionCents;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    listing,
    icon: row.icon ?? null,
    goalAmountCents,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    contributionCents,
    savingMode,
    savedCents: Number.isFinite(savedCents) ? Math.trunc(savedCents) : 0,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toFinancialRecurring(
  row: DbFinancialRecurring,
): FinancialRecurring {
  const amountCents =
    row.amountCents == null || row.amountCents === 0 ? null : row.amountCents;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    icon: row.icon ?? null,
    categoryId: row.categoryId ?? null,
    amountCents,
    nextDate: row.nextDate ?? null,
    archived: Boolean(row.archived),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toFinancialImportBatch(
  row: DbFinancialImportBatch,
): FinancialImportBatch {
  const dialect =
    row.dialect === "ing_nl" ||
    row.dialect === "amex_nl" ||
    row.dialect === "unknown"
      ? row.dialect
      : "unknown";
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    bankAccountId: row.bankAccountId,
    originalFilename: row.originalFilename,
    storageKey: row.storageKey,
    dialect,
    rowCount: row.rowCount,
    insertedCount: row.insertedCount,
    duplicateCount: row.duplicateCount,
    errorCount: row.errorCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toFinancialTransaction(
  row: DbFinancialTransaction,
): FinancialTransaction {
  const raw =
    row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
      ? Object.fromEntries(
          Object.entries(row.raw as Record<string, unknown>).map(([key, value]) => [
            key,
            value == null ? "" : String(value),
          ]),
        )
      : {};
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    bankAccountId: row.bankAccountId,
    importBatchId: row.importBatchId,
    bookedOn: row.bookedOn,
    amountCents: row.amountCents,
    currency: row.currency,
    payee: row.payee,
    counterparty: row.counterparty,
    memo: row.memo,
    displayName: row.displayName,
    balanceAfterCents: row.balanceAfterCents,
    externalId: row.externalId,
    fingerprint: row.fingerprint,
    sourceCode: row.sourceCode,
    sourceType: row.sourceType,
    raw,
    organizationId: row.organizationId,
    projectId: row.projectId,
    categoryId: row.categoryId,
    goalId: row.goalId,
    recurringId: row.recurringId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
