"use client";

import type { Document as ApiDocument } from "@backsteros/contracts";

import { isValidEntityIcon } from "@/lib/entity-icon";

import {
  apiErrorText,
  getMutationContext,
  patchDocumentLocal,
  seedDocumentLocal,
} from "./client";

export type CreateComposeDocumentResult =
  | { ok: true; documentId: string; relativePath: string }
  | { ok: false; error: string };

function slugFromTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "untitled";
}

function buildDocumentPath(folderPath: string, slug: string): string {
  const folder = folderPath.trim().replace(/^\/+|\/+$/g, "");
  return folder ? `${folder}/${slug}.md` : `${slug}.md`;
}

/**
 * Document content lives in object storage (see `storageKey` on the API
 * row) rather than the local PowerSync `documents` table, which only
 * mirrors metadata columns. Create via API first (like letters), then seed
 * local PowerSync so side panels update immediately.
 */
async function createComposeDocument(
  body: Record<string, unknown>,
): Promise<CreateComposeDocumentResult> {
  try {
    const { client, sync, refresh } = getMutationContext();
    const document = await client.requestJson<ApiDocument>("/api/v1/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await seedDocumentLocal(sync, document);
    refresh();
    return { ok: true, documentId: document.id, relativePath: document.path };
  } catch (error) {
    return {
      ok: false,
      error: apiErrorText(error, "Could not create document."),
    };
  }
}

export async function createDocumentAction(input: {
  projectId: string;
  title: string;
  folderPath?: string;
  parentId?: string | null;
  content?: string;
}): Promise<CreateComposeDocumentResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Document title is required." };
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };

  const slug = slugFromTitle(title);
  const path = buildDocumentPath(input.folderPath ?? "", slug);

  return createComposeDocument({
    type: "project",
    projectId: input.projectId,
    title,
    path,
    content: input.content ?? "",
    parentId: input.parentId ?? undefined,
  });
}

export async function createKnowledgeDocumentAction(input: {
  title: string;
  folderPath?: string;
  parentId?: string | null;
  content?: string;
}): Promise<CreateComposeDocumentResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Document title is required." };

  const slug = slugFromTitle(title);
  const path = buildDocumentPath(input.folderPath ?? "", slug);

  return createComposeDocument({
    type: "knowledge",
    title,
    path,
    content: input.content ?? "",
    parentId: input.parentId ?? undefined,
  });
}

export type CreateFolderResult =
  | { ok: true; folderId: string }
  | { ok: false; error: string };

async function createFolder(
  body: Record<string, unknown>,
): Promise<CreateFolderResult> {
  try {
    const { client, sync, refresh } = getMutationContext();
    const document = await client.requestJson<ApiDocument>("/api/v1/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await seedDocumentLocal(sync, document);
    refresh();
    return { ok: true, folderId: document.id };
  } catch (error) {
    return { ok: false, error: apiErrorText(error, "Could not create folder.") };
  }
}

export async function createProjectFolderAction(input: {
  projectId: string;
  title: string;
  parentId?: string | null;
}): Promise<CreateFolderResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Folder name is required." };
  const stamp = Date.now().toString(36);
  const path = `${slugFromTitle(title)}-${stamp}`;
  return createFolder({
    type: "project",
    projectId: input.projectId,
    kind: "folder",
    title,
    path,
    parentId: input.parentId ?? undefined,
  });
}

export async function createKnowledgeFolderAction(input: {
  title: string;
  parentId?: string | null;
}): Promise<CreateFolderResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Folder name is required." };
  const stamp = Date.now().toString(36);
  const path = `${slugFromTitle(title)}-${stamp}`;
  return createFolder({
    type: "knowledge",
    kind: "folder",
    title,
    path,
    parentId: input.parentId ?? undefined,
  });
}

export type DocumentMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function renameDocumentEntryAction(input: {
  id: string;
  title: string;
}): Promise<DocumentMutationResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  try {
    const { client, refresh } = getMutationContext();
    await client.requestJson(`/api/v1/documents/${input.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error, "Could not rename.") };
  }
}

export async function deleteDocumentEntryAction(input: {
  id: string;
}): Promise<DocumentMutationResult> {
  try {
    const { client, refresh } = getMutationContext();
    await client.requestJson(`/api/v1/documents/${input.id}`, {
      method: "DELETE",
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error, "Could not delete.") };
  }
}

export async function moveDocumentEntryAction(input: {
  id: string;
  parentId: string | null;
}): Promise<DocumentMutationResult> {
  try {
    const { client, refresh } = getMutationContext();
    await client.requestJson(`/api/v1/documents/${input.id}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: input.parentId }),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error, "Could not move.") };
  }
}

export async function reorderDocumentEntriesAction(input: {
  orderedIds: string[];
}): Promise<DocumentMutationResult> {
  if (input.orderedIds.length === 0) {
    return { ok: false, error: "At least one document is required." };
  }

  try {
    const { client, refresh } = getMutationContext();
    await client.requestJson("/api/v1/documents/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds: input.orderedIds }),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error, "Could not reorder documents.") };
  }
}

export async function updateDocumentIconAction(input: {
  documentId: string;
  icon: string | null;
}): Promise<DocumentMutationResult> {
  if (!input.documentId.trim()) {
    return { ok: false, error: "Document is required." };
  }
  if (!isValidEntityIcon(input.icon)) {
    return { ok: false, error: "Invalid icon." };
  }

  try {
    const { client, sync, refresh } = getMutationContext();
    await patchDocumentLocal(sync, input.documentId, { icon: input.icon });
    await client.requestJson(`/api/v1/documents/${encodeURIComponent(input.documentId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ icon: input.icon }),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error, "Could not update document icon.") };
  }
}
