import { and, eq, isNull } from "drizzle-orm";
import {
  areaInputSchema,
  bankAccountInputSchema,
  cashflowPlannerEntryInputSchema,
  contactInputSchema,
  contactRelationshipInputSchema,
  createCrmActivityNoteSchema,
  createHabitSchema,
  createMeetingSchema,
  createRecurringTaskSchema,
  createTaskActivitySchema,
  crmGroupInputSchema,
  crmGroupMemberInputSchema,
  crmRelationshipLabelInputSchema,
  type DocumentType,
  financialCategoryInputSchema,
  financialGoalInputSchema,
  financialRecurringInputSchema,
  letterInputSchema,
  organizationInputSchema,
  updateContactRelationshipSchema,
  updateContactSchema,
  updateCrmGroupSchema,
  updateCrmRelationshipLabelSchema,
  updateEmailThreadCommentSchema,
  updateEmailThreadMetadataSchema,
  updateFinancialTransactionSchema,
  updateHabitSchema,
  updateMeetingSchema,
  updateRecurringTaskSchema,
  updateTaskCommentSchema,
} from "@backsteros/contracts";

import type { ApplySyncChangeOptions, DbExecutor, SyncChange } from "./types.js";
import { db } from "../../db/index.js";
import {
  areaKeys,
  asBoolean,
  asNullableNumber,
  asNullableString,
  asNumber,
  asString,
  bankAccountKeys,
  camelizePayload,
  cashflowPlannerEntryKeys,
  contactKeys,
  contactRelationshipKeys,
  crmGroupKeys,
  crmRelationshipLabelKeys,
  emailThreadCommentKeys,
  emailThreadKeys,
  financialCategoryKeys,
  financialGoalKeys,
  financialRecurringKeys,
  financialTransactionKeys,
  habitKeys,
  isSoftDeletePayload,
  letterKeys,
  mapProjectUpsert,
  mapTaskUpsert,
  meetingKeys,
  mentionKeys,
  normalizeContactSyncPayload,
  normalizeMeetingPayload,
  normalizeOrganizationSyncPayload,
  organizationKeys,
  parseOptionalDate,
  parseOptionalNullableDate,
  recurringTaskKeys,
  taskActivityKeys,
  taskCommentKeys,
} from "./payload-mappers.js";
import * as taskProjectService from "../tasks-projects.js";
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
import { tasks } from "../../db/schema.js";
import * as habitService from "../habits.js";
import { isUniqueViolation } from "../core-replication/soft-unique-conflicts.js";
import * as documentService from "../documents.js";
import * as circleService from "../crm-domain.js";
import * as crmGroupsService from "../crm-groups.js";
import * as financeService from "../finance/finance.js";
import * as emailThreadsService from "../email-threads.js";
import * as recurringTaskService from "../recurring-tasks.js";
import * as meetingService from "../meetings.js";
import * as taskCommentService from "../task-comments.js";
import * as taskActivityService from "../task-activities.js";
import {
  loadContactRelationshipRow,
  loadCrmActivityRow,
  loadCrmGroupMemberRow,
  loadCrmGroupRow,
  loadCrmRelationshipLabelRow,
} from "./rest-sync-events.js";
import * as crmRelationshipLabelsService from "../crm-relationship-labels.js";
import * as crmActivitiesService from "../crm-activities.js";
import * as taskLabelService from "../task-labels.js";
import * as documentPropertyTypeService from "../document-property-types.js";
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
      const projectWriteOptions = options?.peerReplay
        ? {
            updatedAt: options.peerReplay.updatedAt,
            skipVaultSideEffects: true,
          }
        : undefined;

      if (existing) {
        const row = await taskProjectService.updateProject(
          workspaceId,
          change.entity_id,
          input,
          executor,
          projectWriteOptions,
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
          type: input.type,
          provider: input.provider,
          category: input.category,
          githubRepository: input.githubRepository,
          cloudflareZoneId: input.cloudflareZoneId,
          penpotProjectId: input.penpotProjectId,
          localWorkingDirectory: input.localWorkingDirectory,
          developmentLocation: input.developmentLocation,
          productionLocation: input.productionLocation,
          development: input.development,
          production: input.production,
          localLocation: input.localLocation,
          healthCheckMode: input.healthCheckMode,
          healthCheckDomain: input.healthCheckDomain,
          status: input.status,
          priority: input.priority,
          sortOrder: input.sortOrder,
        },
        change.entity_id,
        executor,
        projectWriteOptions,
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
      const taskWriteOptions = options?.peerReplay
        ? {
            updatedAt: options.peerReplay.updatedAt,
            skipActivitySideEffects: true,
          }
        : undefined;

      if (existing) {
        const row = await taskProjectService.updateTask(
          workspaceId,
          change.entity_id,
          input,
          executor,
          undefined,
          taskWriteOptions,
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

      // Soft-unique habit+due forks (leader-first fallback vs twin) must not 500
      // the cloud mutations endpoint — clear the other live row first.
      if (input.habitId && input.dueDate) {
        const conflicts = await executor
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.workspaceId, workspaceId),
              eq(tasks.habitId, input.habitId),
              eq(tasks.dueDate, new Date(input.dueDate)),
              isNull(tasks.deletedAt),
            ),
          );
        for (const conflict of conflicts) {
          if (conflict.id === change.entity_id) continue;
          await taskProjectService.deleteTask(
            workspaceId,
            conflict.id,
            executor,
          );
        }
      }

      try {
        const row = await taskProjectService.createTask(
          workspaceId,
          {
            projectId: input.projectId,
            contactId: input.contactId,
            assigneeId: input.assigneeId,
            relatedContactIds: input.relatedContactIds,
            relatedOrganizationIds: input.relatedOrganizationIds,
            linkedEmailIds: input.linkedEmailIds,
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            sortOrder: input.sortOrder,
            dueDate: input.dueDate,
            dueEndDate: input.dueEndDate,
            followUpDate: input.followUpDate,
            triagedAt: input.triagedAt,
            inbox: input.inbox,
            support: input.support,
            notification: input.notification,
            links: input.links,
            agentChatId: input.agentChatId,
            agentWorkingContactId: input.agentWorkingContactId,
            agentWorkingLabel: input.agentWorkingLabel,
            agentWorkingKind: input.agentWorkingKind,
            linkedCommitShas: input.linkedCommitShas,
            habitId: input.habitId,
            trackedMinutes: input.trackedMinutes,
            trackedDurationSeconds: input.trackedDurationSeconds,
            agentCreatedAt: input.agentCreatedAt,
            inboxUpdatedAt: input.inboxUpdatedAt,
          },
          change.entity_id,
          executor,
          undefined,
          taskWriteOptions,
        );
        return taskSnapshot(row);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "PROJECT_NOT_FOUND"
        ) {
          // Stale/missing project refs must not 500 leader mutations. Prefer the
          // habit's project when present; otherwise create as inbox.
          let projectId: string | null | undefined = null;
          if (input.habitId) {
            const habitRow = await habitService.getHabitRow(
              workspaceId,
              input.habitId,
              executor,
            );
            projectId = habitRow?.projectId ?? null;
          }
          if (projectId && projectId === input.projectId) {
            projectId = null;
          }
          const row = await taskProjectService.createTask(
            workspaceId,
            {
              projectId: projectId ?? undefined,
              contactId: input.contactId,
              assigneeId: input.assigneeId,
              relatedContactIds: input.relatedContactIds,
              relatedOrganizationIds: input.relatedOrganizationIds,
              linkedEmailIds: input.linkedEmailIds,
              title: input.title,
              description: input.description,
              status: input.status,
              priority: input.priority,
              sortOrder: input.sortOrder,
              dueDate: input.dueDate,
              dueEndDate: input.dueEndDate,
              followUpDate: input.followUpDate,
              triagedAt: input.triagedAt,
              inbox: projectId ? input.inbox : true,
              support: input.support,
              notification: input.notification,
              links: input.links,
              agentChatId: input.agentChatId,
              agentWorkingContactId: input.agentWorkingContactId,
              agentWorkingLabel: input.agentWorkingLabel,
              agentWorkingKind: input.agentWorkingKind,
              linkedCommitShas: input.linkedCommitShas,
              habitId: input.habitId,
              trackedMinutes: input.trackedMinutes,
              trackedDurationSeconds: input.trackedDurationSeconds,
              agentCreatedAt: input.agentCreatedAt,
              inboxUpdatedAt: input.inboxUpdatedAt,
            },
            change.entity_id,
            executor,
            undefined,
            taskWriteOptions,
          );
          return taskSnapshot(row);
        }
        if (!isUniqueViolation(error)) throw error;
        // Race: another writer won the soft-unique after our pre-check.
        // Soft-delete losers once more and retry a single time.
        if (input.habitId && input.dueDate) {
          const conflicts = await executor
            .select({ id: tasks.id })
            .from(tasks)
            .where(
              and(
                eq(tasks.workspaceId, workspaceId),
                eq(tasks.habitId, input.habitId),
                eq(tasks.dueDate, new Date(input.dueDate)),
                isNull(tasks.deletedAt),
              ),
            );
          for (const conflict of conflicts) {
            if (conflict.id === change.entity_id) continue;
            await taskProjectService.deleteTask(
              workspaceId,
              conflict.id,
              executor,
            );
          }
          const row = await taskProjectService.createTask(
            workspaceId,
            {
              projectId: input.projectId,
              contactId: input.contactId,
              assigneeId: input.assigneeId,
              relatedContactIds: input.relatedContactIds,
              relatedOrganizationIds: input.relatedOrganizationIds,
              linkedEmailIds: input.linkedEmailIds,
              title: input.title,
              description: input.description,
              status: input.status,
              priority: input.priority,
              sortOrder: input.sortOrder,
              dueDate: input.dueDate,
              dueEndDate: input.dueEndDate,
              followUpDate: input.followUpDate,
              triagedAt: input.triagedAt,
              inbox: input.inbox,
              support: input.support,
              notification: input.notification,
              links: input.links,
              agentChatId: input.agentChatId,
              agentWorkingContactId: input.agentWorkingContactId,
              agentWorkingLabel: input.agentWorkingLabel,
              agentWorkingKind: input.agentWorkingKind,
              linkedCommitShas: input.linkedCommitShas,
              habitId: input.habitId,
              trackedMinutes: input.trackedMinutes,
              trackedDurationSeconds: input.trackedDurationSeconds,
              agentCreatedAt: input.agentCreatedAt,
              inboxUpdatedAt: input.inboxUpdatedAt,
            },
            change.entity_id,
            executor,
            undefined,
            taskWriteOptions,
          );
          return taskSnapshot(row);
        }
        throw error;
      }
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
        const trackedMinutes = asNullableNumber(
          change.payload.tracked_minutes ?? change.payload.trackedMinutes,
        );
        const trackedDurationSeconds = asNullableNumber(
          change.payload.tracked_duration_seconds ??
            change.payload.trackedDurationSeconds,
        );
        const lastTrackedAt = asNullableString(
          change.payload.last_tracked_at ?? change.payload.lastTrackedAt,
        );
        const audience = asString(
          change.payload.audience,
        ) as "group" | "individual" | undefined;
        const row = await documentService.updateDocument(
          workspaceId,
          change.entity_id,
          {
            title,
            path,
            parentId,
            icon,
            sortOrder,
            journalDate,
            ...(audience !== undefined ? { audience } : {}),
            ...(change.payload.project_id !== undefined ||
            change.payload.projectId !== undefined
              ? { projectId: projectId ?? null }
              : {}),
            ...(trackedMinutes !== undefined ? { trackedMinutes } : {}),
            ...(trackedDurationSeconds !== undefined
              ? { trackedDurationSeconds }
              : {}),
            ...(lastTrackedAt !== undefined ? { lastTrackedAt } : {}),
          },
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
      // Keep `portalPasswordHash` here: REST leader writes and peer replication
      // must apply hashes. PowerSync client uploads strip the column earlier
      // (`mapCrudBatch` + PowerSync ingest below) so stale SQLite rows cannot clobber.
      if (existing) {
        const parsed = updateContactSchema.safeParse(payload);
        if (!parsed.success) {
          console.error(
            "INVALID_CONTACT (update)",
            parsed.error.issues.slice(0, 8),
          );
          throw new Error("INVALID_CONTACT");
        }
        const row = await circleService.updateContact(
          workspaceId, change.entity_id, parsed.data, executor,
        );
        if (row && parsed.data.organizationId !== undefined) {
          await crmGroupsService.inheritOrganizationGroupMemberships(
            workspaceId,
            row.id,
            executor,
          );
        }
        return row ? contactSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = contactInputSchema.safeParse(payload);
      if (!parsed.success) {
        console.error(
          "INVALID_CONTACT (create)",
          parsed.error.issues.slice(0, 8),
        );
        throw new Error("INVALID_CONTACT");
      }
      const row = await circleService.createContact(
        workspaceId, parsed.data, change.entity_id, executor,
      );
      await crmGroupsService.inheritOrganizationGroupMemberships(
        workspaceId,
        row.id,
        executor,
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
      // Moneybird sync refreshes amount/settlement/version while keeping
      // user classification (category / org / project / …).
      if (
        payload.moneybirdLedgerRefresh === true ||
        (typeof payload.amountCents === "number" &&
          (payload.sourceCode === "moneybird" ||
            existing.sourceCode === "moneybird"))
      ) {
        const row = await financeService.refreshTransactionLedgerFromSync(
          workspaceId,
          change.entity_id,
          payload,
          executor,
        );
        return row ? financialTransactionSnapshot(row) : null;
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
      for (const key of ["messageParties", "messageParty"] as const) {
        const raw = payload[key];
        if (typeof raw === "string") {
          try {
            payload[key] = JSON.parse(raw);
          } catch {
            throw new Error("INVALID_EMAIL_THREAD");
          }
        }
      }
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
        // Same as upsert: REST/cascade already emitted per-subject deletes.
        // Re-cascading here wipes the sibling org/contact membership on apply
        // (e.g. deduping one Clients contact row also dropped the org).
        const ok = await crmGroupsService.removeCrmGroupMember(
          workspaceId,
          groupId,
          change.entity_id,
          executor,
          { cascade: false },
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
      // Membership sync events already name the intended subject (REST expands
      // org↔contact cascade into separate writes). Re-cascading here fails when
      // a sibling is missing on this core while the primary exists.
      const row = await crmGroupsService.addCrmGroupMember(
        workspaceId,
        groupId,
        parsed.data,
        change.entity_id,
        executor,
        { cascade: false },
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

    case "task_label": {
      const payload = change.payload ?? {};
      if (change.operation === "delete" || isSoftDeletePayload(payload)) {
        const row = await taskLabelService.deleteTaskLabel(
          workspaceId,
          change.entity_id,
          executor,
        );
        if (!row) return null;
        const dbRow = await taskLabelService.getTaskLabelById(
          workspaceId,
          change.entity_id,
          executor,
        );
        return dbRow ? taskLabelService.taskLabelSyncSnapshot(dbRow) : null;
      }
      const name = asString(payload.name);
      const color = asString(payload.color);
      const description =
        payload.description === undefined
          ? undefined
          : asNullableString(payload.description);
      const parentSource =
        payload.parent_id !== undefined ? payload.parent_id : payload.parentId;
      const parentId =
        parentSource === undefined ? undefined : asNullableString(parentSource);
      const isGroup = asBoolean(
        payload.is_group !== undefined ? payload.is_group : payload.isGroup,
      );
      const fields = {
        ...(name !== undefined ? { name } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
      };
      const existing = await taskLabelService.getTaskLabelById(
        workspaceId,
        change.entity_id,
        executor,
      );
      if (existing && !existing.deletedAt) {
        const row = await taskLabelService.updateTaskLabel(
          workspaceId,
          change.entity_id,
          fields,
          executor,
        );
        if (!row) return null;
        const dbRow = await taskLabelService.getTaskLabelById(
          workspaceId,
          change.entity_id,
          executor,
        );
        return dbRow ? taskLabelService.taskLabelSyncSnapshot(dbRow) : null;
      }
      if (!name) throw new Error("INVALID_TASK_LABEL");
      const created = await taskLabelService.createTaskLabel(
        workspaceId,
        {
          id: change.entity_id,
          name,
          ...(color !== undefined ? { color } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
          ...(isGroup !== undefined ? { isGroup } : {}),
        },
        executor,
      );
      if (!created) throw new Error("INVALID_TASK_LABEL");
      const dbRow = await taskLabelService.getTaskLabelById(
        workspaceId,
        created.id,
        executor,
      );
      return dbRow ? taskLabelService.taskLabelSyncSnapshot(dbRow) : null;
    }

    case "document_property_type": {
      const payload = change.payload ?? {};
      if (change.operation === "delete" || isSoftDeletePayload(payload)) {
        const row = await documentPropertyTypeService.deleteDocumentPropertyType(
          workspaceId,
          change.entity_id,
          { confirm: true },
          executor,
        );
        if (!row) return null;
        const dbRow =
          await documentPropertyTypeService.getDocumentPropertyTypeById(
            workspaceId,
            change.entity_id,
            executor,
          );
        return dbRow
          ? documentPropertyTypeService.documentPropertyTypeSyncSnapshot(dbRow)
          : null;
      }
      const rawOptions = payload.options;
      const options = Array.isArray(rawOptions)
        ? rawOptions
        : typeof rawOptions === "string"
          ? (JSON.parse(rawOptions) as unknown)
          : undefined;
      const statusRaw = asString(payload.status);
      const key = asString(payload.key);
      const label = asString(payload.label);
      const kind = asString(payload.kind);
      const existing =
        await documentPropertyTypeService.getDocumentPropertyTypeById(
          workspaceId,
          change.entity_id,
          executor,
        );
      if (existing && !existing.deletedAt) {
        if (
          statusRaw === "active" ||
          statusRaw === "proposed" ||
          statusRaw === "rejected"
        ) {
          await documentPropertyTypeService.setDocumentPropertyTypeStatus(
            workspaceId,
            change.entity_id,
            statusRaw,
            executor,
          );
        }
        const row = await documentPropertyTypeService.updateDocumentPropertyType(
          workspaceId,
          change.entity_id,
          {
            ...(key ? { key } : {}),
            ...(label ? { label } : {}),
            ...(kind ? { kind: kind as never } : {}),
            ...(options !== undefined ? { options: options as never } : {}),
            ...(payload.multiple !== undefined
              ? { multiple: asBoolean(payload.multiple) }
              : {}),
            ...(payload.project_id !== undefined ||
            payload.projectId !== undefined
              ? {
                  projectId: asNullableString(
                    payload.project_id ?? payload.projectId,
                  ),
                }
              : {}),
          },
          executor,
        );
        if (!row) return null;
        const dbRow =
          await documentPropertyTypeService.getDocumentPropertyTypeById(
            workspaceId,
            change.entity_id,
            executor,
          );
        return dbRow
          ? documentPropertyTypeService.documentPropertyTypeSyncSnapshot(dbRow)
          : null;
      }
      if (!key || !label || !kind) {
        throw new Error("INVALID_DOCUMENT_PROPERTY_TYPE");
      }
      const created =
        await documentPropertyTypeService.createDocumentPropertyType(
          workspaceId,
          {
            id: change.entity_id,
            key,
            label,
            kind: kind as never,
            options: (options as never) ?? [],
            multiple: asBoolean(payload.multiple),
            projectId: asNullableString(
              payload.project_id ?? payload.projectId,
            ),
            status:
              statusRaw === "proposed" || statusRaw === "rejected"
                ? statusRaw
                : "active",
            seeded: asBoolean(payload.seeded) === true,
            proposedByContactId: asNullableString(
              payload.proposed_by_contact_id ?? payload.proposedByContactId,
            ),
          },
          executor,
        );
      const dbRow =
        await documentPropertyTypeService.getDocumentPropertyTypeById(
          workspaceId,
          created.id,
          executor,
        );
      return dbRow
        ? documentPropertyTypeService.documentPropertyTypeSyncSnapshot(dbRow)
        : null;
    }
  }
}
