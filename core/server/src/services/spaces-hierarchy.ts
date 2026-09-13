/**
 * Spaces hierarchy: move with path rewrite, and idempotent heal.
 */

import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { documents, type DbDocument } from "../db/schema.js";
import {
  buildStorageKey,
  moveObject,
  reconcileObjectToPreferredKey,
  SPACES_CATEGORY_SUPPORT,
  SPACES_SECOND_BRAIN_RELATIVE,
} from "../lib/storage.js";
import {
  expectedChildSpacesPath,
  isMisplacedPortalUnderSecondBrain,
  normalizeSpacesPath,
  rewritePathUnderPrefix,
  spacesPathLeaf,
} from "./spaces-paths.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

async function listKnowledgeRows(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<DbDocument[]> {
  return executor
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.type, "knowledge"),
        isNull(documents.deletedAt),
      ),
    );
}

function collectDescendantIds(
  rows: readonly DbDocument[],
  rootId: string,
): string[] {
  const childrenByParent = new Map<string | null, DbDocument[]>();
  for (const row of rows) {
    const key = row.parentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(row);
    childrenByParent.set(key, list);
  }
  const ids: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    ids.push(current);
    for (const child of childrenByParent.get(current) ?? []) {
      stack.push(child.id);
    }
  }
  return ids;
}

async function applyPathAndStorageKey(
  workspaceId: string,
  row: DbDocument,
  nextPath: string,
  executor: DbExecutor = db,
): Promise<DbDocument> {
  const normalized = normalizeSpacesPath(nextPath);
  if (normalized === normalizeSpacesPath(row.path)) {
    return row;
  }

  const nextStorageKey = buildStorageKey(
    "knowledge",
    normalized,
    undefined,
    workspaceId,
  );

  const oldPath = normalizeSpacesPath(row.path);
  const candidateFromKeys = new Set<string>([
    row.storageKey,
    buildStorageKey("knowledge", oldPath, undefined, workspaceId),
  ]);
  // Loose / second-brain layouts that may hold the bytes today.
  if (oldPath === "portal" || oldPath.startsWith("portal/")) {
    candidateFromKeys.add(
      buildStorageKey(
        "knowledge",
        `${SPACES_SECOND_BRAIN_RELATIVE}/${oldPath}`,
        undefined,
        workspaceId,
      ),
    );
  }
  // After Portal → Support heal, DB path is support/portal/… but vault may
  // still be under knowledge-base/second-brain/portal/….
  if (
    oldPath === `${SPACES_CATEGORY_SUPPORT}/portal` ||
    oldPath.startsWith(`${SPACES_CATEGORY_SUPPORT}/portal/`)
  ) {
    const suffix = oldPath.slice(`${SPACES_CATEGORY_SUPPORT}/portal`.length);
    candidateFromKeys.add(
      buildStorageKey(
        "knowledge",
        `${SPACES_SECOND_BRAIN_RELATIVE}/portal${suffix}`,
        undefined,
        workspaceId,
      ),
    );
  }
  if (
    normalized === `${SPACES_CATEGORY_SUPPORT}/portal` ||
    normalized.startsWith(`${SPACES_CATEGORY_SUPPORT}/portal/`)
  ) {
    const suffix = normalized.slice(`${SPACES_CATEGORY_SUPPORT}/portal`.length);
    candidateFromKeys.add(
      buildStorageKey(
        "knowledge",
        `${SPACES_SECOND_BRAIN_RELATIVE}/portal${suffix}`,
        undefined,
        workspaceId,
      ),
    );
  }

  if (nextStorageKey !== row.storageKey) {
    let moved = false;
    for (const fromKey of candidateFromKeys) {
      if (!fromKey || fromKey === nextStorageKey) continue;
      try {
        await moveObject(fromKey, nextStorageKey);
        moved = true;
        break;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "STORAGE_OBJECT_NOT_FOUND"
        ) {
          continue;
        }
        console.warn(
          "[spaces] vault move failed",
          fromKey,
          "→",
          nextStorageKey,
          error,
        );
      }
    }
    if (!moved && (row.byteSize ?? 0) > 0) {
      console.warn(
        "[spaces] no vault object moved for",
        row.path,
        "→",
        normalized,
      );
    }
  }

  const [updated] = await executor
    .update(documents)
    .set({
      path: normalized,
      storageKey: nextStorageKey,
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.workspaceId, workspaceId), eq(documents.id, row.id)),
    )
    .returning();

  return updated ?? { ...row, path: normalized, storageKey: nextStorageKey };
}

/**
 * Move a document under a new parent and rewrite path + storageKey for the
 * whole parentId subtree so Spaces category prefixes stay honest.
 */
export async function moveDocumentWithPathRewrite(
  workspaceId: string,
  id: string,
  parentId: string | null,
  executor: DbExecutor = db,
): Promise<DbDocument | null> {
  if (parentId === id) throw new Error("INVALID_PARENT");

  const rows = await listKnowledgeRows(workspaceId, executor);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const existing = byId.get(id);
  if (!existing) {
    // Non-knowledge or missing — fall back to parentId-only update.
    if (parentId) {
      const parent = await executor
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.id, parentId),
            isNull(documents.deletedAt),
          ),
        )
        .limit(1);
      const parentRow = parent[0];
      if (!parentRow || parentRow.kind !== "folder") {
        throw new Error("FOLDER_NOT_FOUND");
      }
    }
    const [row] = await executor
      .update(documents)
      .set({ parentId, updatedAt: new Date() })
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.id, id),
          isNull(documents.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }

  if (parentId) {
    const parent = byId.get(parentId);
    if (!parent || parent.kind !== "folder") {
      throw new Error("FOLDER_NOT_FOUND");
    }
  }

  const oldPath = normalizeSpacesPath(existing.path);
  const parentPath = parentId
    ? normalizeSpacesPath(byId.get(parentId)?.path ?? "")
    : "";
  const leaf = spacesPathLeaf(existing.path, existing.title);
  const newPath = expectedChildSpacesPath(parentPath || null, leaf);

  const [moved] = await executor
    .update(documents)
    .set({ parentId, updatedAt: new Date() })
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.id, id),
        isNull(documents.deletedAt),
      ),
    )
    .returning();
  if (!moved) return null;

  // Refresh rows after parent change.
  const afterMove = await listKnowledgeRows(workspaceId, executor);
  const afterById = new Map(afterMove.map((row) => [row.id, row]));
  const subtreeIds = collectDescendantIds(afterMove, id);

  let root = afterById.get(id) ?? moved;
  root = await applyPathAndStorageKey(workspaceId, root, newPath, executor);
  afterById.set(root.id, root);

  for (const childId of subtreeIds) {
    if (childId === id) continue;
    const child = afterById.get(childId);
    if (!child) continue;
    const nextPath = rewritePathUnderPrefix(child.path, oldPath, newPath);
    // If path did not share the old prefix, rebuild from parent chain.
    const parent = child.parentId ? afterById.get(child.parentId) : null;
    const rebuilt = parent
      ? expectedChildSpacesPath(
          parent.path,
          spacesPathLeaf(child.path, child.title),
        )
      : nextPath;
    const preferred =
      normalizeSpacesPath(nextPath) !== normalizeSpacesPath(child.path)
        ? nextPath
        : rebuilt;
    const updated = await applyPathAndStorageKey(
      workspaceId,
      child,
      preferred,
      executor,
    );
    afterById.set(updated.id, updated);
  }

  return afterById.get(id) ?? root;
}

export type SpacesHealReport = {
  movedPortalToSupport: boolean;
  pathFixes: number;
  vaultReconciles: number;
};

/**
 * Idempotent heal:
 * 1) Move Portal from Second brain → Support center
 * 2) Rewrite knowledge paths so each row nests under its parent path
 * 3) Reconcile vault bytes to canonical storageKeys (Portal path drift)
 */
export async function healSpacesHierarchy(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<SpacesHealReport> {
  const report: SpacesHealReport = {
    movedPortalToSupport: false,
    pathFixes: 0,
    vaultReconciles: 0,
  };

  let rows = await listKnowledgeRows(workspaceId, executor);
  let byId = new Map(rows.map((row) => [row.id, row]));
  const byPath = new Map(
    rows.map((row) => [normalizeSpacesPath(row.path), row]),
  );

  const support = byPath.get(SPACES_CATEGORY_SUPPORT);
  const secondBrain = byPath.get(SPACES_SECOND_BRAIN_RELATIVE);

  if (support && secondBrain) {
    const portal = rows.find((row) => {
      if (row.kind !== "folder") return false;
      const parent = row.parentId ? byId.get(row.parentId) : null;
      return isMisplacedPortalUnderSecondBrain({
        title: row.title,
        path: row.path,
        parentPath: parent?.path ?? null,
      });
    });

    if (portal) {
      await moveDocumentWithPathRewrite(
        workspaceId,
        portal.id,
        support.id,
        executor,
      );
      report.movedPortalToSupport = true;
      rows = await listKnowledgeRows(workspaceId, executor);
      byId = new Map(rows.map((row) => [row.id, row]));
    }
  }

  // Topological-ish: fix parents before children by sorting path depth ascending
  // after ensuring parent pointers are used for expected paths.
  const pending = [...rows].sort(
    (a, b) =>
      normalizeSpacesPath(a.path).split("/").length -
      normalizeSpacesPath(b.path).split("/").length,
  );

  for (const row of pending) {
    const current = byId.get(row.id);
    if (!current) continue;
    if (!current.parentId) continue;
    const parent = byId.get(current.parentId);
    if (!parent) continue;
    const leaf = spacesPathLeaf(current.path, current.title);
    const expected = expectedChildSpacesPath(parent.path, leaf);
    if (normalizeSpacesPath(current.path) === expected) continue;
    const updated = await applyPathAndStorageKey(
      workspaceId,
      current,
      expected,
      executor,
    );
    byId.set(updated.id, updated);
    report.pathFixes += 1;
  }

  // Re-read after path fixes, then pull vault bytes onto canonical keys.
  rows = await listKnowledgeRows(workspaceId, executor);
  for (const row of rows) {
    if (row.kind === "folder") continue;
    if ((row.byteSize ?? 0) <= 0 || !row.storageKey) continue;
    try {
      const moved = await reconcileObjectToPreferredKey(row.storageKey);
      if (moved) report.vaultReconciles += 1;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "STORAGE_OBJECT_NOT_FOUND"
      ) {
        continue;
      }
      console.warn(
        "[spaces] vault reconcile failed",
        row.path,
        row.storageKey,
        error,
      );
    }
  }

  return report;
}
