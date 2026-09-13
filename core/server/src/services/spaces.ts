/**
 * Spaces-shaped façade over knowledge documents (UI category → space → tree).
 */

import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { documents, type DbDocument } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import * as documentService from "./documents.js";
import {
  expectedChildSpacesPath,
  isSpacesCategoryId,
  normalizeSpacesPath,
  SPACES_CATEGORY_IDS,
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_CATEGORY_TITLES,
  type SpacesCategoryId,
} from "./spaces-paths.js";

function slugifyTitle(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "space"
  );
}

async function listKnowledge(workspaceId: string): Promise<DbDocument[]> {
  await documentService.ensureSpacesHierarchy(workspaceId);
  return db
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

function findByPath(
  rows: readonly DbDocument[],
  path: string,
): DbDocument | null {
  const normalized = normalizeSpacesPath(path);
  return (
    rows.find(
      (row) =>
        row.kind === "folder" && normalizeSpacesPath(row.path) === normalized,
    ) ?? null
  );
}

function listDirectChildFolders(
  rows: readonly DbDocument[],
  parentId: string,
): DbDocument[] {
  return rows
    .filter(
      (row) =>
        row.kind === "folder" &&
        row.parentId === parentId &&
        row.id !== parentId,
    )
    .slice()
    .sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (order !== 0) return order;
      return a.title.localeCompare(b.title);
    });
}

function countArticles(
  rows: readonly DbDocument[],
  folderId: string,
): number {
  const childrenByParent = new Map<string | null, DbDocument[]>();
  for (const row of rows) {
    const key = row.parentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(row);
    childrenByParent.set(key, list);
  }
  let count = 0;
  const stack = [folderId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      if (child.kind === "folder") stack.push(child.id);
      else count += 1;
    }
  }
  return count;
}

function latestUpdatedAt(
  rows: readonly DbDocument[],
  folderId: string,
): string | null {
  const childrenByParent = new Map<string | null, DbDocument[]>();
  for (const row of rows) {
    const key = row.parentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(row);
    childrenByParent.set(key, list);
  }
  const root = rows.find((row) => row.id === folderId);
  let latest = root?.updatedAt ? new Date(root.updatedAt).getTime() : 0;
  const stack = [folderId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      const at = child.updatedAt ? new Date(child.updatedAt).getTime() : 0;
      if (at > latest) latest = at;
      if (child.kind === "folder") stack.push(child.id);
    }
  }
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function toSpaceCard(row: DbDocument, rows: readonly DbDocument[]) {
  const categoryId =
    resolveCategoryForSpace(row, rows) ?? SPACES_CATEGORY_KNOWLEDGE_BASE;
  return {
    id: row.id,
    title: row.title,
    path: row.path,
    icon: row.icon,
    categoryId,
    articleCount: countArticles(rows, row.id),
    updatedAt: latestUpdatedAt(rows, row.id),
  };
}

function resolveCategoryForSpace(
  space: DbDocument,
  rows: readonly DbDocument[],
): SpacesCategoryId | null {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let current: DbDocument | null = space;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const path = normalizeSpacesPath(current.path);
    if (isSpacesCategoryId(path)) return path;
    if (!current.parentId) break;
    current = byId.get(current.parentId) ?? null;
  }
  return null;
}

export async function listSpacesCategories(workspaceId: string) {
  const rows = await listKnowledge(workspaceId);
  return SPACES_CATEGORY_IDS.map((id) => {
    const root = findByPath(rows, id);
    const spaces = root ? listDirectChildFolders(rows, root.id) : [];
    return {
      id,
      title: SPACES_CATEGORY_TITLES[id],
      path: id,
      spaceCount: spaces.length,
    };
  });
}

export async function listSpacesInCategory(
  workspaceId: string,
  categoryId: string,
) {
  if (!isSpacesCategoryId(categoryId)) {
    throw new Error("INVALID_CATEGORY");
  }
  const rows = await listKnowledge(workspaceId);
  const root = findByPath(rows, categoryId);
  if (!root) throw new Error("CATEGORY_NOT_FOUND");
  return listDirectChildFolders(rows, root.id).map((row) =>
    toSpaceCard(row, rows),
  );
}

export async function createSpaceInCategory(
  workspaceId: string,
  categoryId: string,
  input: { title: string; icon?: string | null },
) {
  if (!isSpacesCategoryId(categoryId)) {
    throw new Error("INVALID_CATEGORY");
  }
  const title = input.title.trim();
  if (!title) throw new Error("TITLE_REQUIRED");

  const rows = await listKnowledge(workspaceId);
  const root = findByPath(rows, categoryId);
  if (!root) throw new Error("CATEGORY_NOT_FOUND");

  const slug = slugifyTitle(title);
  let path = expectedChildSpacesPath(root.path, slug);
  let attempt = 0;
  while (findByPath(rows, path)) {
    attempt += 1;
    path = expectedChildSpacesPath(root.path, `${slug}-${attempt}`);
  }

  const row = await documentService.createDocument(workspaceId, {
    type: "knowledge",
    kind: "folder",
    title,
    path,
    parentId: root.id,
    icon: input.icon ?? undefined,
    content: "",
  });

  const refreshed = await listKnowledge(workspaceId);
  return toSpaceCard(row, refreshed);
}

export async function getSpace(workspaceId: string, spaceId: string) {
  const rows = await listKnowledge(workspaceId);
  const space = rows.find((row) => row.id === spaceId && row.kind === "folder");
  if (!space) return null;
  return toSpaceCard(space, rows);
}

export async function updateSpace(
  workspaceId: string,
  spaceId: string,
  input: {
    title?: string;
    icon?: string | null;
    categoryId?: string;
  },
) {
  const rows = await listKnowledge(workspaceId);
  const space = rows.find((row) => row.id === spaceId && row.kind === "folder");
  if (!space) return null;

  if (input.categoryId) {
    if (!isSpacesCategoryId(input.categoryId)) {
      throw new Error("INVALID_CATEGORY");
    }
    const root = findByPath(rows, input.categoryId);
    if (!root) throw new Error("CATEGORY_NOT_FOUND");
    if (space.parentId !== root.id) {
      await documentService.moveDocument(workspaceId, spaceId, root.id);
    }
  }

  if (input.title !== undefined || input.icon !== undefined) {
    await documentService.updateDocument(workspaceId, spaceId, {
      title: input.title,
      icon: input.icon,
    });
  }

  const refreshed = await listKnowledge(workspaceId);
  const updated = refreshed.find((row) => row.id === spaceId);
  return updated ? toSpaceCard(updated, refreshed) : null;
}

export async function deleteSpace(workspaceId: string, spaceId: string) {
  const row = await documentService.getDocumentById(workspaceId, spaceId);
  if (!row || row.type !== "knowledge" || row.kind !== "folder") {
    return null;
  }
  // Soft-delete space folder only (same as documents delete). Nested content
  // remains until explicitly deleted — matches document API semantics.
  return documentService.deleteDocument(workspaceId, spaceId);
}

export async function getSpaceTree(workspaceId: string, spaceId: string) {
  const rows = await listKnowledge(workspaceId);
  const space = rows.find((row) => row.id === spaceId && row.kind === "folder");
  if (!space) return null;

  const childrenByParent = new Map<string | null, DbDocument[]>();
  for (const row of rows) {
    const key = row.parentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(row);
    childrenByParent.set(key, list);
  }

  const nodes: Array<{
    id: string;
    title: string;
    path: string;
    kind: string;
    parentId: string | null;
    updatedAt: string | null;
  }> = [];
  const stack = [spaceId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      nodes.push({
        id: child.id,
        title: child.title,
        path: child.path,
        kind: child.kind,
        parentId: child.parentId,
        updatedAt: child.updatedAt
          ? new Date(child.updatedAt).toISOString()
          : null,
      });
      if (child.kind === "folder") stack.push(child.id);
    }
  }

  return {
    space: toSpaceCard(space, rows),
    nodes,
  };
}

export async function createSpaceArticle(
  workspaceId: string,
  spaceId: string,
  input: {
    title: string;
    content?: string;
    parentFolderId?: string | null;
  },
) {
  const rows = await listKnowledge(workspaceId);
  const space = rows.find((row) => row.id === spaceId && row.kind === "folder");
  if (!space) throw new Error("SPACE_NOT_FOUND");

  const parentId = input.parentFolderId ?? spaceId;
  const parent =
    parentId === spaceId
      ? space
      : rows.find((row) => row.id === parentId && row.kind === "folder");
  if (!parent) throw new Error("FOLDER_NOT_FOUND");

  // Ensure parent is under the space.
  if (parentId !== spaceId) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    let cursor: DbDocument | null = parent;
    let underSpace = false;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      if (cursor.id === spaceId) {
        underSpace = true;
        break;
      }
      cursor = cursor.parentId ? (byId.get(cursor.parentId) ?? null) : null;
    }
    if (!underSpace) throw new Error("FOLDER_NOT_IN_SPACE");
  }

  const title = input.title.trim() || "Untitled";
  const slug = slugifyTitle(title);
  const stamp = newId().slice(0, 6);
  const path = expectedChildSpacesPath(
    parent.path,
    `${slug}-${stamp}.md`.replace(/\.md\.md$/i, ".md"),
  );

  return documentService.createDocument(workspaceId, {
    type: "knowledge",
    kind: "document",
    title,
    path,
    parentId,
    content: input.content ?? "",
  });
}

export { SPACES_CATEGORY_IDS, isSpacesCategoryId };
