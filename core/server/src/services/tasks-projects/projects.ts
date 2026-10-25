import path from "node:path";
import { and, asc, desc, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { CreateProjectInput, UpdateProjectInput } from "@backsteros/contracts";

import {
  assertProjectVaultRenameAllowed,
  ensureProjectVaultFolders,
  PROJECT_VAULT_CODEBASE_FOLDER,
  removeProjectVaultFolderIfPresent,
  renameProjectVaultFolder,
  rewriteProjectStorageKeyPrefix,
  rewriteProjectVaultWorkingDirectory,
} from "../../lib/storage.js";
import { assertWorkspaceReference, type DbExecutor } from "./shared.js";
import { db } from "../../db/index.js";
import { areas, documents, organizations, projects } from "../../db/schema.js";
import {
  decodeUpdatedAtCursor,
  encodeUpdatedAtCursor,
  type ParsedProjectsListQuery,
} from "../../lib/list-query.js";
import { newId } from "../../lib/crypto.js";
/** OS-49: peer sync replay / controlled writes. */
export type ProjectWriteOptions = {
  /** Preserve the sync_event row time instead of stamping now. */
  updatedAt?: Date;
  /** Skip vault folder rename/ensure (replica apply must not touch disks). */
  skipVaultSideEffects?: boolean;
};

type ProjectLocationInput = {
  developmentLocation?: string | null;
  productionLocation?: string | null;
};

function assertCodebaseLocationFields(
  type: string,
  input: ProjectLocationInput,
): void {
  const hasLocation =
    (input.developmentLocation != null &&
      String(input.developmentLocation).trim() !== "") ||
    (input.productionLocation != null &&
      String(input.productionLocation).trim() !== "");
  if (hasLocation && type !== "codebase") {
    throw new Error("LOCATION_REQUIRES_CODEBASE");
  }
}

/**
 * Fold deprecated `localLocation` into `localWorkingDirectory`, then clear it.
 * Prefer an existing non-vault-root cwd; otherwise take localLocation.
 */
function consolidateLocalPaths(input: {
  localWorkingDirectory?: string | null;
  localLocation?: string | null;
  projectVaultPath?: string | null;
}): {
  localWorkingDirectory: string | null | undefined;
  /** Always null after consolidation — column kept for sync compat. */
  localLocation: null;
} {
  const loc = input.localLocation?.trim() || null;
  const cwdRaw = input.localWorkingDirectory;
  const cwd = cwdRaw?.trim() || null;
  const vault = input.projectVaultPath?.replace(/\/+$/, "") || null;
  const cwdIsVault =
    Boolean(vault) &&
    (cwd === vault || cwd === `${vault}/` || cwd === `${vault}${path.sep}`);

  if (loc && (!cwd || cwdIsVault)) {
    return { localWorkingDirectory: loc, localLocation: null };
  }
  if (cwdRaw === undefined && loc) {
    return { localWorkingDirectory: loc, localLocation: null };
  }
  return {
    localWorkingDirectory: cwdRaw,
    localLocation: null,
  };
}

function defaultWorkingDirectoryForType(
  type: string,
  projectVaultPath: string,
): string {
  if (type === "codebase") {
    return path.join(projectVaultPath, PROJECT_VAULT_CODEBASE_FOLDER);
  }
  return projectVaultPath;
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
  assertCodebaseLocationFields(type, {
    developmentLocation: input.developmentLocation,
    productionLocation: input.productionLocation,
  });

  const consolidatedCreate = consolidateLocalPaths({
    localWorkingDirectory: input.localWorkingDirectory,
    localLocation: input.localLocation,
  });

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
      penpotProjectId: input.penpotProjectId ?? null,
      localWorkingDirectory: consolidatedCreate.localWorkingDirectory ?? null,
      developmentLocation: input.developmentLocation ?? null,
      productionLocation: input.productionLocation ?? null,
      localLocation: null,
      developmentSetupStatus: input.developmentSetupStatus ?? null,
      developmentSetupError: input.developmentSetupError ?? null,
      developmentSetupUpdatedAt: input.developmentSetupUpdatedAt
        ? new Date(input.developmentSetupUpdatedAt)
        : null,
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
    // Default agent cwd: codebase → Projects/{KEY}/Codebase; others → vault root.
    // Deprecated localLocation is never written.
    const patch: {
      localWorkingDirectory?: string | null;
      localLocation: null;
      updatedAt: Date;
    } = { localLocation: null, updatedAt: writeAt };
    if (!row.localWorkingDirectory?.trim()) {
      patch.localWorkingDirectory = defaultWorkingDirectoryForType(
        type,
        ensured.projectVaultPath,
      );
    }
    const [updated] = await executor
      .update(projects)
      .set(patch)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
      .returning();
    if (updated) {
      return updated;
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
  // Reject non-empty Dev/Prod location writes unless the resulting type is codebase.
  // When leaving codebase, existing Dev/Prod columns are cleared below.
  assertCodebaseLocationFields(nextType, {
    developmentLocation: input.developmentLocation,
    productionLocation: input.productionLocation,
  });

  // Droping codebase type clears any linked repository.
  const githubRepository =
    input.type !== undefined && input.type !== "codebase"
      ? null
      : input.githubRepository;

  // Leaving codebase type clears health-check probe settings and locations.
  const healthCheckMode =
    input.type !== undefined && input.type !== "codebase"
      ? null
      : input.healthCheckMode;
  const healthCheckDomain =
    input.type !== undefined && input.type !== "codebase"
      ? null
      : input.healthCheckDomain;
  const leavingCodebase =
    input.type !== undefined && input.type !== "codebase";
  const developmentLocation = leavingCodebase
    ? null
    : input.developmentLocation;
  const productionLocation = leavingCodebase ? null : input.productionLocation;

  // Fold deprecated localLocation into localWorkingDirectory; always clear column.
  const consolidatedUpdate = consolidateLocalPaths({
    localWorkingDirectory:
      input.localWorkingDirectory !== undefined
        ? input.localWorkingDirectory
        : existing.localWorkingDirectory,
    localLocation:
      input.localLocation !== undefined
        ? input.localLocation
        : existing.localLocation,
  });
  const shouldPatchLocalWorkingDirectory =
    input.localWorkingDirectory !== undefined ||
    input.localLocation !== undefined ||
    Boolean(existing.localLocation?.trim());
  const nextLocalWorkingDirectory = shouldPatchLocalWorkingDirectory
    ? (consolidatedUpdate.localWorkingDirectory ?? null)
    : undefined;

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
        penpotProjectId: input.penpotProjectId,
        ...(nextLocalWorkingDirectory !== undefined
          ? { localWorkingDirectory: nextLocalWorkingDirectory }
          : {}),
        // Clear deprecated localLocation when folding or leaving leftover values.
        ...(shouldPatchLocalWorkingDirectory || existing.localLocation
          ? { localLocation: null }
          : {}),
        ...(leavingCodebase || input.developmentLocation !== undefined
          ? { developmentLocation }
          : {}),
        ...(leavingCodebase || input.productionLocation !== undefined
          ? { productionLocation }
          : {}),
        ...(input.developmentSetupStatus !== undefined
          ? { developmentSetupStatus: input.developmentSetupStatus }
          : {}),
        ...(input.developmentSetupError !== undefined
          ? { developmentSetupError: input.developmentSetupError }
          : {}),
        ...(input.developmentSetupUpdatedAt !== undefined
          ? {
              developmentSetupUpdatedAt: input.developmentSetupUpdatedAt
                ? new Date(input.developmentSetupUpdatedAt)
                : null,
            }
          : {}),
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
      const folded = consolidateLocalPaths({
        localWorkingDirectory: row.localWorkingDirectory,
        localLocation: row.localLocation,
        projectVaultPath: ensured.projectVaultPath,
      });
      const ensurePatch: {
        localWorkingDirectory?: string | null;
        localLocation?: null;
        updatedAt: Date;
      } = { updatedAt: writeAt };
      if (!folded.localWorkingDirectory?.trim()) {
        ensurePatch.localWorkingDirectory = defaultWorkingDirectoryForType(
          row.type,
          ensured.projectVaultPath,
        );
      } else if (
        folded.localWorkingDirectory !== row.localWorkingDirectory ||
        row.localLocation
      ) {
        ensurePatch.localWorkingDirectory = folded.localWorkingDirectory;
      }
      if (row.localLocation) {
        ensurePatch.localLocation = null;
      }
      if (
        ensurePatch.localWorkingDirectory !== undefined ||
        ensurePatch.localLocation !== undefined
      ) {
        const [updated] = await tx
          .update(projects)
          .set(ensurePatch)
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
  const row =
    keyChanging && !skipVault && executor === db
      ? await db.transaction(async (tx) => applyRow(tx))
      : await applyRow(executor);

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
