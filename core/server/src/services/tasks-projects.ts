import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import type {
  CreateApiKeyInput,
  CreateProjectInput,
  CreateTaskInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@backsteros/contracts";
import { shouldClearInboxUpdatedOnUserWrite } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { nudgeDynamicIslandTasksRefresh } from "../lib/dynamic-island-nudge.js";
import {
  areas,
  contacts,
  documents,
  entityCounters,
  habits,
  organizations,
  projects,
  tasks,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  ensureProjectVaultFolders,
  renameProjectVaultFolder,
  rewriteProjectStorageKeyPrefix,
  rewriteProjectVaultWorkingDirectory,
} from "../lib/storage.js";
import * as taskActivityService from "./task-activities.js";
import type { TaskWriteActor } from "./task-activities.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

async function assertWorkspaceReference(
  workspaceId: string,
  id: string | null | undefined,
  table:
    | typeof organizations
    | typeof areas
    | typeof contacts
    | typeof habits,
  code: string,
  executor: DbExecutor,
) {
  if (!id) return;
  const [row] = await executor
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), eq(table.id, id), isNull(table.deletedAt)))
    .limit(1);
  if (!row) throw new Error(code);
}

async function contactDisplayName(
  workspaceId: string,
  contactId: string | null | undefined,
  executor: DbExecutor,
): Promise<string | null> {
  if (!contactId) return null;
  const [row] = await executor
    .select({ name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.id, contactId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const name = row.name?.trim();
  if (name) return name;
  const email = row.email?.trim();
  return email || null;
}

async function projectDisplayName(
  workspaceId: string,
  projectId: string | null | undefined,
  executor: DbExecutor,
): Promise<string | null> {
  if (!projectId) return null;
  const [row] = await executor
    .select({ name: projects.name, key: projects.key })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const name = row.name?.trim();
  if (name) return name;
  const key = row.key?.trim();
  return key || null;
}

function dueDateIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function normalizeRelatedContactIds(
  value: readonly string[] | null | undefined,
): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function relatedContactIdsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

async function assertRelatedContactIds(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor,
) {
  for (const id of ids) {
    await assertWorkspaceReference(
      workspaceId,
      id,
      contacts,
      "RELATED_CONTACT_NOT_FOUND",
      executor,
    );
  }
}

async function relatedContactDisplayNames(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor,
): Promise<string[]> {
  const names: string[] = [];
  for (const id of ids) {
    const name = await contactDisplayName(workspaceId, id, executor);
    if (name) names.push(name);
  }
  return names;
}

function normalizeRelatedOrganizationIds(
  value: readonly string[] | null | undefined,
): string[] {
  return normalizeRelatedContactIds(value);
}

function relatedOrganizationIdsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return relatedContactIdsEqual(a, b);
}

async function assertRelatedOrganizationIds(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor,
) {
  for (const id of ids) {
    await assertWorkspaceReference(
      workspaceId,
      id,
      organizations,
      "RELATED_ORGANIZATION_NOT_FOUND",
      executor,
    );
  }
}

async function organizationDisplayName(
  workspaceId: string,
  organizationId: string | null | undefined,
  executor: DbExecutor,
): Promise<string | null> {
  if (!organizationId) return null;
  const [row] = await executor
    .select({ name: organizations.name })
    .from(organizations)
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        eq(organizations.id, organizationId),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const name = row.name?.trim();
  return name || null;
}

async function relatedOrganizationDisplayNames(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor,
): Promise<string[]> {
  const names: string[] = [];
  for (const id of ids) {
    const name = await organizationDisplayName(workspaceId, id, executor);
    if (name) names.push(name);
  }
  return names;
}

export async function listProjects(
  workspaceId: string,
  filters: {
    organizationId?: string;
    area?: string;
    status?: string;
    type?: string;
  } = {},
  executor: DbExecutor = db,
) {
  const conditions = [eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)];
  if (filters.organizationId) conditions.push(eq(projects.organizationId, filters.organizationId));
  if (filters.area) conditions.push(eq(projects.area, filters.area));
  if (filters.status) conditions.push(eq(projects.status, filters.status));
  if (filters.type) conditions.push(eq(projects.type, filters.type));
  return executor
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(projects.sortOrder, desc(projects.updatedAt));
}

export async function getProjectById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, id),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getProjectByKey(
  workspaceId: string,
  key: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.key, key),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createProject(
  workspaceId: string,
  input: CreateProjectInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const key = input.key.toUpperCase();
  const existing = await getProjectByKey(workspaceId, key, executor);
  if (existing) {
    throw new Error("PROJECT_KEY_EXISTS");
  }
  await assertWorkspaceReference(
    workspaceId,
    input.organizationId,
    organizations,
    "ORGANIZATION_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(workspaceId, input.areaId, areas, "AREA_NOT_FOUND", executor);

  const type = input.type ?? "general";
  if (input.githubRepository && type !== "codebase") {
    throw new Error("GITHUB_REPO_REQUIRES_CODEBASE");
  }

  const [row] = await executor
    .insert(projects)
    .values({
      id,
      workspaceId,
      key,
      name: input.name,
      summary: input.summary ?? null,
      description: input.description ?? null,
      organizationId: input.organizationId ?? null,
      areaId: input.areaId ?? null,
      area: input.area ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      type,
      githubRepository: input.githubRepository ?? null,
      localWorkingDirectory: input.localWorkingDirectory ?? null,
      status: input.status ?? "backlog",
      priority: input.priority ?? 0,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  try {
    const ensured = await ensureProjectVaultFolders(key, undefined, {
      projectType: type,
    });
    // Default agent cwd to the vault project folder when the caller did not
    // supply a local working directory (codebase repos still override this).
    if (!row.localWorkingDirectory?.trim()) {
      const [updated] = await executor
        .update(projects)
        .set({
          localWorkingDirectory: ensured.projectVaultPath,
          updatedAt: new Date(),
        })
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
        .returning();
      if (updated) {
        return updated;
      }
    }
  } catch {
    // Vault may be unset — folder bootstrap happens when storage is configured.
  }

  return row;
}

export async function updateProject(
  workspaceId: string,
  id: string,
  input: UpdateProjectInput,
  executor: DbExecutor = db,
) {
  const existing = await getProjectById(workspaceId, id, executor);
  if (!existing) {
    return null;
  }

  const key =
    input.key !== undefined ? input.key.toUpperCase() : undefined;
  if (key && key !== existing.key) {
    const conflict = await getProjectByKey(workspaceId, key, executor);
    if (conflict) {
      throw new Error("PROJECT_KEY_EXISTS");
    }
  }
  await assertWorkspaceReference(
    workspaceId,
    input.organizationId,
    organizations,
    "ORGANIZATION_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(workspaceId, input.areaId, areas, "AREA_NOT_FOUND", executor);

  const nextType = input.type ?? existing.type;
  if (
    input.githubRepository !== undefined &&
    input.githubRepository !== null &&
    nextType !== "codebase"
  ) {
    throw new Error("GITHUB_REPO_REQUIRES_CODEBASE");
  }

  // Droping codebase type clears any linked repository.
  const githubRepository =
    input.type !== undefined && input.type !== "codebase"
      ? null
      : input.githubRepository;

  const [updatedRow] = await executor
    .update(projects)
    .set({
      key,
      name: input.name,
      summary: input.summary,
      description: input.description,
      organizationId: input.organizationId,
      areaId: input.areaId,
      area: input.area,
      startDate:
        input.startDate === undefined
          ? undefined
          : input.startDate
            ? new Date(input.startDate)
            : null,
      dueDate:
        input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      icon: input.icon,
      color: input.color,
      type: input.type,
      githubRepository,
      localWorkingDirectory: input.localWorkingDirectory,
      status: input.status,
      priority: input.priority,
      sortOrder: input.sortOrder,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
    .returning();

  let row = updatedRow;
  if (!row) {
    return null;
  }

  const keyChanged = Boolean(key && key !== existing.key);

  // Key rename — move the on-disk vault folder and rewrite document storage keys.
  if (keyChanged) {
    try {
      const renamed = await renameProjectVaultFolder(existing.key, row.key);
      if (renamed.renamed && renamed.previousProjectVaultPath) {
        const nextCwd = rewriteProjectVaultWorkingDirectory(
          row.localWorkingDirectory,
          renamed.previousProjectVaultPath,
          renamed.projectVaultPath,
        );
        if (nextCwd && nextCwd !== row.localWorkingDirectory) {
          const [cwdUpdated] = await executor
            .update(projects)
            .set({
              localWorkingDirectory: nextCwd,
              updatedAt: new Date(),
            })
            .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
            .returning();
          if (cwdUpdated) {
            row = cwdUpdated;
          }
        }
      }

      const projectDocs = await executor
        .select({
          id: documents.id,
          storageKey: documents.storageKey,
        })
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.projectId, id),
            eq(documents.type, "project"),
          ),
        );

      for (const doc of projectDocs) {
        const nextKey = rewriteProjectStorageKeyPrefix(
          doc.storageKey,
          existing.key,
          row.key,
        );
        if (!nextKey || nextKey === doc.storageKey) continue;
        await executor
          .update(documents)
          .set({
            storageKey: nextKey,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(documents.workspaceId, workspaceId),
              eq(documents.id, doc.id),
            ),
          );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "PROJECT_VAULT_TARGET_EXISTS"
      ) {
        throw error;
      }
      // Vault may be unset — folder bootstrap still runs below when possible.
    }
  }

  // Keep on-disk vault folders in sync (creates missing areas / .cursor skills).
  try {
    const ensured = await ensureProjectVaultFolders(row.key, undefined, {
      projectType: row.type,
    });
    if (!row.localWorkingDirectory?.trim()) {
      const [updated] = await executor
        .update(projects)
        .set({
          localWorkingDirectory: ensured.projectVaultPath,
          updatedAt: new Date(),
        })
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
        .returning();
      return updated ?? row;
    }
  } catch {
    // Vault may be unset.
  }

  return row;
}

export async function deleteProject(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, id),
        isNull(projects.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listTasks(
  workspaceId: string,
  filters: {
    projectId?: string;
    contactId?: string;
    assigneeId?: string;
    relatedContactId?: string;
    status?: string;
    inbox?: boolean;
  } = {},
  executor: DbExecutor = db,
) {
  const conditions = [
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.deletedAt),
  ];

  if (filters.projectId) conditions.push(eq(tasks.projectId, filters.projectId));
  if (filters.contactId) conditions.push(eq(tasks.contactId, filters.contactId));
  if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId));
  if (filters.relatedContactId) {
    conditions.push(
      sql`${tasks.relatedContactIds} @> ${JSON.stringify([filters.relatedContactId])}::jsonb`,
    );
  }
  if (filters.status) conditions.push(eq(tasks.status, filters.status));
  if (filters.inbox !== undefined) conditions.push(eq(tasks.inbox, filters.inbox));

  return executor
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(tasks.sortOrder, desc(tasks.updatedAt));
}

export async function getTaskById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, id),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

function taskScope(projectId?: string | null, contactId?: string | null) {
  return projectId
    ? `project:${projectId}`
    : contactId
      ? `contact:${contactId}`
      : "__inbox__";
}

/**
 * Allocate the next task number for a scope.
 *
 * Counters can lag behind imported/legacy rows. Always floor allocation at
 * max(existing number)+1 so display IDs like CI-2 are never reused — including
 * soft-deleted and legacy rows.
 */
async function nextTaskNumber(
  workspaceId: string,
  projectId: string | null | undefined,
  contactId: string | null | undefined,
  executor: DbExecutor,
) {
  const scopeId = taskScope(projectId, contactId);
  const scopeFilter = projectId
    ? eq(tasks.projectId, projectId)
    : contactId
      ? and(isNull(tasks.projectId), eq(tasks.contactId, contactId))
      : and(isNull(tasks.projectId), isNull(tasks.contactId));

  const [maxRow] = await executor
    .select({
      maxNumber: sql<number>`coalesce(max(${tasks.number}), 0)`,
    })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), scopeFilter));

  const minNext = Number(maxRow?.maxNumber ?? 0) + 1;

  const [counter] = await executor
    .insert(entityCounters)
    .values({
      workspaceId,
      entity: "task",
      scopeId,
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

async function createTaskWithExecutor(
  workspaceId: string,
  input: CreateTaskInput,
  id: string,
  executor: DbExecutor,
  actor?: TaskWriteActor | null,
  options?: { authKind?: "api_key" | "clerk" },
) {
  if (input.projectId) {
    const project = await getProjectById(workspaceId, input.projectId, executor);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
  }
  await assertWorkspaceReference(
    workspaceId,
    input.contactId,
    contacts,
    "CONTACT_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(
    workspaceId,
    input.assigneeId,
    contacts,
    "ASSIGNEE_NOT_FOUND",
    executor,
  );
  const relatedContactIds = normalizeRelatedContactIds(input.relatedContactIds);
  await assertRelatedContactIds(workspaceId, relatedContactIds, executor);
  const relatedOrganizationIds = normalizeRelatedOrganizationIds(
    input.relatedOrganizationIds,
  );
  await assertRelatedOrganizationIds(
    workspaceId,
    relatedOrganizationIds,
    executor,
  );
  await assertWorkspaceReference(
    workspaceId,
    input.habitId,
    habits,
    "HABIT_NOT_FOUND",
    executor,
  );

  const number = await nextTaskNumber(
    workspaceId,
    input.projectId ?? null,
    input.contactId ?? null,
    executor,
  );
  const status = input.status ?? "ready_to_start";
  const agentInbox =
    options?.authKind === "api_key" || actor?.kind === "agent";
  const agentCreatedAt =
    input.agentCreatedAt !== undefined
      ? input.agentCreatedAt
        ? new Date(input.agentCreatedAt)
        : null
      : agentInbox
        ? new Date()
        : null;
  const inboxUpdatedAt =
    input.inboxUpdatedAt !== undefined
      ? input.inboxUpdatedAt
        ? new Date(input.inboxUpdatedAt)
        : null
      : undefined;

  const [row] = await executor
    .insert(tasks)
    .values({
      id,
      workspaceId,
      projectId: input.projectId ?? null,
      contactId: input.contactId ?? null,
      assigneeId: input.assigneeId ?? null,
      relatedContactIds,
      relatedOrganizationIds,
      number,
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? 0,
      sortOrder: input.sortOrder ?? 0,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      dueEndDate: input.dueEndDate ? new Date(input.dueEndDate) : null,
      triagedAt: input.triagedAt ? new Date(input.triagedAt) : null,
      inbox: input.inbox ?? (!input.projectId && !input.contactId),
      links: input.links ?? [],
      agentChatId: input.agentChatId ?? null,
      habitId: input.habitId ?? null,
      trackedMinutes: input.trackedMinutes ?? null,
      trackedDurationSeconds: input.trackedDurationSeconds ?? null,
      completedAt: status === "completed" ? new Date() : null,
      agentCreatedAt,
      ...(inboxUpdatedAt !== undefined ? { inboxUpdatedAt } : {}),
    })
    .returning();

  if (row) {
    await taskActivityService.recordTaskActivity(
      workspaceId,
      row.id,
      "created",
      { status: row.status },
      actor,
      executor,
    );
    if (row.assigneeId) {
      const toName = await contactDisplayName(
        workspaceId,
        row.assigneeId,
        executor,
      );
      await taskActivityService.recordTaskActivity(
        workspaceId,
        row.id,
        "assignee_changed",
        { from: null, to: row.assigneeId, fromName: null, toName },
        actor,
        executor,
      );
    }
    if (relatedContactIds.length > 0) {
      const toNames = await relatedContactDisplayNames(
        workspaceId,
        relatedContactIds,
        executor,
      );
      await taskActivityService.recordTaskActivity(
        workspaceId,
        row.id,
        "related_contacts_changed",
        { from: [], to: relatedContactIds, fromNames: [], toNames },
        actor,
        executor,
      );
    }
    if (relatedOrganizationIds.length > 0) {
      const toNames = await relatedOrganizationDisplayNames(
        workspaceId,
        relatedOrganizationIds,
        executor,
      );
      await taskActivityService.recordTaskActivity(
        workspaceId,
        row.id,
        "related_organizations_changed",
        { from: [], to: relatedOrganizationIds, fromNames: [], toNames },
        actor,
        executor,
      );
    }
  }

  return row;
}

export async function createTask(
  workspaceId: string,
  input: CreateTaskInput,
  id = newId(),
  executor?: DbExecutor,
  actor?: TaskWriteActor | null,
  options?: { authKind?: "api_key" | "clerk" },
) {
  if (executor) {
    return createTaskWithExecutor(
      workspaceId,
      input,
      id,
      executor,
      actor,
      options,
    );
  }
  return db.transaction((tx) =>
    createTaskWithExecutor(workspaceId, input, id, tx, actor, options),
  );
}

export async function updateTask(
  workspaceId: string,
  id: string,
  input: UpdateTaskInput,
  executor: DbExecutor = db,
  actor?: TaskWriteActor | null,
  options?: { allowAgentInboxApproval?: boolean },
) {
  const existing = await getTaskById(workspaceId, id, executor);
  if (!existing) {
    return null;
  }

  if (input.projectId) {
    const project = await getProjectById(workspaceId, input.projectId, executor);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
  }
  await assertWorkspaceReference(
    workspaceId,
    input.contactId,
    contacts,
    "CONTACT_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(
    workspaceId,
    input.assigneeId,
    contacts,
    "ASSIGNEE_NOT_FOUND",
    executor,
  );
  const nextRelatedContactIds =
    input.relatedContactIds === undefined
      ? undefined
      : normalizeRelatedContactIds(input.relatedContactIds);
  if (nextRelatedContactIds !== undefined) {
    await assertRelatedContactIds(workspaceId, nextRelatedContactIds, executor);
  }
  const nextRelatedOrganizationIds =
    input.relatedOrganizationIds === undefined
      ? undefined
      : normalizeRelatedOrganizationIds(input.relatedOrganizationIds);
  if (nextRelatedOrganizationIds !== undefined) {
    await assertRelatedOrganizationIds(
      workspaceId,
      nextRelatedOrganizationIds,
      executor,
    );
  }
  await assertWorkspaceReference(
    workspaceId,
    input.habitId,
    habits,
    "HABIT_NOT_FOUND",
    executor,
  );

  const nextStatus = input.status ?? existing.status;
  const nextProjectId =
    input.projectId === undefined ? existing.projectId : input.projectId;
  const nextContactId =
    input.contactId === undefined ? existing.contactId : input.contactId;
  const number =
    taskScope(nextProjectId, nextContactId) ===
    taskScope(existing.projectId, existing.contactId)
      ? existing.number
      : await nextTaskNumber(workspaceId, nextProjectId, nextContactId, executor);
  const completedAt =
    nextStatus === "completed"
      ? existing.completedAt ?? new Date()
      : input.status && input.status !== "completed"
        ? null
        : existing.completedAt;

  let agentInboxApprovedAt = existing.agentInboxApprovedAt;
  if (
    input.agentInboxApproved === true &&
    options?.allowAgentInboxApproval &&
    existing.agentCreatedAt &&
    !existing.agentInboxApprovedAt
  ) {
    agentInboxApprovedAt = new Date();
  } else if (
    input.agentInboxApprovedAt &&
    existing.agentCreatedAt &&
    !existing.agentInboxApprovedAt &&
    (options === undefined || options.allowAgentInboxApproval === true)
  ) {
    const parsed = new Date(input.agentInboxApprovedAt);
    if (!Number.isNaN(parsed.getTime())) {
      agentInboxApprovedAt = parsed;
    }
  }

  let inboxUpdatedAt: Date | null | undefined = undefined;
  if (
    shouldClearInboxUpdatedOnUserWrite(input) ||
    input.inboxUpdatedAt === null
  ) {
    inboxUpdatedAt = null;
  } else if (typeof input.inboxUpdatedAt === "string") {
    const parsed = new Date(input.inboxUpdatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      inboxUpdatedAt = parsed;
    }
  }

  const [row] = await executor
    .update(tasks)
    .set({
      projectId: input.projectId,
      contactId: input.contactId,
      assigneeId: input.assigneeId,
      ...(nextRelatedContactIds !== undefined
        ? { relatedContactIds: nextRelatedContactIds }
        : {}),
      ...(nextRelatedOrganizationIds !== undefined
        ? { relatedOrganizationIds: nextRelatedOrganizationIds }
        : {}),
      number,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      sortOrder: input.sortOrder,
      dueDate:
        input.dueDate === undefined
          ? undefined
          : input.dueDate
            ? new Date(input.dueDate)
            : null,
      dueEndDate:
        input.dueEndDate === undefined
          ? undefined
          : input.dueEndDate
            ? new Date(input.dueEndDate)
            : null,
      triagedAt:
        input.triagedAt === undefined
          ? undefined
          : input.triagedAt
            ? new Date(input.triagedAt)
            : null,
      inbox:
        input.inbox ??
        (input.projectId !== undefined || input.contactId !== undefined
          ? !nextProjectId && !nextContactId
          : undefined),
      links: input.links,
      agentChatId: input.agentChatId,
      habitId: input.habitId,
      trackedMinutes: input.trackedMinutes,
      trackedDurationSeconds: input.trackedDurationSeconds,
      completedAt,
      agentInboxApprovedAt,
      ...(inboxUpdatedAt !== undefined ? { inboxUpdatedAt } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)))
    .returning();

  if (row) {
    if (input.status !== undefined && input.status !== existing.status) {
      await taskActivityService.recordTaskActivity(
        workspaceId,
        id,
        "status_changed",
        { from: existing.status, to: input.status },
        actor,
        executor,
      );
      nudgeDynamicIslandTasksRefresh(
        `status:${existing.status}->${input.status}`,
      );
    }
    if (
      input.assigneeId !== undefined &&
      input.assigneeId !== existing.assigneeId
    ) {
      const [fromName, toName] = await Promise.all([
        contactDisplayName(workspaceId, existing.assigneeId, executor),
        contactDisplayName(workspaceId, input.assigneeId, executor),
      ]);
      await taskActivityService.recordTaskActivity(
        workspaceId,
        id,
        "assignee_changed",
        {
          from: existing.assigneeId,
          to: input.assigneeId,
          fromName,
          toName,
        },
        actor,
        executor,
      );
    }
    if (nextRelatedContactIds !== undefined) {
      const existingRelated = normalizeRelatedContactIds(
        existing.relatedContactIds,
      );
      if (!relatedContactIdsEqual(existingRelated, nextRelatedContactIds)) {
        const [fromNames, toNames] = await Promise.all([
          relatedContactDisplayNames(workspaceId, existingRelated, executor),
          relatedContactDisplayNames(
            workspaceId,
            nextRelatedContactIds,
            executor,
          ),
        ]);
        await taskActivityService.recordTaskActivity(
          workspaceId,
          id,
          "related_contacts_changed",
          {
            from: existingRelated,
            to: nextRelatedContactIds,
            fromNames,
            toNames,
          },
          actor,
          executor,
        );
      }
    }
    if (nextRelatedOrganizationIds !== undefined) {
      const existingRelated = normalizeRelatedOrganizationIds(
        existing.relatedOrganizationIds,
      );
      if (
        !relatedOrganizationIdsEqual(
          existingRelated,
          nextRelatedOrganizationIds,
        )
      ) {
        const [fromNames, toNames] = await Promise.all([
          relatedOrganizationDisplayNames(
            workspaceId,
            existingRelated,
            executor,
          ),
          relatedOrganizationDisplayNames(
            workspaceId,
            nextRelatedOrganizationIds,
            executor,
          ),
        ]);
        await taskActivityService.recordTaskActivity(
          workspaceId,
          id,
          "related_organizations_changed",
          {
            from: existingRelated,
            to: nextRelatedOrganizationIds,
            fromNames,
            toNames,
          },
          actor,
          executor,
        );
      }
    }
    if (input.priority !== undefined && input.priority !== existing.priority) {
      await taskActivityService.recordTaskActivity(
        workspaceId,
        id,
        "priority_changed",
        { from: existing.priority, to: input.priority },
        actor,
        executor,
      );
    }
    if (input.dueDate !== undefined) {
      const fromDue = dueDateIso(existing.dueDate);
      const toDue = dueDateIso(
        input.dueDate ? new Date(input.dueDate) : null,
      );
      if (fromDue !== toDue) {
        await taskActivityService.recordTaskActivity(
          workspaceId,
          id,
          "due_date_changed",
          { from: fromDue, to: toDue },
          actor,
          executor,
        );
      }
    }
    if (
      input.projectId !== undefined &&
      input.projectId !== existing.projectId
    ) {
      const [fromName, toName] = await Promise.all([
        projectDisplayName(workspaceId, existing.projectId, executor),
        projectDisplayName(workspaceId, input.projectId, executor),
      ]);
      await taskActivityService.recordTaskActivity(
        workspaceId,
        id,
        "project_changed",
        {
          from: existing.projectId,
          to: input.projectId,
          fromName,
          toName,
        },
        actor,
        executor,
      );
    }
  }

  return row ?? null;
}

export async function deleteTask(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, id),
        isNull(tasks.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listDueTasks(
  workspaceId: string,
  before = new Date(),
  executor: DbExecutor = db,
) {
  return executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        isNull(tasks.completedAt),
        isNotNull(tasks.dueDate),
        lte(tasks.dueDate, before),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(tasks.sortOrder));
}

/**
 * Expanded inbox: triage capture (`inbox`), On Hold / In Review from any
 * project when not due in the future, and overdue open tasks (due before
 * local today, not completed / canceled / duplicated). Matching is refined
 * on clients by calendar day.
 */
export async function listInboxTasks(workspaceId: string, executor: DbExecutor = db) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  return executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        or(
          eq(tasks.inbox, true),
          and(
            inArray(tasks.status, ["on_hold", "in_review"]),
            or(isNull(tasks.dueDate), lt(tasks.dueDate, startOfTomorrow)),
          ),
          and(
            isNotNull(tasks.dueDate),
            lt(tasks.dueDate, startOfToday),
            sql`${tasks.status} not in ('completed', 'canceled', 'duplicated')`,
          ),
          and(
            isNotNull(tasks.agentCreatedAt),
            isNull(tasks.agentInboxApprovedAt),
          ),
        ),
      ),
    )
    .orderBy(asc(tasks.sortOrder), desc(tasks.updatedAt));
}

export async function batchUpdateTasks(
  workspaceId: string,
  ids: string[],
  input: UpdateTaskInput,
  actor?: TaskWriteActor | null,
) {
  if (ids.length === 0) return [];
  return db.transaction(async (tx) => {
    const rows = [];
    for (const id of ids) {
      const row = await updateTask(workspaceId, id, input, tx, actor);
      if (row) rows.push(row);
    }
    return rows;
  });
}

export async function reorderTasks(
  workspaceId: string,
  orderedIds: string[],
) {
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          inArray(tasks.id, orderedIds),
          isNull(tasks.deletedAt),
        ),
      );
    if (owned.length !== new Set(orderedIds).size) throw new Error("TASK_NOT_FOUND");
    const rows = [];
    for (const [sortOrder, id] of orderedIds.entries()) {
      const [row] = await tx
        .update(tasks)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)))
        .returning();
      if (row) rows.push(row);
    }
    return rows;
  });
}
