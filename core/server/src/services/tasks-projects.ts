import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
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
  type DbTask,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  decodeUpdatedAtCursor,
  encodeUpdatedAtCursor,
  LIST_DEFAULT_LIMIT,
  type ParsedDueTasksListQuery,
  type ParsedProjectsListQuery,
} from "../lib/list-query.js";
import { resolveTaskRef } from "../lib/entity-refs.js";
import {
  TASK_LIST_DEFAULT_EXCLUDED_STATUSES,
  decodeTaskListCursor,
  encodeTaskListCursor,
  formatTaskDisplayKey,
  taskListUsesDefaultStatusExclusion,
  type DueDateFilter,
  type ParsedTaskListQuery,
} from "../lib/task-filters.js";
import {
  assertTaskLabelIds,
  normalizeTaskLabelIds,
  touchTaskLabelsUsed,
} from "./task-labels.js";
import {
  assertProjectVaultRenameAllowed,
  ensureProjectVaultFolders,
  removeProjectVaultFolderIfPresent,
  renameProjectVaultFolder,
  rewriteProjectStorageKeyPrefix,
  rewriteProjectVaultWorkingDirectory,
} from "../lib/storage.js";
import { mergeLinkedCommitShas } from "../lib/linked-commit-shas.js";
import * as taskActivityService from "./task-activities.js";
import type { TaskWriteActor } from "./task-activities.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

/** OS-49: peer sync replay / controlled writes. */
export type ProjectWriteOptions = {
  /** Preserve the sync_event row time instead of stamping now. */
  updatedAt?: Date;
  /** Skip vault folder rename/ensure (replica apply must not touch disks). */
  skipVaultSideEffects?: boolean;
};

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
    updatedSince?: Date;
  } = {},
  executor: DbExecutor = db,
) {
  const conditions = [eq(projects.workspaceId, workspaceId)];
  if (filters.updatedSince) {
    conditions.push(gte(projects.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(projects.deletedAt));
  }
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

export async function listProjectsPaginated(
  workspaceId: string,
  filters: ParsedProjectsListQuery,
  executor: DbExecutor = db,
  nowMs: number = Date.now(),
) {
  const conditions: SQL[] = [eq(projects.workspaceId, workspaceId)];
  if (filters.updatedSince) {
    conditions.push(gte(projects.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(projects.deletedAt));
  }
  if (filters.organizationId) {
    conditions.push(eq(projects.organizationId, filters.organizationId));
  }
  if (filters.area) conditions.push(eq(projects.area, filters.area));
  if (filters.status) conditions.push(eq(projects.status, filters.status));
  if (filters.type) conditions.push(eq(projects.type, filters.type));
  if (filters.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(filters.cursor, nowMs);
    conditions.push(
      sql`(
        date_trunc('milliseconds', ${projects.updatedAt}) < date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
        OR (
          date_trunc('milliseconds', ${projects.updatedAt}) = date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
          AND ${projects.id} > ${cursor.id}
        )
      )`,
    );
  }
  const rows = await executor
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(
      sql`date_trunc('milliseconds', ${projects.updatedAt}) desc`,
      asc(projects.id),
    )
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const page = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor:
      hasMore && last
        ? encodeUpdatedAtCursor(
            { id: last.id, updatedAt: last.updatedAt },
            nowMs,
          )
        : null,
  };
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
  options?: ProjectWriteOptions,
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

  const writeAt = options?.updatedAt ?? new Date();
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
      provider: input.provider ?? null,
      category: input.category ?? null,
      githubRepository: input.githubRepository ?? null,
      cloudflareZoneId: input.cloudflareZoneId ?? null,
      localWorkingDirectory: input.localWorkingDirectory ?? null,
      healthCheckMode: input.healthCheckMode ?? null,
      healthCheckDomain: input.healthCheckDomain ?? null,
      hourlyRateCents: input.hourlyRateCents ?? null,
      budgets: input.budgets ?? [],
      status: input.status ?? "backlog",
      priority: input.priority ?? 0,
      sortOrder: input.sortOrder ?? 0,
      createdAt: writeAt,
      updatedAt: writeAt,
    })
    .returning();

  if (options?.skipVaultSideEffects) {
    return row;
  }

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
          updatedAt: writeAt,
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
  options?: ProjectWriteOptions,
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

  // Leaving codebase type clears health-check probe settings.
  const healthCheckMode =
    input.type !== undefined && input.type !== "codebase"
      ? null
      : input.healthCheckMode;
  const healthCheckDomain =
    input.type !== undefined && input.type !== "codebase"
      ? null
      : input.healthCheckDomain;

  // Leaving email type clears the provider category.
  const category =
    input.type !== undefined && input.type !== "email"
      ? null
      : input.category;

  const keyChanging = Boolean(key && key !== existing.key);
  const skipVault = Boolean(options?.skipVaultSideEffects);
  const writeAt = options?.updatedAt ?? new Date();

  // OS-49: refuse non-empty target folders before touching the DB row.
  if (keyChanging && !skipVault) {
    await assertProjectVaultRenameAllowed(existing.key, key!);
  }

  const applyRow = async (tx: DbExecutor) => {
    const [updatedRow] = await tx
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
          input.dueDate === undefined
            ? undefined
            : input.dueDate
              ? new Date(input.dueDate)
              : null,
        icon: input.icon,
        color: input.color,
        type: input.type,
        provider: input.provider,
        category,
        githubRepository,
        cloudflareZoneId: input.cloudflareZoneId,
        localWorkingDirectory: input.localWorkingDirectory,
        healthCheckMode,
        healthCheckDomain,
        hourlyRateCents: input.hourlyRateCents,
        budgets: input.budgets,
        status: input.status,
        priority: input.priority,
        sortOrder: input.sortOrder,
        updatedAt: writeAt,
      })
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
      .returning();

    let row = updatedRow;
    if (!row) {
      return null;
    }

    const keyChanged = Boolean(key && key !== existing.key);

    // Key rename — move the on-disk vault folder and rewrite document storage keys.
    if (keyChanged && !skipVault) {
      let didRename = false;
      let previousVaultPath: string | null = null;
      let nextVaultPath: string | null = null;
      try {
        const renamed = await renameProjectVaultFolder(existing.key, row.key);
        didRename = renamed.renamed;
        previousVaultPath = renamed.previousProjectVaultPath;
        nextVaultPath = renamed.projectVaultPath;
        if (renamed.renamed && renamed.previousProjectVaultPath) {
          const nextCwd = rewriteProjectVaultWorkingDirectory(
            row.localWorkingDirectory,
            renamed.previousProjectVaultPath,
            renamed.projectVaultPath,
          );
          if (nextCwd && nextCwd !== row.localWorkingDirectory) {
            const [cwdUpdated] = await tx
              .update(projects)
              .set({
                localWorkingDirectory: nextCwd,
                updatedAt: writeAt,
              })
              .where(
                and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)),
              )
              .returning();
            if (cwdUpdated) {
              row = cwdUpdated;
            }
          }
        }

        // Belt-and-suspenders: if the old key folder somehow remains, drop it so
        // vault sync cannot copy Projects/{oldKey} back onto the Mac.
        await removeProjectVaultFolderIfPresent(existing.key);

        const projectDocs = await tx
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
          await tx
            .update(documents)
            .set({
              storageKey: nextKey,
              updatedAt: writeAt,
            })
            .where(
              and(
                eq(documents.workspaceId, workspaceId),
                eq(documents.id, doc.id),
              ),
            );
        }
      } catch (error) {
        if (didRename && previousVaultPath && nextVaultPath) {
          try {
            await renameProjectVaultFolder(row.key, existing.key);
          } catch {
            // Best-effort undo; DB transaction rollback restores the key.
          }
        }
        if (
          error instanceof Error &&
          error.message === "PROJECT_VAULT_TARGET_EXISTS"
        ) {
          throw error;
        }
        // Vault may be unset — folder bootstrap still runs below when possible.
      }
    }

    if (skipVault) {
      return row;
    }

    // Keep on-disk vault folders in sync (creates missing areas / .cursor skills).
    try {
      const ensured = await ensureProjectVaultFolders(row.key, undefined, {
        projectType: row.type,
      });
      if (!row.localWorkingDirectory?.trim()) {
        const [updated] = await tx
          .update(projects)
          .set({
            localWorkingDirectory: ensured.projectVaultPath,
            updatedAt: writeAt,
          })
          .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
          .returning();
        return updated ?? row;
      }
    } catch {
      // Vault may be unset.
    }

    return row;
  };

  // OS-49: when renaming, wrap DB + folder rename so a vault failure rolls back
  // the key. Callers already inside a transaction pass their executor through.
  if (keyChanging && !skipVault && executor === db) {
    return db.transaction(async (tx) => applyRow(tx));
  }
  return applyRow(executor);
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
    /** Single id or OR-list (OS-45: comma lists work in legacy mode too). */
    projectId?: string | string[];
    contactId?: string | string[];
    assigneeId?: string | string[];
    relatedContactId?: string | string[];
    relatedOrganizationId?: string | string[];
    status?: string | string[];
    inbox?: boolean;
    support?: boolean;
    notification?: boolean;
  } = {},
  executor: DbExecutor = db,
) {
  const conditions = [
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.deletedAt),
  ];
  const list = (value: string | string[] | undefined): string[] =>
    (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);

  const projectIds = list(filters.projectId);
  if (projectIds.length) conditions.push(inArray(tasks.projectId, projectIds));
  const contactIds = list(filters.contactId);
  if (contactIds.length) conditions.push(inArray(tasks.contactId, contactIds));
  const assigneeIds = list(filters.assigneeId);
  if (assigneeIds.length) {
    conditions.push(inArray(tasks.assigneeId, assigneeIds));
  }
  const relatedContact = relatedContactOrCondition(
    list(filters.relatedContactId),
  );
  if (relatedContact) conditions.push(relatedContact);
  const relatedOrg = relatedOrganizationOrCondition(
    list(filters.relatedOrganizationId),
  );
  if (relatedOrg) conditions.push(relatedOrg);
  const statuses = list(filters.status);
  if (statuses.length) conditions.push(inArray(tasks.status, statuses));
  if (filters.inbox !== undefined) conditions.push(eq(tasks.inbox, filters.inbox));
  if (filters.support !== undefined) {
    conditions.push(eq(tasks.support, filters.support));
  }
  if (filters.notification !== undefined) {
    conditions.push(eq(tasks.notification, filters.notification));
  }

  return executor
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(tasks.sortOrder, desc(tasks.updatedAt));
}

/**
 * projectId → project key for display keys (PF-41). Includes soft-deleted
 * projects so old tasks keep a stable key.
 */
export async function getProjectKeyMap(
  workspaceId: string,
  projectIds?: Array<string | null | undefined>,
  executor: DbExecutor = db,
): Promise<Map<string, string>> {
  const ids =
    projectIds === undefined
      ? undefined
      : [
          ...new Set(
            projectIds.filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        ];
  const out = new Map<string, string>();
  if (ids && !ids.length) return out;
  const rows = await executor
    .select({ id: projects.id, key: projects.key })
    .from(projects)
    .where(
      ids
        ? and(eq(projects.workspaceId, workspaceId), inArray(projects.id, ids))
        : eq(projects.workspaceId, workspaceId),
    );
  for (const row of rows) {
    if (row.key) out.set(row.id, row.key);
  }
  return out;
}

/** contactId → display name (name, else email). Soft-deleted contacts omitted. */
export async function getContactNameMap(
  workspaceId: string,
  contactIds?: Array<string | null | undefined>,
  executor: DbExecutor = db,
): Promise<Map<string, string>> {
  const ids =
    contactIds === undefined
      ? undefined
      : [
          ...new Set(
            contactIds.filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        ];
  const out = new Map<string, string>();
  if (ids && !ids.length) return out;
  const rows = await executor
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.deletedAt),
        ...(ids ? [inArray(contacts.id, ids)] : []),
      ),
    );
  for (const row of rows) {
    const name = row.name?.trim() || row.email?.trim();
    if (name) out.set(row.id, name);
  }
  return out;
}

/**
 * Merge replace / add / remove commit SHA lists (dedupe case-insensitive).
 * Returns `undefined` when nothing changes.
 */
export { mergeLinkedCommitShas } from "../lib/linked-commit-shas.js";

export type TaskListItem = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: number;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectKey: string | null;
  dueDate: string | null;
  linkedDocumentIds: string[];
  linkedContactIds: string[];
  linkedTaskIds: string[];
  createdAt: string;
  updatedAt: string;
  /** Only present with `updatedSince` (change feed includes deletions). */
  deletedAt?: string | null;
};

export type ListTasksPaginatedResult = {
  items: TaskListItem[];
  nextCursor: string | null;
  totalCount?: number;
  /**
   * When the default terminal-status exclusion applies and
   * `includeTotalCount=true`: how many matching tasks were hidden.
   */
  excludedCount?: number;
  /** Present when completed/canceled/duplicated were hidden by default (OS-57). */
  appliedDefaults?: {
    excludedStatuses: Array<(typeof TASK_LIST_DEFAULT_EXCLUDED_STATUSES)[number]>;
  };
};

function dueDateSqlCondition(filter: DueDateFilter): SQL {
  if (filter.op === "before") {
    return and(isNotNull(tasks.dueDate), lt(tasks.dueDate, filter.date))!;
  }
  if (filter.op === "after") {
    return and(isNotNull(tasks.dueDate), gt(tasks.dueDate, filter.date))!;
  }
  return and(
    isNotNull(tasks.dueDate),
    gte(tasks.dueDate, filter.start),
    lte(tasks.dueDate, filter.end),
  )!;
}

function relatedContactOrCondition(ids: string[]): SQL | undefined {
  if (!ids.length) return undefined;
  return or(
    ...ids.map(
      (id) =>
        sql`${tasks.relatedContactIds} @> ${JSON.stringify([id])}::jsonb`,
    ),
  );
}

function relatedOrganizationOrCondition(ids: string[]): SQL | undefined {
  if (!ids.length) return undefined;
  return or(
    ...ids.map(
      (id) =>
        sql`${tasks.relatedOrganizationIds} @> ${JSON.stringify([id])}::jsonb`,
    ),
  );
}

/** Tasks whose display key appears in any of the given documents' linkedTasks. */
function linkedDocumentsCondition(documentIds: string[]): SQL {
  return sql`exists (
    select 1
    from ${documents} d
    where d.workspace_id = ${tasks.workspaceId}
      and d.id in (${sql.join(
        documentIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      and d.deleted_at is null
      and d.kind = 'document'
      and (
        d.properties->'linkedTasks' @> to_jsonb(
          coalesce(${projects.key}, 'INBOX') || '-' || ${tasks.number}::text
        )
        or d.properties->>'linkedTasks' = (
          coalesce(${projects.key}, 'INBOX') || '-' || ${tasks.number}::text
        )
      )
  )`;
}

/**
 * Tasks co-linked via document front-matter linkedTasks with any seed task id.
 * Excludes the seed tasks themselves.
 */
function linkedTasksCondition(
  workspaceId: string,
  seedTaskIds: string[],
): SQL {
  return sql`${tasks.id} in (
    with seed as (
      select
        t.id as seed_id,
        (coalesce(p.key, 'INBOX') || '-' || t.number::text) as display_key
      from ${tasks} t
      left join ${projects} p
        on p.id = t.project_id and p.workspace_id = t.workspace_id
      where t.workspace_id = ${workspaceId}
        and (
          t.id in (${sql.join(
            seedTaskIds.map((id) => sql`${id}`),
            sql`, `,
          )})
          -- OS-45: also accept display keys (e.g. OS-28) as seeds.
          or (coalesce(p.key, 'INBOX') || '-' || t.number::text) in (${sql.join(
            seedTaskIds.map((id) => sql`${id.toUpperCase()}`),
            sql`, `,
          )})
        )
        and t.deleted_at is null
    ),
    docs as (
      select d.properties->'linkedTasks' as linked
      from ${documents} d
      cross join seed s
      where d.workspace_id = ${workspaceId}
        and d.deleted_at is null
        and d.kind = 'document'
        and (
          d.properties->'linkedTasks' @> to_jsonb(s.display_key)
          or d.properties->>'linkedTasks' = s.display_key
        )
    ),
    keys as (
      select distinct trim(both '"' from elem::text) as display_key
      from docs,
      lateral jsonb_array_elements(
        case
          when jsonb_typeof(docs.linked) = 'array' then docs.linked
          when jsonb_typeof(docs.linked) = 'string' then jsonb_build_array(docs.linked)
          else '[]'::jsonb
        end
      ) as elem
      union
      select docs.linked #>> '{}' as display_key
      from docs
      where jsonb_typeof(docs.linked) = 'string'
    )
    select t2.id
    from ${tasks} t2
    left join ${projects} p2
      on p2.id = t2.project_id and p2.workspace_id = t2.workspace_id
    join keys k
      on (coalesce(p2.key, 'INBOX') || '-' || t2.number::text) = k.display_key
    where t2.workspace_id = ${workspaceId}
      and t2.deleted_at is null
      and t2.id not in (select seed_id from seed)
  )`;
}

function buildPaginatedTaskConditions(
  workspaceId: string,
  filters: ParsedTaskListQuery,
): SQL[] {
  const conditions: SQL[] = [eq(tasks.workspaceId, workspaceId)];

  if (filters.updatedSince) {
    // Change feed (OS-45): include soft-deleted rows so callers see removals.
    conditions.push(gte(tasks.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(tasks.deletedAt));
  }

  if (filters.projectIds.length) {
    conditions.push(inArray(tasks.projectId, filters.projectIds));
  }
  if (filters.statuses.length) {
    conditions.push(inArray(tasks.status, filters.statuses));
  } else if (!filters.updatedSince) {
    conditions.push(
      notInArray(tasks.status, [...TASK_LIST_DEFAULT_EXCLUDED_STATUSES]),
    );
  }
  if (filters.assigneeIds.length) {
    conditions.push(inArray(tasks.assigneeId, filters.assigneeIds));
  }
  if (filters.contactIds.length) {
    conditions.push(inArray(tasks.contactId, filters.contactIds));
  }
  const relatedContact = relatedContactOrCondition(filters.relatedContactIds);
  if (relatedContact) conditions.push(relatedContact);
  const relatedOrg = relatedOrganizationOrCondition(
    filters.relatedOrganizationIds,
  );
  if (relatedOrg) conditions.push(relatedOrg);
  if (filters.dueDate) {
    conditions.push(dueDateSqlCondition(filters.dueDate));
  }
  if (filters.inbox !== undefined) {
    conditions.push(eq(tasks.inbox, filters.inbox));
  }
  if (filters.support !== undefined) {
    conditions.push(eq(tasks.support, filters.support));
  }
  if (filters.notification !== undefined) {
    conditions.push(eq(tasks.notification, filters.notification));
  }
  if (filters.linkedDocumentIds.length) {
    conditions.push(linkedDocumentsCondition(filters.linkedDocumentIds));
  }
  if (filters.linkedTaskIds.length) {
    conditions.push(
      linkedTasksCondition(workspaceId, filters.linkedTaskIds),
    );
  }

  return conditions;
}

function cursorSqlCondition(cursor: ReturnType<typeof decodeTaskListCursor>): SQL {
  // Sort key: (coalesce(due_date, infinity), created_at, id) ascending.
  // Truncate to milliseconds so ISO cursor values match JS Date precision.
  const dueKey =
    cursor.dueDate == null
      ? sql`'infinity'::timestamptz`
      : sql`date_trunc('milliseconds', ${cursor.dueDate}::timestamptz)`;
  return sql`(
    coalesce(date_trunc('milliseconds', ${tasks.dueDate}), 'infinity'::timestamptz),
    date_trunc('milliseconds', ${tasks.createdAt}),
    ${tasks.id}
  ) > (
    ${dueKey},
    date_trunc('milliseconds', ${cursor.createdAt}::timestamptz),
    ${cursor.id}
  )`;
}

async function loadTaskLinkEnrichment(
  workspaceId: string,
  rows: Array<{
    id: string;
    number: number;
    projectKey: string | null;
  }>,
  executor: DbExecutor,
): Promise<
  Map<
    string,
    {
      linkedDocumentIds: string[];
      linkedTaskIds: string[];
    }
  >
> {
  const result = new Map<
    string,
    { linkedDocumentIds: string[]; linkedTaskIds: string[] }
  >();
  if (!rows.length) return result;

  const keyByTaskId = new Map<string, string>();
  const taskIdByKey = new Map<string, string>();
  for (const row of rows) {
    const key = formatTaskDisplayKey(row.projectKey, row.number);
    keyByTaskId.set(row.id, key);
    taskIdByKey.set(key, row.id);
    result.set(row.id, { linkedDocumentIds: [], linkedTaskIds: [] });
  }

  const keys = [...keyByTaskId.values()];
  const docRows = await executor
    .select({
      id: documents.id,
      properties: documents.properties,
    })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        isNull(documents.deletedAt),
        eq(documents.kind, "document"),
        or(
          ...keys.map(
            (key) =>
              sql`(
                ${documents.properties}->'linkedTasks' @> ${JSON.stringify([key])}::jsonb
                or ${documents.properties}->>'linkedTasks' = ${key}
              )`,
          ),
        ),
      ),
    );

  const linkedKeysByTask = new Map<string, Set<string>>();
  for (const taskId of keyByTaskId.keys()) {
    linkedKeysByTask.set(taskId, new Set());
  }

  for (const doc of docRows) {
    const linked = (doc.properties as { linkedTasks?: unknown } | null)
      ?.linkedTasks;
    const listed: string[] = [];
    if (typeof linked === "string" && linked.trim()) {
      listed.push(linked.trim());
    } else if (Array.isArray(linked)) {
      for (const entry of linked) {
        if (typeof entry === "string" && entry.trim()) {
          listed.push(entry.trim());
        }
      }
    }
    for (const key of listed) {
      const taskId = taskIdByKey.get(key);
      if (!taskId) continue;
      const bucket = result.get(taskId)!;
      if (!bucket.linkedDocumentIds.includes(doc.id)) {
        bucket.linkedDocumentIds.push(doc.id);
      }
      for (const other of listed) {
        if (other === key) continue;
        linkedKeysByTask.get(taskId)!.add(other);
      }
    }
  }

  const unresolvedKeys = new Set<string>();
  for (const keysForTask of linkedKeysByTask.values()) {
    for (const key of keysForTask) {
      if (!taskIdByKey.has(key)) unresolvedKeys.add(key);
    }
  }

  if (unresolvedKeys.size) {
    const resolved = await resolveTaskIdsByDisplayKeys(
      workspaceId,
      [...unresolvedKeys],
      executor,
    );
    for (const [key, id] of resolved) {
      taskIdByKey.set(key, id);
    }
  }

  for (const [taskId, keysForTask] of linkedKeysByTask) {
    const bucket = result.get(taskId)!;
    for (const key of keysForTask) {
      const otherId = taskIdByKey.get(key);
      if (otherId && otherId !== taskId && !bucket.linkedTaskIds.includes(otherId)) {
        bucket.linkedTaskIds.push(otherId);
      }
    }
  }

  return result;
}

async function resolveTaskIdsByDisplayKeys(
  workspaceId: string,
  displayKeys: string[],
  executor: DbExecutor,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!displayKeys.length) return out;

  const parsed = displayKeys
    .map((key) => {
      const match = key.trim().match(/^([A-Za-z][A-Za-z0-9_]*)-(\d+)$/);
      if (!match) return null;
      return { key, projectKey: match[1]!, number: Number(match[2]) };
    })
    .filter((row): row is { key: string; projectKey: string; number: number } =>
      Boolean(row),
    );

  if (!parsed.length) return out;

  const rows = await executor
    .select({
      id: tasks.id,
      number: tasks.number,
      projectKey: projects.key,
    })
    .from(tasks)
    .leftJoin(
      projects,
      and(
        eq(projects.id, tasks.projectId),
        eq(projects.workspaceId, tasks.workspaceId),
      ),
    )
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        or(
          ...parsed.map(
            (entry) =>
              and(
                eq(tasks.number, entry.number),
                entry.projectKey.toUpperCase() === "INBOX"
                  ? isNull(tasks.projectId)
                  : eq(projects.key, entry.projectKey),
              )!,
          ),
        ),
      ),
    );

  for (const row of rows) {
    const key = formatTaskDisplayKey(row.projectKey, row.number);
    out.set(key, row.id);
  }
  return out;
}

/**
 * Cursor-paginated task list with multi-value filters (OS-28).
 * Default sort: dueDate ASC (nulls last), then createdAt ASC, then id.
 */
export async function listTasksPaginated(
  workspaceId: string,
  filters: ParsedTaskListQuery,
  executor: DbExecutor = db,
  nowMs: number = Date.now(),
): Promise<ListTasksPaginatedResult> {
  const conditions = buildPaginatedTaskConditions(workspaceId, filters);
  if (filters.cursor?.trim()) {
    const cursor = decodeTaskListCursor(filters.cursor, nowMs);
    conditions.push(cursorSqlCondition(cursor));
  }

  const limit = filters.limit;
  const rows = await executor
    .select({
      id: tasks.id,
      workspaceId: tasks.workspaceId,
      projectId: tasks.projectId,
      contactId: tasks.contactId,
      assigneeId: tasks.assigneeId,
      relatedContactIds: tasks.relatedContactIds,
      relatedOrganizationIds: tasks.relatedOrganizationIds,
      labelIds: tasks.labelIds,
      number: tasks.number,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      sortOrder: tasks.sortOrder,
      dueDate: tasks.dueDate,
      dueEndDate: tasks.dueEndDate,
      triagedAt: tasks.triagedAt,
      inbox: tasks.inbox,
      support: tasks.support,
      notification: tasks.notification,
      links: tasks.links,
      agentChatId: tasks.agentChatId,
      linkedCommitShas: tasks.linkedCommitShas,
      habitId: tasks.habitId,
      legacySource: tasks.legacySource,
      completedAt: tasks.completedAt,
      agentCreatedAt: tasks.agentCreatedAt,
      agentInboxApprovedAt: tasks.agentInboxApprovedAt,
      trackedMinutes: tasks.trackedMinutes,
      trackedDurationSeconds: tasks.trackedDurationSeconds,
      inboxUpdatedAt: tasks.inboxUpdatedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      deletedAt: tasks.deletedAt,
      projectKey: projects.key,
    })
    .from(tasks)
    .leftJoin(
      projects,
      and(
        eq(projects.id, tasks.projectId),
        eq(projects.workspaceId, tasks.workspaceId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      sql`coalesce(date_trunc('milliseconds', ${tasks.dueDate}), 'infinity'::timestamptz) asc`,
      sql`date_trunc('milliseconds', ${tasks.createdAt}) asc`,
      asc(tasks.id),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const enrichment = await loadTaskLinkEnrichment(workspaceId, page, executor);
  const assigneeNames = await getContactNameMap(
    workspaceId,
    page.map((row) => row.assigneeId),
    executor,
  );

  const items: TaskListItem[] = page.map((row) => {
    const links = enrichment.get(row.id) ?? {
      linkedDocumentIds: [],
      linkedTaskIds: [],
    };
    const linkedContactIds = [
      ...new Set(
        [
          row.contactId,
          ...(Array.isArray(row.relatedContactIds)
            ? row.relatedContactIds
            : []),
        ].filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    return {
      id: row.id,
      key: formatTaskDisplayKey(row.projectKey, row.number),
      title: row.title,
      status: row.status,
      priority: row.priority,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeId
        ? (assigneeNames.get(row.assigneeId) ?? null)
        : null,
      projectId: row.projectId,
      projectKey: row.projectKey ?? null,
      dueDate: row.dueDate?.toISOString() ?? null,
      linkedDocumentIds: links.linkedDocumentIds,
      linkedContactIds,
      linkedTaskIds: links.linkedTaskIds,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...(filters.updatedSince
        ? { deletedAt: row.deletedAt?.toISOString() ?? null }
        : {}),
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeTaskListCursor(
          {
            dueDate: last.dueDate,
            createdAt: last.createdAt,
            id: last.id,
          },
          nowMs,
        )
      : null;

  const usesDefaultExclusion = taskListUsesDefaultStatusExclusion(filters);

  let totalCount: number | undefined;
  let excludedCount: number | undefined;
  if (filters.includeTotalCount) {
    const countConditions = buildPaginatedTaskConditions(workspaceId, filters);
    const [countRow] = await executor
      .select({ value: sql<number>`count(*)::int` })
      .from(tasks)
      .leftJoin(
        projects,
        and(
          eq(projects.id, tasks.projectId),
          eq(projects.workspaceId, tasks.workspaceId),
        ),
      )
      .where(and(...countConditions));
    totalCount = Number(countRow?.value ?? 0);

    // OS-57: same other filters, but only the default-excluded statuses.
    if (usesDefaultExclusion) {
      const excludedConditions = buildPaginatedTaskConditions(workspaceId, {
        ...filters,
        statuses: [...TASK_LIST_DEFAULT_EXCLUDED_STATUSES],
      });
      const [excludedRow] = await executor
        .select({ value: sql<number>`count(*)::int` })
        .from(tasks)
        .leftJoin(
          projects,
          and(
            eq(projects.id, tasks.projectId),
            eq(projects.workspaceId, tasks.workspaceId),
          ),
        )
        .where(and(...excludedConditions));
      excludedCount = Number(excludedRow?.value ?? 0);
    }
  }

  return {
    items,
    nextCursor,
    ...(totalCount !== undefined ? { totalCount } : {}),
    ...(excludedCount !== undefined ? { excludedCount } : {}),
    ...(usesDefaultExclusion
      ? {
          appliedDefaults: {
            excludedStatuses: [...TASK_LIST_DEFAULT_EXCLUDED_STATUSES],
          },
        }
      : {}),
  };
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

const TASK_SEARCH_SNIPPET_MAX = 280;

export type TaskSearchHit = {
  id: string;
  type: "task";
  key: string;
  projectId: string | null;
  status: string;
  title: string;
  snippet: string | null;
  updatedAt: string;
};

function taskSearchSnippet(description: string | null | undefined): string | null {
  if (description == null) return null;
  const trimmed = description.trim();
  if (!trimmed) return null;
  if (trimmed.length <= TASK_SEARCH_SNIPPET_MAX) return trimmed;
  return `${trimmed.slice(0, TASK_SEARCH_SNIPPET_MAX - 1)}…`;
}

function toTaskSearchHit(row: {
  id: string;
  projectId: string | null;
  number: number;
  title: string;
  description: string | null;
  status: string;
  updatedAt: Date;
  projectKey: string | null;
}): TaskSearchHit {
  return {
    id: row.id,
    type: "task",
    key: formatTaskDisplayKey(row.projectKey, row.number),
    projectId: row.projectId,
    status: row.status,
    title: row.title,
    snippet: taskSearchSnippet(row.description),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Agent task text search for `GET /api/v1/search?type=task` (OS-55).
 * SQL ILIKE on title/description with keyset pagination; prefers an exact
 * display-key or id match on the first page.
 */
export async function searchTasks(
  input: {
    workspaceId: string;
    q: string;
    projectId?: string;
    statuses?: string[];
    limit?: number;
    cursor?: string;
  },
  executor: DbExecutor = db,
  nowMs: number = Date.now(),
): Promise<{ results: TaskSearchHit[]; nextCursor: string | null }> {
  const limit = input.limit ?? 20;
  const q = input.q.trim();
  const exactHits: TaskSearchHit[] = [];
  const excludeIds = new Set<string>();

  if (!input.cursor?.trim()) {
    const exactId = await resolveTaskRef(input.workspaceId, q, executor);
    if (exactId) {
      const exactConditions: SQL[] = [
        eq(tasks.workspaceId, input.workspaceId),
        eq(tasks.id, exactId),
        isNull(tasks.deletedAt),
      ];
      if (input.projectId) {
        exactConditions.push(eq(tasks.projectId, input.projectId));
      }
      if (input.statuses?.length) {
        exactConditions.push(inArray(tasks.status, input.statuses));
      }
      const [row] = await executor
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          number: tasks.number,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          updatedAt: tasks.updatedAt,
          projectKey: projects.key,
        })
        .from(tasks)
        .leftJoin(
          projects,
          and(
            eq(projects.id, tasks.projectId),
            eq(projects.workspaceId, tasks.workspaceId),
          ),
        )
        .where(and(...exactConditions))
        .limit(1);
      if (row) {
        exactHits.push(toTaskSearchHit(row));
        excludeIds.add(row.id);
      }
    }
  }

  const pattern = `%${q}%`;
  const conditions: SQL[] = [
    eq(tasks.workspaceId, input.workspaceId),
    isNull(tasks.deletedAt),
    or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))!,
  ];
  if (excludeIds.size) {
    conditions.push(notInArray(tasks.id, [...excludeIds]));
  }
  if (input.projectId) {
    conditions.push(eq(tasks.projectId, input.projectId));
  }
  if (input.statuses?.length) {
    conditions.push(inArray(tasks.status, input.statuses));
  }
  if (input.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(input.cursor, nowMs);
    conditions.push(
      sql`(
        date_trunc('milliseconds', ${tasks.updatedAt}) < date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
        OR (
          date_trunc('milliseconds', ${tasks.updatedAt}) = date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
          AND ${tasks.id} > ${cursor.id}
        )
      )`,
    );
  }

  const need = Math.max(0, limit - exactHits.length);
  const rows =
    need > 0
      ? await executor
          .select({
            id: tasks.id,
            projectId: tasks.projectId,
            number: tasks.number,
            title: tasks.title,
            description: tasks.description,
            status: tasks.status,
            updatedAt: tasks.updatedAt,
            projectKey: projects.key,
          })
          .from(tasks)
          .leftJoin(
            projects,
            and(
              eq(projects.id, tasks.projectId),
              eq(projects.workspaceId, tasks.workspaceId),
            ),
          )
          .where(and(...conditions))
          .orderBy(
            sql`date_trunc('milliseconds', ${tasks.updatedAt}) desc`,
            asc(tasks.id),
          )
          .limit(need + 1)
      : [];

  const hasMore = rows.length > need;
  const page = hasMore ? rows.slice(0, need) : rows;
  const results = [...exactHits, ...page.map(toTaskSearchHit)];
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeUpdatedAtCursor(
          { id: last.id, updatedAt: last.updatedAt },
          nowMs,
        )
      : null;

  return { results, nextCursor };
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
  options?: { authKind?: "api_key" | "local_shell" },
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
  const labelIds = normalizeTaskLabelIds(input.labelIds);
  await assertTaskLabelIds(workspaceId, labelIds, executor);
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
  const support = input.support ?? false;
  const notification = input.notification ?? false;
  const status =
    input.status ??
    (support || notification ? "triage" : "ready_to_start");
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
      labelIds,
      number,
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? 0,
      sortOrder: input.sortOrder ?? 0,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      dueEndDate: input.dueEndDate ? new Date(input.dueEndDate) : null,
      triagedAt: input.triagedAt ? new Date(input.triagedAt) : null,
      inbox:
        input.inbox ??
        (support || notification
          ? true
          : !input.projectId && !input.contactId),
      support,
      notification,
      links: input.links ?? [],
      agentChatId: input.agentChatId ?? null,
      linkedCommitShas: input.linkedCommitShas ?? [],
      habitId: input.habitId ?? null,
      trackedMinutes: input.trackedMinutes ?? null,
      trackedDurationSeconds: input.trackedDurationSeconds ?? null,
      completedAt: status === "completed" ? new Date() : null,
      agentCreatedAt,
      ...(inboxUpdatedAt !== undefined ? { inboxUpdatedAt } : {}),
    })
    .returning();

  if (row) {
    if (labelIds.length > 0) {
      await touchTaskLabelsUsed(workspaceId, labelIds, executor);
    }
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
    if (taskActivityService.shouldAutoStartTaskTimer(null, row.status)) {
      await taskActivityService.autoStartTaskTimerOnStatus(
        workspaceId,
        row.id,
        row.assigneeId,
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
  options?: { authKind?: "api_key" | "local_shell" },
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
): Promise<DbTask | null> {
  const needsShaLock =
    (Array.isArray(input.addLinkedCommitShas) &&
      input.addLinkedCommitShas.length > 0) ||
    (Array.isArray(input.removeLinkedCommitShas) &&
      input.removeLinkedCommitShas.length > 0);

  // Concurrent addLinkedCommitShas must see each other's writes (OS-64).
  if (needsShaLock && executor === db) {
    return db.transaction((tx) =>
      updateTask(workspaceId, id, input, tx, actor, options),
    );
  }

  const existingQuery = executor
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
  const [existing] = needsShaLock
    ? await existingQuery.for("update")
    : await existingQuery;
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
  const nextLabelIds =
    input.labelIds === undefined
      ? undefined
      : normalizeTaskLabelIds(input.labelIds);
  if (nextLabelIds !== undefined) {
    await assertTaskLabelIds(workspaceId, nextLabelIds, executor);
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

  const nextLinkedCommitShas = mergeLinkedCommitShas(
    existing.linkedCommitShas,
    input.linkedCommitShas,
    input.addLinkedCommitShas,
    input.removeLinkedCommitShas,
  );

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
      ...(nextLabelIds !== undefined ? { labelIds: nextLabelIds } : {}),
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
      support: input.support,
      notification: input.notification,
      links: input.links,
      agentChatId: input.agentChatId,
      ...(nextLinkedCommitShas !== undefined
        ? { linkedCommitShas: nextLinkedCommitShas }
        : {}),
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
    if (nextLabelIds !== undefined) {
      const previous = new Set(normalizeTaskLabelIds(existing.labelIds));
      const added = nextLabelIds.filter((labelId) => !previous.has(labelId));
      if (added.length > 0) {
        await touchTaskLabelsUsed(workspaceId, added, executor);
      }
    }
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
    // Auto time tracking: start on in_progress, pause on leave — attribute
    // to the assignee contact so agent status flips never show as "Agent".
    // Ensure-start whenever the write sets `in_progress` (even if twin
    // replication already flipped the row) so leader-first local apply cannot
    // no-op the transition and skip the timer.
    if (input.status === "in_progress") {
      await taskActivityService.autoStartTaskTimerOnStatus(
        workspaceId,
        id,
        row.assigneeId,
        executor,
      );
    } else if (
      input.status !== undefined &&
      taskActivityService.shouldAutoStopTaskTimer(existing.status, input.status)
    ) {
      const stopped = await taskActivityService.autoStopTaskTimerOnStatus(
        workspaceId,
        id,
        row.assigneeId,
        executor,
      );
      if (
        stopped &&
        stopped.trackedDurationSeconds !== (row.trackedDurationSeconds ?? null)
      ) {
        row.trackedDurationSeconds = stopped.trackedDurationSeconds;
        row.trackedMinutes =
          stopped.trackedDurationSeconds != null &&
          stopped.trackedDurationSeconds >= 60
            ? Math.floor(stopped.trackedDurationSeconds / 60)
            : null;
      }
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

export type DueTaskListItem = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: number;
  projectId: string | null;
  dueDate: string | null;
  updatedAt: string;
};

export async function listDueTasksPaginated(
  workspaceId: string,
  filters: ParsedDueTasksListQuery,
  executor: DbExecutor = db,
  nowMs: number = Date.now(),
): Promise<{ items: DueTaskListItem[]; nextCursor: string | null }> {
  const conditions: SQL[] = [
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.deletedAt),
    isNull(tasks.completedAt),
    isNotNull(tasks.dueDate),
    lte(tasks.dueDate, filters.before),
  ];
  if (filters.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(filters.cursor, nowMs);
    conditions.push(
      sql`(
        date_trunc('milliseconds', ${tasks.updatedAt}) < date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
        OR (
          date_trunc('milliseconds', ${tasks.updatedAt}) = date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
          AND ${tasks.id} > ${cursor.id}
        )
      )`,
    );
  }
  const limit = Number.isFinite(filters.limit) ? filters.limit : LIST_DEFAULT_LIMIT;
  const rows = await executor
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      projectId: tasks.projectId,
      dueDate: tasks.dueDate,
      updatedAt: tasks.updatedAt,
      projectKey: projects.key,
    })
    .from(tasks)
    .leftJoin(
      projects,
      and(
        eq(projects.id, tasks.projectId),
        eq(projects.workspaceId, tasks.workspaceId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      sql`date_trunc('milliseconds', ${tasks.updatedAt}) desc`,
      asc(tasks.id),
    )
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      key: formatTaskDisplayKey(row.projectKey, row.number),
      title: row.title,
      status: row.status,
      priority: row.priority,
      projectId: row.projectId,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor:
      hasMore && last
        ? encodeUpdatedAtCursor(
            { id: last.id, updatedAt: last.updatedAt },
            nowMs,
          )
        : null,
  };
}

/**
 * Expanded inbox: triage capture (`inbox`), On Hold / In Review from any
 * project, and overdue open tasks (due before local today, not completed /
 * canceled / duplicated). Matching is refined on clients by calendar day.
 * Habit day instances and tasks due today or later are excluded
 * (only overdue / undated inbox candidates remain).
 */
export async function listInboxTasks(workspaceId: string, executor: DbExecutor = db) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        isNull(tasks.habitId),
        or(isNull(tasks.dueDate), lt(tasks.dueDate, startOfToday)),
        or(
          eq(tasks.inbox, true),
          inArray(tasks.status, ["on_hold", "in_review"]),
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
