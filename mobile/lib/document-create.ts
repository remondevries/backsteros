import type { Document as ApiDocument } from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import { documentPathFromTitle } from "./compose";
import { saveDocumentContent } from "./document-content";
import { shouldSkipRestEntityWrite } from "./powersync-write-path";

type CreateDocumentInput = {
  type: "knowledge" | "project";
  title: string;
  content?: string;
  projectId?: string | null;
  parentId?: string | null;
};

type MobileDocumentPowerSync = {
  ready: boolean;
  connected: boolean;
  createMetadata?: (
    table: "documents",
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
  flushCrudUpload?: () => Promise<void>;
};

export function folderPathFromTitle(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "folder";
  return `${slug}-${Date.now().toString(36)}`;
}

function documentMetadataFields(input: {
  type: "knowledge" | "project";
  title: string;
  path: string;
  kind: "document" | "folder";
  projectId?: string | null;
  parentId?: string | null;
}): Record<string, unknown> {
  return {
    type: input.type,
    project_id: input.projectId ?? null,
    parent_id: input.parentId ?? null,
    kind: input.kind,
    icon: null,
    sort_order: 0,
    journal_date: null,
    path: input.path,
    title: input.title,
    storage_key: "",
    content_type: "text/markdown",
    byte_size: 0,
    checksum: null,
    snippet: null,
    content_version: 1,
    content_etag: null,
  };
}

/** Folder metadata only — no Tier D body. */
export async function createFolderViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileDocumentPowerSync,
  input: {
    type: "knowledge" | "project";
    title: string;
    projectId?: string | null;
    parentId?: string | null;
  },
): Promise<{ id: string; path: string }> {
  const title = input.title.trim();
  if (!title) throw new Error("Folder name is required.");
  const path = folderPathFromTitle(title);

  if (
    shouldSkipRestEntityWrite(powerSync) &&
    powerSync.createMetadata &&
    powerSync.flushCrudUpload
  ) {
    const id = await powerSync.createMetadata(
      "documents",
      documentMetadataFields({
        type: input.type,
        title,
        path,
        kind: "folder",
        projectId: input.projectId,
        parentId: input.parentId,
      }),
    );
    await powerSync.flushCrudUpload();
    return { id, path };
  }

  const document = await client.requestJson<ApiDocument>("/api/v1/documents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: input.type,
      kind: "folder",
      title,
      path,
      projectId: input.projectId ?? undefined,
      parentId: input.parentId ?? undefined,
    }),
  });
  return { id: document.id, path: document.path };
}

/** Metadata via PowerSync when connected; initial body via leader-first content PATCH. */
export async function createDocumentWithLeaderContent(
  client: BacksterosApiClient,
  powerSync: MobileDocumentPowerSync,
  input: CreateDocumentInput,
): Promise<{ id: string; path: string; contentVersion: number }> {
  const title = input.title.trim() || "Untitled";
  const path = documentPathFromTitle(title);
  const content = input.content ?? "";

  if (
    shouldSkipRestEntityWrite(powerSync) &&
    powerSync.createMetadata &&
    powerSync.flushCrudUpload
  ) {
    const id = await powerSync.createMetadata(
      "documents",
      documentMetadataFields({
        type: input.type,
        title,
        path,
        kind: "document",
        projectId: input.projectId,
        parentId: input.parentId,
      }),
    );
    await powerSync.flushCrudUpload();
    let contentVersion = 1;
    if (content.length > 0) {
      const saved = await saveDocumentContent(client, id, content, 1);
      contentVersion = saved.contentVersion;
    }
    return { id, path, contentVersion };
  }

  const document = await client.requestJson<ApiDocument>("/api/v1/documents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: input.type,
      title,
      path,
      content,
      projectId: input.projectId ?? undefined,
      parentId: input.parentId ?? undefined,
    }),
  });
  return {
    id: document.id,
    path: document.path,
    contentVersion: document.contentVersion,
  };
}

function journalDocumentMetadata(journalDate: string): Record<string, unknown> {
  return {
    type: "journal",
    project_id: null,
    parent_id: null,
    kind: "document",
    icon: null,
    sort_order: 0,
    journal_date: journalDate,
    path: `${journalDate}.md`,
    title: journalDate,
    storage_key: "",
    content_type: "text/markdown",
    byte_size: 0,
    checksum: null,
    snippet: null,
    content_version: 1,
    content_etag: null,
  };
}

/** Create/open a journal day — local metadata + upload when PowerSync is connected. */
export async function createTodayJournalViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileDocumentPowerSync,
  journalDate: string,
): Promise<{ id: string }> {
  if (
    shouldSkipRestEntityWrite(powerSync) &&
    powerSync.createMetadata &&
    powerSync.flushCrudUpload
  ) {
    const id = await powerSync.createMetadata(
      "documents",
      journalDocumentMetadata(journalDate),
    );
    await powerSync.flushCrudUpload();
    return { id };
  }

  const document = await client.requestJson<ApiDocument>(
    `/api/v1/journal/${encodeURIComponent(journalDate)}`,
  );
  return { id: document.id };
}

/** Server get-or-create when the journal row is missing from local SQLite. */
export async function ensureJournalDocumentViaApi(
  client: BacksterosApiClient,
  journalDate: string,
): Promise<{ id: string }> {
  const document = await client.requestJson<ApiDocument>(
    `/api/v1/journal/${encodeURIComponent(journalDate)}`,
  );
  return { id: document.id };
}
